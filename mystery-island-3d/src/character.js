/* Mystery Island 3D — the visible survivor.
 *
 * Built from primitives so the game keeps zero asset dependencies, and animated
 * procedurally: the walk cycle is driven by distance travelled, so the feet
 * always move at the speed the body actually moves. No sliding.
 */
(function (root) {
  'use strict';

  const SKIN = 0xb08a68;
  const COAT = 0x3d4a3a;
  const COAT_DARK = 0x2a3328;
  const TROUSERS = 0x2b2b30;
  const BOOT = 0x1a1614;
  const HAIR = 0x1e1a17;
  const PACK = 0x4a3a2a;

  function create(opts) {
    const THREE = opts.THREE;
    const group = new THREE.Group();
    group.name = 'survivor';

    const mat = (color, extra) => new THREE.MeshStandardMaterial(Object.assign({
      color, roughness: 0.92, metalness: 0.02, flatShading: true,
    }, extra || {}));

    const coatMat = mat(COAT);
    const coatDarkMat = mat(COAT_DARK);
    const skinMat = mat(SKIN);
    const trouserMat = mat(TROUSERS);
    const bootMat = mat(BOOT);
    const hairMat = mat(HAIR);
    const packMat = mat(PACK);

    /* body sits inside a bob group so the whole torso can rise and fall */
    const body = new THREE.Group();
    body.name = 'body';
    group.add(body);

    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.62, 0.30), coatMat);
    torso.position.y = 1.20;
    torso.castShadow = true;
    body.add(torso);

    const collar = new THREE.Mesh(new THREE.BoxGeometry(0.40, 0.12, 0.26), coatDarkMat);
    collar.position.y = 1.53;
    body.add(collar);

    const pack = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.40, 0.18), packMat);
    pack.position.set(0, 1.24, 0.22);
    body.add(pack);

    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.085, 0.10, 8), skinMat);
    neck.position.y = 1.58;
    body.add(neck);

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.155, 12, 10), skinMat);
    head.position.y = 1.72;
    head.castShadow = true;
    body.add(head);

    const hair = new THREE.Mesh(new THREE.SphereGeometry(0.163, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.62), hairMat);
    hair.position.y = 1.735;
    body.add(hair);

    /* shoulders: each arm pivots from its own group so it can swing */
    function limb(x, y, upperColor, lowerColor, upperLen, lowerLen, width) {
      const pivot = new THREE.Group();
      pivot.position.set(x, y, 0);
      const upper = new THREE.Mesh(new THREE.BoxGeometry(width, upperLen, width), upperColor);
      upper.position.y = -upperLen / 2;
      upper.castShadow = true;
      pivot.add(upper);
      const lower = new THREE.Mesh(new THREE.BoxGeometry(width * 0.9, lowerLen, width * 0.9), lowerColor);
      lower.position.y = -upperLen - lowerLen / 2;
      lower.castShadow = true;
      pivot.add(lower);
      return pivot;
    }

    const armL = limb(-0.34, 1.44, coatMat, skinMat, 0.30, 0.30, 0.13);
    const armR = limb(0.34, 1.44, coatMat, skinMat, 0.30, 0.30, 0.13);
    body.add(armL, armR);

    const legL = limb(-0.14, 0.88, trouserMat, bootMat, 0.44, 0.42, 0.17);
    const legR = limb(0.14, 0.88, trouserMat, bootMat, 0.44, 0.42, 0.17);
    group.add(legL, legR);

    /* the lantern the survivor carries, lit by the flashlight toggle */
    const lampGroup = new THREE.Group();
    lampGroup.position.set(0.30, 1.02, -0.10);
    const lampGlass = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06, 0.07, 0.14, 8),
      new THREE.MeshStandardMaterial({ color: 0xffd79a, emissive: 0xffb64d, emissiveIntensity: 2.2, roughness: 0.4 })
    );
    lampGroup.add(lampGlass);
    const lampGlow = new THREE.PointLight(0xffb64d, 3.2, 9, 1.6);
    lampGlow.position.set(0, 0, 0);
    lampGroup.add(lampGlow);
    group.add(lampGroup);

    const state = {
      phase: 0,
      speed: 0,
      moving: false,
      running: false,
      facing: Math.PI,
      pickup: 0,
      hurt: 0,
      lampOn: true,
    };

    const angleLerp = (a, b, t) => {
      let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
      if (d < -Math.PI) d += Math.PI * 2;
      return a + d * t;
    };

    /* ------------------------------------------------------------- update */
    /* ------------------------------------------------- gltf survivor */
    let model = null;
    const bones = {};
    const restQ = new Map();
    let _tmpE = new THREE.Euler(), _tmpQ = new THREE.Quaternion();

    // Load the MakeHuman survivor in the background. The primitive rig stays
    // visible until it arrives, so a failed or slow load never breaks play.
    try {
      if (root.__SURVIVOR_GLB && root.GLTFLoader) {
        loadModel(THREE, root.__SURVIVOR_GLB).then(attachModel).catch(() => {});
      }
    } catch (err) { /* the fallback rig is already in place */ }

    function loadModel(three, source) {
      return new Promise((resolve, reject) => {
        const Loader = root.GLTFLoader;
        if (!Loader || !source) { reject(new Error('no GLTFLoader or model source')); return; }
        new Loader().load(source, (gltf) => resolve(gltf.scene), undefined, reject);
      });
    }

    function attachModel(scene) {
      if (!scene) return false;
      model = scene;
      model.traverse((o) => {
        if (o.isBone) { bones[o.name] = o; restQ.set(o, o.quaternion.clone()); }
        if (o.isMesh) { o.frustumCulled = false; o.castShadow = true; }
      });
      // Blender's -Y forward becomes -Z after the glTF Y-up conversion; the rig
      // here faces +Z, so turn the model half a circle to match.
      model.rotation.y = Math.PI;
      model.position.y = 0;
      group.add(model);
      [body, armL, armR, legL, legR].forEach((part) => { if (part) part.visible = false; });
      return true;
    }

    function boneSet(name, angle) {
      const b = bones[name];
      if (!b) return;
      const rest = restQ.get(b);
      _tmpE.set(angle, 0, 0);
      _tmpQ.setFromEuler(_tmpE);
      b.quaternion.copy(rest).multiply(_tmpQ);
    }

    function driveSkeleton(swing, gait, running) {
      if (!_tmpQ) return;
      boneSet('upperleg01.L', swing * 0.85);
      boneSet('upperleg01.R', -swing * 0.85);
      boneSet('lowerleg01.L', Math.max(0, -swing) * 0.9);
      boneSet('lowerleg01.R', Math.max(0, swing) * 0.9);
      boneSet('upperarm01.L', -swing * 0.7);
      boneSet('upperarm01.R', swing * 0.7);
      boneSet('lowerarm01.L', 0.25 + Math.max(0, swing) * 0.5);
      boneSet('lowerarm01.R', 0.25 + Math.max(0, -swing) * 0.5);
      boneSet('spine01', (running ? 0.18 : 0.06) * gait);
      boneSet('head', -0.5 * (running ? 0.18 : 0.06) * gait);
      if (state.pickup > 0) {
        const t = 1 - state.pickup / 0.55;
        boneSet('upperarm01.R', -1.5 * Math.sin(Math.min(1, t) * Math.PI));
      }
    }

    function update(dt, input) {
      const speed = input && typeof input.speed === 'number' ? input.speed : 0;
      const running = !!(input && input.running);
      state.speed = speed;
      state.running = running;
      state.moving = speed > 0.15;

      if (state.moving) {
        // phase advances with distance, so feet match ground speed
        state.phase += speed * dt * (running ? 2.1 : 2.7);
      } else {
        state.phase += dt * 0.8; // idle breathing
      }

      const gait = Math.min(1, speed / 2.4);
      const swing = Math.sin(state.phase) * (running ? 0.95 : 0.62) * gait;

      if (state.pickup > 0) state.pickup = Math.max(0, state.pickup - dt);
      if (model) { driveSkeleton(swing, gait, running); return; }

      if (state.pickup > 0) {
        state.pickup = Math.max(0, state.pickup - dt);
        const t = 1 - state.pickup / 0.55;
        const reach = Math.sin(Math.min(1, t) * Math.PI);
        armR.rotation.x = -1.5 * reach;
        armR.rotation.z = -0.25 * reach;
      } else {
        armR.rotation.x = swing * 0.85;
        armR.rotation.z = 0;
      }
      armL.rotation.x = -swing * 0.85;
      legL.rotation.x = swing;
      legR.rotation.x = -swing;

      const bob = state.moving ? Math.abs(Math.sin(state.phase)) * (running ? 0.085 : 0.045) : 0;
      body.position.y = bob + (state.moving ? 0 : Math.sin(state.phase * 0.7) * 0.008);
      body.rotation.x = (running ? -0.13 : -0.04) * gait;
      body.rotation.z = Math.sin(state.phase) * 0.035 * gait;

      if (state.hurt > 0) {
        state.hurt = Math.max(0, state.hurt - dt);
        body.rotation.x += Math.sin(state.hurt * 40) * 0.12;
      }
    }

    function setFacing(radians, dt, snap) {
      state.facing = snap ? radians : angleLerp(state.facing, radians, Math.min(1, (dt || 0.016) * 12));
      group.rotation.y = state.facing;
    }

    function setPosition(x, z, y) {
      group.position.set(x, typeof y === 'number' ? y : 0, z);
    }

    function playPickup() {
      state.pickup = 0.55;
    }

    function flinch() {
      state.hurt = 0.45;
    }

    function setLamp(on) {
      state.lampOn = !!on;
      lampGroup.visible = true;
      lampGlow.intensity = on ? 3.2 : 0;
      lampGlass.material.emissiveIntensity = on ? 2.2 : 0.05;
    }

    function setVisible(v) {
      group.visible = !!v;
    }

    setLamp(true);
    group.rotation.y = state.facing;

    return {
      group, body, armL, armR, legL, legR, lampGroup, attachModel, loadModel,
      get hasModel() { return !!model; },
      update, setFacing, setPosition, playPickup, flinch, setLamp, setVisible,
      get facing() { return state.facing; },
      get moving() { return state.moving; },
      get phase() { return state.phase; },
      state,
    };
  }

  root.MI = root.MI || {};
  root.MI.character = { create };
})(typeof window !== 'undefined' ? window : globalThis);
