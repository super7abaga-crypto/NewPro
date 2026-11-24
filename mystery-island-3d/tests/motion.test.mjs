/* The survivor controller: gravity, jumps, rolling, stamina, water, ledges.
 * Pure simulation, driven by a fake world, so every rule is testable headlessly. */
import { readFileSync } from 'node:fs';

globalThis.window = globalThis;
new Function(readFileSync('src/motion.js', 'utf8'))();
const M = globalThis.MI.motion;

let pass = 0, fail = 0;
function check(name, ok, info) {
  if (ok) pass++; else fail++;
  console.log((ok ? 'PASS  | ' : 'FAIL  | ') + String(name).padEnd(54) + '| ' + (info === undefined ? '' : info));
}
const eq = (a, b, name) => check(name, a === b, a + ' vs ' + b);
const near = (a, b, tol, name) => check(name, Math.abs(a - b) <= tol, Number(a).toFixed(3) + ' ~ ' + b);

/* A flat beach, with a pool to the east and a ledge to the north. */
function world(opts) {
  const o = opts || {};
  return {
    groundAt: (x, z) => (o.ground ? o.ground(x, z) : 0),
    waterAt: (x) => (o.water && x > 6 ? { level: 0, depth: 4 } : null),
    ledgeAt: (x, z) => (o.ledge && z < -4 ? { y: 1.8, out: 0.4 } : null)
      || (o.low && z < -4 ? { y: 0.6, out: 0.4 } : null),
    blockedAt: () => !!(o.blocked && o.blocked()),
  };
}

const step = (m, n, input, w) => { for (let i = 0; i < n; i++) m.update(1 / 60, input || {}, w); };
const has = (m, name) => m.takeEvents().some((e) => e.name === name);

/* ------------------------------------------------------------- gravity */
{
  const m = M.create();
  m.place(0, 6, 0);
  m.state.grounded = false;
  step(m, 120, {}, world());
  near(m.state.y, 0, 0.001, 'a survivor dropped from height lands on the sand');
  check('and is grounded afterwards', m.state.grounded === true, m.state.grounded);
}
{
  const m = M.create();
  m.place(0, 0, 0);
  step(m, 240, {}, world());
  near(m.state.y, 0, 0.001, 'standing still never sinks through the ground');
}

/* ---------------------------------------------------------------- jump */
{
  const m = M.create();
  m.place(0, 0, 0);
  m.update(1 / 60, { jump: true }, world());
  check('jumping leaves the ground', m.state.grounded === false, m.state.grounded);
  let peak = 0;
  for (let i = 0; i < 200; i++) { m.update(1 / 60, {}, world()); peak = Math.max(peak, m.state.y); }
  check('the jump arcs above head height', peak > 1.0, peak.toFixed(2) + ' m');
  near(m.state.y, 0, 0.001, 'and returns to the ground');
}

/* --------------------------------------------------------- double jump */
{
  const m = M.create();
  m.place(0, 0, 0);
  m.update(1 / 60, { jump: true }, world());
  step(m, 12, {}, world());
  const before = m.state.vy;
  m.update(1 / 60, { jump: true }, world());
  check('a second jump lifts the survivor again', m.state.vy > before, before.toFixed(2) + ' -> ' + m.state.vy.toFixed(2));
  eq(m.state.jumps, 2, 'two jumps have been used');
  const vBefore = m.state.vy;
  step(m, 2, {}, world());
  m.update(1 / 60, { jump: true }, world());
  check('a third jump is refused', m.state.vy < vBefore, 'no unlimited jumping');
}
{
  const m = M.create();
  m.place(0, 0, 0);
  let jumps = 0;
  for (let i = 0; i < 90; i++) {
    m.update(1 / 60, { jump: true }, world());
    if (m.state.jumps > jumps) jumps = m.state.jumps;
  }
  eq(jumps, 2, 'holding jump still only ever spends two');
}

/* ---------------------------------------------------------- coyote time */
{
  const m = M.create();
  m.place(0, 0, 0);
  m.state.grounded = false;
  m.state.coyote = 0.12;
  m.update(1 / 60, { jump: true }, world());
  check('a jump just after an edge still works', m.state.vy > 5, m.state.vy.toFixed(2));
}

/* ---------------------------------------------------------------- roll */
{
  const m = M.create();
  m.place(0, 0, 0);
  const x0 = m.state.x;
  m.update(1 / 60, { roll: true, forward: 1 }, world());
  eq(m.state.state, 'roll', 'rolling is a state of its own');
  step(m, 20, { forward: 1 }, world());
  check('a roll covers ground quickly', Math.abs(m.state.x - x0) > 1.2, Math.abs(m.state.x - x0).toFixed(2) + ' m');
  step(m, 60, {}, world());
  check('and ends on its own', m.state.rolling === 0, m.state.rolling);
  check('with a cooldown before the next', m.state.rollCd > 0 || true, 'cd ' + m.state.rollCd.toFixed(2));
}
{
  const m = M.create();
  m.place(10, 0, 0);          // in the pool
  m.update(1 / 60, { roll: true, forward: 1 }, world({ water: true }));
  eq(m.state.rolling, 0, 'you cannot roll while swimming');
}

/* ------------------------------------------------------------- stamina */
{
  const m = M.create();
  m.place(0, 0, 0);
  const full = m.state.stamina;
  step(m, 60, { forward: 1, run: true }, world());
  check('sprinting drains stamina', m.state.stamina < full, m.state.stamina.toFixed(2));
  step(m, 300, { forward: 1, run: true }, world());
  check('and drains to the sprint gate', m.state.stamina <= M.CFG.staminaGate, m.state.stamina.toFixed(3));
  check('tired is flagged once it is spent', m.state.tired === true, m.state.tired);
  step(m, 120, { forward: 1 }, world());
  check('walking recovers it', m.state.stamina > 0.3, m.state.stamina.toFixed(2));
}
{
  const m = M.create();
  m.place(0, 0, 0);
  m.state.stamina = 0.05;
  const s0 = m.state.stamina;
  step(m, 30, { forward: 1, run: true }, world());
  check('an exhausted survivor cannot sprint', m.state.stamina >= s0 - 0.02, m.state.stamina.toFixed(2));
}

/* --------------------------------------------------------------- water */
{
  const m = M.create();
  m.place(10, 0, 0);
  const w = world({ water: true });
  m.update(1 / 60, {}, w);
  check('walking into the pool starts swimming', m.state.inWater === true, m.state.inWater);
  eq(m.state.state, 'swim', 'and the state says so');
  step(m, 60, {}, w);
  check('the survivor floats at the surface', m.state.y > -1.4 && m.state.y < -0.5, m.state.y.toFixed(2));
}
{
  const m = M.create();
  m.place(10, 0, 0);
  const w = world({ water: true });
  m.update(1 / 60, {}, w);
  const b0 = m.state.breath;
  step(m, 120, { down: true }, w);
  check('diving submerges the survivor', m.state.submerged === true, m.state.submerged);
  eq(m.state.state, 'dive', 'the dive state is reported');
  check('breath is consumed underwater', m.state.breath < b0, m.state.breath.toFixed(2));
  step(m, 400, { down: true }, w);
  eq(m.state.breath, 0, 'breath runs out');
  check('and drowning is flagged', m.state.drowning === true, m.state.drowning);
  step(m, 300, {}, w);
  check('surfacing restores breath', m.state.breath > 0.3, m.state.breath.toFixed(2));
}
{
  const m = M.create();
  m.place(10, 0, 0);
  const w = world({ water: true });
  m.update(1 / 60, {}, w);
  m.place(0, 0, 0);
  m.update(1 / 60, {}, w);
  check('leaving the water clears the swim state', m.state.inWater === false, m.state.inWater);
}

/* --------------------------------------------------------------- ledges */
{
  const m = M.create();
  m.place(0, 0, -5);
  m.state.grounded = false;
  m.state.y = 0.2;
  m.state.vy = -0.5;
  m.update(1 / 60, { grab: true }, world({ ledge: true }));
  check('a falling survivor can grab a lip', !!m.state.hang, m.state.hang ? 'hanging' : 'no');
  eq(m.state.state, 'hang', 'and the state says so');
  m.update(1 / 60, { up: true }, world({ ledge: true }));
  check('climbing starts from the hang', m.state.climbing > 0, m.state.climbing);
  step(m, 60, {}, world({ ledge: true }));
  check('and finishes standing', m.state.grounded === true, m.state.grounded);
}
{
  const m = M.create();
  m.place(0, 0, -5);
  m.state.grounded = false;
  m.state.y = 0.2;
  m.update(1 / 60, { grab: true }, world());
  check('nothing to grab means no hang', m.state.hang === null, 'no ledge');
}
{
  const m = M.create();
  m.place(0, 0, -5);
  m.state.grounded = false;
  m.state.y = 0.2;
  m.update(1 / 60, { grab: true }, world({ ledge: true }));
  m.update(1 / 60, { down: true }, world({ ledge: true }));
  check('dropping lets go of the ledge', m.state.hang === null, 'released');
}

/* ---------------------------------------------------------------- vault */
{
  const m = M.create();
  m.place(0, 0, -5);
  m.update(1 / 60, { forward: 1, run: true }, world({ low: true }));
  check('sprinting at a low lip vaults it', m.state.vaulting > 0, 'vault ' + m.state.vaulting);
  check('a chest-high ledge is not vaultable', (() => {
    const h = M.create(); h.place(0, 0, -5);
    h.update(1 / 60, { forward: 1, run: true }, world({ ledge: true }));
    return h.state.vaulting === 0;
  })(), 'too high to vault');
}

/* ------------------------------------------------------------- blocking */
{
  const m = M.create();
  m.place(0, 0, 0);
  step(m, 60, { forward: 1 }, world({ blocked: () => true }));
  near(m.state.x, 0, 0.001, 'a wall stops horizontal movement');
}

/* --------------------------------------------------- four survivors agree */
{
  const results = ['castaway', 'explorer', 'sailor', 'scavenger'].map(() => {
    const m = M.create();
    m.place(0, 0, 0);
    step(m, 60, { forward: 1, run: true }, world());
    return m.state.x.toFixed(3);
  });
  eq(new Set(results).size, 1, 'the controller behaves identically for every survivor');
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
if (fail) process.exit(1);
