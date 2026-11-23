/* Mystery Island 3D — first-person player: movement, collision, flashlight. */
(function (root) {
  'use strict';

  const EYE_HEIGHT = 1.68;
  const SPEED = 3.4;
  const STRIDE = 2.05;

  function create(opts) {
    const THREE = opts.THREE;
    const camera = opts.camera;
    const scene = opts.scene;
    const audio = opts.audio;

    const pos = new THREE.Vector3(0, 0, 12);
    const state = {
      yaw: Math.PI,
      pitch: 0,
      speed: SPEED,
      sensitivity: 0.0022,
      flashlightOn: true,
      walked: 0,
      bob: 0,
      colliders: [],
      clamp: null,
      surface: 'sand',
      lastStep: 0,
      shake: 0,
      shakeT: 0,
      weak: false,
      t: 0,
    };

    const flashlight = new THREE.SpotLight(0xfff2d0, 62, 30, 0.44, 0.55, 1.35);
    flashlight.position.set(0, 2, 0);
    flashlight.castShadow = opts.quality === 'high';
    if (flashlight.shadow) {
      flashlight.shadow.mapSize.width = 1024;
      flashlight.shadow.mapSize.height = 1024;
      flashlight.shadow.camera.far = 32;
      flashlight.shadow.bias = -0.0012;
    }
    const flashTarget = new THREE.Object3D();
    scene.add(flashlight, flashTarget);
    flashlight.target = flashTarget;

    const glow = new THREE.PointLight(0xbfd4e6, 1.4, 7, 2);
    scene.add(glow);

    const forward = new THREE.Vector3();
    const rightVec = new THREE.Vector3();
    const nextPos = new THREE.Vector3();

    function setKit(kit) {
      state.colliders = kit.colliders || [];
      state.clamp = kit.clamp || null;
      state.surface = kit.surface || 'sand';
    }

    function teleport(x, z, yaw) {
      pos.set(x, 0, z);
      if (typeof yaw === 'number') state.yaw = yaw;
      state.walked = 0;
      state.bob = 0;
    }

    function toggleFlashlight() {
      state.flashlightOn = !state.flashlightOn;
      flashlight.intensity = state.flashlightOn ? 62 : 0;
      return state.flashlightOn;
    }

    function setFlashlight(on) {
      state.flashlightOn = !!on;
      flashlight.intensity = state.flashlightOn ? 62 : 0;
    }

    function collide(next) {
      const radius = 0.42;
      state.colliders.forEach((c) => {
        const dx = next.x - c.x;
        const dz = next.z - c.z;
        const dist = Math.hypot(dx, dz);
        const min = c.r + radius;
        if (dist < min && dist > 0.0001) {
          next.x = c.x + (dx / dist) * min;
          next.z = c.z + (dz / dist) * min;
        }
      });
      if (state.clamp) state.clamp(next);
      return next;
    }

    function update(dt, input) {
      state.yaw -= input.lookX * state.sensitivity;
      state.pitch -= input.lookY * state.sensitivity;
      state.pitch = Math.max(-1.35, Math.min(1.35, state.pitch));

      forward.set(Math.sin(state.yaw) * -1, 0, Math.cos(state.yaw) * -1);
      rightVec.set(forward.z, 0, -forward.x);

      let mx = 0;
      let mz = 0;
      if (input.forward) {
        mx += forward.x * input.forward;
        mz += forward.z * input.forward;
      }
      if (input.right) {
        mx += rightVec.x * input.right;
        mz += rightVec.z * input.right;
      }
      const mag = Math.hypot(mx, mz);
      if (mag > 0.001) {
        const step = (state.speed * dt) / Math.max(1, mag);
        nextPos.copy(pos);
        nextPos.x += mx * step;
        nextPos.z += mz * step;
        collide(nextPos);
        const moved = Math.hypot(nextPos.x - pos.x, nextPos.z - pos.z);
        pos.copy(nextPos);
        state.walked += moved;
        state.bob += moved * 3.6;
        if (state.walked - state.lastStep > STRIDE) {
          state.lastStep = state.walked;
          if (audio) audio.footstep(state.surface);
        }
      } else {
        state.bob += dt * 0.6;
      }

      const bobY = Math.sin(state.bob * 1.7) * 0.028;
      camera.position.set(pos.x, EYE_HEIGHT + bobY, pos.z);
      camera.rotation.set(state.pitch, state.yaw, 0, 'YXZ');

      state.t += dt;
      // Fear: a short, decaying camera shake. Never strong enough to make the
      // controls unreadable, always short enough to feel like an event.
      if (state.shakeT > 0) {
        state.shakeT = Math.max(0, state.shakeT - dt);
        const decay = Math.min(1, state.shakeT * 2.6);
        const amp = state.shake * decay;
        const wobble = state.t * 46;
        camera.position.x += Math.sin(wobble) * amp * 0.055;
        camera.position.y += Math.cos(wobble * 1.7) * amp * 0.045;
        camera.rotation.z = Math.sin(wobble * 0.9) * amp * 0.03;
        if (state.shakeT === 0) state.shake = 0;
      }

      // A failing torch is scarier than a steady one.
      if (state.weak) {
        const flicker = 0.62 + Math.sin(state.t * 23.5) * 0.14 + Math.random() * 0.2;
        flashlight.intensity = 62 * flicker;
        glow.intensity = 1.4 * flicker;
      } else if (flashlight.intensity !== 62) {
        flashlight.intensity = 62;
        glow.intensity = 1.4;
      }

      flashlight.position.set(pos.x, EYE_HEIGHT - 0.12, pos.z);
      const dirX = Math.sin(state.yaw) * -1;
      const dirZ = Math.cos(state.yaw) * -1;
      const pitchLift = Math.sin(state.pitch);
      flashTarget.position.set(
        pos.x + dirX * 12,
        EYE_HEIGHT - 0.12 + pitchLift * 12,
        pos.z + dirZ * 12
      );
      flashTarget.updateMatrixWorld();
      glow.position.set(pos.x, EYE_HEIGHT, pos.z);
      input.lookX = 0;
      input.lookY = 0;
    }

    function lookDirection(out) {
      const v = out || new THREE.Vector3();
      v.set(Math.sin(state.yaw) * -1, Math.sin(state.pitch), Math.cos(state.yaw) * -1).normalize();
      return v;
    }

    return {
      state, pos, flashlight, setKit, teleport, update, toggleFlashlight, setFlashlight,
      shake: (amount, seconds) => {
        state.shake = Math.max(state.shake, Number(amount) || 1);
        state.shakeT = Math.max(state.shakeT, Number(seconds) || 0.5);
      },
      setWeak: (on) => { state.weak = !!on; },
      lookDirection, setSensitivity: (v) => { state.sensitivity = 0.0022 * (Number(v) || 1); },
      setSpeed: (v) => { state.speed = SPEED * (Number(v) || 1); },
      get yaw() { return state.yaw; },
      set yaw(v) { state.yaw = v; },
    };
  }

  root.MI = root.MI || {};
  root.MI.player = { create, EYE_HEIGHT };
})(typeof window !== 'undefined' ? window : globalThis);
