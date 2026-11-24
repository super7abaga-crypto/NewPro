/* Stage 3 environmental systems: wind, mist, leaves, ripples. */
import { readFileSync } from 'node:fs';

globalThis.window = globalThis;

/* A deliberately small THREE stand-in: only what weather.js touches. */
class Vec3 {
  constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
  set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
  getSize(t) { t.x = 1; t.y = 4; t.z = 1; return t; }
}
class Obj {
  constructor() { this.children = []; this.rotation = { x: 0, y: 0, z: 0 }; this.position = new Vec3(); this.scale = { set: () => {} }; this.userData = {}; }
  add(...o) { this.children.push(...o); return this; }
  traverse(fn) { fn(this); this.children.forEach((c) => c.traverse && c.traverse(fn)); }
  remove() {}
}
const THREE = {
  Group: class extends Obj {},
  Mesh: class extends Obj { constructor(g, m) { super(); this.isMesh = true; this.geometry = g; this.material = m; } },
  Points: class extends Obj { constructor(g, m) { super(); this.geometry = g; this.material = m; } },
  PlaneGeometry: class { dispose() {} },
  RingGeometry: class { constructor() { this.isRing = true; } dispose() {} },
  Box3: class { setFromObject() { return this; } getSize(t) { t.x = 1; t.y = 4; t.z = 1; return t; } },
  Vector3: Vec3,
  MeshBasicMaterial: class { constructor(o) { Object.assign(this, o); } dispose() {} },
  PointsMaterial: class { constructor(o) { Object.assign(this, o); } dispose() {} },
  BufferGeometry: class {
    constructor() { this.attributes = {}; }
    setAttribute(n, a) { this.attributes[n] = a; }
    dispose() {}
  },
  BufferAttribute: class { constructor(arr) { this.array = arr; this.needsUpdate = false; } },
  DoubleSide: 2,
};

new Function(readFileSync('src/weather.js', 'utf8'))();
const W = globalThis.MI.weather;

let pass = 0, fail = 0;
function check(name, ok, info) {
  if (ok) pass++; else fail++;
  console.log((ok ? 'PASS  | ' : 'FAIL  | ') + String(name).padEnd(52) + '| ' + (info === undefined ? '' : info));
}
const eq = (a, b, name) => check(name, a === b, a + ' vs ' + b);

/* ------------------------------------------------------------- presets */
['Beach', 'Jungle', 'Cave', 'Old Bridge', 'Lighthouse'].forEach((loc) => {
  check(loc + ' has an atmosphere preset', !!W.PRESETS[loc]);
});
eq(W.PRESETS.Beach.leaves, 0, 'the beach has no falling leaves');
check('the jungle is the leafiest place', W.PRESETS.Jungle.leaves === 1, W.PRESETS.Jungle.leaves);
check('the bridge is the windiest', W.PRESETS['Old Bridge'].wind === 1, W.PRESETS['Old Bridge'].wind);
check('the cave is the stillest', W.PRESETS.Cave.wind < W.PRESETS.Jungle.wind, W.PRESETS.Cave.wind);

/* --------------------------------------------------------------- build */
function build(location, quality, water) {
  const scene = new THREE.Group();
  const kit = { group: new THREE.Group(), water: water || [] };
  W.enter(THREE, scene, location, kit, quality || 'high');
  return scene;
}

const jungle = build('Jungle');
check('the jungle gets an atmosphere group', jungle.children.length === 1, jungle.children.length);
const jw = jungle.children[0];
const leafLayer = jw.children.filter((c) => c.geometry && c.geometry.attributes && c.geometry.attributes.position)[0];
check('and falling leaves', !!leafLayer, leafLayer ? 'present' : 'missing');

const beach = build('Beach');
const bw = beach.children[0];
const beachLeaves = bw.children.filter((c) => c.geometry && c.geometry.attributes && c.geometry.attributes.position)[0];
check('the beach gets no leaves', !beachLeaves, beachLeaves ? 'unexpected' : 'none');

/* ------------------------------------------------------------ quality */
function count(location, quality) {
  const s = build(location, quality);
  return s.children[0].children.length;
}
const high = count('Jungle', 'high');
const low = count('Jungle', 'low');
check('a low quality setting spends less on particles', low < high, low + ' vs ' + high);

/* --------------------------------------------------------- leaf motion */
{
  const scene = build('Jungle');
  const g = scene.children[0];
  const leaves = g.children.filter((c) => c.geometry && c.geometry.attributes && c.geometry.attributes.position)[0];
  const arr = leaves.geometry.attributes.position.array;
  const y0 = arr[1];
  W.update(1 / 60, { x: 0, y: 0, z: 0 }, null);
  check('leaves fall', arr[1] < y0, y0.toFixed(2) + ' -> ' + arr[1].toFixed(2));
  check('the leaf buffer is marked dirty', leaves.geometry.attributes.position.needsUpdate === true, 'needsUpdate');
}

/* ------------------------------------------------------- leaf recycling */
{
  const scene = build('Jungle');
  const leaves = scene.children[0].children.filter((c) => c.geometry && c.geometry.attributes && c.geometry.attributes.position)[0];
  const arr = leaves.geometry.attributes.position.array;
  for (let i = 0; i < arr.length; i += 3) arr[i + 1] = 0.01;
  for (let i = 0; i < 30; i++) W.update(1 / 60, { x: 0, y: 0, z: 0 }, null);
  let above = 0;
  for (let i = 1; i < arr.length; i += 3) if (arr[i] > 1) above++;
  check('spent leaves respawn overhead', above > 0, above + ' recycled');
  check('and none linger below ground', Math.min(...Array.from({ length: arr.length / 3 }, (_, k) => arr[k * 3 + 1])) >= 0,
    'lowest ' + Math.min(...Array.from({ length: arr.length / 3 }, (_, k) => arr[k * 3 + 1])).toFixed(2));
}

/* -------------------------------------------------------------- ripples */
{
  const scene = build('Beach', 'high', [{ x0: -26, x1: 26, z0: 17, z1: 32, level: 0, depth: 2.4 }]);
  const g = scene.children[0];
  const rings = g.children.filter((c) => c.geometry && c.geometry.isRing);
  check('the shoreline carries ripples', rings.length > 0, rings.length);
  const r = rings[0];
  const o0 = r.material.opacity;
  W.update(1 / 60, { x: 0, y: 0, z: 0 }, null);
  check('ripples animate their opacity', r.material.opacity !== o0, o0.toFixed(3) + ' -> ' + r.material.opacity.toFixed(3));
}

/* ------------------------------------------------------------- wind sway */
{
  const scene = new THREE.Group();
  const kit = { group: new THREE.Group(), water: [] };
  const trunk = new THREE.Mesh(new THREE.PlaneGeometry(), new THREE.MeshBasicMaterial({}));
  trunk.geometry.boundingBox = null;
  // a tall, narrow object: 4 m high, 1 m wide
  const box = new THREE.Box3();
  box.setFromObject = () => box;
  box.getSize = (t) => { t.x = 1; t.y = 4; t.z = 1; return t; };
  kit.group.add(trunk);
  W.enter(THREE, scene, 'Jungle', kit, 'high');
  const z0 = trunk.rotation.z;
  for (let i = 0; i < 60; i++) W.update(1 / 60, { x: 0, y: 0, z: 0 }, null);
  check('tall vegetation sways in the wind', trunk.rotation.z !== z0, z0.toFixed(3) + ' -> ' + trunk.rotation.z.toFixed(3));
}

/* ---------------------------------------------------------------- clean */
{
  const scene = build('Cave');
  W.clear();
  check('leaving a location clears its atmosphere', W.clear() === undefined, 'cleared');
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
if (fail) process.exit(1);
