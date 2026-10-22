/* Morse Mash: Tap: sending practice, one character at a time or a whole word. */
(function () {
  'use strict';
  const { MORSE, unitMs, classify, decodeCode, spoken, segmentTaps, scoreWord, letterSplit } = window.MorseCore;
  const MM = window.MM;
  const { WORDS, $, state, bumpMax, record, confuse, pickChar, pool, symHtml, toneOn, toneOff, gapMs } = MM;

  // presses: [{ down, up }] in ms for the current attempt. Words mode cuts them into letters by the silences between them.
  const T = {
    target: null, presses: [], downAt: 0, idle: null, next: null, locked: false, score: 0,
    streak: 0, wstreak: 0, hint: false, isDown: false
  };
  const words = function () { return state.opts.tapWords; };
  const unit = function () { return unitMs(state.wpm); };
  // Words end after a long pause (or the Done button); letters after a short one, as before.
  const endPause = function () { return words() ? Math.max(7 * gapMs(), 1500) : unit() * 6; };

  function pickWord(avoid) {
    const set = pool();
    const fit = WORDS.filter(function (w) {
      return w.length >= 2 && w.length <= 5 && w !== avoid && w.split('').every(function (c) { return set.indexOf(c) >= 0; });
    });
    if (fit.length >= 3) return fit[Math.floor(Math.random() * fit.length)];
    let w = '';
    for (let i = 0; i < 3; i++) w += set[Math.floor(Math.random() * set.length)];
    return w;
  }
  function codes() {
    return words() ? segmentTaps(T.presses, unit(), gapMs()) : [classify(T.presses.map(function (p) { return p.up - p.down; }), unit())];
  }

  function renderTapStats() {
    $('#tScore').textContent = T.score;
    $('#tStreak').textContent = words() ? T.wstreak : T.streak;
    $('#tLetters').setAttribute('aria-pressed', String(!words()));
    $('#tWords').setAttribute('aria-pressed', String(words()));
  }
  function renderEntered(result) {
    const box = $('#tEntered');
    if (!T.presses.length) {
      box.innerHTML = '<span class="msg" style="color:var(--muted)">Waiting for your first tap</span>';
      return;
    }
    if (!words()) { box.innerHTML = symHtml(codes()[0], 'big'); return; }
    const cs = codes();
    box.innerHTML = cs.map(function (c, i) {
      const r = result && result[i];
      const got = decodeCode(c);
      return '<span class="tl' + (r ? (r.ok ? ' good' : ' bad') : '') + '"><b>' + (got || '?') + '</b>' + symHtml(c, 'small') + '</span>';
    }).join('') + (result ? result.slice(cs.length).map(function () { return '<span class="tl bad miss"><b>_</b></span>'; }).join('') : '');
  }
  function renderHint() {
    let h = '';
    if (T.hint && T.target) {
      h = words() ?
        '<div class="hintword">' + T.target.split('').map(function (c) { return '<span class="tl"><b>' + c + '</b>' + symHtml(MORSE[c], 'small') + '</span>'; }).join('') + '</div>' :
        symHtml(MORSE[T.target], 'big') + '<span class="msg" style="color:var(--muted)">' + spoken(MORSE[T.target]) + '</span>';
    }
    $('#tHint').innerHTML = h;
    $('#tHintBtn').textContent = T.hint ? 'Hide the pattern' : 'Show the pattern';
  }
  function renderGuide() {
    const g = $('#tGuide');
    if (!words()) { g.textContent = 'Pause when you are done and it checks you.'; return; }
    g.textContent = 'Leave a gap of at least ' + Math.round(letterSplit(unit(), gapMs())) + ' ms between letters (about ' +
      Math.round(3 * gapMs()) + ' ms is ideal). Pause ' + (endPause() / 1000).toFixed(1) + ' s or press Done to finish.';
  }
  function nextTap() {
    clearTimeout(T.idle);
    clearTimeout(T.next);
    T.target = words() ? pickWord(T.target) : pickChar(T.target);
    T.presses = [];
    T.locked = false;
    T.hint = false;
    const tg = $('#tTarget');
    tg.textContent = T.target;
    tg.classList.toggle('word', words());
    $('#tMsg').textContent = '';
    $('#tMsg').className = 'msg';
    $('#tWordBtns').hidden = !words();
    renderEntered();
    renderHint();
    renderGuide();
    renderTapStats();
  }
  function tapDown() {
    if (T.locked || T.isDown) return;
    T.isDown = true;
    clearTimeout(T.idle);
    T.downAt = performance.now();
    $('#tKey').classList.add('down');
    toneOn();
  }
  function tapUp() {
    if (!T.isDown) return;
    T.isDown = false;
    $('#tKey').classList.remove('down');
    toneOff();
    T.presses.push({ down: T.downAt, up: performance.now() });
    renderEntered();
    T.idle = setTimeout(judge, endPause());
  }
  function judge() {
    if (T.locked || !T.presses.length || T.isDown) return;
    clearTimeout(T.idle);
    T.locked = true;
    if (words()) judgeWord(); else judgeLetter();
    renderTapStats();
  }
  function judgeLetter() {
    const code = codes()[0];
    const want = MORSE[T.target];
    const ok = code === want;
    record(T.target, ok);
    const msg = $('#tMsg');
    if (ok) {
      T.streak++;
      bumpMax('tapBest', T.streak);
      T.score += 10 + Math.min(T.streak, 10) + (T.hint ? 0 : 5);
      msg.textContent = 'Clean. That is ' + T.target + '.';
      msg.className = 'msg ok';
    } else {
      T.streak = 0;
      const got = decodeCode(code);
      if (got) confuse(T.target, got);
      msg.textContent = (got ? 'That sent ' + got + '. ' : 'No match. ') + T.target + ' is ' + spoken(want) + '.';
      msg.className = 'msg bad';
      T.hint = true;
      renderHint();
    }
    T.next = setTimeout(function () { if (MM.is('tap') && T.locked) nextTap(); }, ok ? 900 : 2200);
  }
  function judgeWord() {
    const result = scoreWord(T.target, codes());
    let right = 0;
    result.forEach(function (r) {
      if (!r.want) return;
      record(r.want, r.ok);
      if (r.ok) right++;
      else if (r.got) confuse(r.want, r.got);
    });
    const clean = result.every(function (r) { return r.ok; });
    const sent = result.filter(function (r) { return r.code; }).length;
    const msg = $('#tMsg');
    if (clean) {
      T.wstreak++;
      bumpMax('wordBest', T.wstreak);
      T.score += 10 * T.target.length + Math.min(T.wstreak, 10) * 2 + (T.hint ? 0 : 10);
      msg.textContent = 'Clean copy. ' + T.target + ', every letter right.';
      msg.className = 'msg ok';
    } else {
      T.wstreak = 0;
      T.score += 5 * right;
      const extra = sent > T.target.length ? ' You sent ' + sent + ' letters for ' + T.target.length + ', so check your gaps.' :
        sent < T.target.length ? ' Some letters ran together. Leave a longer gap between them.' : '';
      msg.textContent = right + ' of ' + T.target.length + ' letters right.' + extra;
      msg.className = 'msg bad';
      T.hint = true;
      renderHint();
    }
    renderEntered(result);
    T.next = setTimeout(function () { if (MM.is('tap') && T.locked) nextTap(); }, clean ? 1400 : 3600);
  }
  function setWords(on) {
    if (state.opts.tapWords === on) return;
    state.opts.tapWords = on;
    MM.save();
    nextTap();
  }
  const key = $('#tKey');
  key.addEventListener('pointerdown', function (e) { e.preventDefault(); try { key.setPointerCapture(e.pointerId); } catch (x) { /* ignore */ } tapDown(); });
  key.addEventListener('pointerup', tapUp);
  key.addEventListener('pointercancel', tapUp);
  $('#tHintBtn').addEventListener('click', function () { T.hint = !T.hint; renderHint(); });
  $('#tLetters').addEventListener('click', function () { setWords(false); });
  $('#tWords').addEventListener('click', function () { setWords(true); });
  $('#tDone').addEventListener('click', judge);
  $('#tRetry').addEventListener('click', function () {
    if (T.locked) return;
    clearTimeout(T.idle);
    T.presses = [];
    renderEntered();
  });

  MM.onRefresh(function () { renderTapStats(); if (MM.is('tap')) renderGuide(); });
  MM.register('tap', {
    show: nextTap,
    onPool: nextTap,
    leave: function () {
      clearTimeout(T.idle);
      clearTimeout(T.next);
      if (T.isDown) tapUp();
      clearTimeout(T.idle);
      T.presses = [];
    },
    onKey: function (e) {
      if (e.code === 'Space') { e.preventDefault(); if (!e.repeat) tapDown(); return; }
      if (e.key === 'Enter' && words()) { e.preventDefault(); judge(); }
    },
    onKeyUp: function (e) { if (e.code === 'Space') { e.preventDefault(); tapUp(); } }
  });
})();
