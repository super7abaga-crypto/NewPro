/* Mystery Island 3D — pose blender.
 *
 * Adapted from the reference project's web/pose.js. The original blends a painted
 * 2.5D figure by easing channels (lean, bob, squash, sway, breathe, tilt, drop,
 * lift) toward per-state targets. The same channel model drives the rigged GLB:
 * each channel maps onto a bone transform in character.js.
 *
 * Nothing here is a hard snap: every channel is damped toward its target, so a
 * state change eases instead of jumping. Pure maths, no DOM, no THREE.
 */
(function (root) {
  'use strict';

  const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  /* Per-state channel targets. Unlisted channels fall back to 0 (sx/sy to 1). */
  const TARGETS = {
    idle:       { breathe: 0.5 },
    walk:       { lean: 0.06, bob: 0.5 },
    run:        { lean: 0.16, bob: 1 },
    sprint:     { lean: 0.26, bob: 1.2 },
    turn:       { sway: 0.5 },
    rise:       { lean: -0.08, lift: 0.6, bob: 0.2 },
    fall:       { lean: 0.1, drop: 0.4, bob: 0.1 },
    apex:       { bob: 0.3 },
    land:       { drop: 0.9, sx: 1.06, sy: 0.9, lean: 0.18 },
    roll:       { tilt: 1, drop: 0.7, bob: 0.4 },
    flip:       { tilt: 1, lift: 0.8 },
    hang:       { lift: 0.85, lean: -0.05, drop: 0.2 },
    climb:      { lift: 0.5, lean: 0.2, bob: 0.3 },
    vault:      { tilt: 0.7, lift: 0.6, lean: 0.3 },
    swim:       { lean: 0.7, bob: 0.3, sway: 0.3 },
    dive:       { lean: 1.1, bob: 0.1 },
    pickup:     { lean: 0.55, drop: 0.8 },
    interact:   { lean: 0.2, lift: 0.25 },
    hurt:       { lean: -0.35, tilt: 0.25, sx: 0.94, sy: 1.05 },
    collapse:   { lean: 1.3, drop: 1, tilt: 0.6 },
  };

  const RATES = {
    lean: 11, bob: 22, sx: 18, sy: 18, sway: 14,
    breathe: 8, tilt: 16, drop: 20, lift: 16,
  };

  const CAPS = {
    lean: 1.6, bob: 1.4, sx: 0.25, sy: 0.25, sway: 1.2,
    breathe: 1, tilt: 1.2, drop: 1.2, lift: 1.2,
  };

  const STATES = Object.keys(TARGETS);

  function create() {
    const p = { lean: 0, bob: 0, sx: 1, sy: 1, sway: 0, breathe: 0, tilt: 0, drop: 0, lift: 0 };
    let time = 0;
    let state = 'idle';
    let prev = 'idle';
    let turn = 0;
    let lastFacing = 1;
    let interact = 0;
    let hurt = 0;
    let airFlip = 0;
    let stride = 0;

    function kick(kind) {
      if (kind === 'doublejump') airFlip = 1;
      else if (kind === 'interact' || kind === 'pickup') interact = 1;
      else if (kind === 'hurt') hurt = 1;
      else if (kind === 'land') { /* landTimer drives it */ }
    }

    /* Pick the state from the survivor's situation, in the same priority order
     * the original used (fatal > water > hang > climb > vault > roll > air ...). */
    function pick(g) {
      if (g.over && !g.won) return 'collapse';
      if (g.inWater) return g.submerged ? 'dive' : 'swim';
      if (g.hang) return 'hang';
      if (g.climbing > 0) return 'climb';
      if (g.vaulting > 0) return 'vault';
      if (g.rolling > 0) return 'roll';
      if (airFlip > 0) return 'flip';
      if (hurt > 0.4) return 'hurt';
      if (interact > 0.4) return g.interactKind === 'pickup' ? 'pickup' : 'interact';
      if (!g.grounded) return g.vy > 2 ? 'rise' : g.vy < -2 ? 'fall' : 'apex';
      if (g.landTimer > 0) return 'land';
      if (turn > 0.55) return 'turn';
      if (g.speed < 0.05) return 'idle';
      if (g.sprinting) return 'sprint';
      return g.speed > g.walk * 1.05 ? 'run' : 'walk';
    }

    function update(dt, g) {
      time += dt;
      const facing = g.facing === undefined ? lastFacing : (g.facing >= 0 ? 1 : -1);
      if (facing !== lastFacing) { turn = 1; lastFacing = facing; }
      turn = Math.max(0, turn - dt * 5.5);
      airFlip = Math.max(0, airFlip - dt * 2.2);
      interact = Math.max(0, interact - dt * 2.4);
      hurt = Math.max(0, hurt - dt * 3);

      prev = state;
      state = pick(g || {});

      const target = TARGETS[state] || TARGETS.idle;
      Object.keys(p).forEach((ch) => {
        let want = target[ch] === undefined ? (ch === 'sx' || ch === 'sy' ? 1 : 0) : target[ch];
        if (ch === 'breathe' && state === 'idle') {
          want = 0.5 + Math.sin(time * 1.9) * 0.5;
        }
        if (ch === 'bob') {
          stride += (g && g.speed ? g.speed : 0) * dt * Math.PI;
          const amp = (TARGETS[state] || {}).bob || 0;
          want = Math.sin(stride * 2) * amp;
        }
        if (ch === 'sway') {
          const amp = (TARGETS[state] || {}).sway || 0;
          want = amp ? Math.sin(stride) * amp : 0;
        }
        if (ch === 'lean' && state === 'idle') {
          want = Math.sin(time * 0.63) * 0.02;
        }
        const rate = RATES[ch] || 12;
        p[ch] = clamp(damp(p[ch], want, rate, dt), -CAPS[ch], CAPS[ch]);
      });

      return p;
    }

    return {
      update,
      kick,
      channels: p,
      get state() { return state; },
      get previous() { return prev; },
      get stride() { return stride; },
      get turn() { return turn; },
      states: STATES,
      reset() {
        Object.keys(p).forEach((k) => { p[k] = k === 'sx' || k === 'sy' ? 1 : 0; });
        state = 'idle'; prev = 'idle'; turn = 0; interact = 0; hurt = 0; airFlip = 0;
      },
    };
  }

  root.MI = root.MI || {};
  root.MI.pose = { create, STATES, TARGETS };
})(typeof window !== 'undefined' ? window : globalThis);
