/* Mystery Island 3D — game orchestration.
 *
 * Owns the state machine (menu / playing / paused / ended), wires the rules to
 * the 3D world, and keeps save, audio and the horror director in step.
 */
(function (root) {
  'use strict';

  const MI = root.MI || {};
  const OPPOSITE = { north: 'south', south: 'north', east: 'west', west: 'east' };

  let THREE = root.THREE;
  let renderer = null;
  let scene = null;
  let camera = null;
  let player = null;
  let controls = null;
  let director = null;
  let ui = null;
  let audio = MI.audio;
  let save = MI.save;
  let rules = MI.rules;

  let kit = null;
  let rs = null;                 // the rules player dict
  let state = 'boot';            // boot | menu | playing | paused | ended
  let settings = save ? save.loadSettings() : { volume: 75, brightness: 100, look: 100, quality: 'medium', subtitles: true };
  let last = 0;
  let nearest = null;
  let fpsAccum = 0;
  let fpsFrames = 0;

  const params = (function () {
    const out = {};
    const q = String(root.location && root.location.search ? root.location.search : '').replace(/^\?/, '');
    q.split('&').forEach((pair) => {
      if (!pair) return;
      const [k, v] = pair.split('=');
      out[decodeURIComponent(k)] = decodeURIComponent(v || '1');
    });
    return out;
  })();

  /* ------------------------------------------------------------- helpers */
  function objectiveFor(p) {
    const hasRope = p.inventory.indexOf('rope') !== -1;
    const hasLantern = p.inventory.indexOf('lantern') !== -1;
    if (p.location === 'Lighthouse') {
      return hasLantern ? 'Light the beacon' : 'The beacon needs oil. The lantern was in the Cave.';
    }
    if (!hasRope && !hasLantern) return 'Find a way across the channel';
    if (!hasLantern) return 'Find a light for the beacon';
    if (!hasRope) return 'Find a rope to lash the bridge';
    return 'Cross the bridge and light the beacon';
  }

  function syncHud() {
    if (!ui || !rs) return;
    ui.hud.location(rs.location);
    ui.hud.objective(objectiveFor(rs));
    ui.hud.energy(rs.energy, rules.MAX_ENERGY);
    ui.hud.inventory(rs.inventory);
    if (player) player.setWeak(rs.energy <= 2);
    if (audio) {
      const e = rs.energy;
      audio.setHeartbeat(e <= 2 ? 0.85 : e <= 3 ? 0.4 : 0);
    }
  }

  function persist() {
    if (!rs || !save) return;
    if (rs.gameOver) return;
    save.saveGame(rs, rs.location);
    refreshContinue();
  }

  function refreshContinue() {
    if (!ui || !save) return;
    const info = save.describeSave();
    if (info) {
      ui.setContinueMeta(
        info.location + ' · ' + info.energy + '/5 energy' + (info.stamp ? ' · ' + info.stamp : ''),
        true
      );
    } else {
      ui.setContinueMeta('no saved game', false);
    }
  }

  function qualityRatio(quality) {
    const dpr = root.devicePixelRatio || 1;
    if (quality === 'low') return 1;
    if (quality === 'medium') return Math.min(dpr, 1.5);
    return Math.min(dpr, 2);
  }

  function applyQuality(quality) {
    if (!renderer) return;
    const dpr = root.devicePixelRatio || 1;
    const ratio = quality === 'low' ? 1 : quality === 'medium' ? Math.min(dpr, 1.5) : Math.min(dpr, 2);
    renderer.setPixelRatio(ratio);
    renderer.shadowMap.enabled = quality === 'high';
    renderer.shadowMap.needsUpdate = true;
  }

  function applySettings(next) {
    settings = Object.assign({}, settings, next || {});
    if (audio) audio.setVolume(settings.volume / 100);
    if (renderer) renderer.toneMappingExposure = settings.brightness / 100;
    if (player) player.setSensitivity(settings.look / 100);
    applyQuality(settings.quality);
    if (save) save.saveSettings(settings);
  }

  /* ----------------------------------------------------------- rendering */
  function initRenderer() {
    const canvas = document.createElement('canvas');
    // Fail with a sentence a human can act on, not a black rectangle.
    if (typeof root.WebGLRenderingContext !== 'undefined') {
      const probe = canvas.getContext('webgl2') || canvas.getContext('webgl');
      if (!probe) {
        throw new Error(
          'This browser has WebGL switched off, so the island cannot be drawn. ' +
          'Enable hardware acceleration or try Chrome, Edge, Firefox or Safari.'
        );
      }
    }
    canvas.id = 'game-canvas';
    root.document.body.insertBefore(canvas, root.document.body.firstChild);

    renderer = new THREE.WebGLRenderer({ canvas, antialias: settings.quality !== 'low', powerPreference: 'high-performance' });
    renderer.setSize(root.innerWidth, root.innerHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = settings.brightness / 100;
    renderer.shadowMap.enabled = settings.quality === 'high';
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    applyQuality(settings.quality);

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x05070a);

    camera = new THREE.PerspectiveCamera(74, root.innerWidth / root.innerHeight, 0.08, 260);
    scene.add(camera);

    const hemi = new THREE.HemisphereLight(0x24303c, 0x05070a, 0.4);
    hemi.name = 'hemi';
    scene.add(hemi);
    const amb = new THREE.AmbientLight(0x1a2430, 0.35);
    amb.name = 'amb';
    scene.add(amb);

    player = MI.player.create({ THREE, camera, scene, audio, quality: settings.quality });
    player.setSensitivity(settings.look / 100);

    controls = MI.controls.create({
      canvas,
      handlers: {
        onInteract: () => interact(),
        onFlashlight: () => toggleFlash(),
        onPause: () => togglePause(),
        onMute: () => {
          const v = audio.volume > 0 ? 0 : 0.75;
          audio.setVolume(v);
          if (ui) ui.hud.say(v ? 'Sound on' : 'Sound muted', 1400);
        },
      },
    });
    if (ui) ui.touch(controls.isTouch);

    director = MI.horror.create({
      THREE,
      scene,
      audio,
      onThreat: () => caughtByPresence(),
      onShake: (amount, seconds) => { if (player) player.shake(amount, seconds); },
    });

    root.addEventListener('resize', () => {
      if (!renderer || !camera) return;
      camera.aspect = root.innerWidth / root.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(root.innerWidth, root.innerHeight);
    });
  }

  /* ------------------------------------------------------------ location */
  function unloadKit() {
    if (kit && kit.group) {
      scene.remove(kit.group);
      kit.group.traverse((obj) => {
        if (obj.geometry && obj.geometry.dispose) obj.geometry.dispose();
        if (obj.material) {
          if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose && m.dispose());
          else if (obj.material.dispose) obj.material.dispose();
        }
      });
    }
    kit = null;
  }

  function entryPoint(location, fromDirection) {
    // One implementation, shared with the spawn-clearance tests.
    const shared = MI.world.arrivalPoint(kit.anchors, fromDirection);
    if (shared) return shared;
    return { x: 0, z: 10, yaw: Math.PI };
  }

  function loadLocation(location, fromDirection) {
    unloadKit();
    kit = MI.world.build(THREE, location, settings.quality);
    if (MI.world.dress) MI.world.dress(THREE, kit.group, location);
    scene.add(kit.group);

    if (scene.fog && scene.fog.dispose) scene.fog = null;
    scene.fog = new THREE.FogExp2(kit.fog.color, kit.fog.density);

    const hemi = scene.getObjectByName('hemi');
    const amb = scene.getObjectByName('amb');
    if (hemi) { hemi.color.setHex(kit.ambient.sky); hemi.groundColor.setHex(kit.ambient.ground); hemi.intensity = kit.ambient.intensity; }
    if (amb) { amb.color.setHex(kit.ambient.color); amb.intensity = kit.ambient.intensity * 0.8; }

    const spawn = entryPoint(location, fromDirection);
    player.setKit(kit);
    player.teleport(spawn.x, spawn.z, spawn.yaw);
    player.setFlashlight(kit.flashlightNeed >= 1 ? true : player.state.flashlightOn);

    if (audio) audio.ambience(location);
    director.enter(location, { playerPos: player.pos });

    if (ui) {
      ui.hud.location(location);
      ui.hud.say(rules.LOCATIONS[location].description, 7000);
    }
  }

  /* ---------------------------------------------------------- interaction */
  function nearestAnchor() {
    if (!kit || !player) return null;
    let best = null;
    let bestDist = Infinity;
    kit.anchors.forEach((a) => {
      const d = Math.hypot(player.pos.x - a.x, player.pos.z - a.z);
      if (d <= a.radius && d < bestDist) {
        best = a;
        bestDist = d;
      }
    });
    return best;
  }

  function anchorLabel(anchor) {
    if (anchor.action.indexOf('go ') === 0 && rs) {
      const dir = anchor.action.slice(3);
      const exit = rules.LOCATIONS[rs.location].exits[dir];
      if (exit && exit.requires && rs.inventory.indexOf(exit.requires) === -1) {
        return anchor.label + ' (needs ' + exit.requires + ')';
      }
    }
    return anchor.label;
  }

  function interact() {
    if (state !== 'playing' || !rs) return;
    if (audio) audio.resume();
    const anchor = nearestAnchor();
    if (!anchor) {
      if (ui) ui.hud.say('Nothing within reach.', 1400);
      return;
    }
    if (audio) audio.click();
    const before = rs.location;
    const msg = rules.applyAction(rs, anchor.action);

    if (player && /^(take|pick up)/.test(String(anchor.action || ''))) player.celebrate();
    if (ui) ui.hud.say(msg, 4600);
    syncHud();

    if (anchor.action === 'take lantern' && rs.inventory.indexOf('lantern') !== -1) {
      director.trigger('lanternTaken', { camera });
    }
    if (anchor.action === 'go north' && before === 'Old Bridge' && rs.location === 'Old Bridge') {
      director.trigger('bridgeBlocked', { camera });
    }
    if (anchor.action === 'go north' && rs.location === 'Lighthouse') {
      director.trigger('crossed', {});
    }

    if (rs.won) { finish(true); return; }
    if (rs.gameOver) { finish(false); return; }

    if (rs.location !== before) {
      transition(anchor.action.slice(3), before);
    } else {
      persist();
    }
  }

  function transition(direction, from) {
    const goingTo = rs.location;
    ui.hud.prompt(null);
    ui.fade(200).then(() => {
      loadLocation(goingTo, direction);
      persist();
    });
  }

  /* ------------------------------------------------------------- threats */
  function damage(amount, why) {
    if (!rs || state !== 'playing') return;
    rs.energy = Math.max(0, rs.energy - amount);
    if (ui) { ui.flashDamage(); ui.hud.say(why, 3600); }
    if (player) player.shake(1.1, 0.7);
    syncHud();
    if (rs.energy === 0) {
      rs.gameOver = true;
      rs.lossReason = 'energy';
      finish(false);
    } else {
      persist();
    }
  }

  function caughtByPresence() {
    if (state !== 'playing') return;
    ui.fade(260).then(() => {
      rs.location = 'Beach';
      loadLocation('Beach', null);
      damage(1, 'Something took hold of you in the trees. You ran until the sand gave out under you.');
      persist();
    });
  }

  /* --------------------------------------------------------------- flow */
  function finish(won) {
    state = 'ended';
    if (controls) controls.release();
    if (controls) controls.exitPointerLock();
    if (audio) audio.setHeartbeat(0);
    if (save) save.clearGame();
    if (won) director.trigger('won', {});
    else director.trigger('lost', {});

    const text = rules.outcomeText(rs);
    ui.fade(320).then(() => {
      ui.end({
        won,
        title: won ? 'You escaped' : rs.quit ? 'You gave up' : 'The island keeps you',
        text,
      });
      if (audio) { if (!won) audio.deathTone(); }
    });
  }

  function startGame(name, restored, character) {
    if (audio) { audio.init(); audio.resume(); }
    rs = restored || rules.newGame(name, character);
    state = 'playing';
    if (MI.character && MI.character.setLook) MI.character.setLook(rs.character || character || 'castaway');
    ui.hideScreens();
    ui.hud.on();
    loadLocation(rs.location, null);
    syncHud();
    persist();
    if (controls) controls.release();
  }

  /* The name is collected on the in-game survivor screen, not a browser prompt. */
  /* Any script's letters, plus the punctuation real names use. Deliberately
   * Unicode-aware: phone keyboards type U+2019 for apostrophes, and names like
   * José or Chukwuemeka must pass. */
  const NAME_MAX = 24;
  function openSurvivor() {
    if (audio) { audio.init(); audio.resume(); }
    ui.survivor.open('');
  }

  /* Pure so it can be tested directly: returns { ok, name, error }. */
  function validateName(raw) {
    let name = String(raw == null ? '' : raw);
    try { name = name.normalize('NFC'); } catch (err) { /* older engines */ }
    name = name.replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim();
    if (!name) return { ok: false, name: '', error: 'Enter a name so the story can address you.' };
    if (name.length > NAME_MAX) return { ok: false, name, error: 'That name is too long. Keep it under ' + (NAME_MAX + 1) + ' characters.' };
    // The original CLI accepts any non-empty name, so the 3D build does too.
    return { ok: true, name, error: '' };
  }

  function submitSurvivor(raw) {
    const result = validateName(raw);
    if (!result.ok) {
      if (ui.survivor.busy) ui.survivor.busy(false);
      ui.survivor.error(result.error);
      return;
    }
    ui.survivor.close();
    if (ui.survivor.busy) ui.survivor.busy(true);
    try {
      startGame(result.name, null, ui.survivor.character);
    } catch (err) {
      if (ui.survivor.busy) ui.survivor.busy(false);
      ui.survivor.error('The island failed to load. ' + (err && err.message ? err.message : ''));
      if (root.console) root.console.error(err);
    }
  }

  function newGame() {
    openSurvivor();
  }

  function continueGame() {
    const data = save.loadGame();
    if (!data) { newGame(); return; }
    startGame(data.player.name, data.player);
  }

  function togglePause(force) {
    if (state === 'playing') {
      state = 'paused';
      if (controls) { controls.release(); controls.exitPointerLock(); }
      ui.show('pause');
      return;
    }
    if (state === 'paused' && force !== false) {
      state = 'playing';
      ui.hideScreens();
      ui.hud.on();
      if (audio) audio.resume();
    }
  }

  function toggleFlash() {
    if (!player) return;
    const on = player.toggleFlashlight();
    if (ui) ui.hud.say(on ? 'Lamp on' : 'Lamp off', 1100);
  }

  function toMenu() {
    state = 'menu';
    ui.hud.off();
    ui.show('menu');
    if (controls) { controls.release(); controls.exitPointerLock(); }
    refreshContinue();
  }

  /* ---------------------------------------------------------------- loop */
  let frameCount = 0;
  let minimapCtx = null;

  function grabMinimap() {
    if (minimapCtx) return;
    try {
      const canvas = root.document.getElementById('minimap');
      if (canvas && canvas.getContext) minimapCtx = canvas.getContext('2d');
    } catch (err) {
      minimapCtx = null;
    }
  }

  /* Points at the next thing worth walking to, and keeps the roadmap honest. */
  function updateGuidance() {
    if (!rs || !ui || !MI.nav || !player) return;
    const guidance = MI.nav.step(rs);
    const list = (kit && kit.anchors) || [];
    const anchor = list.filter((a) => a.id === guidance.anchor)[0] || null;

    let angle = 0;
    let meta = guidance.sameRoom ? 'right here' : 'towards the ' + guidance.room;
    if (anchor) {
      const world = MI.nav.bearing(player.pos, anchor);
      angle = world + (player.viewYaw || player.cameraYaw || 0);
      const metres = Math.max(1, Math.round(MI.nav.distance(player.pos, anchor)));
      meta = metres + ' m ' + MI.nav.compass(world);
    }
    ui.hud.guidance({ angle, text: guidance.label, meta });
    ui.hud.objective(guidance.goal ? guidance.goal.label : guidance.label);

    if (frameCount % 6 === 0) {
      grabMinimap();
      if (minimapCtx) {
        MI.nav.drawMinimap(minimapCtx, {
          size: 132,
          dpr: root.devicePixelRatio || 1,
          state: rs,
          player: player.pos,
          step: guidance,
          anchor,
        });
      }
    }
  }

  function frame(now) {
    root.requestAnimationFrame(frame);
    frameCount += 1;
    const t = now / 1000;
    let dt = last ? t - last : 0.016;
    last = t;
    if (dt > 0.05) dt = 0.05;

    if (state === 'playing' && kit) {
      controls.update();
      player.update(dt, controls.input);
      kit.update(dt, t);
      director.update(dt, { playerPos: player.pos, camera, scene });
      audio.tickHeartbeat(dt);

      updateGuidance();

      const anchor = nearestAnchor();
      if (anchor !== nearest) {
        nearest = anchor;
        ui.hud.prompt(anchor ? anchorLabel(anchor) : null);
      } else if (anchor) {
        ui.hud.prompt(anchorLabel(anchor));
      }
      if (controls.isTouch) ui.joystick(controls.input.right, -controls.input.forward);
    } else if (kit) {
      kit.update(dt, t);
    }

    if (renderer && scene && camera) renderer.render(scene, camera);

    // Adaptive resolution: phones that cannot hold 45 fps quietly lose pixels
    // instead of frames. It never climbs back above the quality ceiling.
    fpsAccum += dt;
    fpsFrames += 1;
    if (fpsAccum > 1.5 && renderer) {
      const fps = fpsFrames / fpsAccum;
      const current = renderer.getPixelRatio ? renderer.getPixelRatio() : 1;
      const ceiling = qualityRatio(settings.quality);
      if (fps < 45 && current > 1) {
        renderer.setPixelRatio(Math.max(1, current - 0.25));
      } else if (fps > 58 && current < ceiling) {
        renderer.setPixelRatio(Math.min(ceiling, current + 0.25));
      }
      fpsAccum = 0;
      fpsFrames = 0;
    }

    if (params.debug) {
      const el = root.document.getElementById('fps');
      if (el) {
        el.style.display = 'block';
        el.textContent =
          Math.round(renderer && renderer.getPixelRatio ? (fpsFrames / Math.max(0.001, fpsAccum)) : 0) +
          ' · ' + (rs ? rs.location + ' · ' + rs.energy + 'e' : '') +
          ' · x' + (renderer && renderer.getPixelRatio ? renderer.getPixelRatio() : 1);
      }
    }
  }

  /* ------------------------------------------------------------ self test */
  function selfTest() {
    const lines = [];
    const ok = (name, cond, detail) => lines.push((cond ? 'PASS ' : 'FAIL ') + name + (detail ? ' — ' + detail : ''));

    ok('three.js loaded', !!THREE && !!THREE.REVISION, 'r' + (THREE ? THREE.REVISION : '?'));
    ok('webgl context', !!renderer, renderer ? 'ok' : 'no renderer');
    ok('rules engine', typeof rules.applyAction === 'function');

    const p = rules.newGame('Test');
    ['go north', 'take rope', 'go north', 'take lantern', 'go east', 'go north'].forEach((a) => rules.applyAction(p, a));
    rules.applyAction(p, 'light beacon');
    ok('winning path', p.won === true && p.energy === 1, 'energy ' + p.energy);

    const q = rules.newGame('Test');
    ['go north', 'go north', 'go east'].forEach((a) => rules.applyAction(q, a));
    rules.applyAction(q, 'go north');
    ok('bridge needs the rope', q.location === 'Old Bridge', q.location);

    MI.world.locations.forEach((name) => {
      try {
        const k = MI.world.build(THREE, name, 'low');
        ok('world builds: ' + name, k.anchors.length > 0 && !!k.group, k.anchors.length + ' anchors');
      } catch (err) {
        ok('world builds: ' + name, false, err.message);
      }
    });

    ok('audio available', !!audio && !!audio.ready, audio && audio.ready ? 'running' : 'needs a tap to start');
    ok('save round-trip', (function () {
      const before = save.loadGame();
      save.saveGame({ name: 'Probe', location: 'Beach', energy: 5, inventory: [] }, 'Beach');
      const after = save.loadGame();
      if (before) save.saveGame(before.player, before.location); else save.clearGame();
      return !!after && after.player.name === 'Probe';
    })(), save.persistent ? 'persistent' : 'memory only');

    lines.push('');
    lines.push('Renderer: ' + (renderer ? renderer.info.render.calls + ' draw calls last frame' : 'n/a'));
    lines.push('Touch device: ' + (controls && controls.isTouch ? 'yes' : 'no'));
    return lines;
  }

  function showSelfTest() {
    const lines = selfTest();
    const boot = root.document.getElementById('boot');
    const text = root.document.getElementById('bootText');
    const box = root.document.getElementById('errorBox');
    if (boot) { boot.style.display = 'flex'; boot.style.opacity = '1'; }
    if (text) text.textContent = 'Self test';
    if (box) {
      box.style.display = 'block';
      box.style.borderColor = 'rgba(120,200,140,.5)';
      box.style.background = 'rgba(10,30,18,.6)';
      box.innerHTML = '<pre style="margin:0;white-space:pre-wrap;font-size:12px;line-height:1.7">' +
        lines.join('\n') + '</pre>';
    }
  }

  /* ---------------------------------------------------------------- boot */
  function boot() {
    if (!THREE) {
      ui.fatal(
        'Three.js did not load.',
        'The 3D engine comes from a CDN. Check your connection, then reload. ' +
          'If you are offline, run <code>python3 -m http.server</code> from this folder on a machine with internet access once.'
      );
      return;
    }
    if (!rules || !MI.world || !MI.player || !MI.controls || !MI.horror) {
      ui.fatal('A game module failed to load.', 'Reload the page. If it persists, check the browser console.');
      return;
    }

    try {
      ui.setBoot(20, 'Building the island');
      initRenderer();
      ui.setBoot(60, 'Lighting the lamp');
      applySettings(settings);
      ui.bindSettings(settings);
      ui.setBoot(85, 'Waking up');
      ui.setBoot(100, 'Ready');
      ui.bootDone();
      toMenu();
      root.requestAnimationFrame(frame);
      if (params.selftest) showSelfTest();
    } catch (err) {
      ui.fatal('The game could not start.', (err && err.message ? err.message : String(err)));
      if (root.console) root.console.error(err);
    }
  }

  /* -------------------------------------------------------------- wiring */
  ui = MI.ui.create({
    handlers: {
      onNew: () => openSurvivor(),
      onContinue: () => continueGame(),
      onSettings: () => ui.show('settings'),
      onCredits: () => ui.show('credits'),
      onBack: () => ui.show(state === 'paused' ? 'pause' : 'menu'),
      onResume: () => togglePause(true),
      onPauseSettings: () => ui.show('settings'),
      onQuit: () => { if (rs && !rs.gameOver) persist(); toMenu(); },
      onAgain: () => newGame(),
      onToMenu: () => toMenu(),
      onInteract: () => interact(),
      onFlashlight: () => toggleFlash(),
      onPause: () => togglePause(),
      onSettingsChange: (next) => applySettings(next),
    },
  });

  ui.survivor.onCharacter((key) => { if (MI.character && MI.character.setLook) MI.character.setLook(key); });
  ui.survivor.onSubmit((raw) => submitSurvivor(raw));
  ui.survivor.onBack(() => ui.show('menu'));

  root.addEventListener('visibilitychange', () => {
    if (root.document.hidden && state === 'playing') togglePause(true);
  });

  if (root.document.readyState === 'loading') {
    root.document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  root.MI.game = {
    get state() { return state; },
    get playerState() { return rs; },
    get location() { return rs ? rs.location : null; },
    selfTest,
    /* Small hooks so the headless integration test (and the curious) can drive
     * the same code paths the player does. */
    teleport(x, z) { if (player) player.teleport(x, z); },
    interact() { interact(); },
    nearestAnchor() { return nearestAnchor(); },
    anchors() { return kit ? kit.anchors.slice() : []; },
    get player() { return player; },
    get camera() { return camera; },
    get kit() { return kit; },
    get guidance() { return rs ? MI.nav.step(rs) : null; },
    submitSurvivor(name) { submitSurvivor(name); },
    validateName(name) { return validateName(name); },
  };
})(typeof window !== 'undefined' ? window : globalThis);
