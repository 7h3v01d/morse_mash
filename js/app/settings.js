/* Morse Mash: Settings bar and signals. */
(function () {
  'use strict';
  const { unitMs } = window.MorseCore;
  const MM = window.MM;
  const { $, state, save, pool, toast, playText, gapMs } = MM;

  function renderSettings() {
    $('#setSize').value = state.n;
    $('#setSizeVal').textContent = state.n + ' of 36';
    $('#wpm').value = state.wpm;
    $('#wpmVal').textContent = state.wpm + ' WPM';
    const eff = $('#eff');
    eff.max = state.wpm;
    eff.value = state.eff;
    eff.disabled = state.wpm <= 5;
    const fw = state.eff < state.wpm;
    $('#effVal').textContent = fw ? state.eff + ' WPM' : 'same';
    const unit = unitMs(state.wpm);
    const gap = gapMs();
    $('#timing').innerHTML = 'Dot <b>' + Math.round(unit) + ' ms</b> &middot; dash <b>' + Math.round(unit * 3) + ' ms</b> &middot; letter gap <b>' +
      Math.round(gap * 3) + ' ms</b> &middot; word gap <b>' + Math.round(gap * 7) + ' ms</b>' + (fw ? ' <span class="fw">Farnsworth</span>' : '');
    const p = pool();
    $('#setList').innerHTML = 'In play: <b>' + p.join(' ') + '</b>';
  }
  $('#setSize').addEventListener('input', function (e) {
    state.n = +e.target.value;
    save();
    MM.refreshAll();
    const cur = MM.current();
    if (cur.onPool) cur.onPool();
  });
  $('#wpm').addEventListener('input', function (e) {
    const was = state.wpm;
    state.wpm = +e.target.value;
    // Keep standard spacing if it was standard, otherwise keep the overall speed where it was (but never above the character speed).
    state.eff = state.eff >= was ? state.wpm : Math.min(state.eff, state.wpm);
    save();
    MM.refreshAll();
  });
  $('#eff').addEventListener('input', function (e) {
    state.eff = Math.min(+e.target.value, state.wpm);
    save();
    MM.refreshAll();
  });

  const canBuzz = typeof navigator.vibrate === 'function';
  function renderSignals() {
    $('#sigSound').checked = state.sig.sound;
    $('#sigLight').checked = state.sig.light;
    $('#sigBuzz').checked = state.sig.buzz && canBuzz;
    $('#sigBuzz').disabled = !canBuzz;
    $('#sigBuzzTxt').textContent = canBuzz ? 'Buzz' : 'Buzz (not on this device)';
    $('#signalWrap').hidden = !state.sig.light;
    $('#sigNoise').value = String(state.sig.noise);
    $('#sigNoise').disabled = !state.sig.sound;
    $('#sigNote').textContent = 'Light adds a flashing bar that stays at the top as you scroll. Buzz vibrates a phone in time with the code. ' +
      'Noise plays receiver hiss under the sound, for practice copying through interference. ' +
      'Fast flashing can bother people who are sensitive to it, so keep the speed low if that is you.';
  }
  function onSignal(key, el) {
    state.sig[key] = el.checked;
    if (!state.sig.sound && !state.sig.light && !state.sig.buzz) {
      state.sig[key] = true;
      toast('Keep at least one signal on.');
    }
    save();
    renderSignals();
  }
  $('#sigSound').addEventListener('change', function (e) { onSignal('sound', e.target); });
  $('#sigLight').addEventListener('change', function (e) { onSignal('light', e.target); });
  $('#sigBuzz').addEventListener('change', function (e) { onSignal('buzz', e.target); });
  $('#sigNoise').addEventListener('change', function (e) { state.sig.noise = +e.target.value; save(); playText('VVV'); });
  $('#sigTest').addEventListener('click', function () { playText('SOS'); });

  MM.onRefresh(renderSettings);
  MM.onRefresh(renderSignals);
})();
