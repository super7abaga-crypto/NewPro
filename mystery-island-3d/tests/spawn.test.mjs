/* Spawn-collision regression tests.
 *
 *   node tests/spawn.test.mjs
 *
 * Jungle and Cave scatter trees and rocks randomly in rings that overlap the
 * points where the player appears. This suite generates many seeded worlds at
 * every quality setting and proves that no blocking collider overlaps an
 * arrival point, that the player can move the moment they arrive, and that the
 * clearance pass is what keeps it true.
 */
import { readFileSync } from 'node:fs';
import { makeThree } from './three-mock.mjs';

globalThis.window = globalThis;
const load = (f) => new Function(readFileSync(f, 'utf8'))();
load('src/world.js');
load('src/character.js');
load('src/player.js');

const THREE = makeThree();
const W = globalThis.MI.world;
const MI = globalThis.MI;

const results = [];
const check = (name, ok, detail = '') => results.push([ok ? 'PASS' : 'FAIL', name, detail]);

/* deterministic PRNG so every run tests the same worlds */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const LOCATIONS = ['Jungle', 'Cave'];
const QUALITIES = ['low', 'medium', 'high'];
const SEEDS = 150;

/* ---------------------------------------------- the core invariant, 900 worlds */
let builds = 0;
let overlaps = 0;
let minClearance = Infinity;
let worstCase = '';

for (const location of LOCATIONS) {
  for (const quality of QUALITIES) {
    for (let seed = 0; seed < SEEDS; seed += 1) {
      const original = Math.random;
      Math.random = mulberry32(seed * 7919 + location.length * 131 + quality.length);
      let kit;
      try {
        kit = W.build(THREE, location, quality);
      } finally {
        Math.random = original;
      }
      builds += 1;
      const points = W.arrivalPoints(kit.anchors);
      for (const p of points) {
        for (const c of kit.colliders) {
          const d = Math.hypot(c.x - p.x, c.z - p.z);
          const clearance = d - c.r - W.PLAYER_RADIUS;
          if (clearance < minClearance) {
            minClearance = clearance;
            worstCase = `${location}/${quality}/seed ${seed}`;
          }
          if (d < c.r + W.PLAYER_RADIUS) overlaps += 1;
        }
      }
    }
  }
}

check('generated the required number of worlds', builds === LOCATIONS.length * QUALITIES.length * SEEDS,
  `${builds} worlds (${SEEDS} seeds x ${LOCATIONS.length} locations x ${QUALITIES.length} qualities)`);
check('no collider overlaps any arrival point', overlaps === 0,
  `${overlaps} overlaps; tightest clearance ${minClearance.toFixed(3)} m at ${worstCase}`);
check('every arrival keeps a margin beyond the player radius', minClearance >= W.SPAWN_MARGIN - 0.001,
  `${minClearance.toFixed(3)} m vs required ${W.SPAWN_MARGIN} m`);

/* ------------------------------------------------ the actual entry coordinates */
function arrivalFor(location, fromDirection, quality, seed) {
  const original = Math.random;
  Math.random = mulberry32(seed);
  let kit;
  try {
    kit = W.build(THREE, location, quality);
  } finally {
    Math.random = original;
  }
  return { kit, point: W.arrivalPoint(kit.anchors, fromDirection) };
}

const jungle = arrivalFor('Jungle', 'north', 'high', 12345);
check('Jungle entry coordinate is the exit approach', Math.abs(jungle.point.x) < 0.001 && Math.abs(jungle.point.z - 16.4) < 0.001,
  `(${jungle.point.x.toFixed(2)}, ${jungle.point.z.toFixed(2)})`);
check('Jungle entry point is clear of scenery', jungle.kit.colliders.every((c) =>
  Math.hypot(c.x - jungle.point.x, c.z - jungle.point.z) >= c.r + W.PLAYER_RADIUS),
  `${jungle.kit.colliders.length} colliders checked`);

const cave = arrivalFor('Cave', 'north', 'high', 12345);
check('Cave entry coordinate is the exit approach', Math.abs(cave.point.x) < 0.001 && Math.abs(cave.point.z - 14.4) < 0.001,
  `(${cave.point.x.toFixed(2)}, ${cave.point.z.toFixed(2)})`);
check('Cave entry point is clear of scenery', cave.kit.colliders.every((c) =>
  Math.hypot(c.x - cave.point.x, c.z - cave.point.z) >= c.r + W.PLAYER_RADIUS),
  `${cave.kit.colliders.length} colliders checked`);

/* the reverse direction must be safe too, or the defect just moves */
const jungleBack = arrivalFor('Jungle', 'south', 'medium', 999);
check('arriving in the Jungle from the Cave is clear',
  !!jungleBack.point && jungleBack.kit.colliders.every((c) =>
    Math.hypot(c.x - jungleBack.point.x, c.z - jungleBack.point.z) >= c.r + W.PLAYER_RADIUS),
  jungleBack.point ? `(${jungleBack.point.x.toFixed(2)}, ${jungleBack.point.z.toFixed(2)})` : 'no arrival point');

// the Cave is also entered from the bridge, which is its west side
const caveBack = arrivalFor('Cave', 'west', 'low', 4242);
check('arriving in the Cave from the bridge is clear',
  !!caveBack.point && caveBack.kit.colliders.every((c) =>
    Math.hypot(c.x - caveBack.point.x, c.z - caveBack.point.z) >= c.r + W.PLAYER_RADIUS),
  caveBack.point ? `(${caveBack.point.x.toFixed(2)}, ${caveBack.point.z.toFixed(2)})` : 'no arrival point');

/* --------------------------------------------------- the player can move at once */
const noAudio = { footstep() {}, click() {}, setHeartbeat() {}, ambience() {}, resume() {}, init() {} };

for (const location of LOCATIONS) {
  for (const quality of QUALITIES) {
    const { kit, point } = arrivalFor(location, 'north', quality, 2024);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera();
    const player = MI.player.create({ THREE, camera, scene, audio: noAudio, quality });
    player.setKit(kit);
    player.teleport(point.x, point.z, point.yaw);
    const before = { x: player.pos.x, z: player.pos.z };
    for (let i = 0; i < 6; i += 1) player.update(1 / 60, { forward: 1, right: 0 });
    const moved = Math.hypot(player.pos.x - before.x, player.pos.z - before.z);
    check(`player moves immediately on arriving in the ${location} (${quality})`, moved > 0.02, `${moved.toFixed(3)} m`);
  }
}

/* ---------------------------------------- the clearance pass is what fixes it */
const fakeKit = { anchors: [{ id: 'exit-south', action: 'go south', x: 0, z: 19 }], colliders: [] };
const arrival = W.arrivalPoints(fakeKit.anchors)[0];
fakeKit.colliders.push({ x: arrival.x, z: arrival.z, r: 0.55, mesh: { position: { x: arrival.x, y: 0, z: arrival.z } } });
const beforeX = fakeKit.colliders[0].x;
const movedCount = W.clearArrivals(fakeKit.colliders, fakeKit.anchors);
const after = fakeKit.colliders[0];
const afterDistance = Math.hypot(after.x - arrival.x, after.z - arrival.z);
check('a collider sitting on the spawn is pushed clear', movedCount > 0 && afterDistance >= after.r + W.PLAYER_RADIUS + W.SPAWN_MARGIN - 0.001,
  `moved from x=${beforeX.toFixed(2)} to distance ${afterDistance.toFixed(2)} m`);
check('its mesh moves with it, so the scenery stays where it looks',
  Math.abs(after.mesh.position.x - after.x) < 0.001 && Math.abs(after.mesh.position.z - after.z) < 0.001,
  `mesh (${after.mesh.position.x.toFixed(2)}, ${after.mesh.position.z.toFixed(2)})`);

/* collision is still enforced, not disabled */
const stillBlocking = arrivalFor('Jungle', 'north', 'high', 7).kit.colliders.filter((c) => c.r > 0);
check('scenery still blocks movement after the fix', stillBlocking.length > 0, `${stillBlocking.length} solid colliders in the Jungle`);

/* ---------------------------------------------------------------- report */
const failed = results.filter((r) => r[0] === 'FAIL');
for (const [status, name, detail] of results) {
  console.log(`${status.padEnd(5)} | ${name.padEnd(58)} | ${detail}`);
}
console.log(`\n${results.length - failed.length} passed, ${failed.length} failed`);
process.exit(failed.length ? 1 : 0);
