/* Mystery Island 3D — third-person player controller.
 *
 * The survivor is a real object in the world; the camera follows from behind and
 * above, easing rather than snapping. Movement is camera-relative, the character
 * turns to face the direction of travel, and the walk cycle is driven by the
 * distance actually covered.
 */
(function (root) {
  'use strict';

  const WALK = 2.7;
  const RUN = 5.2;
  const RADIUS = 0.42;
  const CAM_BACK = 5.6;

  function create(opts) {
    const THREE = opts.THREE;
    const camera = opts.camera;
    const scene = opts.scene;
    const audio = opts.audio;

    const character = root.MI && root.MI.character
      ? root.MI.character.create({ THREE })
      : null;
    if (character) {
      character.setVisible(true);
      scene.add(character.group);
    }

    const pos = new THREE.Vector3(0, 0, 12);

    const state = {
      facing: Math.PI,
      cameraYaw: Math.PI,
      orbit: 0,
      pitch: 0.22,
      speed: 0,
      running: false,
      flashlightOn: true,
      sensitivity: 0.0022,
      colliders: [],
      clamp: null,
      surface: 'sand',
      walked: 0,
      lastStep: 0,
      shake: 0,
      shakeT: 0,
      weak: false,
      t: 0,
    };

    const forward = new THREE.Vector3();
    const right = new THREE.Vector3();
    const moveDir = new THREE.Vector3();
    const camWanted = new THREE.Vector3();
    const camNow = new THREE.Vector3(pos.x, 4, pos.z + CAM_BACK);
    const lookAt = new THREE.Vector3();

    /* the lamp the survivor carries */
    const flashlight = new THREE.SpotLight(0xfff0cc, 46, 34, 0.52, 0.6, 1.2);
    const flashTarget = new THREE.Object3D();
    scene.add(flashlight, flashTarget);
    flashlight.target = flashTarget;

    /* a soft local fill so the character always reads against the dark */
    const fill = new THREE.PointLight(0xa8c0d6, 2.4, 10, 1.7);
    scene.add(fill);

    const clampNum = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
    function angleLerp(a, b, t) {
      let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
      if (d < -Math.PI) d += Math.PI * 2;
      return a + d * t;
    }

    function setKit(kit) {
      state.colliders = (kit && kit.colliders) || [];
      state.clamp = (kit && kit.clamp) || null;
      state.surface = (kit && kit.surface) || 'sand';
    }

    function collide() {
      for (let i = 0; i < state.colliders.length; i += 1) {
        const c = state.colliders[i];
        const dx = pos.x - c.x;
        const dz = pos.z - c.z;
        const d = Math.hypot(dx, dz);
        const min = c.r + RADIUS;
        if (d < min && d > 0.0001) {
          const push = (min - d) / d;
          pos.x += dx * push;
          pos.z += dz * push;
        }
      }
      if (state.clamp) state.clamp(pos);
    }

    function teleport(x, z, yaw) {
      pos.x = x;
      pos.z = z;
      pos.y = 0;
      if (typeof yaw === 'number') {
        state.facing = yaw;
        state.cameraYaw = yaw;
        state.orbit = 0;
      }
      if (character) {
        character.setPosition(x, z);
        character.setFacing(state.facing, 0, true);
      }
      placeCamera(1, true);
    }

    function placeCamera(dt, snap) {
      const yaw = state.cameraYaw + state.orbit;
      forward.set(-Math.sin(yaw), 0, -Math.cos(yaw));
      const height = 2.4 + state.pitch * 3.4;
      camWanted.set(
        pos.x - forward.x * CAM_BACK,
        Math.max(1.0, height),
        pos.z - forward.z * CAM_BACK
      );
      const k = snap ? 1 : Math.min(1, dt * 7);
      camNow.x += (camWanted.x - camNow.x) * k;
      camNow.y += (camWanted.y - camNow.y) * k;
      camNow.z += (camWanted.z - camNow.z) * k;

      camera.position.copy(camNow);
      lookAt.set(pos.x, 1.35, pos.z);
      camera.lookAt(lookAt);

      if (state.shakeT > 0) {
        state.shakeT = Math.max(0, state.shakeT - dt);
        const decay = Math.min(1, state.shakeT * 3);
        const amount = state.shake * decay;
        const t = state.t * 47;
        camera.position.x += Math.sin(t) * amount * 0.16;
        camera.position.y += Math.cos(t * 1.7) * amount * 0.13;
        camera.rotation.z += Math.sin(t * 0.9) * amount * 0.03;
        if (state.shakeT === 0) state.shake = 0;
      }
    }

    function updateLights(dt) {
      state.t += dt;
      const fx = -Math.sin(state.facing);
      const fz = -Math.cos(state.facing);
      flashlight.position.set(pos.x, 2.05, pos.z);
      flashTarget.position.set(pos.x + fx * 9, 0.5, pos.z + fz * 9);
      fill.position.set(pos.x, 2.3, pos.z);

      let strength = state.flashlightOn ? 1 : 0;
      if (state.weak && state.flashlightOn) {
        strength = 0.72 + Math.sin(state.t * 21) * 0.12 + Math.random() * 0.16;
      }
      flashlight.intensity = 46 * strength;
      flashlight.visible = state.flashlightOn;
      fill.intensity = 2.4 * (state.flashlightOn ? 1 : 0.6);
      if (character) character.setLamp(state.flashlightOn);
    }

    function update(dt, input) {
      const f = input && typeof input.forward === 'number' ? input.forward : 0;
      const r = input && typeof input.right === 'number' ? input.right : 0;
      const wantRun = !!(input && (input.run || input.sprint)) || Math.hypot(f, r) > 0.85;

      if (input) {
        if (input.lookX) state.orbit -= input.lookX * 0.9;
        if (input.lookY) state.pitch = clampNum(state.pitch + input.lookY * 0.45, -0.05, 0.8);
      }
      state.orbit = clampNum(state.orbit, -2.4, 2.4);
      state.orbit *= Math.max(0, 1 - dt * 1.5);

      const yaw = state.cameraYaw + state.orbit;
      forward.set(-Math.sin(yaw), 0, -Math.cos(yaw));
      right.set(-forward.z, 0, forward.x);

      moveDir.set(0, 0, 0)
        .addScaledVector(forward, f)
        .addScaledVector(right, r);

      const mag = Math.hypot(moveDir.x, moveDir.z);
      const wanted = mag > 0.01 ? (wantRun ? RUN : WALK) * Math.min(1, mag) : 0;
      state.speed += (wanted - state.speed) * Math.min(1, dt * 9);
      if (state.speed < 0.02) state.speed = 0;
      state.running = wantRun && state.speed > WALK * 1.05;

      if (mag > 0.01) {
        moveDir.x /= mag;
        moveDir.z /= mag;
        const desired = Math.atan2(-moveDir.x, -moveDir.z);
        state.facing = angleLerp(state.facing, desired, Math.min(1, dt * 10));
        pos.x += moveDir.x * state.speed * dt;
        pos.z += moveDir.z * state.speed * dt;
        collide();
      }

      state.cameraYaw = angleLerp(state.cameraYaw, state.facing, Math.min(1, dt * 2.4));

      if (state.speed > 0.2) {
        state.walked += state.speed * dt;
        const stride = state.running ? 2.5 : 1.9;
        if (state.walked - state.lastStep > stride) {
          state.lastStep = state.walked;
          if (audio) audio.footstep(state.surface);
        }
      }

      if (character) {
        character.setPosition(pos.x, pos.z);
        character.setFacing(state.facing, dt, false);
        character.update(dt, { speed: state.speed, running: state.running });
      }

      placeCamera(dt, false);
      updateLights(dt);
    }

    function setSensitivity(v) {
      state.sensitivity = 0.0022 * (v || 1);
    }

    function setFlashlight(on) {
      state.flashlightOn = !!on;
      if (character) character.setLamp(state.flashlightOn);
    }

    function toggleFlashlight() {
      setFlashlight(!state.flashlightOn);
      return state.flashlightOn;
    }

    function shake(amount, seconds) {
      state.shake = Math.max(state.shake, amount);
      state.shakeT = Math.max(state.shakeT, seconds);
    }

    function setWeak(v) {
      state.weak = !!v;
    }

    function flinch() {
      if (character) character.flinch();
    }

    function celebrate() {
      if (character) character.playPickup();
    }

    return {
      pos,
      state,
      character,
      setKit, teleport, update, setSensitivity,
      setFlashlight, toggleFlashlight, shake, setWeak, flinch, celebrate,
      get facing() { return state.facing; },
      get cameraYaw() { return state.cameraYaw; },
      get viewYaw() { return state.cameraYaw + state.orbit; },
      get speed() { return state.speed; },
    };
  }

  root.MI = root.MI || {};
  root.MI.player = { create, WALK, RUN };
})(typeof window !== 'undefined' ? window : globalThis);
