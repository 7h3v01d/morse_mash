/* Morse Mash: Weak spots, plus progress backup. */
(function () {
  'use strict';
  const { KOCH, PROSIGNS, codeFor, sendText, recCount, rawAcc, weakList, topConfusions, compareNote, drillChars, exportState } = window.MorseCore;
  const MM = window.MM;
  const fullOrder = function () { return KOCH.split('').concat(Object.keys(PROSIGNS)); };
  const { $, state, save, todayKey, checkBadges, symHtml, esc, toast, playText } = MM;

  function heatClass(a) { return a < 0 ? 'h0' : a < 0.6 ? 'h1' : a < 0.85 ? 'h2' : 'h3'; }
  function renderWeak() {
    const order = KOCH.split('');
    // Prosigns count once they have been practised in Listen.
    const full = fullOrder();
    let ok = 0, n = 0, tracked = 0;
    order.forEach(function (ch) {
      const c = recCount(state.mastery[ch]);
      if (c.n) { tracked++; ok += c.ok; n += c.n; }
    });
    const weak = weakList(state.mastery, full, 8);
    $('#wStats').innerHTML = '<span>Tracked <b>' + tracked + '</b> of 36</span>' +
      '<span>Recent accuracy <b>' + (n ? Math.round(ok / n * 100) + '%' : '-') + '</b></span>' +
      '<span>Shaky <b>' + weak.length + '</b></span>';

    $('#wList').innerHTML = weak.length ? weak.map(function (w) {
      const pct = Math.round(rawAcc(state.mastery[w.ch]) * 100);
      return '<div class="wrow"><span class="wch">' + w.ch + '</span>' + symHtml(codeFor(w.ch)) +
        '<span class="wbar" aria-hidden="true"><span style="width:' + pct + '%"></span></span>' +
        '<span class="wpct">' + pct + '%</span>' +
        '<button class="btn ghost sm" data-hear="' + w.ch + '">Hear</button></div>';
    }).join('') : '<p class="empty">' + (tracked ?
      'Nothing shaky right now. Add more characters in Listen to keep growing.' :
      'No data yet. Play Listen, Tap, Sprint or the tree and your slips show up here.') + '</p>';

    const conf = topConfusions(state.conf, 6);
    $('#wConf').innerHTML = conf.length ? conf.map(function (c) {
      return '<div class="wrow"><span class="pairs">Meant <b class="wch s">' + c.target + '</b>' + symHtml(codeFor(c.target), 'small') + '</span>' +
        '<span class="pairs">answered <b class="wch s">' + c.got + '</b>' + symHtml(codeFor(c.got), 'small') + '</span>' +
        '<span class="wpct">x' + c.n + '</span>' +
        '<span class="note">' + esc(compareNote(c.target, c.got)) + '</span></div>';
    }).join('') : '<p class="empty">No mix-ups logged yet. When you answer the wrong character, the pair lands here.</p>';

    const set = KOCH.slice(0, state.n).split('');
    if (state.opts.pro && state.n >= 26) set.push.apply(set, Object.keys(PROSIGNS));
    $('#wHeat').innerHTML = full.filter(function (ch) { return order.indexOf(ch) >= 0 || recCount(state.mastery[ch]).n; }).map(function (ch) {
      const a = rawAcc(state.mastery[ch]);
      const pct = a < 0 ? 'new' : Math.round(a * 100) + '%';
      return '<button class="hm ' + heatClass(a) + (set.indexOf(ch) < 0 ? ' out' : '') + '" data-hear="' + ch +
        '" aria-label="' + ch + ', ' + (a < 0 ? 'not practised yet' : pct + ' recent accuracy') + '"><b>' + ch + '</b><span>' + pct + '</span></button>';
    }).join('');

    const dc = drillChars(state.mastery, state.conf, full);
    $('#wDrill').disabled = !dc.length;
    $('#wMsg').textContent = dc.length ? 'Drill set: ' + dc.join(' ') : 'Nothing to drill yet. Play a few rounds first.';
  }
  $('#weak').addEventListener('click', function (e) {
    const b = e.target.closest ? e.target.closest('[data-hear]') : null;
    if (b) playText(sendText(b.dataset.hear));
  });
  $('#wDrill').addEventListener('click', function () {
    const dc = drillChars(state.mastery, state.conf, fullOrder());
    if (!dc.length) return;
    MM.modes.listen.startDrill(dc);
  });
  $('#wReset').addEventListener('click', function () { $('#wSure').hidden = false; $('#wReset').hidden = true; });
  $('#wNo').addEventListener('click', function () { $('#wSure').hidden = true; $('#wReset').hidden = false; });
  $('#wYes').addEventListener('click', function () {
    state.mastery = {};
    state.conf = {};
    MM.modes.listen.clearDrill();
    save();
    $('#wSure').hidden = true;
    $('#wReset').hidden = false;
    renderWeak();
    MM.refreshAll();
    toast('Stats cleared');
  });

  $('#wExport').addEventListener('click', function () {
    const day = todayKey();
    const blob = new Blob([JSON.stringify(exportState(state, day), null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'morse-mash-backup-' + day + '.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  });
  $('#wImport').addEventListener('click', function () { $('#wFile').click(); });
  $('#wFile').addEventListener('change', function (e) {
    const f = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!f) return;
    if (f.size > 1000000) { toast('That file is too big to be a Morse Mash backup.'); return; }
    f.text().then(function (txt) {
      let data = null;
      try { data = JSON.parse(txt); } catch (x) { /* handled below */ }
      if (!data || data.app !== 'morse-mash') { toast('That is not a Morse Mash backup file.'); return; }
      MM.replaceState(data);
      MM.modes.listen.clearDrill();
      MM.refreshAll();
      renderWeak();
      checkBadges();
      toast('Progress restored from ' + f.name);
    }, function () { toast('Could not read that file.'); });
  });

  MM.register('weak', { show: renderWeak });
})();
