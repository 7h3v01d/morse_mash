'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const C = require('../js/morse-core.js');

describe('Morse table and timing', () => {
  it('has 36 unique codes and a Koch order covering them all', () => {
    assert.equal(Object.keys(C.MORSE).length, 36);
    assert.equal(Object.keys(C.REV).length, 36);
    assert.equal(new Set(C.KOCH).size, 36);
    [...C.KOCH].forEach((ch) => assert.ok(C.MORSE[ch], ch));
  });

  it('decodes codes and rejects unknown ones', () => {
    assert.equal(C.decodeCode('...'), 'S');
    assert.equal(C.decodeCode('-----'), '0');
    assert.equal(C.decodeCode('.-.-.-'), null);
  });

  it('uses the PARIS standard: one unit is 1200 / WPM milliseconds', () => {
    assert.equal(C.unitMs(12), 100);
    assert.equal(C.unitMs(20), 60);
  });

  it('classifies press lengths into dots and dashes', () => {
    assert.equal(C.classify([90, 310, 110], 100), '.-.');
    assert.equal(C.classify([199, 200], 100), '.-');
  });

  it('speaks codes as dit and dah', () => {
    assert.equal(C.spoken('.-'), 'di-dah');
    assert.equal(C.spoken('...'), 'di-di-dit');
  });

  it('schedules PARIS plus a word gap as 50 units', () => {
    assert.equal(C.buildSchedule('PARIS ', 1).total, 50);
  });

  it('puts a word gap of 7 units between words', () => {
    assert.deepEqual(C.buildSchedule('E E', 1).ev.map((e) => e.start), [0, 8]);
  });

  it('schedules a raw code with 1 unit between symbols', () => {
    assert.deepEqual(C.scheduleForCode('.-', 100).ev, [{ start: 0, dur: 100 }, { start: 200, dur: 300 }]);
  });
});

describe('Morse tree', () => {
  const letters = C.buildTree(false);
  const all = C.buildTree(true);

  it('has a root plus 26 letters, or 36 characters and 3 junctions with numbers', () => {
    assert.equal(letters.length, 27);
    assert.equal(all.length, 40);
    assert.equal(all.filter((n) => n.ch).length, 36);
    assert.deepEqual(all.filter((n) => !n.ch && n.code).map((n) => n.code).sort(), ['----', '---.', '..--']);
  });

  it('places dots above their parent and dashes below, with unique rows', () => {
    for (const set of [letters, all]) {
      const by = {};
      set.forEach((n) => { by[n.code] = n; });
      assert.equal(new Set(set.map((n) => n.row)).size, set.length);
      set.forEach((n) => {
        if (n.ch) assert.equal(C.MORSE[n.ch], n.code);
        if (!n.code) return;
        const parent = by[n.code.slice(0, -1)];
        assert.ok(parent, 'parent of ' + n.code);
        if (n.code.slice(-1) === '.') assert.ok(n.row < parent.row);
        else assert.ok(n.row > parent.row);
      });
    }
  });
});

describe('Progress tracking', () => {
  it('keeps only the last 12 results', () => {
    const m = {};
    for (let i = 0; i < 15; i++) C.pushRec(m, i % 2 === 0);
    assert.equal(m.rec.length, 12);
  });

  it('reads accuracy from recent results, with a legacy fallback', () => {
    assert.equal(C.rawAcc({ rec: '1100' }), 0.5);
    assert.equal(C.rawAcc({ ok: 3, tot: 4 }), 0.75);
    assert.equal(C.rawAcc(undefined), -1);
    assert.ok(C.smoothAcc({ rec: '1' }) < 1);
  });

  it('ranks weak characters and ignores ones with too little data', () => {
    const mastery = {
      S: { rec: '0101' }, H: { rec: '000' }, K: { rec: '1111111111' }, M: { rec: '0' }, R: { rec: '110' }
    };
    const order = C.KOCH.split('');
    assert.deepEqual(C.weakList(mastery, order, 8).map((w) => w.ch), ['H', 'S', 'R']);
    assert.deepEqual(C.weakList(mastery, order, 2).map((w) => w.ch), ['H', 'S']);
  });

  it('ranks and groups mix-ups in both directions', () => {
    const conf = { 'S>H': 3, 'H>S': 1, 'U>V': 2, 'K>M': 0 };
    assert.deepEqual(C.topConfusions(conf, 5).map((c) => c.target + c.got), ['SH', 'UV', 'HS']);
    assert.deepEqual(C.confusedWith(conf, 'S'), ['H']);
    assert.deepEqual(C.confusedWith(conf, 'V'), ['U']);
  });

  it('explains how two codes differ', () => {
    assert.equal(C.compareNote('S', 'H'), 'H is S plus one more dot.');
    assert.equal(C.compareNote('H', 'S'), 'H is S plus one more dot.');
    assert.equal(C.compareNote('E', 'S'), 'S is E plus 2 more symbols.');
    assert.equal(C.compareNote('A', 'N'), 'Same length. They differ at symbols 1, 2.');
    assert.equal(C.compareNote('E', 'T'), 'Same length. They differ at symbol 1.');
    assert.equal(C.compareNote('A', 'A'), '');
  });

  it('builds a drill from weak characters, falling back to mix-ups', () => {
    const mastery = { S: { rec: '0101' }, H: { rec: '000' }, R: { rec: '110' } };
    const order = C.KOCH.split('');
    assert.deepEqual(C.drillChars(mastery, { 'S>H': 3 }, order), ['H', 'S', 'R']);
    assert.deepEqual(C.drillChars({}, { 'U>V': 2 }, order), ['U', 'V']);
    assert.deepEqual(C.drillChars({}, {}, order), []);
  });
});

describe('Mash splitting', () => {
  const words = ['SOS', 'SEA', 'CAT', 'MAP', 'SHIP', 'WAVE', 'SIGNAL', 'ANCHOR', 'KEY', 'FOX', 'JAZZ', 'QUIZ'];

  it('round-trips a word through its code and correct dividers', () => {
    for (const w of words) {
      const str = C.wordCode(w);
      const cuts = C.correctCuts(w);
      assert.equal(cuts.length, str.length - 1, w);
      assert.equal(C.readChunks(C.chunkify(str, cuts)).join(''), w);
    }
  });

  it('counts splits the same way it lists them', () => {
    for (const w of words) {
      const str = C.wordCode(w);
      const list = C.allSplits(str, 1e6);
      assert.equal(C.countSplits(str), list.length, w);
      assert.ok(list.includes(w), w);
    }
  });

  it('chunks and reads correctly', () => {
    assert.equal(C.wordCode('SEA'), '.....-');
    assert.deepEqual(C.chunkify('.-.', [false, false]), ['.-.']);
    assert.deepEqual(C.chunkify('.-.', [true, true]), ['.', '-', '.']);
    assert.deepEqual(C.chunkify('', []), []);
    assert.deepEqual(C.readChunks(['.', '----', '-.-']), ['E', null, 'K']);
  });

  it('knows which words have a look-alike arrangement of the same letters', () => {
    assert.equal(C.uniqueSplit('SEA'), false);
    assert.equal(C.uniqueSplit('SOS'), true);
  });

  it('finds 192 ways to split SOS', () => {
    assert.equal(C.countSplits(C.wordCode('SOS')), 192);
  });
});

describe('Vibration patterns', () => {
  it('alternates on and off times in milliseconds', () => {
    assert.deepEqual(C.vibratePattern(C.scheduleForCode('.-', 100).ev), [100, 100, 300]);
    assert.deepEqual(C.vibratePattern(C.buildSchedule('E E', 100).ev), [100, 700, 100]);
    assert.equal(C.vibratePattern(C.buildSchedule('SOS', 100).ev).length, 17);
    assert.deepEqual(C.vibratePattern([]), []);
  });

  it('stays under the browser limit for long messages', () => {
    const long = C.buildSchedule(new Array(11).join('SOS ').trim(), 50).ev;
    assert.ok(C.vibratePattern(long).length <= 99);
  });
});

describe('Daily message', () => {
  it('only uses phrases that can be sent in Morse, with no repeats', () => {
    assert.equal(new Set(C.DAILY).size, C.DAILY.length);
    C.DAILY.forEach((p) => {
      assert.match(p, /^[A-Z]+( [A-Z]+)*$/);
      p.replace(/ /g, '').split('').forEach((c) => assert.ok(C.MORSE[c], c));
    });
  });

  it('counts days correctly across month and year ends', () => {
    assert.equal(C.dayNumber('1970-01-02'), 1);
    assert.equal(C.dayNumber('2026-03-01') - C.dayNumber('2026-02-28'), 1);
    assert.equal(C.dayNumber('2025-01-01') - C.dayNumber('2024-12-31'), 1);
  });

  it('picks the same phrase for the same date and varies across dates', () => {
    const seen = new Set();
    for (let d = 0; d < 60; d++) {
      const key = new Date(Date.UTC(2026, 9, 21 + d)).toISOString().slice(0, 10);
      const i = C.dailyIndex(key, C.DAILY.length);
      assert.ok(i >= 0 && i < C.DAILY.length);
      assert.equal(i, C.dailyIndex(key, C.DAILY.length));
      seen.add(i);
    }
    assert.ok(seen.size >= 45, 'variety: ' + seen.size);
  });

  it('grows the streak on consecutive days and restarts after a gap', () => {
    assert.equal(C.streakAfter('', '2026-10-21', 0), 1);
    assert.equal(C.streakAfter('2026-10-20', '2026-10-21', 4), 5);
    assert.equal(C.streakAfter('2026-10-21', '2026-10-21', 4), 4);
    assert.equal(C.streakAfter('2026-10-18', '2026-10-21', 4), 1);
    assert.equal(C.streakAfter('2026-02-28', '2026-03-01', 2), 3);
  });

  it('shows a lapsed streak as zero', () => {
    assert.equal(C.liveStreak('2026-10-21', '2026-10-21', 4), 4);
    assert.equal(C.liveStreak('2026-10-20', '2026-10-21', 4), 4);
    assert.equal(C.liveStreak('2026-10-19', '2026-10-21', 4), 0);
    assert.equal(C.liveStreak('', '2026-10-21', 0), 0);
  });

  it('matches answers ignoring case, punctuation and extra spaces', () => {
    assert.equal(C.normalizePhrase('  hello,   World! '), 'HELLO WORLD');
    assert.equal(C.wordsRight('ALL IS FINE', 'ALL IS WELL'), 2);
    assert.equal(C.wordsRight('', 'ALL IS WELL'), 0);
  });
});

describe('Badges', () => {
  const zero = {
    n: 5, bestStreak: 0, bestSprint: 0, tracked: 0, shaky: 0,
    stats: { treeBest: 0, tapBest: 0, mashClean: 0, silent: 0 }, dailyBest: 0
  };
  const earned = (s) => C.BADGES.filter((b) => { const g = b.goal(s); return g[0] >= g[1]; }).map((b) => b.id);

  it('has unique ids and unique medal patterns', () => {
    assert.equal(new Set(C.BADGES.map((b) => b.id)).size, C.BADGES.length);
    assert.equal(new Set(C.BADGES.map((b) => b.sig)).size, C.BADGES.length);
    C.BADGES.forEach((b) => assert.match(b.sig, /^[.-]+$/));
  });

  it('awards nothing on a fresh start', () => {
    assert.deepEqual(earned(zero), []);
  });

  it('awards badges as goals are met', () => {
    assert.deepEqual(earned({ ...zero, tracked: 1 }), ['first']);
    assert.deepEqual(earned({ ...zero, n: 26 }), ['ten', 'alpha']);
    assert.deepEqual(earned({ ...zero, bestStreak: 25 }), ['streak10', 'streak25']);
    assert.ok(earned({ ...zero, stats: { ...zero.stats, silent: 10 } }).includes('silent'));
  });

  it('only counts Solid Ground when nothing is shaky', () => {
    assert.ok(!earned({ ...zero, tracked: 20, shaky: 2 }).includes('solid'));
    assert.ok(earned({ ...zero, tracked: 15, shaky: 0 }).includes('solid'));
  });
});
