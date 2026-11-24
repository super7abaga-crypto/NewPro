/* Mystery Island 3D — weather and atmosphere.
 *
 * Wind, mist, falling leaves and water ripples, adapted from the reference
 * project's environmental layer. Kept in one module so it can be swapped per
 * location without touching the world builders, and so the particle budget
 * stays visible in one place.
 */
(function (root) {
  'use strict';

  const PRESETS = {
    Beach: { mist: 0.35, leaves: 0, ripples: 1, sway: 0.5, wind: 0.55 },
    Jungle: { mist: 0.7, leaves: 1, ripples: 0, sway: 1, wind: 0.8 },
    Cave: { mist: 0.5, leaves: 0, ripples: 0.3, sway: 0, wind: 0.15 },
    'Old Bridge': { mist: 0.8, leaves: 0.2, ripples: 1, sway: 0.4, wind: 1 },
    Lighthouse: { mist: 0.4, leaves: 0, ripples: 0.4, sway: 0.3, wind: 0.9 },
  };

  const BUDGET = { high: 1, medium: 0.7, low: 0.4 };

  let THREE = null;
  let scene = null;
  let group = null;
  let preset = PRESETS.Beach;
  let leaves = null;
  let mist = [];
  let ripples = [];
  let swayers = [];
  let t = 0;

  function clear() {
    if (group && scene) {
      scene.remove(group);
      group.traverse((o) => {
        if (o.geometry && o.geometry.dispose) o.geometry.dispose();
        if (o.material && o.material.dispose) o.material.dispose();
      });
    }
    group = null; leaves = null; mist = []; ripples = []; swayers = [];
  }

  function enter(T, S, location, kit, quality) {
    THREE = T; scene = S;
    clear();
    preset = PRESETS[location] || PRESETS.Beach;
    const scale = BUDGET[quality] || 1;
    group = new THREE.Group();
    group.name = 'weather';
    scene.add(group);

    /* ------------------------------------------------------------- mist */
    const mistCount = Math.round(7 * preset.mist * scale);
    for (let i = 0; i < mistCount; i++) {
      const geo = new THREE.PlaneGeometry(22 + Math.random() * 10, 22 + Math.random() * 10);
      const mat = new THREE.MeshBasicMaterial({
        color: 0x9fb6c4, transparent: true, opacity: 0.05 + Math.random() * 0.05,
        depthWrite: false, side: THREE.DoubleSide,
      });
      const m = new THREE.Mesh(geo, mat);
      m.rotation.x = -Math.PI / 2;
      m.position.set((Math.random() - 0.5) * 30, 0.6 + Math.random() * 1.8, (Math.random() - 0.5) * 30);
      m.userData.drift = 0.2 + Math.random() * 0.4;
      m.userData.phase = Math.random() * Math.PI * 2;
      group.add(m);
      mist.push(m);
    }

    /* ----------------------------------------------------------- leaves */
    const leafCount = Math.round(70 * preset.leaves * scale);
    if (leafCount > 0) {
      const positions = new Float32Array(leafCount * 3);
      const speeds = new Float32Array(leafCount);
      for (let i = 0; i < leafCount; i++) {
        positions[i * 3] = (Math.random() - 0.5) * 34;
        positions[i * 3 + 1] = Math.random() * 9;
        positions[i * 3 + 2] = (Math.random() - 0.5) * 34;
        speeds[i] = 0.4 + Math.random() * 0.9;
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      leaves = new THREE.Points(geo, new THREE.PointsMaterial({
        color: 0x7f8f4a, size: 0.13, transparent: true, opacity: 0.75, depthWrite: false,
      }));
      leaves.userData.speeds = speeds;
      group.add(leaves);
    }

    /* ---------------------------------------------------------- ripples */
    const rippleCount = Math.round(10 * preset.ripples * scale);
    for (let i = 0; i < rippleCount; i++) {
      const geo = new THREE.RingGeometry(0.3, 0.42, 20);
      const mat = new THREE.MeshBasicMaterial({
        color: 0xbfe0ef, transparent: true, opacity: 0.2, side: THREE.DoubleSide, depthWrite: false,
      });
      const r = new THREE.Mesh(geo, mat);
      r.rotation.x = -Math.PI / 2;
      const zone = kit && kit.water && kit.water.length ? kit.water[0] : null;
      const cx = zone ? (zone.x0 + zone.x1) / 2 : 0;
      const cz = zone ? (zone.z0 + zone.z1) / 2 : 16;
      r.position.set(cx + (Math.random() - 0.5) * 14, (zone ? zone.level : 0) + 0.03, cz + (Math.random() - 0.5) * 8);
      r.userData.phase = Math.random();
      group.add(r);
      ripples.push(r);
    }

    /* --------------------------------------------- wind on tall vegetation */
    swayers = [];
    if (kit && kit.group && preset.sway > 0) {
      const box = new THREE.Box3();
      kit.group.traverse((o) => {
        if (!o.isMesh || !o.geometry) return;
        box.setFromObject(o);
        const size = new THREE.Vector3();
        box.getSize(size);
        // tall and narrow reads as a trunk or a stem
        if (size.y > 3 && size.y < 12 && Math.max(size.x, size.z) < 1.6) {
          o.userData.swayBase = o.rotation.z;
          o.userData.swayPhase = Math.random() * Math.PI * 2;
          swayers.push(o);
        }
      });
    }
  }

  function update(dt, playerPos, camera) {
    if (!group) return;
    t += dt;
    const wind = preset.wind;

    for (let i = 0; i < mist.length; i++) {
      const m = mist[i];
      m.position.x += Math.sin(t * 0.2 + m.userData.phase) * dt * m.userData.drift * wind;
      m.position.z += Math.cos(t * 0.16 + m.userData.phase) * dt * m.userData.drift * wind;
    }

    if (leaves) {
      const pos = leaves.geometry.attributes.position;
      const arr = pos.array;
      const speeds = leaves.userData.speeds;
      for (let i = 0; i < speeds.length; i++) {
        const iy = i * 3 + 1;
        arr[iy] -= speeds[i] * dt * 0.55;
        arr[i * 3] += Math.sin(t * 0.9 + i) * dt * 0.45 * wind;
        arr[i * 3 + 2] += Math.cos(t * 0.7 + i) * dt * 0.35 * wind;
        if (arr[iy] < 0.05) {
          arr[iy] = 8 + Math.random() * 3;
          arr[i * 3] = (Math.random() - 0.5) * 34;
          arr[i * 3 + 2] = (Math.random() - 0.5) * 34;
        }
      }
      pos.needsUpdate = true;
    }

    for (let i = 0; i < ripples.length; i++) {
      const r = ripples[i];
      r.userData.phase = (r.userData.phase + dt * 0.35) % 1;
      const s = 1 + r.userData.phase * 4;
      r.scale.set(s, s, s);
      r.material.opacity = 0.22 * (1 - r.userData.phase);
    }

    for (let i = 0; i < swayers.length; i++) {
      const o = swayers[i];
      const base = o.userData.swayBase || 0;
      o.rotation.z = base + Math.sin(t * 0.9 + o.userData.swayPhase) * 0.035 * wind * preset.sway;
    }
  }

  root.MI = root.MI || {};
  root.MI.weather = { enter, update, clear, PRESETS, get current() { return preset; } };
})(typeof window !== 'undefined' ? window : globalThis);
