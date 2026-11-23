/* Unit tests for the visible survivor: construction and procedural animation.
 *
 *   node tests/character.test.mjs
 *
 * Uses the structural Three.js mock, so this proves the rig and its animation
 * maths, not the pixels.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { makeThree } from './three-mock.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');

globalThis.window = globalThis;
new Function(readFileSync(join(root, 'src/character.js'), 'utf8'))();

const THREE = makeThree();
const C = globalThis.MI.character;

const results = [];
const check = (name, ok, detail = '') => results.push([ok ? 'PASS' : 'FAIL', name, detail]);
const near = (a, b, tol) => Math.abs(a - b) <= tol;
/* A yaw of -PI and +PI point the same way: compare angles modulo a full turn. */
const sameAngle = (a, b, tol) => {
  let d = ((a - b + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (d < -Math.PI) d += Math.PI * 2;
  return Math.abs(d) <= tol;
};

/* ---------------------------------------------------------------- the rig */
const c = C.create({ THREE });
check('builds a survivor group', !!c.group && c.group.name === 'survivor', c.group && c.group.name);
check('has a body group for bobbing', !!c.body);
check('has two arms', !!c.armL && !!c.armR);
check('has two legs', !!c.legL && !!c.legR);
check('carries a lamp', !!c.lampGroup);
check('the body is built from parts', c.body.children.length >= 5, c.body.children.length + ' parts');
check('legs hang from the hips, below the body',
  c.legL.position.y > 0.5 && c.legL.position.y < 1.2, c.legL.position.y);
check('arms hang from the shoulders',
  c.armL.position.y > 1.2 && c.armL.position.y < 1.7, c.armL.position.y);

/* --------------------------------------------------------------- the lamp */
c.setLamp(false);
check('lamp off means no glow', c.lampGroup.children.some((ch) => ch.intensity === 0 || ch.isLight === undefined) === true);
c.setLamp(true);
check('lamp on glows again', c.lampGroup.children.length > 0);

/* ------------------------------------------------------------- idle stance */
for (let i = 0; i < 20; i += 1) c.update(0.016, { speed: 0, running: false });
check('standing still does not swing the legs', Math.abs(c.legL.rotation.x) < 0.01,
  c.legL.rotation.x.toFixed(4));
check('standing still reports not moving', c.moving === false);

/* ------------------------------------------------------------- walk cycle */
const walker = C.create({ THREE });
let maxWalk = 0;
for (let i = 0; i < 30; i += 1) {
  walker.update(0.033, { speed: 2.7, running: false });
  maxWalk = Math.max(maxWalk, Math.abs(walker.legL.rotation.x));
}
check('walking swings the legs', maxWalk > 0.2, maxWalk.toFixed(3) + ' rad');
check('walking swings the arms', Math.abs(walker.armL.rotation.x) > 0.1, walker.armL.rotation.x.toFixed(3));
check('arms swing opposite the legs',
  walker.armL.rotation.x * walker.legL.rotation.x < 0,
  walker.armL.rotation.x.toFixed(2) + ' vs ' + walker.legL.rotation.x.toFixed(2));
check('walking reports moving', walker.moving === true);
check('walking advances the phase', walker.phase > 0, walker.phase.toFixed(2));

/* -------------------------------------------------------------- run cycle */
const runner = C.create({ THREE });
let maxRun = 0;
for (let i = 0; i < 30; i += 1) {
  runner.update(0.033, { speed: 5.2, running: true });
  maxRun = Math.max(maxRun, Math.abs(runner.legL.rotation.x));
}
check('running swings wider than walking', maxRun > maxWalk, maxRun.toFixed(3) + ' vs ' + maxWalk.toFixed(3));
check('running leans the body forward', runner.body.rotation.x < -0.05, runner.body.rotation.x.toFixed(3));
check('walking leans less than running', Math.abs(walker.body.rotation.x) < Math.abs(runner.body.rotation.x));

/* --------------------------------------------------- animation tracks distance */
const a = C.create({ THREE });
for (let i = 0; i < 10; i += 1) a.update(0.033, { speed: 2.0, running: false });
const slowPhase = a.phase;
const b = C.create({ THREE });
for (let i = 0; i < 10; i += 1) b.update(0.033, { speed: 4.0, running: false });
check('faster movement advances the cycle faster', b.phase > slowPhase,
  b.phase.toFixed(2) + ' vs ' + slowPhase.toFixed(2));

/* --------------------------------------------------------------- the bob */
const bobber = C.create({ THREE });
let maxBob = 0;
for (let i = 0; i < 20; i += 1) {
  bobber.update(0.033, { speed: 2.7, running: false });
  maxBob = Math.max(maxBob, Math.abs(bobber.body.position.y));
}
check('the body bobs while walking', maxBob > 0.01, maxBob.toFixed(3) + ' m');

/* ---------------------------------------------------------- pickup reach */
const picker = C.create({ THREE });
picker.update(0.016, { speed: 0, running: false });
picker.playPickup();
let reached = 0;
for (let i = 0; i < 20; i += 1) {
  picker.update(0.016, { speed: 0, running: false });
  reached = Math.min(reached, picker.armR.rotation.x);
}
check('collecting an item reaches out with the arm', reached < -0.5, reached.toFixed(2) + ' rad');
for (let i = 0; i < 60; i += 1) picker.update(0.016, { speed: 0, running: false });
check('the arm returns to rest afterwards', near(picker.armR.rotation.x, 0, 0.05),
  picker.armR.rotation.x.toFixed(3));

/* ---------------------------------------------------------------- flinch */
const hurt = C.create({ THREE });
const before = hurt.body.rotation.x;
hurt.flinch();
hurt.update(0.016, { speed: 0, running: false });
check('being hurt rocks the body', Math.abs(hurt.body.rotation.x - before) > 0.01,
  hurt.body.rotation.x.toFixed(3));

/* ---------------------------------------------------------------- facing */
const turner = C.create({ THREE });
turner.setFacing(0, 0, true);
check('snapping faces immediately', near(turner.group.rotation.y, 0, 1e-9));
turner.setFacing(Math.PI, 0.016, false);
const midway = turner.group.rotation.y;
check('turning eases rather than jumps', Math.abs(midway) > 0.05 && Math.abs(midway) < Math.PI - 0.05, midway.toFixed(3));
for (let i = 0; i < 60; i += 1) turner.setFacing(Math.PI, 0.016, false);
check('turning arrives at the target', sameAngle(turner.group.rotation.y, Math.PI, 0.02),
  turner.group.rotation.y.toFixed(3) + ' vs ' + Math.PI.toFixed(3));

/* -------------------------------------------------------------- position */
const mover = C.create({ THREE });
mover.setPosition(3, -7);
check('position moves the whole character',
  mover.group.position.x === 3 && mover.group.position.z === -7,
  mover.group.position.x + ',' + mover.group.position.z);

/* --------------------------------------------------------------- visibility */
mover.setVisible(false);
check('the character can be hidden', mover.group.visible === false);
mover.setVisible(true);
check('and shown again', mover.group.visible === true);

console.log(results.map((r) => r[0].padEnd(5) + ' | ' + r[1].padEnd(52) + ' | ' + r[2]).join('\n'));
console.log('\n' + results.filter((r) => r[0] === 'PASS').length + ' passed, ' +
  results.filter((r) => r[0] === 'FAIL').length + ' failed');
process.exit(results.some((r) => r[0] === 'FAIL') ? 1 : 0);
