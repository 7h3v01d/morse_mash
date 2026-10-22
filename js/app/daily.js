/* Morse Mash: Daily: one message a day. */
(function () {
  'use strict';
  const { MORSE, DAILY, dailyIndex, streakAfter, liveStreak, normalizePhrase, wordsRight, dailyShareText } = window.MorseCore;
  const MM = window.MM;
  const { $, state, save, todayKey, fmtDate, record, symHtml, toast, playText } = MM;

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
    $('#dShare').hidden = !solved;
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
      state.daily.tries = D.tries;
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
  $('#dShare').addEventListener('click', function () {
    if (state.daily.last !== D.key) return;
    let text = dailyShareText(D.key, D.phrase, state.daily.tries, liveStreak(state.daily.last, D.key, state.daily.streak));
    if (/^https?:/.test(location.href)) text += '\n' + location.href.split('#')[0];
    const copy = function () {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(function () { toast('Result copied. Paste it anywhere.'); }, function () { toast('Could not copy on this device.'); });
      } else toast('Could not copy on this device.');
    };
    if (navigator.share) navigator.share({ text: text }).catch(function (err) { if (!err || err.name !== 'AbortError') copy(); });
    else copy();
  });
  // A tab left open past midnight picks up the new day's message when it comes back into view.
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden && MM.is('daily') && todayKey() !== D.key) showDaily();
  });
  $('#dHide').addEventListener('change', function (e) { D.hide = e.target.checked; renderDaily(); });

  MM.register('daily', { show: showDaily });
})();
