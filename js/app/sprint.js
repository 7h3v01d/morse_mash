/* Morse Mash: Sprint: the 60 second decode round. */
(function () {
  'use strict';
  const { MORSE, KOCH } = window.MorseCore;
  const MM = window.MM;
  const { WORDS, $, state, save, record, confuse, symHtml, audio, stopAll, playText } = MM;

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

  MM.onRefresh(showBest);
  MM.register('sprint', {
    show: resetSprintView,
    leave: function () { if (S.running) endSprint(true); }
  });
})();
