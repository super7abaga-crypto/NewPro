/* World invariant tests — run with:  node tests/world.test.mjs
 *
 * These catch the class of bug that a screenshot never shows: an interactable
 * the player physically cannot reach, a gate that points at a room that does
 * not exist, or a collider that seals off the only way forward.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { makeThree } from './three-mock.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');

new Function(readFileSync(join(root, 'src', 'rules.js'), 'utf8'))();
const R = globalThis.MI.rules;
const THREE = makeThree();
new Function('window', readFileSync(join(root, 'src', 'world.js'), 'utf8'))(globalThis);
const W = globalThis.MI.world;

const results = [];
const check = (name, ok, detail = '') => results.push([ok ? 'PASS' : 'FAIL', name, detail]);

const PLAYER_RADIUS = 0.42;
const REACH = 1.2; // the player only has to get inside the anchor radius

W.locations.forEach((name) => {
  const kit = W.build(THREE, name, 'low');

  check(name + ': builds a scene', !!kit.group && kit.group.children.length > 3,
    kit.group.children.length + ' objects');

  // 1. Every anchor must be physically reachable once the walkable area and the
  //    solid props have had their say.
  kit.anchors.forEach((a) => {
    const p = { x: a.x, z: a.z };
    if (kit.clamp) kit.clamp(p);
    // push out of any collider exactly as the player would be
    kit.colliders.forEach((c) => {
      const dx = p.x - c.x;
      const dz = p.z - c.z;
      const d = Math.hypot(dx, dz);
      const min = c.r + PLAYER_RADIUS;
      if (d < min && d > 0.0001) {
        p.x = c.x + (dx / d) * min;
        p.z = c.z + (dz / d) * min;
      }
    });
    const dist = Math.hypot(p.x - a.x, p.z - a.z);
    check(
      name + ': reachable — ' + a.id,
      dist <= a.radius,
      'closest approach ' + dist.toFixed(2) + 'm, needs <= ' + a.radius + 'm'
    );
  });

  // 2. Every exit anchor must be a legal rules move from this room.
  kit.anchors
    .filter((a) => a.action.indexOf('go ') === 0)
    .forEach((a) => {
      const dir = a.action.slice(3);
      const exit = R.LOCATIONS[name].exits[dir];
      check(name + ': exit ' + dir + ' exists in the rules', !!exit, exit ? exit.to : 'missing');
    });

  // 3. Every rules exit must be represented in the 3D world, or the player is stuck.
  Object.keys(R.LOCATIONS[name].exits).forEach((dir) => {
    const present = kit.anchors.some((a) => a.action === 'go ' + dir);
    check(name + ': rules exit ' + dir + ' is in the world', present);
  });

  // 4. Item anchors must sit where the rules put the item.
  Object.keys(R.ITEMS).forEach((item) => {
    const anchor = kit.anchors.find((a) => a.action === 'take ' + item);
    if (R.ITEMS[item].location === name) {
      check(name + ': ' + item + ' is pickable here', !!anchor);
    } else {
      check(name + ': no stray ' + item + ' anchor', !anchor);
    }
  });

  // 5. Special actions only where the rules allow them.
  const has = (action) => kit.anchors.some((a) => a.action === action);
  check(name + ': rest anchor only on the Beach', has('rest') === (name === 'Beach'));
  check(name + ': swim anchor only at the bridge', has('swim') === (name === 'Old Bridge'));
  check(name + ': beacon anchor only at the lighthouse', has('light beacon') === (name === 'Lighthouse'));
  check(name + ': help anchor only at the lighthouse', has('call for help') === (name === 'Lighthouse'));

  // 6. Spawn safety: the point the player arrives at must not be inside a prop.
  const spawns = (MI.world.arrivalPoints ? MI.world.arrivalPoints(kit.anchors) : [])
    .concat([MI.world.FALLBACK_SPAWN || { x: 0, z: 10 }]);
  const trapped = spawns.some((raw) => {
    const spawn = { x: raw.x, z: raw.z };
    if (kit.clamp) kit.clamp(spawn);
    return kit.colliders.some((c) => Math.hypot(spawn.x - c.x, spawn.z - c.z) < c.r + PLAYER_RADIUS);
  });
  check(name + ': every spawn point is clear', !trapped, spawns.length + ' spawn points');

  // 7. Fog and ambience present so the location reads as a distinct place.
  check(name + ': has fog', !!kit.fog && kit.fog.density > 0, kit.fog ? 'density ' + kit.fog.density : 'none');
  check(name + ': has ambient light', !!kit.ambient && kit.ambient.intensity > 0);
});

// 8. The five locations the brief requires, and nothing else.
const expected = ['Beach', 'Jungle', 'Cave', 'Old Bridge', 'Lighthouse'];
check('exactly the five original locations', JSON.stringify(W.locations.slice().sort()) === JSON.stringify(expected.slice().sort()),
  W.locations.join(', '));

// 9. Every location is reachable from the start by following exits.
const seen = new Set([R.START_LOCATION]);
const queue = [R.START_LOCATION];
while (queue.length) {
  const here2 = queue.shift();
  Object.keys(R.LOCATIONS[here2].exits).forEach((dir) => {
    const to = R.LOCATIONS[here2].exits[dir].to;
    if (!seen.has(to)) { seen.add(to); queue.push(to); }
  });
}
check('all five locations are connected', seen.size === 5, Array.from(seen).join(' -> '));

console.log(results.map((r) => r[0].padEnd(5) + ' | ' + r[1].padEnd(52) + ' | ' + r[2]).join('\n'));
console.log('\n' + results.filter((r) => r[0] === 'PASS').length + ' passed, ' +
  results.filter((r) => r[0] === 'FAIL').length + ' failed');
process.exit(results.some((r) => r[0] === 'FAIL') ? 1 : 0);
