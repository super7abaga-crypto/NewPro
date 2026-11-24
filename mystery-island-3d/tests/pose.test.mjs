/* The pose blender adapted from the reference web/pose.js. */
import { readFileSync } from 'node:fs';

globalThis.window = globalThis;
new Function(readFileSync('src/pose.js', 'utf8'))();
const P = globalThis.MI.pose;

let pass = 0, fail = 0;
function check(name, ok, info) {
  if (ok) pass++; else fail++;
  console.log((ok ? 'PASS  | ' : 'FAIL  | ') + String(name).padEnd(56) + '| ' + (info === undefined ? '' : info));
}
const eq = (a, b, name) => check(name, a === b, a + ' vs ' + b);

const base = { grounded: true, vy: 0, speed: 0, walk: 2.7, facing: 1, inWater: false, submerged: false, hang: null, climbing: 0, vaulting: 0, rolling: 0, landTimer: 0, over: false, won: false };

/* --------------------------------------------------------------- the states */
check('at least fifteen pose states exist', P.STATES.length >= 15, P.STATES.length);
['idle', 'walk', 'run', 'sprint', 'turn', 'rise', 'fall', 'apex', 'land', 'roll', 'hang', 'climb', 'vault', 'swim', 'dive', 'pickup', 'interact', 'hurt', 'collapse']
  .forEach((s) => check('state ' + s + ' is defined', !!P.TARGETS[s]));

/* ------------------------------------------------------------- state choice */
function stateFor(g) {
  const b = P.create();
  b.update(1 / 60, Object.assign({}, base, g));
  return b.state;
}
eq(stateFor({}), 'idle', 'standing still is idle');
eq(stateFor({ speed: 1.5 }), 'walk', 'a slow pace is walking');
eq(stateFor({ speed: 4 }), 'run', 'a fast pace is running');
eq(stateFor({ speed: 4, sprinting: true }), 'sprint', 'sprinting is its own state');
eq(stateFor({ grounded: false, vy: 5 }), 'rise', 'leaving the ground is a rise');
eq(stateFor({ grounded: false, vy: -5 }), 'fall', 'coming down is a fall');
eq(stateFor({ grounded: false, vy: 0 }), 'apex', 'the top of the arc is the apex');
eq(stateFor({ landTimer: 0.2 }), 'land', 'touching down is a landing');
eq(stateFor({ rolling: 0.4, speed: 5 }), 'roll', 'a roll overrides the gait');
eq(stateFor({ inWater: true }), 'swim', 'water is swimming');
eq(stateFor({ inWater: true, submerged: true }), 'dive', 'below the surface is a dive');
eq(stateFor({ hang: { y: 2 }, grounded: false }), 'hang', 'a ledge grab is hanging');
eq(stateFor({ climbing: 0.5 }), 'climb', 'climbing has its own pose');
eq(stateFor({ vaulting: 0.5 }), 'vault', 'vaulting has its own pose');
eq(stateFor({ over: true, won: false }), 'collapse', 'a lost run collapses');
eq(stateFor({ over: true, won: true, speed: 2 }), 'walk', 'a won run does not collapse');

/* priority: water beats everything below it, collapse beats water */
eq(stateFor({ over: true, inWater: true }), 'collapse', 'collapse outranks water');
eq(stateFor({ inWater: true, rolling: 0.4 }), 'swim', 'water outranks rolling');
eq(stateFor({ hang: { y: 2 }, rolling: 0.4 }), 'hang', 'hanging outranks rolling');

/* ------------------------------------------------------------------- easing */
{
  const b = P.create();
  b.update(1 / 60, base);
  const idleLean = b.channels.lean;
  b.update(1 / 60, Object.assign({}, base, { speed: 5 }));
  const afterOne = b.channels.lean;
  for (let i = 0; i < 40; i++) b.update(1 / 60, Object.assign({}, base, { speed: 5 }));
  const settled = b.channels.lean;
  check('a state change eases rather than snapping', afterOne > idleLean && afterOne < settled,
    idleLean.toFixed(3) + ' -> ' + afterOne.toFixed(3) + ' -> ' + settled.toFixed(3));
  check('and settles on the target', Math.abs(settled - P.TARGETS.run.lean) < 0.02, settled.toFixed(3));
}

/* ----------------------------------------------------------------- breathing */
{
  const b = P.create();
  let lo = 1, hi = 0;
  for (let i = 0; i < 240; i++) {
    b.update(1 / 60, base);
    lo = Math.min(lo, b.channels.breathe);
    hi = Math.max(hi, b.channels.breathe);
  }
  check('an idle survivor breathes', hi - lo > 0.3, lo.toFixed(2) + '..' + hi.toFixed(2));
}

/* --------------------------------------------------------------- turn state */
{
  const b = P.create();
  b.update(1 / 60, Object.assign({}, base, { facing: 1 }));
  b.update(1 / 60, Object.assign({}, base, { facing: -1 }));
  check('a facing flip registers a turn', b.turn > 0.5, b.turn.toFixed(2));
}

/* -------------------------------------------------------------------- reset */
{
  const b = P.create();
  for (let i = 0; i < 30; i++) b.update(1 / 60, Object.assign({}, base, { speed: 5 }));
  b.reset();
  eq(b.channels.lean, 0, 'reset clears the channels');
  eq(b.state, 'idle', 'and returns to idle');
}

/* ------------------------------------------------------- every survivor agrees */
{
  const states = ['castaway', 'explorer', 'sailor', 'scavenger'].map(() => {
    const b = P.create();
    for (let i = 0; i < 20; i++) b.update(1 / 60, Object.assign({}, base, { speed: 4 }));
    return b.state;
  });
  eq(new Set(states).size, 1, 'the pose system is identical for every survivor');
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
if (fail) process.exit(1);
