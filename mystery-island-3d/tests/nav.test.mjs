/* Unit tests for the roadmap, objective guidance and minimap.
 *
 *   node tests/nav.test.mjs
 *
 * Pure logic: no browser, no canvas, no Three.js.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');

globalThis.window = globalThis;
for (const file of ['src/rules.js', 'src/nav.js']) {
  new Function(readFileSync(join(root, file), 'utf8'))();
}

const R = globalThis.MI.rules;
const N = globalThis.MI.nav;

const results = [];
const check = (name, ok, detail = '') => results.push([ok ? 'PASS' : 'FAIL', name, detail]);
const eq = (a, b, name) => check(name, a === b, String(a) + ' vs ' + String(b));

/* ------------------------------------------------------------- roadmap map */
const rooms = Object.keys(N.MAP);
check('roadmap covers all five rooms', rooms.length === 5, rooms.join(','));
check('roadmap order matches the story', N.ORDER.join('>') === 'Beach>Jungle>Cave>Old Bridge>Lighthouse', N.ORDER.join('>'));
check('every rules room has a map position',
  Object.keys(R.LOCATIONS).every((room) => !!N.MAP[room]));
check('map positions stay inside the panel',
  rooms.every((r) => N.MAP[r].x > 0.05 && N.MAP[r].x < 0.95 && N.MAP[r].y > 0.05 && N.MAP[r].y < 0.95));

/* --------------------------------------------------------------- the graph */
eq(N.neighbours('Beach').length, 1, 'the beach has one way out');
eq(N.neighbours('Beach')[0].to, 'Jungle', 'the beach leads to the jungle');
eq(N.neighbours('Jungle').length, 2, 'the jungle is a junction');
eq(N.neighbours('Lighthouse').length, 1, 'the lighthouse is the end of the line');

const route = N.pathBetween('Beach', 'Lighthouse');
eq(route.join('>'), 'Beach>Jungle>Cave>Old Bridge>Lighthouse', 'route to the lighthouse follows the story');
eq(N.pathBetween('Cave', 'Cave').join('>'), 'Cave', 'a route to the room you are in is just that room');
eq(N.pathBetween('Lighthouse', 'Beach').join('>'), 'Lighthouse>Old Bridge>Cave>Jungle>Beach', 'routes work backwards too');

/* ------------------------------------------------------------ the objective */
const fresh = R.newGame('Ada');
const g1 = N.goal(fresh);
eq(g1.room, 'Jungle', 'first goal is the jungle');
eq(g1.anchor, 'item-rope', 'first goal is the rope');
check('first goal label mentions the rope', /rope/i.test(g1.label), g1.label);

const withRope = R.newGame('Ada');
withRope.inventory.push('rope');
const g2 = N.goal(withRope);
eq(g2.room, 'Cave', 'with the rope the goal moves to the cave');
eq(g2.anchor, 'item-lantern', 'second goal is the lantern');

const withBoth = R.newGame('Ada');
withBoth.inventory.push('rope', 'lantern');
const g3 = N.goal(withBoth);
eq(g3.room, 'Lighthouse', 'with both items the goal is the lighthouse');
eq(g3.anchor, 'beacon', 'final goal is the beacon');

/* ------------------------------------------------- the immediate next step */
const s1 = N.step(fresh);
eq(s1.anchor, 'exit-north', 'on the beach the next step is the north exit');
eq(s1.sameRoom, false, 'the rope is not in this room');
check('step label names the direction and room', /north/i.test(s1.label) && /Jungle/i.test(s1.label), s1.label);

const inJungle = R.newGame('Ada');
inJungle.location = 'Jungle';
const s2 = N.step(inJungle);
eq(s2.anchor, 'item-rope', 'in the jungle the step is the rope itself');
eq(s2.sameRoom, true, 'the rope is in this room');

const inCave = R.newGame('Ada');
inCave.location = 'Cave';
inCave.inventory.push('rope');
eq(N.step(inCave).anchor, 'item-lantern', 'in the cave the step is the lantern');

const inBridge = R.newGame('Ada');
inBridge.location = 'Old Bridge';
inBridge.inventory.push('rope', 'lantern');
const s3 = N.step(inBridge);
eq(s3.anchor, 'exit-north', 'on the bridge the step is the crossing');
eq(s3.room, 'Lighthouse', 'the crossing leads to the lighthouse');

const atGoal = R.newGame('Ada');
atGoal.location = 'Lighthouse';
atGoal.inventory.push('rope', 'lantern');
eq(N.step(atGoal).anchor, 'beacon', 'at the lighthouse the step is the beacon');
eq(N.step(atGoal).sameRoom, true, 'the beacon is in this room');

check('the step carries the overall goal for the HUD', N.step(fresh).goal.room === 'Jungle');

/* --------------------------------------------------------------- bearings */
const origin = { x: 0, z: 0 };
check('due north is zero radians', Math.abs(N.bearing(origin, { x: 0, z: -10 })) < 1e-9);
check('due east is a quarter turn', Math.abs(N.bearing(origin, { x: 10, z: 0 }) - Math.PI / 2) < 1e-9);
check('due south is a half turn', Math.abs(Math.abs(N.bearing(origin, { x: 0, z: 10 })) - Math.PI) < 1e-9);
eq(N.compass(0), 'north', 'compass names north');
eq(N.compass(Math.PI / 2), 'east', 'compass names east');
eq(N.compass(-Math.PI / 2), 'west', 'compass names west');
check('distance is in metres', Math.abs(N.distance({ x: 0, z: 0 }, { x: 3, z: 4 }) - 5) < 1e-9);
check('arrow angle follows the camera', Math.abs(N.arrowAngle(origin, { x: 0, z: -10 }, 0)) < 1e-9);

/* --------------------------------------------------------------- projection */
const proj = N.projectToMap('Beach', { x: 0, z: 0 });
check('a player at the centre sits on the room node',
  Math.abs(proj.x - N.MAP.Beach.x) < 1e-9 && Math.abs(proj.y - N.MAP.Beach.y) < 1e-9);
const edge = N.projectToMap('Beach', { x: 23, z: 23 });
check('a player at the edge stays near the node',
  Math.abs(edge.x - N.MAP.Beach.x) < 0.1 && Math.abs(edge.y - N.MAP.Beach.y) < 0.1);

/* ------------------------------------------------------------- minimap draw */
function fakeCtx() {
  const calls = [];
  const record = (name) => (...args) => calls.push([name, args.length]);
  return {
    calls,
    setTransform: record('setTransform'), clearRect: record('clearRect'), fillRect: record('fillRect'),
    beginPath: record('beginPath'), moveTo: record('moveTo'), lineTo: record('lineTo'),
    stroke: record('stroke'), arc: record('arc'), fill: record('fill'),
    save: record('save'), restore: record('restore'), setLineDash: record('setLineDash'),
    strokeRect: record('strokeRect'), fillText: record('fillText'),
  };
}

const ctx = fakeCtx();
N.drawMinimap(ctx, { size: 132, dpr: 1, state: fresh, player: { x: 2, z: 8 }, step: s1, anchor: null });
check('minimap draws without a DOM', ctx.calls.length > 20, ctx.calls.length + ' canvas calls');
check('minimap draws the room labels',
  ctx.calls.filter((c) => c[0] === 'fillText').length === 5,
  ctx.calls.filter((c) => c[0] === 'fillText').length + ' labels');
check('minimap dashes the remaining route',
  ctx.calls.some((c) => c[0] === 'setLineDash'));
check('minimap survives a missing context', (() => { N.drawMinimap(null, { state: fresh }); return true; })());

/* ------------------------------------------------------- no spoiler policy */
const allLabels = [fresh, withRope, withBoth].map((st) => N.step(st).label + ' ' + N.goal(st).label).join(' ');
check('guidance never names a horror event',
  !/stalk|presence|scare|ghost|demon|jump/i.test(allLabels), allLabels.slice(0, 60));

console.log(results.map((r) => r[0].padEnd(5) + ' | ' + r[1].padEnd(52) + ' | ' + r[2]).join('\n'));
console.log('\n' + results.filter((r) => r[0] === 'PASS').length + ' passed, ' +
  results.filter((r) => r[0] === 'FAIL').length + ' failed');
process.exit(results.some((r) => r[0] === 'FAIL') ? 1 : 0);
