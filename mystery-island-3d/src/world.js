/* Mystery Island 3D — the five locations, built procedurally.
 *
 * No external models or textures: every prop is generated from Three.js
 * primitives, so the game loads instantly and can never ship a broken asset.
 * build() returns a kit describing what the game layer needs to know:
 *   group      the THREE.Group to add to the scene
 *   colliders  circles the player cannot walk through
 *   anchors    interactable points (each carries a rules action string)
 *   clamp()    keeps the player inside the walkable area
 *   update()   per-frame animation
 */
(function (root) {
  'use strict';

  const TAU = Math.PI * 2;

  function rnd(min, max) {
    return min + Math.random() * (max - min);
  }

  function mat(THREE, color, opts) {
    return new THREE.MeshStandardMaterial(
      Object.assign({ color, roughness: 0.92, metalness: 0.04, flatShading: true }, opts || {})
    );
  }

  function ground(THREE, color, radius) {
    const g = new THREE.Mesh(new THREE.CircleGeometry(radius, 56), mat(THREE, color, { roughness: 1 }));
    g.rotation.x = -Math.PI / 2;
    g.receiveShadow = true;
    return g;
  }

  function post(THREE, x, z, color) {
    const grp = new THREE.Group();
    const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 1.5, 6), mat(THREE, 0x2b2b2b));
    stick.position.y = 0.75;
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.34, 0.05, 6, 18),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.75 })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.06;
    grp.add(stick, ring);
    grp.position.set(x, 0, z);
    grp.userData.ring = ring;
    return grp;
  }

  /* ------------------------------------------------------------- BEACH */
  function buildBeach(THREE, quality) {
    const group = new THREE.Group();
    const colliders = [];
    const anchors = [];
    const animated = [];

    group.add(ground(THREE, 0x4a4438, 26));

    const sea = new THREE.Mesh(
      new THREE.PlaneGeometry(160, 90, 1, 1),
      mat(THREE, 0x061018, { roughness: 0.18, metalness: 0.75, flatShading: false })
    );
    sea.rotation.x = -Math.PI / 2;
    sea.position.set(0, -0.45, 46);
    group.add(sea);

    for (let i = 0; i < 3; i += 1) {
      const foam = new THREE.Mesh(
        new THREE.PlaneGeometry(70, 2.4),
        new THREE.MeshBasicMaterial({ color: 0x9fb8c4, transparent: true, opacity: 0.12 })
      );
      foam.rotation.x = -Math.PI / 2;
      foam.position.set(rnd(-6, 6), 0.02, 12 + i * 3);
      group.add(foam);
      animated.push({ kind: 'foam', mesh: foam, phase: i * 1.7 });
    }

    // wreck of the boat
    const wreck = new THREE.Group();
    const hull = new THREE.Mesh(new THREE.BoxGeometry(5.2, 1.3, 2.4), mat(THREE, 0x3b3128));
    hull.position.y = 0.5;
    hull.rotation.z = 0.16;
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 6, 7), mat(THREE, 0x4a3d30));
    mast.position.set(0.6, 3.2, 0);
    mast.rotation.z = -0.3;
    wreck.add(hull, mast);
    wreck.position.set(-8, 0, 6);
    wreck.rotation.y = 0.6;
    group.add(wreck);
    colliders.push({ x: -8, z: 6, r: 3.1 });

    // campfire
    const fire = new THREE.Group();
    for (let i = 0; i < 6; i += 1) {
      const log = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.13, 1.1, 5), mat(THREE, 0x2a211a));
      log.rotation.z = Math.PI / 2;
      log.rotation.y = (i / 6) * TAU;
      log.position.y = 0.16;
      fire.add(log);
    }
    const flame = new THREE.Mesh(
      new THREE.ConeGeometry(0.34, 1.1, 7),
      new THREE.MeshBasicMaterial({ color: 0xff8a3c, transparent: true, opacity: 0.85 })
    );
    flame.position.y = 0.7;
    fire.add(flame);
    const fireLight = new THREE.PointLight(0xff7a2a, 14, 16, 1.6);
    fireLight.position.y = 1.1;
    fire.add(fireLight);
    fire.position.set(-3.5, 0, 2.5);
    group.add(fire);
    colliders.push({ x: -3.5, z: 2.5, r: 1.1 });
    animated.push({ kind: 'fire', light: fireLight, flame, phase: 0 });
    anchors.push({
      id: 'rest', action: 'rest', label: 'Rest by the campfire',
      x: -3.5, z: 2.5, radius: 3.0, hint: 'the fire still has embers',
    });

    // footprints leading north
    for (let i = 0; i < 9; i += 1) {
      const print = new THREE.Mesh(
        new THREE.CircleGeometry(0.16, 8),
        new THREE.MeshBasicMaterial({ color: 0x2a2620, transparent: true, opacity: 0.55 })
      );
      print.rotation.x = -Math.PI / 2;
      print.position.set(Math.sin(i * 0.7) * 0.7, 0.012, 4 - i * 1.9);
      group.add(print);
    }

    // palm-ish silhouettes
    for (let i = 0; i < 16; i += 1) {
      const a = (i / 16) * TAU + rnd(-0.12, 0.12);
      const r = rnd(17, 24);
      const x = Math.sin(a) * r;
      const z = Math.cos(a) * r;
      if (z > 8) continue;
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.26, rnd(4, 7), 6), mat(THREE, 0x2f2a22));
      trunk.position.set(x, 2.4, z);
      trunk.rotation.z = rnd(-0.16, 0.16);
      group.add(trunk);
      colliders.push({ x, z, r: 0.5, mesh: trunk });
    }

    // rain
    const rainCount = quality === 'low' ? 700 : 1600;
    const positions = new Float32Array(rainCount * 3);
    for (let i = 0; i < rainCount; i += 1) {
      positions[i * 3] = rnd(-26, 26);
      positions[i * 3 + 1] = rnd(0, 22);
      positions[i * 3 + 2] = rnd(-26, 26);
    }
    const rainGeo = new THREE.BufferGeometry();
    rainGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const rain = new THREE.Points(
      rainGeo,
      new THREE.PointsMaterial({ color: 0xaec6d4, size: 0.055, transparent: true, opacity: 0.5 })
    );
    group.add(rain);
    animated.push({ kind: 'rain', points: rain, positions });

    // north gate
    const gate = post(THREE, 0, -19, 0xffb066);
    group.add(gate);
    anchors.push({
      id: 'exit-north', action: 'go north', label: 'Follow the shell path north',
      x: 0, z: -19, radius: 3.4, hint: 'broken shells, leading into the trees',
    });
    animated.push({ kind: 'ring', mesh: gate.userData.ring });

    return {
      group, colliders, anchors, animated,
      surface: 'sand',
      fog: { color: 0x0a1016, density: 0.030 },
      ambient: { color: 0x22303c, intensity: 0.62, sky: 0x2a3a48, ground: 0x0b0d10 },
      flashlightNeed: 0.4,
      clamp(pos) {
        const r = Math.hypot(pos.x, pos.z);
        if (r > 23) { pos.x *= 23 / r; pos.z *= 23 / r; }
      },
      update(dt, t) {
        animated.forEach((a) => {
          if (a.kind === 'foam') {
            a.mesh.position.z = 12 + Math.sin(t * 0.5 + a.phase) * 1.6 + a.phase * 3;
            a.mesh.material.opacity = 0.08 + Math.abs(Math.sin(t * 0.4 + a.phase)) * 0.09;
          }
          if (a.kind === 'fire') {
            const f = 0.82 + Math.sin(t * 9.1) * 0.09 + Math.sin(t * 23.3) * 0.06;
            a.light.intensity = 14 * f;
            a.flame.scale.set(0.9 + Math.sin(t * 11) * 0.1, f, 0.9 + Math.cos(t * 13) * 0.1);
          }
          if (a.kind === 'rain') {
            const p = a.positions;
            for (let i = 0; i < p.length; i += 3) {
              p[i + 1] -= dt * 26;
              if (p[i + 1] < 0) {
                p[i + 1] = 20;
                p[i] = rnd(-26, 26);
                p[i + 2] = rnd(-26, 26);
              }
            }
            a.points.geometry.attributes.position.needsUpdate = true;
          }
          if (a.kind === 'ring') {
            a.mesh.material.opacity = 0.4 + Math.sin(t * 2.2) * 0.28;
            a.mesh.scale.setScalar(1 + Math.sin(t * 2.2) * 0.06);
          }
        });
      },
    };
  }

  /* ------------------------------------------------------------ JUNGLE */
  function buildJungle(THREE, quality) {
    const group = new THREE.Group();
    const colliders = [];
    const anchors = [];
    const animated = [];

    group.add(ground(THREE, 0x14201a, 26));

    const treeCount = quality === 'low' ? 26 : 46;
    for (let i = 0; i < treeCount; i += 1) {
      const a = (i / treeCount) * TAU + rnd(-0.1, 0.1);
      const r = rnd(7, 24);
      const x = Math.sin(a) * r;
      const z = Math.cos(a) * r;
      const h = rnd(5, 9);
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.34, h, 6), mat(THREE, 0x2b241c));
      trunk.position.set(x, h / 2, z);
      trunk.rotation.z = rnd(-0.1, 0.1);
      group.add(trunk);
      const canopy = new THREE.Mesh(
        new THREE.ConeGeometry(rnd(1.8, 3.2), rnd(3, 5), 7),
        mat(THREE, 0x0f2a1c, { roughness: 1 })
      );
      canopy.position.set(x, h + 0.8, z);
      group.add(canopy);
      if (r > 9) colliders.push({ x, z, r: 0.55, mesh: trunk });
    }

    // hanging vines
    for (let i = 0; i < 22; i += 1) {
      const a = rnd(0, TAU);
      const r = rnd(6, 20);
      const len = rnd(2, 5);
      const vine = new THREE.Mesh(
        new THREE.CylinderGeometry(0.035, 0.035, len, 4),
        mat(THREE, 0x1d3a26)
      );
      vine.position.set(Math.sin(a) * r, rnd(4, 7) - len / 2, Math.cos(a) * r);
      group.add(vine);
      animated.push({ kind: 'sway', mesh: vine, phase: rnd(0, TAU), amp: 0.05 });
    }

    // the rope
    const ropeGrp = new THREE.Group();
    const coil = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.13, 8, 20), mat(THREE, 0x9a8a60));
    coil.rotation.y = 0.4;
    const loop2 = new THREE.Mesh(new THREE.TorusGeometry(0.44, 0.1, 8, 18), mat(THREE, 0x8d7d55));
    loop2.position.set(0.1, -0.35, 0.1);
    loop2.rotation.x = 0.5;
    ropeGrp.add(coil, loop2);
    ropeGrp.position.set(5, 1.5, -4);
    group.add(ropeGrp);
    animated.push({ kind: 'sway', mesh: ropeGrp, phase: 1.1, amp: 0.12 });
    anchors.push({
      id: 'item-rope', action: 'take rope', label: 'Take the tangle of rope',
      x: 5, z: -4, radius: 2.8, hint: 'old ship\'s rope, caught in the branches',
    });

    // the thing that watches (revealed by the horror director)
    const figure = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(0.26, 0.42, 2.0, 7),
      new THREE.MeshBasicMaterial({ color: 0x000000 })
    );
    body.position.y = 1.0;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 10, 8), new THREE.MeshBasicMaterial({ color: 0x000000 }));
    head.position.y = 2.15;
    figure.add(body, head);
    figure.visible = false;
    group.add(figure);

    const gateSouth = post(THREE, 0, 19, 0x66d0ff);
    const gateNorth = post(THREE, 0, -19, 0xffb066);
    group.add(gateSouth, gateNorth);
    animated.push({ kind: 'ring', mesh: gateSouth.userData.ring });
    animated.push({ kind: 'ring', mesh: gateNorth.userData.ring });

    anchors.push({
      id: 'exit-south', action: 'go south', label: 'Back to the Beach',
      x: 0, z: 19, radius: 3.4, hint: 'the way you came',
    });
    anchors.push({
      id: 'exit-north', action: 'go north', label: 'Climb towards the dark opening',
      x: 0, z: -19, radius: 3.4, hint: 'a cave mouth, uphill',
    });

    return {
      group, colliders, anchors, animated, figure,
      surface: 'leaves',
      fog: { color: 0x06110c, density: 0.050 },
      ambient: { color: 0x1b3327, intensity: 0.55, sky: 0x1c3a2a, ground: 0x060a08 },
      flashlightNeed: 0.6,
      clamp(pos) {
        const r = Math.hypot(pos.x, pos.z);
        if (r > 23) { pos.x *= 23 / r; pos.z *= 23 / r; }
      },
      update(dt, t) {
        animated.forEach((a) => {
          if (a.kind === 'sway') {
            a.mesh.rotation.z = Math.sin(t * 0.9 + a.phase) * a.amp;
          }
          if (a.kind === 'ring') {
            a.mesh.material.opacity = 0.35 + Math.sin(t * 2.2) * 0.25;
          }
        });
      },
    };
  }

  /* -------------------------------------------------------------- CAVE */
  function buildCave(THREE, quality) {
    const group = new THREE.Group();
    const colliders = [];
    const anchors = [];
    const animated = [];

    group.add(ground(THREE, 0x241f18, 22));

    const shell = new THREE.Mesh(
      new THREE.SphereGeometry(24, 20, 14),
      new THREE.MeshStandardMaterial({ color: 0x18140f, roughness: 1, side: THREE.BackSide, flatShading: true })
    );
    shell.position.y = 2;
    group.add(shell);

    for (let i = 0; i < 34; i += 1) {
      const a = rnd(0, TAU);
      const r = rnd(4, 19);
      const len = rnd(1.2, 3.6);
      const stal = new THREE.Mesh(new THREE.ConeGeometry(rnd(0.2, 0.6), len, 6), mat(THREE, 0x211c16));
      stal.position.set(Math.sin(a) * r, rnd(5, 9), Math.cos(a) * r);
      stal.rotation.x = Math.PI;
      group.add(stal);
      if (i % 3 === 0 && r > 8) colliders.push({ x: Math.sin(a) * r, z: Math.cos(a) * r, r: 0.7, mesh: stal });
    }

    for (let i = 0; i < 14; i += 1) {
      const a = rnd(0, TAU);
      const r = rnd(9, 20);
      const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(rnd(0.5, 1.4), 0), mat(THREE, 0x2a241c));
      rock.position.set(Math.sin(a) * r, 0.4, Math.cos(a) * r);
      group.add(rock);
      colliders.push({ x: rock.position.x, z: rock.position.z, r: 1.1, mesh: rock });
    }

    // the lantern, on its rock
    const plinth = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.9, 1.1), mat(THREE, 0x2d2a24));
    plinth.position.set(4, 0.45, -3);
    group.add(plinth);
    const lantern = new THREE.Group();
    const glass = new THREE.Mesh(
      new THREE.CylinderGeometry(0.26, 0.3, 0.55, 10),
      new THREE.MeshStandardMaterial({ color: 0xffcf8a, emissive: 0xff9a3c, emissiveIntensity: 1.6, transparent: true, opacity: 0.85 })
    );
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.1, 10), mat(THREE, 0x6b6255, { metalness: 0.6, roughness: 0.4 }));
    cap.position.y = 0.33;
    const handle = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.035, 6, 12), mat(THREE, 0x6b6255, { metalness: 0.6, roughness: 0.4 }));
    handle.position.y = 0.5;
    lantern.add(glass, cap, handle);
    lantern.position.set(4, 1.2, -3);
    group.add(lantern);
    const lanternGlow = new THREE.PointLight(0xffa04a, 5, 9, 1.8);
    lanternGlow.position.set(4, 1.4, -3);
    group.add(lanternGlow);
    colliders.push({ x: 4, z: -3, r: 1.0 });
    animated.push({ kind: 'glow', light: lanternGlow, mesh: lantern, phase: 0.4 });
    anchors.push({
      id: 'item-lantern', action: 'take lantern', label: 'Take the rusted lantern',
      x: 4, z: -3, radius: 2.8, hint: 'a rusted lantern, still half full of oil',
    });

    // dripping water
    const dripCount = 260;
    const dp = new Float32Array(dripCount * 3);
    for (let i = 0; i < dripCount; i += 1) {
      dp[i * 3] = rnd(-18, 18);
      dp[i * 3 + 1] = rnd(0, 9);
      dp[i * 3 + 2] = rnd(-18, 18);
    }
    const dripGeo = new THREE.BufferGeometry();
    dripGeo.setAttribute('position', new THREE.BufferAttribute(dp, 3));
    const drips = new THREE.Points(dripGeo, new THREE.PointsMaterial({ color: 0x8fa6b0, size: 0.05, transparent: true, opacity: 0.45 }));
    group.add(drips);
    animated.push({ kind: 'drip', points: drips, positions: dp });

    const gateSouth = post(THREE, 0, 17, 0x66d0ff);
    const gateEast = post(THREE, 17, 0, 0xffb066);
    group.add(gateSouth, gateEast);
    animated.push({ kind: 'ring', mesh: gateSouth.userData.ring });
    animated.push({ kind: 'ring', mesh: gateEast.userData.ring });

    anchors.push({
      id: 'exit-south', action: 'go south', label: 'Back down to the Jungle',
      x: 0, z: 17, radius: 3.4, hint: 'daylight, far above',
    });
    anchors.push({
      id: 'exit-east', action: 'go east', label: 'Take the slope east',
      x: 17, z: 0, radius: 3.4, hint: 'you can hear the sea through the rock',
    });

    return {
      group, colliders, anchors, animated,
      surface: 'rock',
      fog: { color: 0x02040a, density: 0.075 },
      ambient: { color: 0x0d1016, intensity: 0.34, sky: 0x1a2430, ground: 0x020203 },
      flashlightNeed: 1,
      clamp(pos) {
        const r = Math.hypot(pos.x, pos.z);
        if (r > 19) { pos.x *= 19 / r; pos.z *= 19 / r; }
      },
      update(dt, t) {
        animated.forEach((a) => {
          if (a.kind === 'glow') {
            const f = 0.86 + Math.sin(t * 3.4 + a.phase) * 0.1;
            a.light.intensity = 5 * f;
            a.mesh.rotation.y = Math.sin(t * 0.5) * 0.08;
          }
          if (a.kind === 'drip') {
            const p = a.positions;
            for (let i = 0; i < p.length; i += 3) {
              p[i + 1] -= dt * 3.4;
              if (p[i + 1] < 0) p[i + 1] = 9;
            }
            a.points.geometry.attributes.position.needsUpdate = true;
          }
          if (a.kind === 'ring') {
            a.mesh.material.opacity = 0.35 + Math.sin(t * 2.2) * 0.25;
          }
        });
      },
    };
  }

  /* -------------------------------------------------------- OLD BRIDGE */
  function buildBridge(THREE) {
    const group = new THREE.Group();
    const colliders = [];
    const anchors = [];
    const animated = [];

    const nearDeck = new THREE.Mesh(new THREE.BoxGeometry(16, 1, 14), mat(THREE, 0x2a2822));
    nearDeck.position.set(0, -0.5, 12);
    const farDeck = new THREE.Mesh(new THREE.BoxGeometry(16, 1, 14), mat(THREE, 0x2a2822));
    farDeck.position.set(0, -0.5, -12);
    group.add(nearDeck, farDeck);

    // the chasm floor, far below
    const chasm = new THREE.Mesh(new THREE.PlaneGeometry(90, 40), new THREE.MeshBasicMaterial({ color: 0x02050a }));
    chasm.rotation.x = -Math.PI / 2;
    chasm.position.y = -14;
    group.add(chasm);

    // planks and ropes
    const planks = [];
    for (let i = 0; i < 14; i += 1) {
      const z = -5.5 + i * 0.85;
      const plank = new THREE.Mesh(new THREE.BoxGeometry(3.1, 0.14, 0.72), mat(THREE, 0x4a3a28));
      plank.position.set(rnd(-0.12, 0.12), 0.05, z);
      plank.rotation.z = rnd(-0.04, 0.04);
      group.add(plank);
      planks.push({ mesh: plank, base: plank.rotation.z, phase: rnd(0, TAU) });
    }
    [-1.62, 1.62].forEach((x) => {
      const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 12.5, 5), mat(THREE, 0x8b7c58));
      rope.rotation.x = Math.PI / 2;
      rope.position.set(x, 0.95, 0);
      group.add(rope);
    });
    animated.push({ kind: 'planks', planks });

    // wind-blown grit
    const gritCount = 400;
    const gp = new Float32Array(gritCount * 3);
    for (let i = 0; i < gritCount; i += 1) {
      gp[i * 3] = rnd(-14, 14);
      gp[i * 3 + 1] = rnd(0, 8);
      gp[i * 3 + 2] = rnd(-16, 16);
    }
    const gritGeo = new THREE.BufferGeometry();
    gritGeo.setAttribute('position', new THREE.BufferAttribute(gp, 3));
    const grit = new THREE.Points(gritGeo, new THREE.PointsMaterial({ color: 0xb8c2c8, size: 0.05, transparent: true, opacity: 0.35 }));
    group.add(grit);
    animated.push({ kind: 'grit', points: grit, positions: gp });

    const gateWest = post(THREE, -6.6, 12, 0x66d0ff);
    const gateNorth = post(THREE, 0, -14, 0xffb066);
    group.add(gateWest, gateNorth);
    animated.push({ kind: 'ring', mesh: gateWest.userData.ring });
    animated.push({ kind: 'ring', mesh: gateNorth.userData.ring });

    anchors.push({
      id: 'exit-west', action: 'go west', label: 'Back into the Cave',
      x: -6.6, z: 12, radius: 3.4, hint: 'the way back through the rock',
    });
    anchors.push({
      id: 'exit-north', action: 'go north', label: 'Cross to the Lighthouse',
      x: 0, z: -14, radius: 3.6, hint: 'the planks are rotting through',
    });
    anchors.push({
      id: 'swim', action: 'swim', label: 'Swim the channel instead',
      x: 8, z: 8, radius: 3.0, hint: 'black water, churning below',
    });

    return {
      group, colliders, anchors, animated,
      surface: 'wood',
      fog: { color: 0x05080c, density: 0.042 },
      ambient: { color: 0x1a2230, intensity: 0.50, sky: 0x1d2a36, ground: 0x04060a },
      flashlightNeed: 0.5,
      clamp(pos) {
        if (Math.abs(pos.z) < 6.2) {
          pos.x = Math.max(-1.35, Math.min(1.35, pos.x));
        } else {
          pos.x = Math.max(-7.4, Math.min(7.4, pos.x));
          pos.z = Math.max(-18, Math.min(18, pos.z));
        }
      },
      update(dt, t) {
        animated.forEach((a) => {
          if (a.kind === 'planks') {
            a.planks.forEach((p) => {
              p.mesh.rotation.z = p.base + Math.sin(t * 1.3 + p.phase) * 0.012;
              p.mesh.position.y = 0.05 + Math.sin(t * 1.6 + p.phase) * 0.012;
            });
          }
          if (a.kind === 'grit') {
            const p = a.positions;
            for (let i = 0; i < p.length; i += 3) {
              p[i] += dt * 2.4;
              if (p[i] > 14) p[i] = -14;
            }
            a.points.geometry.attributes.position.needsUpdate = true;
          }
          if (a.kind === 'ring') {
            a.mesh.material.color.setHex(0xffb066);
            a.mesh.material.opacity = 0.35 + Math.sin(t * 2.2) * 0.25;
          }
        });
      },
    };
  }

  /* -------------------------------------------------------- LIGHTHOUSE */
  function buildLighthouse(THREE) {
    const group = new THREE.Group();
    const colliders = [];
    const anchors = [];
    const animated = [];

    group.add(ground(THREE, 0x33322c, 20));

    const tower = new THREE.Mesh(new THREE.CylinderGeometry(3.1, 4.3, 20, 18), mat(THREE, 0x8a8377, { roughness: 0.95 }));
    tower.position.set(0, 10, -7);
    group.add(tower);
    colliders.push({ x: 0, z: -7, r: 4.5 });

    const band = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.35, 2.2, 18), mat(THREE, 0x6d2a24));
    band.position.set(0, 12.5, -7);
    group.add(band);

    const lampRoom = new THREE.Mesh(
      new THREE.CylinderGeometry(2.4, 2.4, 3, 14),
      new THREE.MeshStandardMaterial({ color: 0xffe6b0, emissive: 0x332200, emissiveIntensity: 0.4, transparent: true, opacity: 0.55 })
    );
    lampRoom.position.set(0, 21.5, -7);
    group.add(lampRoom);

    const roof = new THREE.Mesh(new THREE.ConeGeometry(2.9, 2.4, 14), mat(THREE, 0x4a443c));
    roof.position.set(0, 24.2, -7);
    group.add(roof);

    const door = new THREE.Mesh(new THREE.BoxGeometry(1.8, 2.6, 0.4), new THREE.MeshStandardMaterial({ color: 0x0a0a0a }));
    door.position.set(0, 1.3, -3.05);
    group.add(door);

    // the beam that will sweep once the beacon burns
    const beam = new THREE.Mesh(
      new THREE.ConeGeometry(3.2, 46, 12, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xffe9b8, transparent: true, opacity: 0, side: THREE.DoubleSide })
    );
    beam.rotation.z = Math.PI / 2;
    beam.position.set(0, 21.5, -7);
    group.add(beam);
    const beamLight = new THREE.SpotLight(0xffe9b8, 0, 90, 0.22, 0.6, 0.8);
    beamLight.position.set(0, 21.5, -7);
    group.add(beamLight, beamLight.target);
    animated.push({ kind: 'beam', mesh: beam, light: beamLight, on: false });

    // keeper's path stones
    for (let i = 0; i < 8; i += 1) {
      const stone = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.6, 0.12, 7), mat(THREE, 0x3d3b34));
      stone.position.set(Math.sin(i * 0.9) * 1.1, 0.06, 4 - i * 2.2);
      group.add(stone);
    }

    const gateSouth = post(THREE, 0, 15, 0x66d0ff);
    group.add(gateSouth);
    animated.push({ kind: 'ring', mesh: gateSouth.userData.ring });

    anchors.push({
      id: 'exit-south', action: 'go south', label: 'Back to the Old Bridge',
      x: 0, z: 15, radius: 3.4, hint: 'the way you came',
    });
    anchors.push({
      id: 'beacon', action: 'light beacon', label: 'Light the beacon',
      x: 0, z: -2.2, radius: 3.2, hint: 'the great beacon, cold and dark',
    });
    anchors.push({
      id: 'help', action: 'call for help', label: 'Call for help from the cliff edge',
      x: -7, z: 6, radius: 3.0, hint: 'a horn sounds far out at sea',
    });

    return {
      group, colliders, anchors, animated,
      surface: 'rock',
      fog: { color: 0x070a0f, density: 0.038 },
      ambient: { color: 0x243040, intensity: 0.55, sky: 0x24384a, ground: 0x080a0d },
      flashlightNeed: 0.5,
      clamp(pos) {
        const r = Math.hypot(pos.x, pos.z);
        if (r > 17) { pos.x *= 17 / r; pos.z *= 17 / r; }
      },
      lightBeacon() {
        const a = animated.find((x) => x.kind === 'beam');
        if (!a) return;
        a.on = true;
        a.mesh.material.opacity = 0.16;
        a.light.intensity = 180;
      },
      update(dt, t) {
        animated.forEach((a) => {
          if (a.kind === 'beam' && a.on) {
            const angle = t * 0.7;
            a.mesh.rotation.y = angle;
            a.light.target.position.set(Math.cos(angle) * 40, 0, -7 + Math.sin(angle) * 40);
            a.light.target.updateMatrixWorld();
          }
          if (a.kind === 'ring') {
            a.mesh.material.opacity = 0.35 + Math.sin(t * 2.2) * 0.25;
          }
        });
      },
    };
  }


  /* ------------------------------------------------------------- dressing
   * Small, cheap set pieces that stop each clearing reading as an empty disc:
   * driftwood, dead trees, bones, crates. Visual only (no colliders), placed
   * away from the centre so they never block a path.
   */
  function dress(THREE, group, location) {
    const rock = new THREE.MeshStandardMaterial({ color: 0x2b2c2e, roughness: 1, flatShading: true });
    const wood = new THREE.MeshStandardMaterial({ color: 0x2f2519, roughness: 1, flatShading: true });
    const bone = new THREE.MeshStandardMaterial({ color: 0x8f8a7c, roughness: 0.9, flatShading: true });
    const metal = new THREE.MeshStandardMaterial({ color: 0x3a3d40, roughness: 0.7, metalness: 0.6 });

    function put(mesh, angle, radius, y) {
      mesh.position.set(Math.cos(angle) * radius, y || 0, Math.sin(angle) * radius);
      mesh.rotation.y = rnd(0, Math.PI * 2);
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      group.add(mesh);
      return mesh;
    }
    function rocks(count, minR, maxR, scale) {
      for (let i = 0; i < count; i += 1) {
        const m = new THREE.Mesh(new THREE.DodecahedronGeometry(rnd(0.25, 0.6) * scale, 0), rock);
        put(m, rnd(0, Math.PI * 2), rnd(minR, maxR), 0.08);
      }
    }
    function logs(count, minR, maxR) {
      for (let i = 0; i < count; i += 1) {
        const len = rnd(1.6, 3.4);
        const m = new THREE.Mesh(new THREE.CylinderGeometry(rnd(0.14, 0.26), rnd(0.16, 0.3), len, 6), wood);
        m.rotation.z = Math.PI / 2;
        m.rotation.y = rnd(0, Math.PI);
        put(m, rnd(0, Math.PI * 2), rnd(minR, maxR), 0.16);
      }
    }

    if (location === 'Beach') {
      logs(5, 6, 18);
      rocks(9, 5, 20, 1);
      for (let i = 0; i < 3; i += 1) {
        const crate = new THREE.Mesh(new THREE.BoxGeometry(rnd(0.5, 0.9), rnd(0.4, 0.7), rnd(0.5, 0.9)), wood);
        put(crate, rnd(0, Math.PI * 2), rnd(7, 16), 0.3);
      }
      // The wreck's ribs, half-buried.
      for (let i = 0; i < 5; i += 1) {
        const rib = new THREE.Mesh(new THREE.BoxGeometry(0.14, rnd(1.2, 2.2), 0.14), wood);
        rib.rotation.z = rnd(-0.4, 0.4);
        put(rib, rnd(0.4, 1.4), rnd(6, 10), 0.6);
      }
    }
    if (location === 'Jungle') {
      logs(7, 5, 18);
      rocks(6, 6, 20, 0.8);
      for (let i = 0; i < 8; i += 1) {
        const stump = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.34, rnd(0.4, 0.9), 7), wood);
        put(stump, rnd(0, Math.PI * 2), rnd(5, 19), 0.2);
      }
    }
    if (location === 'Cave') {
      rocks(12, 4, 17, 1.1);
      for (let i = 0; i < 6; i += 1) {
        const rib = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, rnd(0.5, 1.1), 5), bone);
        rib.rotation.z = rnd(0, Math.PI);
        put(rib, rnd(0, Math.PI * 2), rnd(5, 14), 0.12);
      }
      const skull = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), bone);
      put(skull, 2.1, 6.5, 0.2);
    }
    if (location === 'Old Bridge') {
      for (let i = 0; i < 4; i += 1) {
        const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.9, 10), wood);
        put(barrel, rnd(0, Math.PI * 2), rnd(6, 12), 0.45);
      }
      for (let i = 0; i < 3; i += 1) {
        const postMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 1.5, 6), wood);
        put(postMesh, rnd(0, Math.PI * 2), rnd(6.5, 12), 0.75);
      }
    }
    if (location === 'Lighthouse') {
      for (let i = 0; i < 5; i += 1) {
        const crate = new THREE.Mesh(new THREE.BoxGeometry(rnd(0.5, 1), rnd(0.4, 0.8), rnd(0.5, 1)), wood);
        put(crate, rnd(0, Math.PI * 2), rnd(6, 14), 0.35);
      }
      for (let i = 0; i < 6; i += 1) {
        const link = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.05, 5, 8), metal);
        put(link, rnd(0, Math.PI * 2), rnd(5.5, 13), 0.12);
      }
      rocks(5, 8, 16, 0.7);
    }
    return group;
  }

  /* A cold moon overhead: gives every room shape and contrast without the lamp. */
  function addMoonlight(THREE, group) {
    const moon = new THREE.DirectionalLight(0xa8c4e0, 0.62);
    moon.name = 'moon';
    moon.position.set(-18, 26, -12);
    group.add(moon);
    const bounce = new THREE.DirectionalLight(0x2a3a4a, 0.28);
    bounce.name = 'moonBounce';
    bounce.position.set(16, 9, 18);
    group.add(bounce);
  }

  /* Lit stepping stones from the middle of a room to each way out, so the route
   * is visible without turning the horror into a torch-lit corridor. */
  function addPathways(THREE, group, anchors, location) {
    if (location === 'Old Bridge') return; // the crossing is already the path
    const geo = new THREE.BoxGeometry(0.62, 0.07, 0.46);
    const mat = new THREE.MeshStandardMaterial({
      color: 0x707c86, emissive: 0x2f5a6e, emissiveIntensity: 1.05, roughness: 0.95,
    });
    (anchors || []).forEach((a) => {
      if (!a || String(a.action || '').indexOf('go ') !== 0) return;
      const len = Math.hypot(a.x, a.z);
      if (len < 3) return;
      const steps = Math.min(14, Math.max(3, Math.round(len / 1.9)));
      for (let i = 1; i < steps; i += 1) {
        const t = i / steps;
        const stone = new THREE.Mesh(geo, mat);
        stone.position.set(a.x * t, 0.04, a.z * t);
        stone.rotation.y = Math.atan2(a.x, a.z) + (i % 2 ? 0.12 : -0.12);
        group.add(stone);
      }
    });
  }

  /* ------------------------------------------------------- arrival safety
   * A room can be entered from each of its exits. The arrival point sits 2.6 m
   * inside that exit, and scenery is scattered randomly in rings that overlap
   * it, so a tree or a rock could land on top of the player. These helpers are
   * the single source of truth for where the player appears, and they push any
   * blocking collider (with its mesh) clear of every arrival point.
   */
  const OPPOSITE = { north: 'south', south: 'north', east: 'west', west: 'east' };
  const ARRIVAL_INSET = 2.6;
  const PLAYER_RADIUS = 0.42;
  const SPAWN_MARGIN = 0.35;
  const FALLBACK_SPAWN = { x: 0, z: 10 };

  function arrivalPoints(anchors) {
    const points = [];
    (anchors || []).forEach((a) => {
      if (!a || String(a.action || '').indexOf('go ') !== 0) return;
      const len = Math.hypot(a.x, a.z) || 1;
      points.push({
        x: a.x - (a.x / len) * ARRIVAL_INSET,
        z: a.z - (a.z / len) * ARRIVAL_INSET,
        from: a.action.slice(3),
      });
    });
    return points;
  }

  function arrivalPoint(anchors, fromDirection) {
    const opposite = OPPOSITE[fromDirection] || null;
    const anchor = opposite && (anchors || []).find((a) => a.action === 'go ' + opposite);
    if (!anchor) return null;
    const len = Math.hypot(anchor.x, anchor.z) || 1;
    return {
      x: anchor.x - (anchor.x / len) * ARRIVAL_INSET,
      z: anchor.z - (anchor.z / len) * ARRIVAL_INSET,
      yaw: Math.atan2(-anchor.x, -anchor.z),
    };
  }

  function clearArrivals(colliders, anchors) {
    // every exit approach, plus the fallback used when there is no exit to
    // come from (this is where a new game begins)
    const points = arrivalPoints(anchors).concat([FALLBACK_SPAWN]);
    if (!points.length || !colliders) return 0;
    let moved = 0;
    for (let pass = 0; pass < 2; pass += 1) {
      colliders.forEach((c) => {
        points.forEach((p) => {
          const dx = c.x - p.x;
          const dz = c.z - p.z;
          const d = Math.hypot(dx, dz);
          const need = c.r + PLAYER_RADIUS + SPAWN_MARGIN;
          if (d >= need) return;
          const nx = d > 0.0001 ? dx / d : 1;
          const nz = d > 0.0001 ? dz / d : 0;
          const shift = need - d;
          c.x += nx * shift;
          c.z += nz * shift;
          if (c.mesh && c.mesh.position) {
            c.mesh.position.x += nx * shift;
            c.mesh.position.z += nz * shift;
          }
          moved += 1;
        });
      });
    }
    return moved;
  }

  const BUILDERS = {
    Beach: buildBeach,
    Jungle: buildJungle,
    Cave: buildCave,
    'Old Bridge': buildBridge,
    Lighthouse: buildLighthouse,
  };

  root.MI = root.MI || {};
  root.MI.world = {
    build(THREE, location, quality) {
      const fn = BUILDERS[location];
      if (!fn) throw new Error('Unknown location: ' + location);
      const kit = fn(THREE, quality || 'medium');
      kit.location = location;
      addMoonlight(THREE, kit.group);
      addPathways(THREE, kit.group, kit.anchors, location);
      clearArrivals(kit.colliders, kit.anchors);
      return kit;
    },
    locations: Object.keys(BUILDERS),
    dress,
    arrivalPoint,
    arrivalPoints,
    clearArrivals,
    PLAYER_RADIUS,
    SPAWN_MARGIN,
    ARRIVAL_INSET,
    FALLBACK_SPAWN,
  };
})(typeof window !== 'undefined' ? window : globalThis);
