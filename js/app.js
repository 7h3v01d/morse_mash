/* Morse Mash app: UI, audio, storage and game modes. Pure logic lives in morse-core.js. */
(function () {
  'use strict';

  const {
    MORSE,
    KOCH,
    REV,
    unitMs,
    classify,
    decodeCode,
    spoken,
    buildSchedule,
    scheduleForCode,
    buildTree,
    pushRec,
    recCount,
    rawAcc,
    smoothAcc,
    weakList,
    topConfusions,
    confusedWith,
    compareNote,
    drillChars,
    isLetter,
    wordCode,
    correctCuts,
    chunkify,
    readChunks,
    allSplits,
    countSplits,
    sortLetters,
    uniqueSplit,
    vibratePattern,
    DAILY,
    dayNumber,
    dailyIndex,
    streakAfter,
    liveStreak,
    normalizePhrase,
    wordsRight,
    BADGES
  } = window.MorseCore;


  const WORDS = ['SOS', 'CAT', 'SEA', 'MAP', 'TOP', 'KEY', 'DOT', 'SAIL', 'SHIP', 'WAVE', 'LAMP', 'CODE', 'DASH', 'RADIO', 'SIGNAL', 'MORSE', 'WIRE', 'PORT', 'STAR', 'MOON', 'RAIN', 'WIND', 'SALT', 'TIDE', 'ROPE', 'LIGHT', 'HELP', 'NORTH', 'COAST', 'ANCHOR', 'MAST', 'SKY', 'FOG', 'BOAT', 'TEAM', 'PLAY', 'GAME', 'MASH', 'BEEP', 'LONG', 'SHORT', 'FAST', 'SLOW', 'PAUSE', 'LISTEN', 'TAP', 'ZIP', 'QUIZ', 'JAZZ', 'FOX'];

  const $ = function (s) { return document.querySelector(s); };
  const STORE = 'morsemash.v1';
  const state = { n: 5, wpm: 10, mastery: {}, conf: {}, sig: { sound: true, light: false, buzz: false }, stats: { treeBest: 0, tapBest: 0, mashClean: 0, silent: 0 }, badges: {}, daily: { last: '', streak: 0, best: 0, solved: 0 }, bestSprint: 0, bestStreak: 0 };
  try {
    const raw = localStorage.getItem(STORE);
    if (raw) {
      const s = JSON.parse(raw);
      if (s && typeof s === 'object') {
        if (s.n >= 2 && s.n <= 36) state.n = s.n;
        if (s.wpm >= 5 && s.wpm <= 25) state.wpm = s.wpm;
        if (s.mastery && typeof s.mastery === 'object') state.mastery = s.mastery;
        if (s.conf && typeof s.conf === 'object') state.conf = s.conf;
        if (s.stats && typeof s.stats === 'object') {
          Object.keys(state.stats).forEach(function (k) { if (s.stats[k] > 0) state.stats[k] = s.stats[k]; });
        }
        if (s.badges && typeof s.badges === 'object') state.badges = s.badges;
        if (s.daily && typeof s.daily === 'object') {
          state.daily.last = typeof s.daily.last === 'string' ? s.daily.last : '';
          ['streak', 'best', 'solved'].forEach(function (k) { if (s.daily[k] > 0) state.daily[k] = s.daily[k]; });
        }
        if (s.sig && typeof s.sig === 'object') {
          state.sig.sound = s.sig.sound !== false;
          state.sig.light = !!s.sig.light;
          state.sig.buzz = !!s.sig.buzz;
          if (!state.sig.sound && !state.sig.light && !state.sig.buzz) state.sig.sound = true;
        }
        Object.keys(state.mastery).forEach(function (k) {
          const m = state.mastery[k];
          if (m && !m.rec && m.tot > 0) {
            const len = Math.min(m.tot, 12);
            const good = Math.round(m.ok / m.tot * len);
            m.rec = '0'.repeat(len - good) + '1'.repeat(good);
          }
        });
        if (s.bestSprint > 0) state.bestSprint = s.bestSprint;
        if (s.bestStreak > 0) state.bestStreak = s.bestStreak;
      }
    }
  } catch (e) { /* storage unavailable */ }
  function persist() { try { localStorage.setItem(STORE, JSON.stringify(state)); } catch (e) { /* ignore */ } }
  function save() { persist(); checkBadges(); }
  function bumpMax(k, v) { if (v > state.stats[k]) { state.stats[k] = v; save(); } }
  function todayKey() {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function fmtDate(key) {
    const p = key.split('-');
    return new Date(+p[0], +p[1] - 1, +p[2]).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  }
  function badgeSnap() {
    const order = KOCH.split('');
    let tracked = 0;
    order.forEach(function (c) { if (recCount(state.mastery[c]).n) tracked++; });
    return {
      n: state.n, bestStreak: state.bestStreak, bestSprint: state.bestSprint, tracked: tracked,
      shaky: weakList(state.mastery, order, 99).length, stats: state.stats, dailyBest: state.daily.best
    };
  }
  let badgeBusy = false;
  function checkBadges() {
    if (badgeBusy) return;
    badgeBusy = true;
    const snap = badgeSnap();
    const fresh = [];
    BADGES.forEach(function (b) {
      if (state.badges[b.id]) return;
      const g = b.goal(snap);
      if (g[0] >= g[1]) { state.badges[b.id] = todayKey(); fresh.push(b.name); }
    });
    if (fresh.length) {
      persist();
      toast((fresh.length > 1 ? 'Badges earned: ' : 'Badge earned: ') + fresh.join(', '));
    }
    badgeBusy = false;
  }

  function record(ch, ok) {
    const m = state.mastery[ch] || (state.mastery[ch] = { ok: 0, tot: 0 });
    m.tot++;
    pushRec(m, ok);
    if (ok) m.ok++;
    if (ok && !state.sig.sound) state.stats.silent++;
    save();
  }
  function accuracy(ch) {
    return rawAcc(state.mastery[ch]);
  }
  function pool() { return KOCH.slice(0, state.n).split(''); }
  function activePool() { return L.drill && mode === 'listen' ? L.drill : pool(); }
  function confuse(target, got) {
    if (!target || !got || target === got || !MORSE[got]) return;
    const k = target + '>' + got;
    state.conf[k] = (state.conf[k] || 0) + 1;
    save();
  }
  // Wrong-answer choices lean on the characters this player actually mixes up.
  function distractors(cur, optPool) {
    const inPool = {};
    optPool.forEach(function (c) { inPool[c] = true; });
    const pref = confusedWith(state.conf, cur).filter(function (c) { return inPool[c]; }).slice(0, 2);
    const rest = shuffle(optPool.filter(function (c) { return c !== cur && pref.indexOf(c) < 0; }));
    return pref.concat(rest).slice(0, 3);
  }
  function pickChar(avoid) {
    const p = activePool();
    let best = null;
    for (let k = 0; k < 3; k++) {
      const c = p[Math.floor(Math.random() * p.length)];
      if (c === avoid && p.length > 1) { k--; continue; }
      if (best === null || accuracy(c) < accuracy(best)) best = c;
    }
    return best;
  }
  function shuffle(a) {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  function symHtml(code, size) {
    let h = '<span class="sym' + (size ? ' ' + size : '') + '" aria-label="' + spoken(code) + '">';
    for (let i = 0; i < code.length; i++) h += '<i class="' + (code[i] === '.' ? 'd' : 'h') + '"></i>';
    return h + '</span>';
  }
  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; });
  }

  let toastTimer = null;
  function toast(text) {
    const t = $('#toast');
    t.textContent = text;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.hidden = true; }, 2600);
  }

  /* ---------- audio ---------- */
  let ac = null;
  let playing = [];
  let lampTimers = [];
  const FREQ = 640;
  function audio() {
    if (!ac) {
      const C = window.AudioContext || window.webkitAudioContext;
      if (!C) return null;
      ac = new C();
    }
    if (ac.state === 'suspended') ac.resume();
    return ac;
  }
  function lamp(on) {
    $('#lamp').classList.toggle('on', on);
    $('#signal').classList.toggle('on', on && state.sig.light);
  }
  let buzzWarned = false;
  function vib(pattern) {
    if (typeof navigator.vibrate !== 'function') return;
    let ok = true;
    try { ok = navigator.vibrate(pattern); } catch (e) { ok = false; }
    if (ok === false && !buzzWarned && pattern !== 0) {
      buzzWarned = true;
      toast('This device blocked vibration. Light still works.');
    }
  }
  function stopAll() {
    playing.forEach(function (o) { try { o.stop(); } catch (e) { /* already stopped */ } });
    playing = [];
    lampTimers.forEach(clearTimeout);
    lampTimers = [];
    lamp(false);
    if (state.sig.buzz) vib(0);
  }
  function playText(text) {
    stopAll();
    const c = state.sig.sound ? audio() : null;
    const unit = unitMs(state.wpm);
    const sched = typeof text === 'string' ? buildSchedule(text, unit) : text;
    if (state.sig.buzz && sched.ev.length) {
      const pat = vibratePattern(sched.ev);
      lampTimers.push(setTimeout(function () { vib(pat); }, 60));
    }
    sched.ev.forEach(function (e) {
      lampTimers.push(setTimeout(function () { lamp(true); }, e.start + 60));
      lampTimers.push(setTimeout(function () { lamp(false); }, e.start + e.dur + 60));
    });
    if (c) {
      const t0 = c.currentTime + 0.06;
      sched.ev.forEach(function (e) {
        const o = c.createOscillator();
        const g = c.createGain();
        const s = t0 + e.start / 1000;
        const f = s + e.dur / 1000;
        o.type = 'sine';
        o.frequency.value = FREQ;
        g.gain.setValueAtTime(0, s);
        g.gain.linearRampToValueAtTime(0.25, s + 0.005);
        g.gain.setValueAtTime(0.25, f - 0.005);
        g.gain.linearRampToValueAtTime(0, f);
        o.connect(g);
        g.connect(c.destination);
        o.start(s);
        o.stop(f + 0.01);
        playing.push(o);
      });
    }
    return sched.total;
  }
  let sidetone = null;
  function toneOn() {
    const c = state.sig.sound ? audio() : null;
    lamp(true);
    if (state.sig.buzz) vib(5000);
    if (!c || sidetone) return;
    const o = c.createOscillator();
    const g = c.createGain();
    o.frequency.value = FREQ;
    g.gain.setValueAtTime(0, c.currentTime);
    g.gain.linearRampToValueAtTime(0.25, c.currentTime + 0.005);
    o.connect(g);
    g.connect(c.destination);
    o.start();
    sidetone = { o: o, g: g };
  }
  function toneOff() {
    lamp(false);
    if (state.sig.buzz) vib(0);
    if (!sidetone) return;
    const c = ac;
    const s = sidetone;
    sidetone = null;
    s.g.gain.cancelScheduledValues(c.currentTime);
    s.g.gain.setValueAtTime(s.g.gain.value, c.currentTime);
    s.g.gain.linearRampToValueAtTime(0, c.currentTime + 0.008);
    s.o.stop(c.currentTime + 0.02);
  }

  /* ---------- settings ---------- */
  function renderSettings() {
    $('#setSize').value = state.n;
    $('#setSizeVal').textContent = state.n + ' of 36';
    $('#wpm').value = state.wpm;
    $('#wpmVal').textContent = state.wpm + ' WPM';
    const p = pool();
    $('#setList').innerHTML = 'In play: <b>' + p.join(' ') + '</b>';
    renderGrid();
  }
  $('#setSize').addEventListener('input', function (e) {
    state.n = +e.target.value;
    save();
    renderSettings();
    if (mode === 'listen') nextListen(false);
    if (mode === 'tap') nextTap();
  });
  $('#wpm').addEventListener('input', function (e) {
    state.wpm = +e.target.value;
    save();
    renderSettings();
  });

  /* ---------- modes ---------- */
  let mode = 'learn';
  const MODES = ['learn', 'tree', 'listen', 'tap', 'mash', 'sprint', 'daily', 'weak', 'badges'];
  function setMode(m) {
    stopAll();
    if (T.idle) clearTimeout(T.idle);
    T.taps = [];
    if (mode === 'sprint' && S.running) endSprint(true);
    mode = m;
    document.querySelectorAll('.tab').forEach(function (b) {
      b.setAttribute('aria-selected', String(b.dataset.mode === m));
    });
    MODES.forEach(function (id) { $('#' + id).hidden = id !== m; });
    if (m === 'listen') nextListen(true);
    if (m === 'tap') nextTap();
    if (m === 'sprint') resetSprintView();
    if (m === 'tree') showTree();
    if (m === 'mash') showMash();
    if (m === 'daily') showDaily();
    if (m === 'badges') renderBadges();
    if (m === 'weak') renderWeak();
  }
  document.querySelectorAll('.tab').forEach(function (b) {
    b.addEventListener('click', function () { setMode(b.dataset.mode); });
  });

  /* ---------- learn ---------- */
  let picked = 'S';
  function renderGrid() {
    const g = $('#grid');
    g.innerHTML = '';
    KOCH.split('').sort().forEach(function (ch) {
      const idx = KOCH.indexOf(ch);
      const b = document.createElement('button');
      b.className = 'tile' + (idx >= state.n ? ' out' : '');
      b.setAttribute('aria-pressed', String(ch === picked));
      b.setAttribute('aria-label', ch + ', ' + spoken(MORSE[ch]));
      const acc = Math.max(0, accuracy(ch));
      b.innerHTML = '<span class="c">' + ch + '</span>' + symHtml(MORSE[ch], 'small') +
        '<span class="meter"><span style="width:' + Math.round(acc * 100) + '%"></span></span>';
      b.addEventListener('click', function () { picked = ch; showDetail(true); renderGrid(); });
      g.appendChild(b);
    });
    showDetail(false);
  }
  function showDetail(play) {
    const code = MORSE[picked];
    $('#detail').innerHTML = '<div class="ch">' + picked + '</div><div class="info">' + symHtml(code, 'big') +
      '<div class="say">' + spoken(code) + '</div>' +
      '<div><button class="btn ghost" id="dPlay">Hear it</button></div></div>';
    $('#dPlay').addEventListener('click', function () { playText(picked); });
    if (play) playText(picked);
  }
  $('#playForm').addEventListener('submit', function (e) {
    e.preventDefault();
    const txt = $('#playText').value.toUpperCase();
    const out = $('#playOut');
    out.innerHTML = '';
    txt.split('').forEach(function (ch) {
      if (ch === ' ') { const sp = document.createElement('span'); sp.style.width = '24px'; out.appendChild(sp); return; }
      if (!MORSE[ch]) return;
      const d = document.createElement('span');
      d.className = 'lt';
      d.innerHTML = symHtml(MORSE[ch]) + '<span>' + ch + '</span>';
      out.appendChild(d);
    });
    playText(txt);
  });

  /* ---------- listen ---------- */
  const L = { cur: null, answered: false, streak: 0, score: 0, win: [], last: null, drill: null };
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
  }
  function nextListen(autoplay) {
    renderDrill();
    L.cur = pickChar(L.last);
    L.last = L.cur;
    L.answered = false;
    const p = pool();
    const optPool = L.drill ? L.drill.concat(p.filter(function (c) { return L.drill.indexOf(c) < 0; })) : p;
    const others = distractors(L.cur, optPool);
    const opts = shuffle([L.cur].concat(others));
    const box = $('#lOpts');
    box.innerHTML = '';
    opts.forEach(function (c) {
      const b = document.createElement('button');
      b.className = 'opt';
      b.textContent = c;
      b.dataset.c = c;
      b.addEventListener('click', function () { answerListen(c); });
      box.appendChild(b);
    });
    $('#lReveal').innerHTML = '<span class="msg">What character is this?</span>';
    $('#lMsg').textContent = '';
    $('#lMsg').className = 'msg';
    $('#lNext').hidden = true;
    renderListenStats();
    if (autoplay !== false) playText(L.cur);
  }
  function answerListen(c) {
    if (L.answered || !L.cur) return;
    L.answered = true;
    const ok = c === L.cur;
    record(L.cur, ok);
    if (!ok) confuse(L.cur, c);
    document.querySelectorAll('#lOpts .opt').forEach(function (b) {
      b.disabled = true;
      if (b.dataset.c === L.cur) b.classList.add('right');
      else if (b.dataset.c === c) b.classList.add('wrong');
    });
    $('#lReveal').innerHTML = '<span class="big-ch">' + L.cur + '</span>' + symHtml(MORSE[L.cur], 'big');
    if (ok) {
      L.streak++;
      L.score += 10 + Math.min(L.streak, 10);
      if (L.streak > state.bestStreak) { state.bestStreak = L.streak; save(); }
      $('#lMsg').textContent = 'Yes, ' + spoken(MORSE[L.cur]) + '.';
      $('#lMsg').className = 'msg ok';
    } else {
      L.streak = 0;
      $('#lMsg').textContent = 'That was ' + L.cur + ', ' + spoken(MORSE[L.cur]) + '.';
      $('#lMsg').className = 'msg bad';
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
        toast('New character unlocked: ' + KOCH[state.n - 1]);
        renderSettings();
      }
    }
    renderListenStats();
    $('#lNext').hidden = false;
    if (ok && !leveled) setTimeout(function () { if (mode === 'listen' && L.answered) nextListen(true); }, 1100);
  }
  $('#lReplay').addEventListener('click', function () { if (L.cur) playText(L.cur); });
  $('#lNext').addEventListener('click', function () { nextListen(true); });

  /* ---------- tap ---------- */
  const T = { target: null, taps: [], downAt: 0, idle: null, locked: false, score: 0, streak: 0, hint: false, isDown: false, wasDown: false };
  function renderTapStats() {
    $('#tScore').textContent = T.score;
    $('#tStreak').textContent = T.streak;
  }
  function renderEntered(code) {
    $('#tEntered').innerHTML = code ? symHtml(code, 'big') : '<span class="msg" style="color:var(--muted)">Waiting for your first tap</span>';
  }
  function renderHint() {
    $('#tHint').innerHTML = T.hint && T.target ? symHtml(MORSE[T.target], 'big') + '<span class="msg" style="color:var(--muted)">' + spoken(MORSE[T.target]) + '</span>' : '';
    $('#tHintBtn').textContent = T.hint ? 'Hide the pattern' : 'Show the pattern';
  }
  function nextTap() {
    clearTimeout(T.idle);
    T.target = pickChar(T.target);
    T.taps = [];
    T.locked = false;
    T.hint = false;
    $('#tTarget').textContent = T.target;
    $('#tMsg').textContent = '';
    $('#tMsg').className = 'msg';
    renderEntered('');
    renderHint();
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
    T.taps.push(performance.now() - T.downAt);
    const unit = unitMs(state.wpm);
    renderEntered(classify(T.taps, unit));
    T.idle = setTimeout(judgeTap, unit * 6);
  }
  function judgeTap() {
    if (T.locked || !T.taps.length) return;
    T.locked = true;
    const unit = unitMs(state.wpm);
    const code = classify(T.taps, unit);
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
    renderTapStats();
    setTimeout(function () { if (mode === 'tap' && T.locked) nextTap(); }, ok ? 900 : 2200);
  }
  const key = $('#tKey');
  key.addEventListener('pointerdown', function (e) { e.preventDefault(); try { key.setPointerCapture(e.pointerId); } catch (x) { /* ignore */ } tapDown(); });
  key.addEventListener('pointerup', tapUp);
  key.addEventListener('pointercancel', tapUp);
  $('#tHintBtn').addEventListener('click', function () { T.hint = !T.hint; renderHint(); });

  /* ---------- sprint ---------- */
  const S = { running: false, end: 0, raf: null, word: '', score: 0 };
  function pickWord() {
    const set = KOCH.slice(0, state.n);
    const fit = WORDS.filter(function (w) { return w.split('').every(function (c) { return set.indexOf(c) >= 0; }) && w !== S.word; });
    if (fit.length >= 3) return fit[Math.floor(Math.random() * fit.length)];
    const p = set.split('');
    let w = '';
    const len = 2 + Math.floor(Math.random() * 2);
    for (let i = 0; i < len; i++) w += p[Math.floor(Math.random() * p.length)];
    return w;
  }
  function renderWord() {
    const box = $('#sCode');
    if ($('#audioOnly').checked) { box.innerHTML = '<span class="msg" style="color:var(--muted)">Watch or listen, then type what you get</span>'; return; }
    box.innerHTML = S.word.split('').map(function (c) { return symHtml(MORSE[c], 'big'); }).join('');
  }
  function showBest() { $('#sBest').textContent = state.bestSprint; }
  function resetSprintView() {
    S.score = 0;
    $('#sScore').textContent = 0;
    $('#sTime').textContent = 60;
    $('#sClock').style.width = '100%';
    $('#sCode').innerHTML = symHtml(MORSE.S, 'big') + symHtml(MORSE.O, 'big') + symHtml(MORSE.S, 'big');
    $('#sMsg').textContent = 'This is SOS. Press start when you are ready.';
    $('#sMsg').className = 'msg';
    $('#sInput').disabled = true;
    $('#sGo').disabled = true;
    $('#sHear').disabled = true;
    $('#sStart').disabled = false;
    $('#sStart').textContent = 'Start 60 seconds';
    showBest();
  }
  function nextWord() {
    S.word = pickWord();
    renderWord();
    $('#sInput').value = '';
    if ($('#audioOnly').checked) playText(S.word);
  }
  function startSprint() {
    audio();
    S.running = true;
    S.score = 0;
    S.end = performance.now() + 60000;
    $('#sScore').textContent = 0;
    $('#sMsg').textContent = '';
    $('#sInput').disabled = false;
    $('#sGo').disabled = false;
    $('#sHear').disabled = false;
    $('#sStart').disabled = true;
    nextWord();
    $('#sInput').focus();
    const tick = function () {
      if (!S.running) return;
      const left = S.end - performance.now();
      if (left <= 0) { endSprint(false); return; }
      $('#sTime').textContent = Math.ceil(left / 1000);
      $('#sClock').style.width = (left / 600) + '%';
      S.raf = requestAnimationFrame(tick);
    };
    S.raf = requestAnimationFrame(tick);
  }
  function endSprint(silent) {
    S.running = false;
    cancelAnimationFrame(S.raf);
    stopAll();
    $('#sInput').disabled = true;
    $('#sGo').disabled = true;
    $('#sHear').disabled = true;
    $('#sStart').disabled = false;
    $('#sStart').textContent = 'Go again';
    $('#sTime').textContent = 0;
    $('#sClock').style.width = '0%';
    if (silent) return;
    let m = 'Time. You decoded ' + S.score + ' letters.';
    if (S.score > state.bestSprint) { state.bestSprint = S.score; save(); m += ' New best.'; }
    $('#sMsg').textContent = m;
    $('#sMsg').className = 'msg ok';
    showBest();
  }
  $('#sStart').addEventListener('click', startSprint);
  $('#sHear').addEventListener('click', function () { if (S.running) playText(S.word); });
  $('#audioOnly').addEventListener('change', function () { if (S.running) nextWord(); });
  $('#sForm').addEventListener('submit', function (e) {
    e.preventDefault();
    if (!S.running) return;
    const guess = $('#sInput').value.trim().toUpperCase();
    if (!guess) return;
    const ok = guess === S.word;
    const same = guess.length === S.word.length;
    S.word.split('').forEach(function (c, i) {
      const hit = same && guess[i] === c;
      record(c, hit);
      if (same && !hit) confuse(c, guess[i]);
    });
    if (ok) {
      S.score += S.word.length;
      $('#sScore').textContent = S.score;
      $('#sMsg').textContent = S.word + ' correct.';
      $('#sMsg').className = 'msg ok';
    } else {
      $('#sMsg').textContent = 'It was ' + S.word + '.';
      $('#sMsg').className = 'msg bad';
    }
    nextWord();
  });

  /* ---------- tree ---------- */
  function playRaw(code) { return playText(scheduleForCode(code, unitMs(state.wpm))); }
  const TR = { digits: false, find: false, path: '', target: null, mistakes: 0, hints: 0, score: 0, streak: 0, locked: false, nodes: [], by: {}, built: false, msg: '', msgClass: 'msg' };
  const COLW = 62, ROWH = 26, X0 = 44, Y0 = 22;
  const nx = function (n) { return X0 + n.depth * COLW; };
  const ny = function (n) { return Y0 + n.row * ROWH; };

  function buildTreeView() {
    TR.nodes = buildTree(TR.digits);
    TR.by = {};
    TR.nodes.forEach(function (n) { TR.by[n.code] = n; });
    const maxD = TR.nodes.reduce(function (m, n) { return Math.max(m, n.depth); }, 0);
    const w = X0 + maxD * COLW + 30;
    const h = Y0 * 2 + (TR.nodes.length - 1) * ROWH;
    let edges = '', nodes = '';
    TR.nodes.forEach(function (n) {
      if (!n.code) return;
      const p = TR.by[n.code.slice(0, -1)];
      const mx = (nx(p) + nx(n)) / 2;
      edges += '<path class="edge ' + (n.code.slice(-1) === '.' ? 'dot' : 'dash') + '" data-code="' + n.code +
        '" d="M' + nx(p) + ' ' + ny(p) + 'H' + mx + 'V' + ny(n) + 'H' + nx(n) + '"/>';
    });
    TR.nodes.forEach(function (n) {
      const cls = 'nd' + (!n.code ? ' root' : n.ch ? '' : ' junction');
      let shape, text = '';
      if (!n.code) { shape = '<rect class="sh" x="-26" y="-13" width="52" height="26" rx="13"/>'; text = '<text class="lbl">START</text>'; }
      else if (n.ch) { shape = '<circle class="sh" r="11.5"/>'; text = '<text class="lbl">' + n.ch + '</text>'; }
      else { shape = '<circle class="sh" r="5"/>'; }
      nodes += '<g class="' + cls + '" data-code="' + n.code + '" transform="translate(' + nx(n) + ' ' + ny(n) +
        ')" tabindex="0" role="button"><circle class="hit" r="13"/>' + shape + text + '</g>';
    });
    const svg = $('#trSvg');
    svg.setAttribute('width', w);
    svg.setAttribute('height', h);
    svg.setAttribute('viewBox', '0 0 ' + w + ' ' + h);
    svg.innerHTML = edges + nodes;
  }

  function renderTreeInfo() {
    const n = TR.by[TR.path];
    const pathHtml = TR.path ? symHtml(TR.path, 'big') : '<span class="small">no steps yet</span>';
    const box = $('#trInfo');
    if (TR.find) {
      box.innerHTML = '<div class="big-ch" aria-label="Find ' + TR.target + '">' + TR.target + '</div>' +
        '<div class="col"><span class="small">Find this letter</span>' + pathHtml + '</div>' +
        '<div class="col"><span class="small">Score <b>' + TR.score + '</b> &middot; Streak <b>' + TR.streak + '</b></span>' +
        '<button class="btn ghost sm" id="trHint">Hint</button></div>';
      $('#trHint').addEventListener('click', trHint);
    } else {
      const text = !TR.path ? 'Start at the root. Pick Dot or Dash, or tap a circle.' :
        n && n.ch ? spoken(TR.path) : 'No letter sits here. Keep going or step back.';
      box.innerHTML = '<div class="big-ch">' + (n && n.ch ? n.ch : '') + '</div>' +
        '<div class="col">' + pathHtml + '<span class="small">' + text + '</span>' +
        (n && n.ch ? '<button class="btn ghost sm" id="trHear">Hear ' + n.ch + '</button>' : '') + '</div>';
      const h = $('#trHear');
      if (h) h.addEventListener('click', function () { playText(n.ch); });
    }
    const m = $('#trMsg');
    m.textContent = TR.msg;
    m.className = TR.msgClass;
  }

  function scrollToCur() {
    const wrap = $('#trWrap');
    const n = TR.by[TR.path];
    if (!n || !wrap.clientHeight) return;
    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    wrap.scrollTo({
      top: Math.max(0, ny(n) - wrap.clientHeight / 2),
      left: Math.max(0, nx(n) - wrap.clientWidth / 2),
      behavior: reduce ? 'auto' : 'smooth'
    });
  }

  function updateTree() {
    const svg = $('#trSvg');
    const path = TR.path;
    svg.querySelectorAll('.edge').forEach(function (el) {
      el.classList.toggle('on', path.indexOf(el.dataset.code) === 0);
    });
    svg.querySelectorAll('.nd').forEach(function (g) {
      const code = g.dataset.code;
      const n = TR.by[code];
      const on = path.indexOf(code) === 0;
      g.classList.toggle('on', on);
      g.classList.toggle('cur', code === path);
      g.classList.toggle('hide', TR.find);
      const name = !code ? 'Start' : (TR.find && !on) ? 'branch' : (n.ch ? n.ch : 'no letter');
      g.setAttribute('aria-label', name + (code && !TR.find ? ', ' + spoken(code) : ''));
    });
    $('#trDot').disabled = TR.locked || !TR.by[path + '.'];
    $('#trDash').disabled = TR.locked || !TR.by[path + '-'];
    $('#trBack').disabled = TR.locked || !path;
    $('#trReset').disabled = TR.locked || !path;
    renderTreeInfo();
    scrollToCur();
  }

  function trMove(code, soundCode) {
    if (TR.locked || !TR.by[code]) return;
    const prev = TR.path;
    TR.path = code;
    TR.msg = '';
    TR.msgClass = 'msg';
    if (soundCode) playRaw(soundCode);
    if (TR.find && TR.target) {
      const want = MORSE[TR.target];
      if (code === want) { trWin(); return; }
      if (want.indexOf(prev) === 0 && want.indexOf(code) !== 0) {
        TR.mistakes++;
        TR.msg = 'Dead end. Step back and try the other way.';
        TR.msgClass = 'msg bad';
      }
    }
    updateTree();
  }
  function trStep(sym) { trMove(TR.path + sym, sym); }
  function trBack() { if (TR.path) trMove(TR.path.slice(0, -1), ''); }

  function trWin() {
    TR.locked = true;
    const clean = TR.mistakes === 0 && TR.hints === 0;
    record(TR.target, clean);
    TR.streak = clean ? TR.streak + 1 : 0;
    bumpMax('treeBest', TR.streak);
    TR.score += Math.max(2, 10 - 3 * TR.mistakes - 2 * TR.hints);
    TR.msg = (clean ? 'Straight there. ' : 'Found it. ') + TR.target + ' is ' + spoken(MORSE[TR.target]) + '.';
    TR.msgClass = clean ? 'msg ok' : 'msg';
    updateTree();
    setTimeout(function () { playRaw(MORSE[TR.target]); }, 250);
    setTimeout(function () { if (mode === 'tree' && TR.locked) trNext(); }, 2200);
  }

  function trNext() {
    const chars = TR.nodes.filter(function (n) { return n.ch; }).map(function (n) { return n.ch; });
    const set = KOCH.slice(0, state.n);
    let p = chars.filter(function (c) { return set.indexOf(c) >= 0; });
    if (p.length < 2) p = chars;
    let best = null;
    for (let k = 0; k < 3; k++) {
      const c = p[Math.floor(Math.random() * p.length)];
      if (c === TR.target && p.length > 1) { k--; continue; }
      if (best === null || accuracy(c) < accuracy(best)) best = c;
    }
    TR.target = best;
    TR.path = '';
    TR.mistakes = 0;
    TR.hints = 0;
    TR.locked = false;
    TR.msg = '';
    TR.msgClass = 'msg';
    updateTree();
  }

  function trHint() {
    if (TR.locked || !TR.target) return;
    const want = MORSE[TR.target];
    TR.hints++;
    let btn;
    if (want.indexOf(TR.path) === 0) {
      const sym = want[TR.path.length];
      btn = sym === '.' ? $('#trDot') : $('#trDash');
      TR.msg = 'Next step: ' + (sym === '.' ? 'dot, up.' : 'dash, down.');
    } else {
      btn = $('#trBack');
      TR.msg = 'You left the route. Step back.';
    }
    TR.msgClass = 'msg';
    renderTreeInfo();
    btn.classList.add('nudge');
    setTimeout(function () { btn.classList.remove('nudge'); }, 1800);
  }

  function showTree() {
    if (!TR.built) { buildTreeView(); TR.built = true; }
    if (TR.find && !TR.target) trNext(); else updateTree();
  }
  function setTrFind(on) {
    TR.find = on;
    TR.path = '';
    TR.locked = false;
    TR.msg = '';
    TR.msgClass = 'msg';
    $('#trExplore').setAttribute('aria-pressed', String(!on));
    $('#trFind').setAttribute('aria-pressed', String(on));
    if (on) trNext(); else updateTree();
  }
  $('#trExplore').addEventListener('click', function () { setTrFind(false); });
  $('#trFind').addEventListener('click', function () { setTrFind(true); });
  $('#trNums').addEventListener('change', function (e) {
    TR.digits = e.target.checked;
    TR.path = '';
    TR.locked = false;
    buildTreeView();
    if (TR.find) trNext(); else updateTree();
  });
  $('#trDot').addEventListener('click', function () { trStep('.'); });
  $('#trDash').addEventListener('click', function () { trStep('-'); });
  $('#trBack').addEventListener('click', trBack);
  $('#trReset').addEventListener('click', function () { trMove('', ''); });
  $('#trSvg').addEventListener('click', function (e) {
    const g = e.target.closest ? e.target.closest('.nd') : null;
    if (g) trMove(g.dataset.code, g.dataset.code);
  });
  $('#trSvg').addEventListener('keydown', function (e) {
    const g = e.target.closest ? e.target.closest('.nd') : null;
    if (g && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); trMove(g.dataset.code, g.dataset.code); }
  });

  /* ---------- mash ---------- */
  const M = { word: '', str: '', cuts: [], hints: 0, tries: 0, score: 0, streak: 0, locked: false, msg: '', msgClass: 'msg' };

  function mashPick() {
    const set = KOCH.slice(0, state.n).split('').filter(function (c) { return /[A-Z]/.test(c); });
    const cand = WORDS.filter(function (w) {
      return w.length >= 3 && w.length <= 6 && w !== M.word && w.split('').every(function (c) { return set.indexOf(c) >= 0; });
    });
    let w = '';
    for (let t = 0; t < 30; t++) {
      if (cand.length >= 3) w = cand[Math.floor(Math.random() * cand.length)];
      else {
        w = '';
        const len = 2 + Math.floor(Math.random() * 2);
        for (let i = 0; i < len; i++) w += set[Math.floor(Math.random() * set.length)];
      }
      if (uniqueSplit(w)) return w;
    }
    return w;
  }
  function mashNew() {
    M.word = mashPick();
    M.str = wordCode(M.word);
    M.cuts = [];
    for (let i = 0; i < M.str.length - 1; i++) M.cuts.push(false);
    M.hints = 0;
    M.tries = 0;
    M.locked = false;
    M.msg = '';
    M.msgClass = 'msg';
    $('#mFact').hidden = true;
    renderMash();
  }
  function mashRead() {
    const chunks = chunkify(M.str, M.cuts);
    const letters = readChunks(chunks);
    return { chunks: chunks, letters: letters, text: letters.every(Boolean) ? letters.join('') : null };
  }
  function renderMash() {
    $('#mScore').textContent = M.score;
    $('#mStreak').textContent = M.streak;
    $('#mClue').innerHTML = '<span>Hidden letters</span><b>' + sortLetters(M.word).split('').join(' ') + '</b><span>' + M.word.length + ' letters</span>';
    let h = '';
    for (let i = 0; i < M.str.length; i++) {
      h += '<span class="ms ' + (M.str[i] === '.' ? 'd' : 'h') + '"></span>';
      if (i < M.str.length - 1) {
        h += '<button class="gapb' + (M.cuts[i] ? ' cut' : '') + '" data-i="' + i + '" aria-pressed="' + (M.cuts[i] ? 'true' : 'false') +
          '" aria-label="Divider after symbol ' + (i + 1) + '"' + (M.locked ? ' disabled' : '') + '></button>';
      }
    }
    $('#mStr').innerHTML = h;
    const r = mashRead();
    $('#mChunks').innerHTML = r.chunks.map(function (c, i) {
      const l = r.letters[i];
      return '<span class="chunk ' + (M.locked ? 'good' : l ? '' : 'bad') + '"><b>' + (l || '?') + '</b>' + symHtml(c, 'small') + '</span>';
    }).join('');
    const m = $('#mMsg');
    m.textContent = M.msg;
    m.className = M.msgClass;
    ['#mCheck', '#mHint', '#mClear'].forEach(function (id) { $(id).hidden = M.locked; });
    $('#mNext').hidden = !M.locked;
    $('#mHear').textContent = M.locked ? 'Hear it with gaps' : 'Hear the string';
  }
  function mashWin() {
    M.locked = true;
    const clean = M.hints === 0 && M.tries === 0;
    M.word.split('').forEach(function (c) { record(c, clean); });
    M.streak = clean ? M.streak + 1 : 0;
    if (clean) { state.stats.mashClean++; save(); }
    M.score += Math.max(2, 10 - 2 * M.hints - 2 * M.tries);
    M.msg = (clean ? 'Clean split. ' : 'Solved. ') + 'It spells ' + M.word + '.';
    M.msgClass = clean ? 'msg ok' : 'msg';
    const n = countSplits(M.str);
    const others = shuffle(allSplits(M.str, 600).filter(function (s) { return s !== M.word; })).slice(0, 3);
    $('#mFact').innerHTML = 'Those ' + M.str.length + ' symbols can be split <b>' + n + '</b> different ways into letters.' +
      (others.length ? ' A few other readings: ' + others.map(function (s) { return '<b>' + s + '</b>'; }).join(', ') + '.' : '') +
      ' That is why real Morse needs the gaps.';
    $('#mFact').hidden = false;
    renderMash();
    setTimeout(function () { if (mode === 'mash' && M.locked) playText(M.word); }, 200);
  }
  function mashAuto() {
    if (mashRead().text === M.word) mashWin(); else renderMash();
  }
  function mashCheck() {
    if (M.locked) return;
    const r = mashRead();
    if (r.text === M.word) { mashWin(); return; }
    M.tries++;
    M.msgClass = 'msg bad';
    if (r.text === null) M.msg = 'Some chunks are not letters yet. They show as ? above.';
    else if (sortLetters(r.text) === sortLetters(M.word)) M.msg = 'Right letters, wrong order. Try another split.';
    else M.msg = 'That reads ' + r.text + ', which does not use the hidden letters.';
    renderMash();
  }
  function mashHint() {
    if (M.locked) return;
    const want = correctCuts(M.word);
    M.hints++;
    const wrong = M.cuts.findIndex(function (c, i) { return c && !want[i]; });
    if (wrong >= 0) { M.cuts[wrong] = false; M.msg = 'Removed a divider that did not belong.'; }
    else {
      const miss = want.findIndex(function (w, i) { return w && !M.cuts[i]; });
      if (miss >= 0) { M.cuts[miss] = true; M.msg = 'Added a correct divider.'; }
    }
    M.msgClass = 'msg';
    mashAuto();
  }
  function showMash() {
    if (!M.word) mashNew(); else renderMash();
  }
  $('#mStr').addEventListener('click', function (e) {
    const b = e.target.closest ? e.target.closest('.gapb') : null;
    if (!b || M.locked) return;
    const i = +b.dataset.i;
    M.cuts[i] = !M.cuts[i];
    M.msg = '';
    M.msgClass = 'msg';
    mashAuto();
    const again = $('#mStr').querySelector('.gapb[data-i="' + i + '"]');
    if (again) again.focus();
  });
  $('#mCheck').addEventListener('click', mashCheck);
  $('#mHint').addEventListener('click', mashHint);
  $('#mClear').addEventListener('click', function () {
    M.cuts = M.cuts.map(function () { return false; });
    M.msg = '';
    renderMash();
  });
  $('#mHear').addEventListener('click', function () { if (M.locked) playText(M.word); else playRaw(M.str); });
  $('#mNext').addEventListener('click', mashNew);

  /* ---------- daily ---------- */
  const D = { key: '', phrase: '', tries: 0, msg: '', msgClass: 'msg', hide: false };
  function showDaily() {
    const key = todayKey();
    if (key !== D.key) {
      D.key = key;
      D.phrase = DAILY[dailyIndex(key, DAILY.length)];
      D.tries = 0;
      D.msg = '';
      D.msgClass = 'msg';
      $('#dInput').value = '';
    }
    renderDaily();
  }
  function renderDaily() {
    const solved = state.daily.last === D.key;
    const words = D.phrase.split(' ');
    $('#dStreak').textContent = liveStreak(state.daily.last, D.key, state.daily.streak);
    $('#dBest').textContent = state.daily.best;
    $('#dSolved').textContent = state.daily.solved;
    $('#dClue').innerHTML = '<span>' + fmtDate(D.key) + '</span><b>' + words.length + ' ' + (words.length === 1 ? 'word' : 'words') + '</b><span>' +
      D.phrase.replace(/ /g, '').length + ' letters</span>';
    $('#dCode').innerHTML = words.map(function (w) {
      return '<div class="dword">' + w.split('').map(function (c) {
        return '<span class="dlet">' + (D.hide && !solved ? '<i class="blank"></i>' : symHtml(MORSE[c])) + '<b>' + (solved ? c : '') + '</b></span>';
      }).join('') + '</div>';
    }).join('');
    $('#dInput').disabled = solved;
    $('#dGo').disabled = solved;
    if (solved && !D.msg) {
      D.msg = 'Solved today: ' + D.phrase + '. Come back tomorrow for a new one.';
      D.msgClass = 'msg ok';
    }
    const m = $('#dMsg');
    m.textContent = D.msg;
    m.className = D.msgClass;
    $('#dHide').checked = D.hide;
  }
  $('#dForm').addEventListener('submit', function (e) {
    e.preventDefault();
    if (todayKey() !== D.key) { showDaily(); return; }
    if (state.daily.last === D.key) return;
    const g = normalizePhrase($('#dInput').value);
    if (!g) return;
    if (g === D.phrase) {
      const clean = D.tries === 0;
      D.phrase.replace(/ /g, '').split('').forEach(function (c) { record(c, clean); });
      state.daily.streak = streakAfter(state.daily.last, D.key, state.daily.streak);
      state.daily.best = Math.max(state.daily.best, state.daily.streak);
      state.daily.solved++;
      state.daily.last = D.key;
      save();
      D.msg = (clean ? 'First try. ' : 'Solved. ') + D.phrase + '. Streak ' + state.daily.streak + '. Come back tomorrow for a new one.';
      D.msgClass = 'msg ok';
    } else {
      D.tries++;
      const total = D.phrase.split(' ').length;
      D.msg = wordsRight(g, D.phrase) + ' of ' + total + ' words right. Keep going.';
      D.msgClass = 'msg bad';
    }
    renderDaily();
  });
  $('#dHear').addEventListener('click', function () { if (D.phrase) playText(D.phrase); });
  $('#dHide').addEventListener('change', function (e) { D.hide = e.target.checked; renderDaily(); });

  /* ---------- badges ---------- */
  function renderBadges() {
    const snap = badgeSnap();
    let got = 0;
    $('#bGrid').innerHTML = BADGES.map(function (b) {
      const g = b.goal(snap);
      const earned = !!state.badges[b.id];
      if (earned) got++;
      const cur = Math.min(g[0], g[1]);
      const status = earned ? 'Earned ' + fmtDate(state.badges[b.id]) : cur + ' of ' + g[1];
      return '<div class="badge ' + (earned ? 'got' : 'locked') + '"><div class="medal">' + symHtml(b.sig, 'big') + '</div>' +
        '<b>' + esc(b.name) + '</b><span class="bdesc">' + esc(b.desc) + '</span>' +
        '<span class="bbar" aria-hidden="true"><span style="width:' + Math.round((earned ? 1 : cur / g[1]) * 100) + '%"></span></span>' +
        '<span class="bstat">' + status + '</span></div>';
    }).join('');
    $('#bSummary').textContent = got + ' of ' + BADGES.length + ' earned. Each medal wears its own Morse pattern.';
  }

  /* ---------- weak spots ---------- */
  function heatClass(a) { return a < 0 ? 'h0' : a < 0.6 ? 'h1' : a < 0.85 ? 'h2' : 'h3'; }
  function renderWeak() {
    const order = KOCH.split('');
    let ok = 0, n = 0, tracked = 0;
    order.forEach(function (ch) {
      const c = recCount(state.mastery[ch]);
      if (c.n) { tracked++; ok += c.ok; n += c.n; }
    });
    const weak = weakList(state.mastery, order, 8);
    $('#wStats').innerHTML = '<span>Tracked <b>' + tracked + '</b> of 36</span>' +
      '<span>Recent accuracy <b>' + (n ? Math.round(ok / n * 100) + '%' : '-') + '</b></span>' +
      '<span>Shaky <b>' + weak.length + '</b></span>';

    $('#wList').innerHTML = weak.length ? weak.map(function (w) {
      const pct = Math.round(rawAcc(state.mastery[w.ch]) * 100);
      return '<div class="wrow"><span class="wch">' + w.ch + '</span>' + symHtml(MORSE[w.ch]) +
        '<span class="wbar" aria-hidden="true"><span style="width:' + pct + '%"></span></span>' +
        '<span class="wpct">' + pct + '%</span>' +
        '<button class="btn ghost sm" data-hear="' + w.ch + '">Hear</button></div>';
    }).join('') : '<p class="empty">' + (tracked ?
      'Nothing shaky right now. Add more characters in Listen to keep growing.' :
      'No data yet. Play Listen, Tap, Sprint or the tree and your slips show up here.') + '</p>';

    const conf = topConfusions(state.conf, 6);
    $('#wConf').innerHTML = conf.length ? conf.map(function (c) {
      return '<div class="wrow"><span class="pairs">Meant <b class="wch s">' + c.target + '</b>' + symHtml(MORSE[c.target], 'small') + '</span>' +
        '<span class="pairs">answered <b class="wch s">' + c.got + '</b>' + symHtml(MORSE[c.got], 'small') + '</span>' +
        '<span class="wpct">x' + c.n + '</span>' +
        '<span class="note">' + esc(compareNote(c.target, c.got)) + '</span></div>';
    }).join('') : '<p class="empty">No mix-ups logged yet. When you answer the wrong character, the pair lands here.</p>';

    const set = KOCH.slice(0, state.n);
    $('#wHeat').innerHTML = order.map(function (ch) {
      const a = rawAcc(state.mastery[ch]);
      const pct = a < 0 ? 'new' : Math.round(a * 100) + '%';
      return '<button class="hm ' + heatClass(a) + (set.indexOf(ch) < 0 ? ' out' : '') + '" data-hear="' + ch +
        '" aria-label="' + ch + ', ' + (a < 0 ? 'not practised yet' : pct + ' recent accuracy') + '"><b>' + ch + '</b><span>' + pct + '</span></button>';
    }).join('');

    const dc = drillChars(state.mastery, state.conf, order);
    $('#wDrill').disabled = !dc.length;
    $('#wMsg').textContent = dc.length ? 'Drill set: ' + dc.join(' ') : 'Nothing to drill yet. Play a few rounds first.';
  }
  $('#weak').addEventListener('click', function (e) {
    const b = e.target.closest ? e.target.closest('[data-hear]') : null;
    if (b) playText(b.dataset.hear);
  });
  $('#wDrill').addEventListener('click', function () {
    const dc = drillChars(state.mastery, state.conf, KOCH.split(''));
    if (!dc.length) return;
    L.drill = dc;
    setMode('listen');
  });
  $('#wReset').addEventListener('click', function () { $('#wSure').hidden = false; $('#wReset').hidden = true; });
  $('#wNo').addEventListener('click', function () { $('#wSure').hidden = true; $('#wReset').hidden = false; });
  $('#wYes').addEventListener('click', function () {
    state.mastery = {};
    state.conf = {};
    L.drill = null;
    save();
    $('#wSure').hidden = true;
    $('#wReset').hidden = false;
    renderWeak();
    renderSettings();
    toast('Stats cleared');
  });

  /* ---------- signals ---------- */
  const canBuzz = typeof navigator.vibrate === 'function';
  function renderSignals() {
    $('#sigSound').checked = state.sig.sound;
    $('#sigLight').checked = state.sig.light;
    $('#sigBuzz').checked = state.sig.buzz && canBuzz;
    $('#sigBuzz').disabled = !canBuzz;
    $('#sigBuzzTxt').textContent = canBuzz ? 'Buzz' : 'Buzz (not on this device)';
    $('#signalWrap').hidden = !state.sig.light;
    $('#sigNote').textContent = 'Light adds a flashing bar that stays at the top as you scroll. Buzz vibrates a phone in time with the code. ' +
      'Fast flashing can bother people who are sensitive to it, so keep the speed low if that is you.';
  }
  function onSignal(key, el) {
    state.sig[key] = el.checked;
    if (!state.sig.sound && !state.sig.light && !state.sig.buzz) {
      state.sig[key] = true;
      toast('Keep at least one signal on.');
    }
    save();
    renderSignals();
  }
  $('#sigSound').addEventListener('change', function (e) { onSignal('sound', e.target); });
  $('#sigLight').addEventListener('change', function (e) { onSignal('light', e.target); });
  $('#sigBuzz').addEventListener('change', function (e) { onSignal('buzz', e.target); });
  $('#sigTest').addEventListener('click', function () { playText('SOS'); });

  /* ---------- keyboard ---------- */
  document.addEventListener('keydown', function (e) {
    const inField = e.target && e.target.matches && e.target.matches('input[type=text], input:not([type])');
    if (inField) return;
    if (mode === 'tap' && e.code === 'Space') { e.preventDefault(); if (!e.repeat) tapDown(); return; }
    if (mode === 'tree') {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.target.matches && e.target.matches('input[type=range]')) return;
      const k = e.key;
      if (k === '.' || k === 'ArrowUp') { e.preventDefault(); trStep('.'); }
      else if (k === '-' || k === 'ArrowDown') { e.preventDefault(); trStep('-'); }
      else if (k === 'Backspace' || k === 'ArrowLeft') { e.preventDefault(); trBack(); }
      else if (k === 'Escape') { trMove('', ''); }
      return;
    }
    if (mode === 'listen') {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (/^[a-z0-9]$/i.test(e.key)) {
        const k = e.key.toUpperCase();
        const shown = Array.prototype.some.call(document.querySelectorAll('#lOpts .opt'), function (b) { return b.dataset.c === k; });
        if (shown) answerListen(k);
        return;
      }
      if (e.code === 'Space' || e.key === 'Enter') {
        e.preventDefault();
        if (L.answered) nextListen(true); else if (L.cur) playText(L.cur);
      }
    }
  });
  document.addEventListener('keyup', function (e) {
    if (mode === 'tap' && e.code === 'Space') { e.preventDefault(); tapUp(); }
  });

  renderSettings();
  renderListenStats();
  renderTapStats();
  showBest();
  renderSignals();
  checkBadges();
})();
