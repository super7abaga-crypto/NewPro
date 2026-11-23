/* Mystery Island 3D — the horror director.
 *
 * Schedules the atmospheric events and owns the two things that can actually
 * hurt the player: the thing in the jungle and the jump scares. Consequences
 * are handed back to the game layer through onThreat so the rules stay in one
 * place.
 */
(function (root) {
  'use strict';

  function create(opts) {
    const THREE = opts.THREE;
    const scene = opts.scene;
    const audio = opts.audio;
    const onThreat = opts.onThreat || function () {};
    const onShake = opts.onShake || function () {};

    let timers = [];
    let location = null;
    let clock = 0;
    let stalker = null;
    let scare = null;
    let scareTimer = 0;
    let lightningLight = null;

    /* ------------------------------------------------------------- props */
    function buildFace() {
      const grp = new THREE.Group();
      const skin = new THREE.MeshBasicMaterial({ color: 0xd8cfc0 });
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.5, 16, 12), skin);
      head.scale.set(1, 1.25, 0.85);
      const eyeWhite = new THREE.MeshBasicMaterial({ color: 0xffffff });
      const eyeBlack = new THREE.MeshBasicMaterial({ color: 0x000000 });
      [-0.17, 0.17].forEach((x) => {
        const white = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 8), eyeWhite);
        white.position.set(x, 0.14, 0.4);
        const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 6), eyeBlack);
        pupil.position.set(x, 0.14, 0.48);
        grp.add(white, pupil);
      });
      const mouth = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), eyeBlack);
      mouth.position.set(0, -0.26, 0.4);
      mouth.scale.set(1, 1.5, 0.4);
      grp.add(head, mouth);
      grp.visible = false;
      return grp;
    }

    function buildHand() {
      const grp = new THREE.Group();
      const skin = new THREE.MeshStandardMaterial({ color: 0x6e6459, roughness: 1 });
      const palm = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.1, 0.42), skin);
      grp.add(palm);
      for (let i = 0; i < 4; i += 1) {
        const finger = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.03, 0.34, 5), skin);
        finger.position.set(-0.12 + i * 0.08, 0.02, 0.28);
        finger.rotation.x = Math.PI / 2.1;
        grp.add(finger);
      }
      grp.visible = false;
      return grp;
    }

    function init() {
      stalker = buildFace();
      scene.add(stalker);
      scare = buildHand();
      scene.add(scare);
      lightningLight = new THREE.PointLight(0xcfe4ff, 0, 120, 1.4);
      lightningLight.position.set(0, 40, 0);
      scene.add(lightningLight);
    }

    /* --------------------------------------------------------- scheduling */
    function at(seconds, fn, once) {
      timers.push({ t: seconds, fn, once: once !== false, done: false });
    }
    function every(min, max, fn) {
      const push = () => {
        const wait = min + Math.random() * (max - min);
        at(clock + wait, () => { fn(); push(); }, false);
      };
      push();
    }

    function clear() {
      timers = [];
      if (stalker) stalker.visible = false;
      if (scare) scare.visible = false;
      scareTimer = 0;
      if (lightningLight) lightningLight.intensity = 0;
      stalkerActive = false;
    }

    let stalkerActive = false;
    let stalkerPos = new THREE.Vector3();

    function lightning() {
      if (!lightningLight) return;
      lightningLight.intensity = 220;
      audio.thunder();
      setTimeout(() => { if (lightningLight) lightningLight.intensity = 40; }, 90);
      setTimeout(() => { if (lightningLight) lightningLight.intensity = 0; }, 260);
    }

    function showShadow(playerPos, distance, yawOffset) {
      if (!stalker) return;
      const a = (playerPos ? Math.atan2(playerPos.x, playerPos.z) : 0) + (yawOffset || 0) + Math.PI;
      stalkerPos.set(
        (playerPos ? playerPos.x : 0) + Math.sin(a) * distance,
        1.05,
        (playerPos ? playerPos.z : 0) + Math.cos(a) * distance
      );
      stalker.position.copy(stalkerPos);
      stalker.visible = true;
    }

    function rushScare(camera) {
      if (!scare || !camera) return;
      const dir = new THREE.Vector3();
      camera.getWorldDirection(dir);
      scare.position.copy(camera.position).add(dir.multiplyScalar(1.1));
      scare.lookAt(camera.position);
      scare.scale.setScalar(0.4);
      scare.visible = true;
      scareTimer = 0.55;
      audio.stinger();
      audio.scream(0.2);
    }

    /* ------------------------------------------------------------- events */
    function enter(name, ctx) {
      clear();
      location = name;
      clock = 0;
      const playerPos = ctx && ctx.playerPos;

      if (name === 'Beach') {
        every(9, 16, lightning);
        at(21, () => audio.scream(-0.6));
        at(38, () => audio.whisper(0.5));
        every(26, 40, () => audio.whisper(Math.random() * 1.6 - 0.8));
      }

      if (name === 'Jungle') {
        every(6, 11, () => audio.whisper(Math.random() * 1.8 - 0.9));
        at(11, () => {
          showShadow(playerPos, 9.5, 0.6);
          audio.whisper(0.7);
          setTimeout(() => { if (stalker) stalker.visible = false; }, 1500);
        });
        at(22, () => {
          stalkerActive = true;
          showShadow(playerPos, 13, 0);
        });
        every(14, 22, () => audio.creak());
      }

      if (name === 'Cave') {
        every(1.4, 4.2, () => audio.drip());
        at(16, () => audio.whisper(-0.4));
        every(18, 30, () => { audio.whisper(Math.random() * 1.4 - 0.7); audio.drip(); });
      }

      if (name === 'Old Bridge') {
        every(3, 6.5, () => audio.creak());
        every(11, 19, () => audio.whisper(Math.random() * 1.2 - 0.6));
      }

      if (name === 'Lighthouse') {
        at(7, () => audio.whisper(0.1));
        every(20, 34, () => audio.creak());
      }
    }

    /* ------------------------------------------------------------- update */
    function update(dt, ctx) {
      clock += dt;
      const playerPos = ctx.playerPos;
      const camera = ctx.camera;

      timers.forEach((timer) => {
        if (timer.done) return;
        if (clock >= timer.t) {
          timer.done = true;
          try { timer.fn(); } catch (err) { /* a scare must never break the loop */ }
        }
      });
      timers = timers.filter((t) => !t.done || !t.once);

      if (scareTimer > 0 && scare) {
        scareTimer -= dt;
        scare.scale.setScalar(0.4 + (0.55 - scareTimer) * 3.4);
        if (camera) scare.position.lerp(camera.position, 0.22);
        if (scareTimer <= 0) scare.visible = false;
      }

      if (stalkerActive && stalker && stalker.visible && playerPos) {
        const dx = playerPos.x - stalker.position.x;
        const dz = playerPos.z - stalker.position.z;
        const dist = Math.hypot(dx, dz);
        if (dist > 0.001) {
          const speed = 1.55;
          stalker.position.x += (dx / dist) * speed * dt;
          stalker.position.z += (dz / dist) * speed * dt;
          stalker.position.y = 1.05;
          stalker.lookAt(playerPos.x, 1.05, playerPos.z);
        }
        if (dist < 2.3) {
          audio.scream(0);
          onThreat('caught');
          stalker.visible = false;
          stalkerActive = false;
          at(clock + 16, () => {
            stalkerActive = true;
            showShadow(playerPos, 14, 0);
          }, false);
        }
      }
    }

    function trigger(name, ctx) {
      if (name === 'lanternTaken') {
        rushScare(ctx && ctx.camera);
        onShake(1.3, 0.7);
      }
      if (name === 'bridgeBlocked') {
        rushScare(ctx && ctx.camera);
        audio.creak();
        onShake(1.5, 0.8);
      }
      if (name === 'crossed') {
        audio.setHeartbeat(0.5);
      }
      if (name === 'won') {
        audio.setHeartbeat(0);
        audio.beacon();
        if (stalker) stalker.visible = false;
        stalkerActive = false;
      }
      if (name === 'lost') {
        audio.setHeartbeat(0);
        audio.deathTone();
        if (stalker) stalker.visible = false;
        stalkerActive = false;
      }
    }

    init();

    return {
      enter, update, trigger, clear,
      get location() { return location; },
      get clock() { return clock; },
    };
  }

  root.MI = root.MI || {};
  root.MI.horror = { create };
})(typeof window !== 'undefined' ? window : globalThis);
