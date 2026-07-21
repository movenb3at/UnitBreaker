(function (UB) {
  'use strict';

  let context = null;
  let muted = false;

  function ensureContext() {
    if (muted) return null;
    if (!context) context = new (window.AudioContext || window.webkitAudioContext)();
    if (context.state === 'suspended') context.resume();
    return context;
  }

  function tone(frequency, duration, type, volume, delay) {
    const ctx = ensureContext();
    if (!ctx) return;
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    const start = ctx.currentTime + (delay || 0);
    oscillator.type = type || 'sine';
    oscillator.frequency.setValueAtTime(frequency, start);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(volume || 0.035, start + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(gain).connect(ctx.destination);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.02);
  }

  const patterns = {
    select: function () { tone(410, 0.07, 'sine', 0.025); },
    cancel: function () { tone(250, 0.08, 'sine', 0.02); },
    valid: function () { tone(520, 0.12, 'sine', 0.03); tone(780, 0.16, 'sine', 0.025, 0.08); },
    invalid: function () { tone(150, 0.14, 'square', 0.018); },
    ability: function () { tone(220, 0.24, 'sawtooth', 0.025); tone(660, 0.25, 'sine', 0.025, 0.05); },
    chain: function () { tone(640, 0.12, 'triangle', 0.035); tone(920, 0.18, 'triangle', 0.025, 0.08); },
    tick: function () { tone(720, 0.06, 'square', 0.018); },
    win: function () { [440, 554, 659, 880].forEach(function (f, i) { tone(f, 0.32, 'triangle', 0.035, i * 0.09); }); },
    lose: function () { [320, 260, 180].forEach(function (f, i) { tone(f, 0.32, 'sawtooth', 0.02, i * 0.12); }); }
  };

  UB.Audio = {
    play: function (name) { if (patterns[name] && !muted) patterns[name](); },
    toggle: function () { muted = !muted; return muted; },
    isMuted: function () { return muted; },
    unlock: ensureContext
  };
})(window.UnitBreaker = window.UnitBreaker || {});
