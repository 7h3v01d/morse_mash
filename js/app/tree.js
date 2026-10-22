/* Morse Mash: Tree: the Morse tree, explore and find it. */
(function () {
  'use strict';
  const { MORSE, KOCH, spoken, buildTree } = window.MorseCore;
  const MM = window.MM;
  const { $, state, bumpMax, record, accuracy, symHtml, playText, playRaw } = MM;

  const TR = { digits: false, find: false, path: '', target: null, mistakes: 0, hints: 0, score: 0, streak: 0, locked: false, nodes: [], by: {}, built: false, msg: '', msgClass: 'msg' };
  const COLW = 62, ROWH = 26, X0 = 44, Y0 = 22;
  const nx = function (n) { return X0 + n.depth * COLW; };
  const ny = function (n) { return Y0 + n.row * ROWH; };

  function buildTreeView() {
    TR.nodes = buildTree(TR.digits);
    TR.by = {};
    TR.nodes.forEach(function (n) { TR.by[n.code] = n; });
    const maxD = TR.nodes.reduce(function (m, n) { return Math.max(m, n.depth); }, 0);
    const w = X0 + maxD * COLW + 30;
    const h = Y0 * 2 + (TR.nodes.length - 1) * ROWH;
    let edges = '', nodes = '';
    TR.nodes.forEach(function (n) {
      if (!n.code) return;
      const p = TR.by[n.code.slice(0, -1)];
      const mx = (nx(p) + nx(n)) / 2;
      edges += '<path class="edge ' + (n.code.slice(-1) === '.' ? 'dot' : 'dash') + '" data-code="' + n.code +
        '" d="M' + nx(p) + ' ' + ny(p) + 'H' + mx + 'V' + ny(n) + 'H' + nx(n) + '"/>';
    });
    TR.nodes.forEach(function (n) {
      const cls = 'nd' + (!n.code ? ' root' : n.ch ? '' : ' junction');
      let shape, text = '';
      if (!n.code) { shape = '<rect class="sh" x="-26" y="-13" width="52" height="26" rx="13"/>'; text = '<text class="lbl">START</text>'; }
      else if (n.ch) { shape = '<circle class="sh" r="11.5"/>'; text = '<text class="lbl">' + n.ch + '</text>'; }
      else { shape = '<circle class="sh" r="5"/>'; }
      nodes += '<g class="' + cls + '" data-code="' + n.code + '" transform="translate(' + nx(n) + ' ' + ny(n) +
        ')" tabindex="0" role="button"><circle class="hit" r="13"/>' + shape + text + '</g>';
    });
    const svg = $('#trSvg');
    svg.setAttribute('width', w);
    svg.setAttribute('height', h);
    svg.setAttribute('viewBox', '0 0 ' + w + ' ' + h);
    svg.innerHTML = edges + nodes;
  }

  function renderTreeInfo() {
    const n = TR.by[TR.path];
    const pathHtml = TR.path ? symHtml(TR.path, 'big') : '<span class="small">no steps yet</span>';
    const box = $('#trInfo');
    if (TR.find) {
      box.innerHTML = '<div class="big-ch" aria-label="Find ' + TR.target + '">' + TR.target + '</div>' +
        '<div class="col"><span class="small">Find this letter</span>' + pathHtml + '</div>' +
        '<div class="col"><span class="small">Score <b>' + TR.score + '</b> &middot; Streak <b>' + TR.streak + '</b></span>' +
        '<button class="btn ghost sm" id="trHint">Hint</button></div>';
      $('#trHint').addEventListener('click', trHint);
    } else {
      const text = !TR.path ? 'Start at the root. Pick Dot or Dash, or tap a circle.' :
        n && n.ch ? spoken(TR.path) : 'No letter sits here. Keep going or step back.';
      box.innerHTML = '<div class="big-ch">' + (n && n.ch ? n.ch : '') + '</div>' +
        '<div class="col">' + pathHtml + '<span class="small">' + text + '</span>' +
        (n && n.ch ? '<button class="btn ghost sm" id="trHear">Hear ' + n.ch + '</button>' : '') + '</div>';
      const h = $('#trHear');
      if (h) h.addEventListener('click', function () { playText(n.ch); });
    }
    const m = $('#trMsg');
    m.textContent = TR.msg;
    m.className = TR.msgClass;
  }

  function scrollToCur() {
    const wrap = $('#trWrap');
    const n = TR.by[TR.path];
    if (!n || !wrap.clientHeight) return;
    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    wrap.scrollTo({
      top: Math.max(0, ny(n) - wrap.clientHeight / 2),
      left: Math.max(0, nx(n) - wrap.clientWidth / 2),
      behavior: reduce ? 'auto' : 'smooth'
    });
  }

  function updateTree() {
    const svg = $('#trSvg');
    const path = TR.path;
    svg.querySelectorAll('.edge').forEach(function (el) {
      el.classList.toggle('on', path.indexOf(el.dataset.code) === 0);
    });
    svg.querySelectorAll('.nd').forEach(function (g) {
      const code = g.dataset.code;
      const n = TR.by[code];
      const on = path.indexOf(code) === 0;
      g.classList.toggle('on', on);
      g.classList.toggle('cur', code === path);
      g.classList.toggle('hide', TR.find);
      const name = !code ? 'Start' : (TR.find && !on) ? 'branch' : (n.ch ? n.ch : 'no letter');
      g.setAttribute('aria-label', name + (code && !TR.find ? ', ' + spoken(code) : ''));
    });
    $('#trDot').disabled = TR.locked || !TR.by[path + '.'];
    $('#trDash').disabled = TR.locked || !TR.by[path + '-'];
    $('#trBack').disabled = TR.locked || !path;
    $('#trReset').disabled = TR.locked || !path;
    renderTreeInfo();
    scrollToCur();
  }

  function trMove(code, soundCode) {
    if (TR.locked || !TR.by[code]) return;
    const prev = TR.path;
    TR.path = code;
    TR.msg = '';
    TR.msgClass = 'msg';
    if (soundCode) playRaw(soundCode);
    if (TR.find && TR.target) {
      const want = MORSE[TR.target];
      if (code === want) { trWin(); return; }
      if (want.indexOf(prev) === 0 && want.indexOf(code) !== 0) {
        TR.mistakes++;
        TR.msg = 'Dead end. Step back and try the other way.';
        TR.msgClass = 'msg bad';
      }
    }
    updateTree();
  }
  function trStep(sym) { trMove(TR.path + sym, sym); }
  function trBack() { if (TR.path) trMove(TR.path.slice(0, -1), ''); }

  function trWin() {
    TR.locked = true;
    const clean = TR.mistakes === 0 && TR.hints === 0;
    record(TR.target, clean);
    TR.streak = clean ? TR.streak + 1 : 0;
    bumpMax('treeBest', TR.streak);
    TR.score += Math.max(2, 10 - 3 * TR.mistakes - 2 * TR.hints);
    TR.msg = (clean ? 'Straight there. ' : 'Found it. ') + TR.target + ' is ' + spoken(MORSE[TR.target]) + '.';
    TR.msgClass = clean ? 'msg ok' : 'msg';
    updateTree();
    setTimeout(function () { playRaw(MORSE[TR.target]); }, 250);
    setTimeout(function () { if (MM.is('tree') && TR.locked) trNext(); }, 2200);
  }

  function trNext() {
    const chars = TR.nodes.filter(function (n) { return n.ch; }).map(function (n) { return n.ch; });
    const set = KOCH.slice(0, state.n);
    let p = chars.filter(function (c) { return set.indexOf(c) >= 0; });
    if (p.length < 2) p = chars;
    let best = null;
    for (let k = 0; k < 3; k++) {
      const c = p[Math.floor(Math.random() * p.length)];
      if (c === TR.target && p.length > 1) { k--; continue; }
      if (best === null || accuracy(c) < accuracy(best)) best = c;
    }
    TR.target = best;
    TR.path = '';
    TR.mistakes = 0;
    TR.hints = 0;
    TR.locked = false;
    TR.msg = '';
    TR.msgClass = 'msg';
    updateTree();
  }

  function trHint() {
    if (TR.locked || !TR.target) return;
    const want = MORSE[TR.target];
    TR.hints++;
    let btn;
    if (want.indexOf(TR.path) === 0) {
      const sym = want[TR.path.length];
      btn = sym === '.' ? $('#trDot') : $('#trDash');
      TR.msg = 'Next step: ' + (sym === '.' ? 'dot, up.' : 'dash, down.');
    } else {
      btn = $('#trBack');
      TR.msg = 'You left the route. Step back.';
    }
    TR.msgClass = 'msg';
    renderTreeInfo();
    btn.classList.add('nudge');
    setTimeout(function () { btn.classList.remove('nudge'); }, 1800);
  }

  function showTree() {
    if (!TR.built) { buildTreeView(); TR.built = true; }
    if (TR.find && !TR.target) trNext(); else updateTree();
  }
  function setTrFind(on) {
    TR.find = on;
    TR.path = '';
    TR.locked = false;
    TR.msg = '';
    TR.msgClass = 'msg';
    $('#trExplore').setAttribute('aria-pressed', String(!on));
    $('#trFind').setAttribute('aria-pressed', String(on));
    if (on) trNext(); else updateTree();
  }
  $('#trExplore').addEventListener('click', function () { setTrFind(false); });
  $('#trFind').addEventListener('click', function () { setTrFind(true); });
  $('#trNums').addEventListener('change', function (e) {
    TR.digits = e.target.checked;
    TR.path = '';
    TR.locked = false;
    buildTreeView();
    if (TR.find) trNext(); else updateTree();
  });
  $('#trDot').addEventListener('click', function () { trStep('.'); });
  $('#trDash').addEventListener('click', function () { trStep('-'); });
  $('#trBack').addEventListener('click', trBack);
  $('#trReset').addEventListener('click', function () { trMove('', ''); });
  $('#trSvg').addEventListener('click', function (e) {
    const g = e.target.closest ? e.target.closest('.nd') : null;
    if (g) trMove(g.dataset.code, g.dataset.code);
  });
  $('#trSvg').addEventListener('keydown', function (e) {
    const g = e.target.closest ? e.target.closest('.nd') : null;
    if (g && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); trMove(g.dataset.code, g.dataset.code); }
  });

  MM.register('tree', {
    show: showTree,
    onKey: function (e) {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.target.matches && e.target.matches('input[type=range]')) return;
      const k = e.key;
      if (k === '.' || k === 'ArrowUp') { e.preventDefault(); trStep('.'); }
      else if (k === '-' || k === 'ArrowDown') { e.preventDefault(); trStep('-'); }
      else if (k === 'Backspace' || k === 'ArrowLeft') { e.preventDefault(); trBack(); }
      else if (k === 'Escape') { trMove('', ''); }
    }
  });
})();
