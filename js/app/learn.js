/* Morse Mash: Learn: the chart, prosigns, playground and cheat sheet. */
(function () {
  'use strict';
  const { MORSE, KOCH, spoken, PROSIGNS, PROSIGN_INFO, tokenize } = window.MorseCore;
  const MM = window.MM;
  const { $, state, accuracy, symHtml, esc, playText } = MM;

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
    tokenize(txt).forEach(function (tok) {
      if (tok === ' ') { const sp = document.createElement('span'); sp.style.width = '24px'; out.appendChild(sp); return; }
      const d = document.createElement('span');
      d.className = 'lt';
      d.innerHTML = symHtml(tok.code) + '<span' + (tok.pro ? ' class="ovl"' : '') + '>' + tok.label + '</span>';
      out.appendChild(d);
    });
    playText(txt);
  });
  function renderProsigns() {
    $('#pros').innerHTML = Object.keys(PROSIGNS).map(function (k) {
      return '<button class="pro" type="button" data-pro="' + k + '" aria-label="' + k + ', ' + esc(PROSIGN_INFO[k]) + ', ' + spoken(PROSIGNS[k]) + '">' +
        '<span class="pk ovl">' + k + '</span>' + symHtml(PROSIGNS[k], 'small') + '<span class="pm">' + esc(PROSIGN_INFO[k]) + '</span></button>';
    }).join('');
  }
  $('#pros').addEventListener('click', function (e) {
    const b = e.target.closest ? e.target.closest('[data-pro]') : null;
    if (b) playText('<' + b.dataset.pro + '>');
  });
  function buildCheatSheet(mono) {
    $('#cheat').classList.toggle('mono', !!mono);
    const chars = KOCH.split('').sort(function (a, b) {
      const da = /\d/.test(a), db = /\d/.test(b);
      return da === db ? (a < b ? -1 : 1) : da ? 1 : -1;
    });
    const cell = function (label, code, extra, pro) {
      return '<div class="cc"><b' + (pro ? ' class="ovl"' : '') + '>' + label + '</b>' + symHtml(code) +
        '<span>' + (extra ? esc(extra) : spoken(code)) + '</span></div>';
    };
    $('#cheat').innerHTML = '<h1>Morse<span class="m2">Mash</span> cheat sheet</h1>' +
      '<p>' + (mono ? 'Short marks are dots, long marks are dashes.' : 'Dots are pink, dashes are blue.') + ' Dot 1 unit, dash 3, gap inside a letter 1, between letters 3, between words 7.</p>' +
      '<div class="cgrid">' + chars.map(function (c) { return cell(c, MORSE[c]); }).join('') + '</div>' +
      '<h2>Prosigns</h2><div class="cgrid">' + Object.keys(PROSIGNS).map(function (k) { return cell(k, PROSIGNS[k], PROSIGN_INFO[k], true); }).join('') + '</div>';
  }
  $('#printCard').addEventListener('click', function () { buildCheatSheet(false); window.print(); });
  $('#printMono').addEventListener('click', function () { buildCheatSheet(true); window.print(); });

  MM.onRefresh(renderGrid);
  renderProsigns();
  MM.register('learn', {});
})();
