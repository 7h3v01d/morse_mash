/* Morse Mash shared app layer: state, storage, audio, helpers and the mode registry.
   Pure logic lives in morse-core.js. Each game mode lives in its own file under js/app/ and registers itself here. */
window.MM = (function () {
  'use strict';
  const {
    KOCH, unitMs, spoken, buildSchedule, scheduleForCode, pushRec, recCount, rawAcc, weakList,
    confusedWith, vibratePattern, BADGES, farnsworthGap, restoreState, codeFor
  } = window.MorseCore;

  const WORDS = ['SOS', 'CAT', 'SEA', 'MAP', 'TOP', 'KEY', 'DOT', 'SAIL', 'SHIP', 'WAVE', 'LAMP', 'CODE', 'DASH', 'RADIO', 'SIGNAL', 'MORSE', 'WIRE', 'PORT', 'STAR', 'MOON', 'RAIN', 'WIND', 'SALT', 'TIDE', 'ROPE', 'LIGHT', 'HELP', 'NORTH', 'COAST', 'ANCHOR', 'MAST', 'SKY', 'FOG', 'BOAT', 'TEAM', 'PLAY', 'GAME', 'MASH', 'BEEP', 'LONG', 'SHORT', 'FAST', 'SLOW', 'PAUSE', 'LISTEN', 'TAP', 'ZIP', 'QUIZ', 'JAZZ', 'FOX'];

  const $ = function (s) { return document.querySelector(s); };
  const STORE = 'morsemash.v1';
  // One state object for the whole session. It is never replaced, only refilled (see replaceState),
  // so every module can keep a reference to it.
  const state = restoreState(null);
  try {
    const raw = localStorage.getItem(STORE);
    if (raw) Object.assign(state, restoreState(JSON.parse(raw)));
  } catch (e) { /* storage unavailable or unreadable */ }
  function replaceState(next) { Object.assign(state, restoreState(next)); persist(); }
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
  function confuse(target, got) {
    if (!target || !got || target === got || !codeFor(got)) return;
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
  // Picks from p, leaning toward characters with lower accuracy, and avoiding a repeat.
  function pickChar(avoid, p) {
    p = p || pool();
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
  // Practice noise gain for levels 0 (off) to 3 (heavy).
  const NOISE = [0, 0.15, 0.3, 0.55];
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
  // Practice noise: looped white noise, band-passed around the tone so it sounds like a busy receiver.
  let noiseBuf = null;
  function startNoise(c, t0, secs, level) {
    if (!noiseBuf) {
      noiseBuf = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    const src = c.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = true;
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = FREQ;
    bp.Q.value = 0.7;
    const g = c.createGain();
    const a = t0 - 0.05, z = t0 + secs + 0.2;
    g.gain.setValueAtTime(0, a);
    g.gain.linearRampToValueAtTime(level, a + 0.04);
    g.gain.setValueAtTime(level, z - 0.06);
    g.gain.linearRampToValueAtTime(0, z);
    src.connect(bp);
    bp.connect(g);
    g.connect(c.destination);
    src.start(Math.max(c.currentTime, a));
    src.stop(z + 0.01);
    playing.push(src);
  }
  function gapMs() { return farnsworthGap(state.wpm, state.eff); }
  function playText(text) {
    stopAll();
    const c = state.sig.sound ? audio() : null;
    const unit = unitMs(state.wpm);
    const sched = typeof text === 'string' ? buildSchedule(text, unit, gapMs()) : text;
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
      if (state.sig.noise && sched.ev.length) startNoise(c, t0, sched.total / 1000, NOISE[state.sig.noise] || 0);
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

  function playRaw(code) { return playText(scheduleForCode(code, unitMs(state.wpm))); }

  /* ---------- mode registry ---------- */
  // A mode is { show, leave, onKey, onKeyUp, onPool }; every hook is optional.
  const MODES = ['learn', 'tree', 'listen', 'tap', 'mash', 'sprint', 'daily', 'weak', 'badges'];
  const modes = {};
  let mode = 'learn';
  function register(name, def) { modes[name] = def; }
  function is(m) { return mode === m; }
  function current() { return modes[mode] || {}; }
  function setMode(m) {
    stopAll();
    const prev = current();
    if (prev.leave) prev.leave();
    mode = m;
    document.querySelectorAll('.tab').forEach(function (b) {
      b.setAttribute('aria-selected', String(b.dataset.mode === m));
    });
    MODES.forEach(function (id) { $('#' + id).hidden = id !== m; });
    const next = current();
    if (next.show) next.show();
  }
  // Views that depend on state (settings, stats, the chart) register a refresher; refreshAll redraws them all.
  const refreshers = [];
  function onRefresh(fn) { refreshers.push(fn); }
  function refreshAll() { refreshers.forEach(function (fn) { fn(); }); }

  return {
    WORDS: WORDS, $: $, state: state, replaceState: replaceState, persist: persist, save: save, bumpMax: bumpMax,
    todayKey: todayKey, fmtDate: fmtDate, badgeSnap: badgeSnap, checkBadges: checkBadges, record: record, accuracy: accuracy,
    pool: pool, confuse: confuse, distractors: distractors, pickChar: pickChar, shuffle: shuffle, symHtml: symHtml, esc: esc,
    toast: toast, audio: audio, stopAll: stopAll, playText: playText, playRaw: playRaw, gapMs: gapMs, toneOn: toneOn, toneOff: toneOff,
    modes: modes, register: register, is: is, current: current, setMode: setMode, onRefresh: onRefresh, refreshAll: refreshAll
  };
})();
