/* Morse Mash: Listen: the ear trainer. */
(function () {
  'use strict';
  const { KOCH, PROSIGNS, spoken, compareNote, codeFor, sendText } = window.MorseCore;
  const MM = window.MM;
  const { $, state, save, record, pool, confuse, distractors, pickChar, shuffle, symHtml, esc, toast, playText } = MM;

  const PROS = Object.keys(PROSIGNS);
  const isPro = function (c) { return PROS.indexOf(c) >= 0; };
  // Prosigns join Listen once the whole alphabet is in the practice set and the player switches them on.
  const proReady = function () { return state.n >= 26; };
  const proOn = function () { return state.opts.pro && proReady(); };
  // What a question can be drawn from: the drill set, or the practice set plus prosigns when switched on.
  function questionPool() { return L.drill || (proOn() ? pool().concat(PROS) : pool()); }
  // Wrong choices come from the same family as the answer, so a two-letter prosign never gives itself away.
  function optionPool(cur) {
    const base = isPro(cur) ? PROS : pool();
    const drill = (L.drill || []).filter(function (c) { return isPro(c) === isPro(cur); });
    return drill.concat(base.filter(function (c) { return drill.indexOf(c) < 0; }));
  }

  const L = { cur: null, answered: false, streak: 0, score: 0, win: [], last: null, drill: null, opts: [], timers: [] };
  function later(fn, ms) { L.timers.push(setTimeout(fn, ms)); }
  function clearTimers() { L.timers.forEach(clearTimeout); L.timers = []; }
  // Number keys pick a choice by position. Plain 1 to 4 work while no digit is among the choices; Shift + 1 to 4 always work.
  function plainNumbers() { return !L.opts.some(function (c) { return /^\d$/.test(c); }); }
  function labelHtml(c) { return isPro(c) ? '<span class="ovl">' + c + '</span>' : c; }

  function renderDrill() {
    const b = $('#lDrill');
    if (!L.drill) { b.hidden = true; return; }
    b.hidden = false;
    b.innerHTML = '<span>Drill: <b>' + L.drill.join(' ') + '</b></span><button class="btn ghost" id="lExit">Exit drill</button>';
    $('#lExit').addEventListener('click', function () { L.drill = null; nextListen(true); });
  }
  function renderListenStats() {
    $('#lScore').textContent = L.score;
    $('#lStreak').textContent = L.streak;
    $('#lBest').textContent = state.bestStreak;
    $('#lWin').textContent = L.win.length + '/10';
    const pro = $('#lPro');
    pro.checked = proOn();
    pro.disabled = !proReady();
    $('#lProNote').textContent = proReady() ? '' : '(unlocks with all 26 letters)';
    $('#lAuto').checked = state.opts.autoNext;
  }
  function nextListen(autoplay) {
    clearTimers();
    renderDrill();
    L.cur = pickChar(L.last, questionPool());
    L.last = L.cur;
    L.answered = false;
    L.opts = shuffle([L.cur].concat(distractors(L.cur, optionPool(L.cur))));
    const plain = plainNumbers();
    const box = $('#lOpts');
    box.innerHTML = '';
    box.classList.toggle('prosigns', isPro(L.cur));
    L.opts.forEach(function (c, i) {
      const b = document.createElement('button');
      b.className = 'opt';
      b.innerHTML = labelHtml(c) + '<small class="kn" aria-hidden="true">' + (plain ? '' : '⇧') + (i + 1) + '</small>';
      b.setAttribute('aria-label', c + (isPro(c) ? ' prosign' : '') + ', key ' + (plain ? '' : 'Shift ') + (i + 1));
      b.dataset.c = c;
      b.addEventListener('click', function () { answerListen(c); });
      box.appendChild(b);
    });
    $('#lReveal').innerHTML = '<span class="msg">' + (proOn() ? 'What character or prosign is this?' : 'What character is this?') + '</span>';
    $('#lMsg').textContent = '';
    $('#lMsg').className = 'msg';
    $('#lNext').hidden = true;
    renderListenStats();
    if (autoplay !== false) playText(sendText(L.cur));
  }
  function answerListen(c) {
    if (L.answered || !L.cur) return;
    L.answered = true;
    const cur = L.cur;
    const ok = c === cur;
    record(cur, ok);
    if (!ok) confuse(cur, c);
    document.querySelectorAll('#lOpts .opt').forEach(function (b) {
      b.disabled = true;
      if (b.dataset.c === cur) b.classList.add('right');
      else if (b.dataset.c === c) b.classList.add('wrong');
    });
    $('#lReveal').innerHTML = '<span class="big-ch">' + labelHtml(cur) + '</span>' + symHtml(codeFor(cur), 'big');
    if (ok) {
      L.streak++;
      L.score += 10 + Math.min(L.streak, 10);
      if (L.streak > state.bestStreak) { state.bestStreak = L.streak; save(); }
      $('#lMsg').textContent = 'Yes, ' + spoken(codeFor(cur)) + '.';
      $('#lMsg').className = 'msg ok';
    } else {
      L.streak = 0;
      $('#lMsg').textContent = 'That was ' + cur + ', ' + spoken(codeFor(cur)) + '. You picked ' + c + ', ' + spoken(codeFor(c)) + '.';
      $('#lMsg').className = 'msg bad';
      const note = compareNote(cur, c);
      $('#lReveal').innerHTML += '<div class="vs">' +
        '<span class="pairs"><b class="wch s">' + labelHtml(cur) + '</b>' + symHtml(codeFor(cur)) + '</span>' +
        '<span class="pairs"><b class="wch s">' + labelHtml(c) + '</b>' + symHtml(codeFor(c)) + '</span></div>' +
        (note ? '<span class="note">' + esc(note) + '</span>' : '') +
        '<button class="btn ghost sm" id="lBoth" type="button">Hear ' + cur + ' then ' + c + '</button>';
      $('#lBoth').addEventListener('click', function () { clearTimers(); playText(sendText(cur) + ' ' + sendText(c)); });
      // Replay the right answer once so the correct sound is the last one heard,
      // then, with "keep going" on, move on once it has finished.
      later(function () {
        if (!MM.is('listen') || !L.answered || L.cur !== cur) return;
        const ms = playText(sendText(cur));
        if (state.opts.autoNext) later(function () { if (MM.is('listen') && L.answered && L.cur === cur) nextListen(true); }, ms + 1400);
      }, 450);
    }
    L.win.push(ok ? 1 : 0);
    if (L.win.length > 10) L.win.shift();
    let leveled = false;
    if (L.win.length === 10 && !L.drill) {
      const acc = L.win.reduce(function (a, b) { return a + b; }, 0) / 10;
      if (acc >= 0.9 && state.n < 36) {
        state.n++;
        save();
        L.win = [];
        leveled = true;
        toast('New character unlocked: ' + KOCH[state.n - 1] + (state.n === 26 ? '. Prosigns can now join Listen.' : ''));
        MM.refreshAll();
      }
    }
    renderListenStats();
    $('#lNext').hidden = false;
    if (ok && !leveled) later(function () { if (MM.is('listen') && L.answered) nextListen(true); }, 1100);
  }
  $('#lReplay').addEventListener('click', function () { if (L.cur) playText(sendText(L.cur)); });
  $('#lNext').addEventListener('click', function () { nextListen(true); });
  $('#lPro').addEventListener('change', function (e) { state.opts.pro = e.target.checked; save(); nextListen(true); });
  $('#lAuto').addEventListener('change', function (e) { state.opts.autoNext = e.target.checked; save(); });

  MM.onRefresh(renderListenStats);
  MM.register('listen', {
    show: function () { nextListen(true); },
    leave: clearTimers,
    onPool: function () { nextListen(false); },
    onKey: function (e) {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.target.matches && e.target.matches('input[type=checkbox], input[type=range]') && (e.code === 'Space' || e.key.indexOf('Arrow') === 0)) return;
      const pos = /^Digit([1-4])$/.exec(e.code) || /^Numpad([1-4])$/.exec(e.code);
      if (pos && (e.shiftKey || plainNumbers())) {
        e.preventDefault();
        const c = L.opts[+pos[1] - 1];
        if (c) answerListen(c);
        return;
      }
      if (/^[a-z0-9]$/i.test(e.key)) {
        const k = e.key.toUpperCase();
        if (L.opts.indexOf(k) >= 0) answerListen(k);
        return;
      }
      if (e.code === 'Space' || e.key === 'Enter') {
        e.preventDefault();
        if (L.answered) nextListen(true); else if (L.cur) playText(sendText(L.cur));
      }
    },
    // Weak spots hands a drill set over here.
    startDrill: function (chars) { L.drill = chars; MM.setMode('listen'); },
    clearDrill: function () { L.drill = null; }
  });
})();
