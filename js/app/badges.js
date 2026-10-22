/* Morse Mash: Badges. */
(function () {
  'use strict';
  const { BADGES } = window.MorseCore;
  const MM = window.MM;
  const { $, state, fmtDate, badgeSnap, symHtml, esc } = MM;

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

  MM.register('badges', { show: renderBadges });
})();
