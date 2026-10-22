/* Morse Mash: start-up, tabs and keyboard routing. Loads last, after every mode has registered. */
(function () {
  'use strict';
  const MM = window.MM;

  document.querySelectorAll('.tab').forEach(function (b) {
    b.addEventListener('click', function () { MM.setMode(b.dataset.mode); });
  });

  // Keys go to the active mode, except while typing in a text box.
  const typing = function (e) { return e.target && e.target.matches && e.target.matches('input[type=text], input:not([type])'); };
  document.addEventListener('keydown', function (e) {
    if (typing(e)) return;
    const m = MM.current();
    if (m.onKey) m.onKey(e);
  });
  document.addEventListener('keyup', function (e) {
    const m = MM.current();
    if (m.onKeyUp) m.onKeyUp(e);
  });

  MM.refreshAll();
  MM.checkBadges();
})();
