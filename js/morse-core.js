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
  // Standard timing: dot 1, dash 3, gap inside a letter 1, between letters 3, between words 7.
  function buildSchedule(text, unit) {
    const ev = [];
    let t = 0;
    const up = String(text).toUpperCase();
    for (let i = 0; i < up.length; i++) {
      const ch = up[i];
      if (ch === ' ') { t += 4 * unit; continue; }
      const code = MORSE[ch];
      if (!code) continue;
      for (let j = 0; j < code.length; j++) {
        const d = code[j] === '.' ? unit : 3 * unit;
        ev.push({ start: t, dur: d });
        t += d + unit;
      }
      t += 2 * unit;
    }
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
    return Object.keys(conf).map(function (k) { return { target: k[0], got: k[2], n: conf[k] }; })
      .filter(function (x) { return x.n > 0; })
      .sort(function (a, b) { return b.n - a.n; })
      .slice(0, limit);
  }
  function confusedWith(conf, ch) {
    const agg = {};
    Object.keys(conf).forEach(function (k) {
      const t = k[0], g = k[2];
      if (t === ch) agg[g] = (agg[g] || 0) + conf[k];
      else if (g === ch) agg[t] = (agg[t] || 0) + conf[k];
    });
    return Object.keys(agg).sort(function (a, b) { return agg[b] - agg[a]; });
  }
  function compareNote(a, b) {
    const x = MORSE[a], y = MORSE[b];
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
    { id: 'mash5', name: 'Mash Master', sig: '--.', desc: 'Split five strings cleanly, with no hints and no wrong checks.', goal: function (s) { return [s.stats.mashClean, 5]; } },
    { id: 'daily3', name: 'Daily Habit', sig: '.-.', desc: 'Solve the daily message three days running.', goal: function (s) { return [s.dailyBest, 3]; } },
    { id: 'daily7', name: 'Week on the Wire', sig: '.---', desc: 'Solve the daily message seven days running.', goal: function (s) { return [s.dailyBest, 7]; } },
    { id: 'silent', name: 'Silent Signals', sig: '-...', desc: 'Give ten right answers with sound off, using light or buzz.', goal: function (s) { return [s.stats.silent, 10]; } },
    { id: 'solid', name: 'Solid Ground', sig: '-.-.', desc: 'Track 15 characters with none of them shaky.', goal: function (s) { return [s.shaky === 0 ? s.tracked : 0, 15]; } }
  ];

  return {
    MORSE: MORSE,
    KOCH: KOCH,
    REV: REV,
    unitMs: unitMs,
    classify: classify,
    decodeCode: decodeCode,
    spoken: spoken,
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
    BADGES: BADGES
  };
});
