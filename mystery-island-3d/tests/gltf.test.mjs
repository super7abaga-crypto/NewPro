/* Integration checks for the GLB survivor: loader availability, asset
 * structure, attachment to the rig, and the fallback when it cannot load. */
import { readFileSync } from 'node:fs';

globalThis.window = globalThis;
const load = (f) => new Function(readFileSync(f, 'utf8'))();

let pass = 0, fail = 0;
const check = (name, ok, info = '') => {
  ok ? pass++ : fail++;
  console.log((ok ? 'PASS  | ' : 'FAIL  | ') + name.padEnd(52) + ' | ' + info);
};

load('vendor/three.js');
check('vendor bundle exposes three', typeof globalThis.THREE === 'object', 'r' + (globalThis.THREE || {}).REVISION);
check('vendor bundle exposes GLTFLoader', typeof globalThis.GLTFLoader === 'function');
check('vendor bundle exposes AnimationMixer', typeof globalThis.THREE.AnimationMixer === 'function');

const THREE = globalThis.THREE;
load('src/character.js');

/* ---- the shipped asset really is a rigged human ---- */
const buf = readFileSync('assets/survivor.glb');
const jsonLen = buf.readUInt32LE(12);
const gltf = JSON.parse(buf.subarray(20, 20 + jsonLen).toString('utf8'));
check('asset is a binary glTF', buf.subarray(0, 4).toString() === 'glTF', (buf.length / 1048576).toFixed(2) + ' MB');
check('asset has a skin', (gltf.skins || []).length === 1, 'skins: ' + (gltf.skins || []).length);
check('skeleton has 163 joints', gltf.skins[0].joints.length === 163, gltf.skins[0].joints.length + ' joints');
check('asset carries nine meshes', (gltf.meshes || []).length === 9, (gltf.meshes || []).length + ' meshes');
const boneNames = gltf.nodes.map((n) => n.name);
check('rig exposes the bones the animator drives',
  ['upperleg01.L', 'lowerleg01.R', 'upperarm01.R', 'spine01', 'head'].every((b) => boneNames.includes(b)));
const tops = gltf.meshes.flatMap((m) => m.primitives
  .map((pr) => gltf.accessors[pr.attributes.POSITION])
  .filter((a) => a && a.max)
  .map((a) => a.max[1]));
const tallest = Math.max.apply(null, tops);
check('asset is human scale', tallest > 1.5 && tallest < 2.0, 'tallest part ~' + tallest.toFixed(2) + ' m');

/* ---- attachment and fallback ---- */
function fakeModel() {
  const scene = new THREE.Group();
  ['upperleg01.L', 'upperleg01.R', 'lowerleg01.L', 'lowerleg01.R',
   'upperarm01.L', 'upperarm01.R', 'lowerarm01.L', 'lowerarm01.R',
   'spine01', 'head'].forEach((n) => {
    const b = new THREE.Bone();
    b.name = n;
    scene.add(b);
  });
  return scene;
}

const fallback = globalThis.MI.character.create({ THREE });
check('starts on the fallback rig', fallback.hasModel === false);
check('fallback rig is visible', fallback.body.visible === true);

check('attachModel accepts a rigged scene', fallback.attachModel(fakeModel()) === true);
check('attached model is reported', fallback.hasModel === true);
check('primitive body is hidden once the model lands', fallback.body.visible === false);
check('primitive limbs are hidden too', fallback.armL.visible === false && fallback.legR.visible === false);

const bone = (() => { let b = null; fallback.group.traverse((o) => { if (o.name === 'upperleg01.L') b = o; }); return b; })();
const before = bone.quaternion.clone();
fallback.update(0.16, { speed: 2.4, running: false });
check('walking rotates the skeleton', bone.quaternion.angleTo(before) > 0.001, bone.quaternion.angleTo(before).toFixed(4) + ' rad');
fallback.update(0.16, { speed: 0, running: false });
check('idle keeps the character animating', Number.isFinite(fallback.state.phase));

const bare = globalThis.MI.character.create({ THREE });
check('a second instance still falls back cleanly', bare.hasModel === false && bare.body.visible === true);

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
