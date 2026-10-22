/*
 * Morse Mash core: the pure logic behind the game. No DOM, no storage, no timers.
 * Loads in the browser as window.MorseCore and in Node with require().
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MorseCore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const MORSE = {
    A: '.-', B: '-...', C: '-.-.', D: '-..', E: '.', F: '..-.', G: '--.', H: '....', I: '..',
    J: '.---', K: '-.-', L: '.-..', M: '--', N: '-.', O: '---', P: '.--.', Q: '--.-', R: '.-.',
    S: '...', T: '-', U: '..-', V: '...-', W: '.--', X: '-..-', Y: '-.--', Z: '--..',
    0: '-----', 1: '.----', 2: '..---', 3: '...--', 4: '....-', 5: '.....',
    6: '-....', 7: '--...', 8: '---..', 9: '----.'
  };
  // Koch order: start with a few sounds that are easy to tell apart, then add one at a time.
  const KOCH = 'KMRSUAPTLOWINJEFYVGQZHBCDX0123456789';
  const REV = {};
  Object.keys(MORSE).forEach(function (k) { REV[MORSE[k]] = k; });
  const unitMs = function (wpm) { return 1200 / wpm; };
  const classify = function (durs, unit) {
    return durs.map(function (d) { return d < 2 * unit ? '.' : '-'; }).join('');
  };
  const decodeCode = function (c) { return REV[c] || null; };
  const spoken = function (code) {
    return code.split('').map(function (s, i, a) {
      return s === '.' ? (i === a.length - 1 ? 'dit' : 'di') : 'dah';
    }).join('-');
  };
  // Prosigns are sent as one run of symbols with no letter gap. Written <AR> in text.
  const PROSIGNS = {
    AR: '.-.-.', AS: '.-...', BT: '-...-', CT: '-.-.-', HH: '........', KN: '-.--.', SK: '...-.-', SOS: '...---...'
  };
  const PROSIGN_INFO = {
    AR: 'End of message', AS: 'Wait', BT: 'Break, new paragraph', CT: 'Start of message',
    HH: 'Error, ignore the last word', KN: 'Go ahead, named station only', SK: 'End of contact', SOS: 'Distress'
  };
  // Splits text into tokens: ' ' for a word gap, or { label, code, pro } for a character or <PROSIGN>.
  function tokenize(text) {
    const out = [];
    const up = String(text).toUpperCase();
    for (let i = 0; i < up.length; i++) {
      const ch = up[i];
      if (ch === ' ') { out.push(' '); continue; }
      if (ch === '<') {
        const j = up.indexOf('>', i + 1);
        const name = j > i ? up.slice(i + 1, j) : '';
        if (PROSIGNS[name]) { out.push({ label: name, code: PROSIGNS[name], pro: true }); i = j; continue; }
      }
      if (MORSE[ch]) out.push({ label: ch, code: MORSE[ch], pro: false });
    }
    return out;
  }
  // Farnsworth: characters keep their full speed, the gaps between them stretch so the overall
  // speed drops to effWpm. Returns the length of one gap unit in ms (ARRL formula).
  function farnsworthGap(charWpm, effWpm) {
    if (!(effWpm > 0) || effWpm >= charWpm) return unitMs(charWpm);
    const spacing = (60 * charWpm - 37.2 * effWpm) / (effWpm * charWpm);
    return spacing * 1000 / 19;
  }
  // The code for a character or a prosign name, or null.
  function codeFor(label) { return MORSE[label] || PROSIGNS[label] || null; }
  // Text to send for a character or prosign, so prosigns go out as one run.
  function sendText(label) { return PROSIGNS[label] ? '<' + label + '>' : label; }
  // Standard timing: dot 1, dash 3, gap inside a letter 1, between letters 3, between words 7.
  // With a gap unit longer than the unit, the letter and word gaps use it instead (Farnsworth).
  function buildSchedule(text, unit, gap) {
    const g = gap > unit ? gap : unit;
    const ev = [];
    let t = 0;
    tokenize(text).forEach(function (tok) {
      if (tok === ' ') { t += 4 * g; return; }
      for (let j = 0; j < tok.code.length; j++) {
        const d = tok.code[j] === '.' ? unit : 3 * unit;
        ev.push({ start: t, dur: d });
        t += d + unit;
      }
      t += 3 * g - unit;
    });
    return { ev: ev, total: t };
  }
  function scheduleForCode(code, unit) {
    const ev = [];
    let t = 0;
    for (let i = 0; i < code.length; i++) {
      const d = code[i] === '.' ? unit : 3 * unit;
      ev.push({ start: t, dur: d });
      t += d + unit;
    }
    return { ev: ev, total: t };
  }
  // Morse tree: dot branch above its parent, dash branch below, rows in reading order.
  function buildTree(withDigits) {
    const codes = {};
    Object.keys(MORSE).forEach(function (c) {
      if (withDigits || /[A-Z]/.test(c)) codes[MORSE[c]] = c;
    });
    const has = { '': true };
    Object.keys(codes).forEach(function (code) {
      for (let i = 1; i <= code.length; i++) has[code.slice(0, i)] = true;
    });
    const nodes = [];
    let row = 0;
    (function walk(code) {
      if (has[code + '.']) walk(code + '.');
      nodes.push({ code: code, ch: codes[code] || null, depth: code.length, row: row++ });
      if (has[code + '-']) walk(code + '-');
    })('');
    return nodes;
  }
  // Recent results per character are a string of 1 (right) and 0 (wrong), newest last.
  function pushRec(m, ok) { m.rec = ((m.rec || '') + (ok ? '1' : '0')).slice(-12); }
  function recCount(m) {
    const r = m && m.rec ? m.rec : '';
    let ok = 0;
    for (let i = 0; i < r.length; i++) if (r[i] === '1') ok++;
    return { ok: ok, n: r.length };
  }
  function rawAcc(m) {
    const c = recCount(m);
    if (c.n) return c.ok / c.n;
    return m && m.tot ? m.ok / m.tot : -1;
  }
  // Nudged toward 50% so one lucky answer does not look like mastery.
  function smoothAcc(m) {
    const c = recCount(m);
    return (c.ok + 1) / (c.n + 2);
  }
  function weakList(mastery, order, limit) {
    const out = [];
    order.forEach(function (ch) {
      const m = mastery[ch];
      const c = recCount(m);
      if (c.n < 3) return;
      const a = smoothAcc(m);
      if (a < 0.8) out.push({ ch: ch, acc: a, n: c.n });
    });
    out.sort(function (x, y) { return x.acc - y.acc || y.n - x.n; });
    return out.slice(0, limit);
  }
  // conf keys look like "S>H": the character was S and the answer was H.
  function topConfusions(conf, limit) {
    return Object.keys(conf).map(function (k) { const p = k.split('>'); return { target: p[0], got: p[1], n: conf[k] }; })
      .filter(function (x) { return x.n > 0; })
      .sort(function (a, b) { return b.n - a.n; })
      .slice(0, limit);
  }
  function confusedWith(conf, ch) {
    const agg = {};
    Object.keys(conf).forEach(function (k) {
      const p = k.split('>'), t = p[0], g = p[1];
      if (t === ch) agg[g] = (agg[g] || 0) + conf[k];
      else if (g === ch) agg[t] = (agg[t] || 0) + conf[k];
    });
    return Object.keys(agg).sort(function (a, b) { return agg[b] - agg[a]; });
  }
  function compareNote(a, b) {
    const x = codeFor(a), y = codeFor(b);
    if (!x || !y || x === y) return '';
    const extra = function (long, short, L, S) {
      const tail = long.slice(short.length);
      const what = tail.length === 1 ? 'one more ' + (tail === '.' ? 'dot' : 'dash') : tail.length + ' more symbols';
      return L + ' is ' + S + ' plus ' + what + '.';
    };
    if (y.indexOf(x) === 0) return extra(y, x, b, a);
    if (x.indexOf(y) === 0) return extra(x, y, a, b);
    if (x.length === y.length) {
      const d = [];
      for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) d.push(i + 1);
      return 'Same length. They differ at symbol' + (d.length > 1 ? 's ' : ' ') + d.join(', ') + '.';
    }
    return a + ' has ' + x.length + ' symbols, ' + b + ' has ' + y.length + '.';
  }
  function drillChars(mastery, conf, order) {
    let base = weakList(mastery, order, 6).map(function (w) { return w.ch; });
    if (!base.length) base = topConfusions(conf, 3).map(function (c) { return c.target; });
    const out = [];
    const add = function (c) { if (c && out.indexOf(c) < 0) out.push(c); };
    base.forEach(add);
    base.forEach(function (c) { add(confusedWith(conf, c)[0]); });
    return out.slice(0, 10);
  }
  // Sending a word: a silence of at least letterSplit ms between presses starts a new letter.
  // It sits halfway between the gap inside a letter (1 unit) and the gap between letters (3 gap units),
  // so it stretches with Farnsworth spacing.
  function letterSplit(unit, gap) {
    const g = gap > unit ? gap : unit;
    return (unit + 3 * g) / 2;
  }
  // presses: [{ down, up }] times in ms, in order. Returns one code per letter.
  function segmentTaps(presses, unit, gap) {
    const split = letterSplit(unit, gap);
    const letters = [];
    let cur = [];
    presses.forEach(function (p, i) {
      if (i && p.down - presses[i - 1].up >= split) { letters.push(cur); cur = []; }
      cur.push(p.up - p.down);
    });
    if (cur.length) letters.push(cur);
    return letters.map(function (d) { return classify(d, unit); });
  }
  // Letter-by-letter result for a sent word. Extra letters past the end count as wrong.
  function scoreWord(word, codes) {
    const out = word.split('').map(function (ch, i) {
      const code = codes[i] || '';
      return { want: ch, code: code, got: code ? REV[code] || null : null, ok: code === MORSE[ch] };
    });
    for (let i = word.length; i < codes.length; i++) out.push({ want: null, code: codes[i], got: REV[codes[i]] || null, ok: false });
    return out;
  }
  // Mash: a word's code with the letter gaps removed, to be split back into letters.
  const isLetter = function (c) { return !!c && /^[A-Z]$/.test(c); };
  function wordCode(word) { return word.split('').map(function (c) { return MORSE[c]; }).join(''); }
  // cuts[i] is true when a divider sits between symbol i and symbol i + 1.
  function correctCuts(word) {
    const cuts = [];
    word.split('').forEach(function (c) {
      const len = MORSE[c].length;
      for (let k = 0; k < len; k++) cuts.push(k === len - 1);
    });
    cuts.pop();
    return cuts;
  }
  function chunkify(str, cuts) {
    const chunks = [];
    let cur = str.length ? str[0] : '';
    for (let i = 1; i < str.length; i++) {
      if (cuts[i - 1]) { chunks.push(cur); cur = str[i]; } else cur += str[i];
    }
    if (cur) chunks.push(cur);
    return chunks;
  }
  function readChunks(chunks) {
    return chunks.map(function (c) { return isLetter(REV[c]) ? REV[c] : null; });
  }
  function allSplits(str, cap) {
    const out = [];
    (function go(i, acc) {
      if (out.length >= cap) return;
      if (i === str.length) { out.push(acc); return; }
      for (let l = 1; l <= 4 && i + l <= str.length; l++) {
        const ch = REV[str.slice(i, i + l)];
        if (isLetter(ch)) go(i + l, acc + ch);
      }
    })(0, '');
    return out;
  }
  function countSplits(str) {
    const dp = [1];
    for (let i = 1; i <= str.length; i++) {
      dp[i] = 0;
      for (let l = 1; l <= 4 && l <= i; l++) {
        if (isLetter(REV[str.slice(i - l, i)])) dp[i] += dp[i - l];
      }
    }
    return dp[str.length];
  }
  const sortLetters = function (w) { return w.split('').sort().join(''); };
  // True when the word is the only way to arrange its own letters out of its code.
  function uniqueSplit(word) {
    const key = sortLetters(word);
    return allSplits(wordCode(word), 20000).filter(function (s) { return sortLetters(s) === key; }).length === 1;
  }
  // Vibration wants [on, off, on, off...] in milliseconds. Browsers cap the length, so stay under 100 entries.
  function vibratePattern(ev) {
    const p = [];
    let t = 0;
    ev.forEach(function (e) {
      if (p.length) p.push(Math.round(e.start - t));
      p.push(Math.round(e.dur));
      t = e.start + e.dur;
    });
    return p.slice(0, 99);
  }
  // Daily message: the phrase depends only on the date, so everyone playing that day gets the same one.
  const DAILY = [
    'HELLO WORLD', 'SEND HELP', 'ALL IS WELL', 'FULL SPEED AHEAD', 'LAND HO', 'STORM COMING', 'SAIL AT DAWN',
    'MEET AT NOON', 'SAFE HARBOR', 'RADIO CHECK', 'SIGNAL RECEIVED', 'CODE CRACKED', 'WELL DONE', 'KEEP IT STEADY',
    'DUE NORTH BY MORNING', 'LIGHTS ON', 'GOOD MORNING', 'TEA IS READY', 'PACK YOUR BAGS', 'FOLLOW THE COAST',
    'THE FOG LIFTS', 'TIDE IS TURNING', 'ANCHOR DOWN', 'HOLD THE LINE', 'STAND BY', 'MESSAGE SENT', 'LISTEN CLOSELY',
    'DOTS AND DASHES', 'SHORT LONG SHORT', 'QUIET WATERS', 'CLEAR SKIES', 'BRIGHT STAR', 'WIND IS RISING',
    'BRING A TORCH', 'COME HOME SOON', 'EYES ON THE HORIZON', 'SLOW AND STEADY', 'MIND THE GAP', 'FIRST LIGHT',
    'ONE MORE TRY', 'NICE AND EASY', 'SEE YOU SOON', 'THE MAIL BOAT', 'BEACH AT SUNSET', 'COFFEE BREAK',
    'LUNCH AT ONE', 'GO FOR IT', 'TAP TAP TAP', 'SMOOTH SAILING', 'WELCOME ABOARD'
  ];
  function dayNumber(key) {
    const p = key.split('-');
    return Math.floor(Date.UTC(+p[0], +p[1] - 1, +p[2]) / 86400000);
  }
  function dailyIndex(key, n) { return (dayNumber(key) * 7919) % n; }
  function streakAfter(last, today, streak) {
    if (!last) return 1;
    const d = dayNumber(today) - dayNumber(last);
    if (d === 0) return streak;
    return d === 1 ? streak + 1 : 1;
  }
  // The streak a player sees: it lapses once a whole day has been missed.
  function liveStreak(last, today, streak) {
    if (!last) return 0;
    return dayNumber(today) - dayNumber(last) <= 1 ? streak : 0;
  }
  function normalizePhrase(s) {
    return String(s).toUpperCase().replace(/[^A-Z ]/g, '').replace(/\s+/g, ' ').trim();
  }
  function wordsRight(guess, answer) {
    const g = guess.split(' ');
    return answer.split(' ').filter(function (w, i) { return g[i] === w; }).length;
  }
  // Badges: goal(snapshot) returns [current, target]. The medal shows the badge's own Morse pattern.
  const BADGES = [
    { id: 'first', name: 'First Signal', sig: '.', desc: 'Answer your first question.', goal: function (s) { return [s.tracked, 1]; } },
    { id: 'ten', name: 'Ten Characters', sig: '-.', desc: 'Grow your practice set to 10 characters.', goal: function (s) { return [s.n, 10]; } },
    { id: 'alpha', name: 'Whole Alphabet', sig: '.-', desc: 'Unlock all 26 letters.', goal: function (s) { return [s.n, 26]; } },
    { id: 'every', name: 'Every Symbol', sig: '--', desc: 'Unlock all 36 characters, numbers included.', goal: function (s) { return [s.n, 36]; } },
    { id: 'streak10', name: 'Hot Streak', sig: '...', desc: 'Ten right answers in a row in Listen.', goal: function (s) { return [s.bestStreak, 10]; } },
    { id: 'streak25', name: 'Sharp Ear', sig: '-.-', desc: 'Twenty-five right answers in a row in Listen.', goal: function (s) { return [s.bestStreak, 25]; } },
    { id: 'sprint20', name: 'Quick Reader', sig: '..-', desc: 'Decode 20 letters in one Sprint.', goal: function (s) { return [s.bestSprint, 20]; } },
    { id: 'sprint40', name: 'Speed Reader', sig: '...-', desc: 'Decode 40 letters in one Sprint.', goal: function (s) { return [s.bestSprint, 40]; } },
    { id: 'tree5', name: 'Tree Climber', sig: '.--', desc: 'Find five letters on the tree in a row with no wrong turns and no hints.', goal: function (s) { return [s.stats.treeBest, 5]; } },
    { id: 'tap5', name: 'Steady Hand', sig: '-..', desc: 'Tap five characters correctly in a row.', goal: function (s) { return [s.stats.tapBest, 5]; } },
    { id: 'word5', name: 'Word Sender', sig: '..-.', desc: 'Send five words in a row in Tap with every letter right.', goal: function (s) { return [s.stats.wordBest || 0, 5]; } },
    { id: 'mash5', name: 'Mash Master', sig: '--.', desc: 'Split five strings cleanly, with no hints and no wrong checks.', goal: function (s) { return [s.stats.mashClean, 5]; } },
    { id: 'daily3', name: 'Daily Habit', sig: '.-.', desc: 'Solve the daily message three days running.', goal: function (s) { return [s.dailyBest, 3]; } },
    { id: 'daily7', name: 'Week on the Wire', sig: '.---', desc: 'Solve the daily message seven days running.', goal: function (s) { return [s.dailyBest, 7]; } },
    { id: 'silent', name: 'Silent Signals', sig: '-...', desc: 'Give ten right answers with sound off, using light or buzz.', goal: function (s) { return [s.stats.silent, 10]; } },
    { id: 'solid', name: 'Solid Ground', sig: '-.-.', desc: 'Track 15 characters with none of them shaky.', goal: function (s) { return [s.shaky === 0 ? s.tracked : 0, 15]; } }
  ];

  // Saved progress. restoreState accepts anything (old saves, imported files, junk) and returns a clean state.
  const SAVE_APP = 'morse-mash';
  const SAVE_VERSION = 1;
  function freshState() {
    return {
      n: 5, wpm: 10, eff: 10, mastery: {}, conf: {},
      sig: { sound: true, light: false, buzz: false, noise: 0 },
      opts: { pro: false, autoNext: false, tapWords: false },
      stats: { treeBest: 0, tapBest: 0, wordBest: 0, mashClean: 0, silent: 0 }, badges: {},
      daily: { last: '', streak: 0, best: 0, solved: 0, tries: 0 }, bestSprint: 0, bestStreak: 0
    };
  }
  const isObj = function (x) { return !!x && typeof x === 'object' && !Array.isArray(x); };
  const count = function (x) { return typeof x === 'number' && isFinite(x) && x > 0 ? Math.floor(x) : 0; };
  const inRange = function (x, lo, hi) { return typeof x === 'number' && x >= lo && x <= hi; };
  const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
  function restoreState(s) {
    const st = freshState();
    if (!isObj(s)) return st;
    if (s.app === SAVE_APP && isObj(s.state)) s = s.state; // an exported file
    if (inRange(s.n, 2, 36)) st.n = Math.round(s.n);
    if (inRange(s.wpm, 5, 25)) st.wpm = Math.round(s.wpm);
    st.eff = inRange(s.eff, 5, 25) ? Math.min(Math.round(s.eff), st.wpm) : st.wpm;
    if (isObj(s.mastery)) {
      Object.keys(s.mastery).forEach(function (k) {
        const m = s.mastery[k];
        if (!codeFor(k) || !isObj(m)) return;
        const tot = count(m.tot);
        const out = { ok: Math.min(count(m.ok), tot), tot: tot };
        if (typeof m.rec === 'string' && /^[01]{1,12}$/.test(m.rec)) out.rec = m.rec;
        else if (tot > 0) {
          // Older saves only kept totals: rebuild a recent-results string with the same ratio.
          const len = Math.min(tot, 12);
          const good = Math.round(out.ok / tot * len);
          out.rec = '0'.repeat(len - good) + '1'.repeat(good);
        }
        if (out.tot || out.rec) st.mastery[k] = out;
      });
    }
    if (isObj(s.conf)) {
      Object.keys(s.conf).forEach(function (k) {
        const p = k.split('>');
        if (p.length === 2 && codeFor(p[0]) && codeFor(p[1]) && p[0] !== p[1] && count(s.conf[k])) st.conf[k] = count(s.conf[k]);
      });
    }
    if (isObj(s.stats)) Object.keys(st.stats).forEach(function (k) { st.stats[k] = count(s.stats[k]); });
    if (isObj(s.badges)) {
      BADGES.forEach(function (b) {
        if (typeof s.badges[b.id] === 'string' && DATE_RE.test(s.badges[b.id])) st.badges[b.id] = s.badges[b.id];
      });
    }
    if (isObj(s.daily)) {
      st.daily.last = typeof s.daily.last === 'string' && DATE_RE.test(s.daily.last) ? s.daily.last : '';
      ['streak', 'best', 'solved', 'tries'].forEach(function (k) { st.daily[k] = count(s.daily[k]); });
    }
    if (isObj(s.sig)) {
      st.sig.sound = s.sig.sound !== false;
      st.sig.light = s.sig.light === true;
      st.sig.buzz = s.sig.buzz === true;
      // Noise was on/off before it had levels 0 to 3; on maps to the middle level.
      st.sig.noise = s.sig.noise === true ? 2 : inRange(s.sig.noise, 0, 3) ? Math.round(s.sig.noise) : 0;
      if (!st.sig.sound && !st.sig.light && !st.sig.buzz) st.sig.sound = true;
    }
    if (isObj(s.opts)) Object.keys(st.opts).forEach(function (k) { st.opts[k] = s.opts[k] === true; });
    st.bestSprint = count(s.bestSprint);
    st.bestStreak = count(s.bestStreak);
    return st;
  }
  function exportState(st, when) {
    return { app: SAVE_APP, version: SAVE_VERSION, exported: when || '', state: restoreState(st) };
  }
  // A short text for sharing a solved daily message, without giving the answer away.
  function dailyShareText(key, phrase, tries, streak) {
    const words = phrase.split(' ').map(function (w) { return w.split('').map(function (c) { return MORSE[c]; }).join(' '); });
    const bars = words.map(function (w) { return w.replace(/[.]/g, '•').replace(/-/g, '—'); });
    return 'Morse Mash daily ' + key + '\n' + (tries === 0 ? 'Solved first try' : 'Solved after ' + (tries + 1) + ' tries') +
      (streak > 1 ? ', streak ' + streak : '') + '\n' + bars.join(' / ');
  }

  return {
    MORSE: MORSE,
    KOCH: KOCH,
    REV: REV,
    unitMs: unitMs,
    classify: classify,
    decodeCode: decodeCode,
    spoken: spoken,
    PROSIGNS: PROSIGNS,
    PROSIGN_INFO: PROSIGN_INFO,
    tokenize: tokenize,
    codeFor: codeFor,
    sendText: sendText,
    letterSplit: letterSplit,
    segmentTaps: segmentTaps,
    scoreWord: scoreWord,
    farnsworthGap: farnsworthGap,
    buildSchedule: buildSchedule,
    scheduleForCode: scheduleForCode,
    buildTree: buildTree,
    pushRec: pushRec,
    recCount: recCount,
    rawAcc: rawAcc,
    smoothAcc: smoothAcc,
    weakList: weakList,
    topConfusions: topConfusions,
    confusedWith: confusedWith,
    compareNote: compareNote,
    drillChars: drillChars,
    isLetter: isLetter,
    wordCode: wordCode,
    correctCuts: correctCuts,
    chunkify: chunkify,
    readChunks: readChunks,
    allSplits: allSplits,
    countSplits: countSplits,
    sortLetters: sortLetters,
    uniqueSplit: uniqueSplit,
    vibratePattern: vibratePattern,
    DAILY: DAILY,
    dayNumber: dayNumber,
    dailyIndex: dailyIndex,
    streakAfter: streakAfter,
    liveStreak: liveStreak,
    normalizePhrase: normalizePhrase,
    wordsRight: wordsRight,
    BADGES: BADGES,
    freshState: freshState,
    restoreState: restoreState,
    exportState: exportState,
    dailyShareText: dailyShareText
  };
});
