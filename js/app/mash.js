/* Morse Mash: Mash: split the unspaced string. */
(function () {
  'use strict';
  const { KOCH, wordCode, correctCuts, chunkify, readChunks, allSplits, countSplits, sortLetters, uniqueSplit } = window.MorseCore;
  const MM = window.MM;
  const { WORDS, $, state, save, record, shuffle, symHtml, playText, playRaw } = MM;

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
    setTimeout(function () { if (MM.is('mash') && M.locked) playText(M.word); }, 200);
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

  MM.register('mash', { show: showMash });
})();
