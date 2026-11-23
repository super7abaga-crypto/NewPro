/* Mystery Island 3D — procedural audio.
 *
 * Every sound is synthesised with the Web Audio API, so the game ships with no
 * audio files: nothing to 404, nothing to download, and the whole horror bed
 * can react to game state.
 */
(function (root) {
  'use strict';

  const A = {
    ctx: null,
    master: null,
    volume: 0.75,
    ready: false,
    beds: [],
    heart: { timer: 0, rate: 1.0, on: false },
  };

  function ctxClass() {
    return root.AudioContext || root.webkitAudioContext || null;
  }

  function init() {
    if (A.ctx) return A.ready;
    const C = ctxClass();
    if (!C) return false;
    try {
      A.ctx = new C();
      A.master = A.ctx.createGain();
      A.master.gain.value = A.volume;
      A.master.connect(A.ctx.destination);
      A.ready = true;
    } catch (err) {
      A.ready = false;
    }
    return A.ready;
  }

  function resume() {
    if (A.ctx && A.ctx.state === 'suspended') A.ctx.resume().catch(() => {});
  }

  function setVolume(v) {
    A.volume = Math.max(0, Math.min(1, Number(v) || 0));
    if (A.master) A.master.gain.value = A.volume;
  }

  function now() {
    return A.ctx ? A.ctx.currentTime : 0;
  }

  /* A reusable buffer of noise. White for rain and impacts, brown for wind. */
  let noiseWhite = null;
  let noiseBrown = null;
  function makeNoise(kind) {
    const len = A.ctx.sampleRate * 2;
    const buf = A.ctx.createBuffer(1, len, A.ctx.sampleRate);
    const data = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i += 1) {
      const white = Math.random() * 2 - 1;
      if (kind === 'brown') {
        last = (last + 0.02 * white) / 1.02;
        data[i] = last * 3.2;
      } else {
        data[i] = white;
      }
    }
    return buf;
  }
  function noise(kind) {
    if (!A.ctx) return null;
    if (kind === 'brown') {
      if (!noiseBrown) noiseBrown = makeNoise('brown');
      return noiseBrown;
    }
    if (!noiseWhite) noiseWhite = makeNoise('white');
    return noiseWhite;
  }

  function panner(x) {
    const p = A.ctx.createStereoPanner ? A.ctx.createStereoPanner() : null;
    if (p) p.pan.value = Math.max(-1, Math.min(1, x || 0));
    return p;
  }

  function chain(nodes, destination) {
    let prev = null;
    nodes.forEach((n) => {
      if (prev) prev.connect(n);
      prev = n;
    });
    if (prev) prev.connect(destination || A.master);
    return prev;
  }

  /* ---------------------------------------------------------------- beds */
  function stopBeds() {
    A.beds.forEach((bed) => {
      try {
        if (bed.gain) {
          bed.gain.gain.cancelScheduledValues(now());
          bed.gain.gain.setTargetAtTime(0, now(), 0.35);
        }
        if (bed.stop) setTimeout(() => { try { bed.stop(); } catch (e) { /* gone */ } }, 1200);
      } catch (err) { /* already stopped */ }
    });
    A.beds = [];
  }

  function bedNoise({ kind, type, freq, q, gain, lfoRate, lfoDepth }) {
    if (!A.ready) return null;
    const src = A.ctx.createBufferSource();
    src.buffer = noise(kind);
    src.loop = true;
    const filter = A.ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = freq;
    if (q) filter.Q.value = q;
    const g = A.ctx.createGain();
    g.gain.value = 0;
    g.gain.setTargetAtTime(gain, now(), 0.8);
    src.connect(filter).connect(g).connect(A.master);
    if (lfoRate) {
      const lfo = A.ctx.createOscillator();
      const lfoGain = A.ctx.createGain();
      lfo.frequency.value = lfoRate;
      lfoGain.gain.value = lfoDepth || gain * 0.5;
      lfo.connect(lfoGain).connect(g.gain);
      lfo.start();
      A.beds.push({ gain: g, stop: () => { src.stop(); lfo.stop(); } });
    } else {
      A.beds.push({ gain: g, stop: () => src.stop() });
    }
    src.start();
    return g;
  }

  function tone({ freq, type, gain, attack, hold, release, slideTo, pan }) {
    if (!A.ready) return;
    const osc = A.ctx.createOscillator();
    const g = A.ctx.createGain();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, now());
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), now() + (attack || 0.01) + (hold || 0.2));
    g.gain.setValueAtTime(0.0001, now());
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain || 0.2), now() + (attack || 0.02));
    g.gain.exponentialRampToValueAtTime(0.0001, now() + (attack || 0.02) + (hold || 0.2) + (release || 0.3));
    const p = panner(pan);
    if (p) osc.connect(g).connect(p).connect(A.master); else osc.connect(g).connect(A.master);
    osc.start();
    osc.stop(now() + (attack || 0.02) + (hold || 0.2) + (release || 0.3) + 0.1);
  }

  function burst({ kind, freq, type, gain, attack, decay, pan }) {
    if (!A.ready) return;
    const src = A.ctx.createBufferSource();
    src.buffer = noise(kind || 'white');
    const filter = A.ctx.createBiquadFilter();
    filter.type = type || 'lowpass';
    filter.frequency.value = freq || 800;
    const g = A.ctx.createGain();
    const a = attack || 0.005;
    const d = decay || 0.25;
    g.gain.setValueAtTime(0.0001, now());
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain || 0.3), now() + a);
    g.gain.exponentialRampToValueAtTime(0.0001, now() + a + d);
    const p = panner(pan);
    if (p) src.connect(filter).connect(g).connect(p).connect(A.master);
    else src.connect(filter).connect(g).connect(A.master);
    src.start();
    src.stop(now() + a + d + 0.1);
  }

  /* ------------------------------------------------------------ ambience */
  const AMBIENCE = {
    Beach: () => {
      bedNoise({ kind: 'brown', type: 'lowpass', freq: 420, gain: 0.5, lfoRate: 0.13, lfoDepth: 0.22 });
      bedNoise({ kind: 'white', type: 'highpass', freq: 2600, gain: 0.13, lfoRate: 0.31, lfoDepth: 0.06 });
      bedNoise({ kind: 'white', type: 'bandpass', freq: 900, q: 0.7, gain: 0.09, lfoRate: 0.21, lfoDepth: 0.05 });
    },
    Jungle: () => {
      bedNoise({ kind: 'brown', type: 'lowpass', freq: 260, gain: 0.34, lfoRate: 0.09, lfoDepth: 0.16 });
      bedNoise({ kind: 'white', type: 'bandpass', freq: 1800, q: 12, gain: 0.06, lfoRate: 0.6, lfoDepth: 0.05 });
      bedNoise({ kind: 'white', type: 'bandpass', freq: 3400, q: 18, gain: 0.04, lfoRate: 1.7, lfoDepth: 0.03 });
    },
    Cave: () => {
      bedNoise({ kind: 'brown', type: 'lowpass', freq: 150, gain: 0.42, lfoRate: 0.06, lfoDepth: 0.1 });
      bedNoise({ kind: 'white', type: 'bandpass', freq: 520, q: 24, gain: 0.05, lfoRate: 0.35, lfoDepth: 0.04 });
    },
    'Old Bridge': () => {
      bedNoise({ kind: 'brown', type: 'lowpass', freq: 320, gain: 0.46, lfoRate: 0.17, lfoDepth: 0.2 });
      bedNoise({ kind: 'white', type: 'bandpass', freq: 700, q: 0.8, gain: 0.12, lfoRate: 0.28, lfoDepth: 0.07 });
    },
    Lighthouse: () => {
      bedNoise({ kind: 'brown', type: 'lowpass', freq: 200, gain: 0.3, lfoRate: 0.11, lfoDepth: 0.12 });
      tone({ freq: 58, type: 'sine', gain: 0.05, attack: 1.2, hold: 3.5, release: 2.4 });
    },
  };

  function ambience(location) {
    if (!A.ready) return;
    stopBeds();
    const make = AMBIENCE[location];
    if (make) make();
  }

  /* ------------------------------------------------------------- effects */
  function footstep(surface) {
    const map = {
      sand: { freq: 620, gain: 0.18, decay: 0.14 },
      leaves: { freq: 1500, gain: 0.16, decay: 0.1 },
      rock: { freq: 900, gain: 0.2, decay: 0.12 },
      wood: { freq: 480, gain: 0.24, decay: 0.16 },
    };
    const s = map[surface] || map.sand;
    burst({ kind: 'white', type: 'lowpass', freq: s.freq, gain: s.gain, attack: 0.004, decay: s.decay });
    tone({ freq: 90, type: 'sine', gain: 0.06, attack: 0.004, hold: 0.02, release: 0.06 });
  }

  function whisper(pan) {
    for (let i = 0; i < 3; i += 1) {
      setTimeout(() => {
        burst({ kind: 'white', type: 'bandpass', freq: 900 + Math.random() * 1800, gain: 0.1, attack: 0.05, decay: 0.3, pan });
      }, i * 140);
    }
  }

  function scream(pan) {
    tone({ freq: 880, type: 'sawtooth', gain: 0.16, attack: 0.01, hold: 0.12, release: 0.5, slideTo: 180, pan });
    burst({ kind: 'white', type: 'bandpass', freq: 2200, gain: 0.16, attack: 0.01, decay: 0.5, pan });
  }

  function stinger() {
    tone({ freq: 140, type: 'square', gain: 0.18, attack: 0.005, hold: 0.08, release: 0.6, slideTo: 42 });
    burst({ kind: 'white', type: 'highpass', freq: 3000, gain: 0.2, attack: 0.002, decay: 0.4 });
  }

  function thunder() {
    burst({ kind: 'brown', type: 'lowpass', freq: 240, gain: 0.5, attack: 0.02, decay: 2.6 });
    tone({ freq: 46, type: 'sine', gain: 0.2, attack: 0.05, hold: 0.6, release: 2.2 });
  }

  function drip() {
    tone({ freq: 900 + Math.random() * 500, type: 'sine', gain: 0.12, attack: 0.002, hold: 0.03, release: 0.28, pan: Math.random() * 1.6 - 0.8 });
  }

  function creak() {
    tone({ freq: 180 + Math.random() * 90, type: 'sawtooth', gain: 0.05, attack: 0.2, hold: 0.4, release: 0.5, slideTo: 90 });
  }

  function click() {
    tone({ freq: 660, type: 'triangle', gain: 0.08, attack: 0.002, hold: 0.02, release: 0.06 });
  }

  function beacon() {
    tone({ freq: 110, type: 'sine', gain: 0.2, attack: 0.4, hold: 1.2, release: 1.8 });
    tone({ freq: 220, type: 'triangle', gain: 0.12, attack: 0.6, hold: 1.4, release: 2.0 });
    burst({ kind: 'brown', type: 'lowpass', freq: 400, gain: 0.25, attack: 0.3, decay: 2.4 });
  }

  function deathTone() {
    tone({ freq: 200, type: 'sine', gain: 0.18, attack: 0.1, hold: 0.6, release: 2.2, slideTo: 40 });
  }

  /* ----------------------------------------------------------- heartbeat */
  function thump(strength) {
    tone({ freq: 62, type: 'sine', gain: 0.16 * strength, attack: 0.01, hold: 0.05, release: 0.22 });
    setTimeout(() => tone({ freq: 52, type: 'sine', gain: 0.11 * strength, attack: 0.01, hold: 0.04, release: 0.2 }), 170);
  }

  function setHeartbeat(rate) {
    A.heart.rate = rate;
    A.heart.on = rate > 0;
  }

  function tickHeartbeat(dt) {
    if (!A.heart.on || !A.ready) return;
    A.heart.timer -= dt;
    if (A.heart.timer <= 0) {
      thump(Math.min(1, 0.35 + A.heart.rate * 0.6));
      A.heart.timer = Math.max(0.34, 1.35 - A.heart.rate);
    }
  }

  root.MI = root.MI || {};
  root.MI.audio = {
    init, resume, setVolume, ambience, stopBeds, footstep, whisper, scream, stinger,
    thunder, drip, creak, click, beacon, deathTone, setHeartbeat, tickHeartbeat,
    get volume() { return A.volume; },
    get ready() { return A.ready; },
  };
})(typeof window !== 'undefined' ? window : globalThis);
