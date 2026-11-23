/* Structural Three.js stand-in for headless tests: records the scene graph,
 * performs no rendering. Used by dom.test.mjs and world.test.mjs. */
/* ------------------------------------------------------------ THREE mock */
export function makeThree() {
  const v3 = (x = 0, y = 0, z = 0) => ({
    x, y, z,
    set(a, b, c) { this.x = a; this.y = b; this.z = c; return this; },
    copy(v) { this.x = v.x; this.y = v.y; this.z = v.z; return this; },
    clone() { return v3(this.x, this.y, this.z); },
    add(v) { this.x += v.x; this.y += v.y; this.z += v.z; return this; },
    sub(v) { this.x -= v.x; this.y -= v.y; this.z -= v.z; return this; },
    multiplyScalar(s) { this.x *= s; this.y *= s; this.z *= s; return this; },
    normalize() {
      const l = Math.hypot(this.x, this.y, this.z) || 1;
      this.x /= l; this.y /= l; this.z /= l; return this;
    },
    lerp(v, a) { this.x += (v.x - this.x) * a; this.y += (v.y - this.y) * a; this.z += (v.z - this.z) * a; return this; },
    setScalar(s) { this.x = s; this.y = s; this.z = s; return this; },
    length() { return Math.hypot(this.x, this.y, this.z); },
    distanceTo(v) { return Math.hypot(this.x - v.x, this.y - v.y, this.z - v.z); },
  });
  const rot = () => ({ x: 0, y: 0, z: 0, set(a, b, c) { this.x = a; this.y = b; this.z = c; return this; }, copy(v) { this.x = v.x; this.y = v.y; this.z = v.z; return this; } });
  const color = (hex) => ({ hex: hex || 0, setHex(h) { this.hex = h; return this; }, set() { return this; }, getHex() { return this.hex; } });

  function node(extra) {
    const n = {
      name: '',
      position: v3(),
      rotation: rot(),
      scale: v3(1, 1, 1),
      quaternion: {},
      visible: true,
      children: [],
      userData: {},
      material: Object.assign({ color: color(), opacity: 1, dispose() {}, needsUpdate: false }, (extra && extra.material) || {}),
      geometry: { dispose() {}, attributes: { position: { needsUpdate: false } }, setAttribute() {} },
      castShadow: false,
      receiveShadow: false,
      intensity: 1,
      color: color(),
      groundColor: color(),
      target: null,
      shadow: { mapSize: { width: 0, height: 0 }, camera: { far: 0 }, bias: 0 },
      add(...kids) { this.children.push(...kids); return this; },
      remove() {},
      traverse(fn) { fn(this); this.children.forEach((c) => c && c.traverse && c.traverse(fn)); },
      lookAt() {},
      updateMatrixWorld() {},
      getWorldDirection(v) { return (v || v3()).set(0, 0, -1); },
      clone() { return node(); },
      setScalar(s) { this.scale.setScalar(s); return this; },
      updateProjectionMatrix() {},
    };
    if (extra) Object.assign(n, extra);
    return n;
  }

  const known = {
    Vector3: function (x, y, z) { return v3(x, y, z); },
    Vector2: function (x, y) { return { x, y, set(a, b) { this.x = a; this.y = b; return this; } }; },
    Color: function (hex) { return color(hex); },
    Object3D: function () { return node(); },
    Group: function () { return node(); },
    Scene: function () {
      const s = node();
      s.background = color(0);
      s.fog = null;
      s.getObjectByName = function find(name) {
        let found = null;
        s.traverse((o) => { if (!found && o.name === name) found = o; });
        return found;
      };
      return s;
    },
    Mesh: function (geo, material) { return node({ geometry: geo || node().geometry, material: material || node().material }); },
    Points: function (geo, material) { return node({ geometry: geo || node().geometry, material: material || node().material }); },
    PerspectiveCamera: function () {
      const c = node();
      c.fov = 74;
      c.aspect = 1;
      c.getWorldDirection = (v) => (v || v3()).set(0, 0, -1);
      return c;
    },
    WebGLRenderer: function () {
      return {
        domElement: {},
        shadowMap: { enabled: false, type: 0, needsUpdate: false },
        info: { render: { calls: 0 } },
        outputColorSpace: '',
        toneMapping: 0,
        toneMappingExposure: 1,
        setSize() {},
        setPixelRatio(v) { this._ratio = v; },
      getPixelRatio() { return this._ratio || 1; },
        render() { this.info.render.calls += 1; },
      };
    },
    FogExp2: function (c, d) { return { color: color(c), density: d }; },
    BufferGeometry: function () {
      return { dispose() {}, attributes: {}, setAttribute(name, value) { this.attributes[name] = value; } };
    },
    BufferAttribute: function (array, itemSize) { return { array, itemSize, needsUpdate: false }; },
    Float32BufferAttribute: function (array, itemSize) { return { array, itemSize, needsUpdate: false }; },
    MathUtils: { clamp: (v, a, b) => Math.max(a, Math.min(b, v)), lerp: (a, b, t) => a + (b - a) * t, degToRad: (d) => (d * Math.PI) / 180 },
    SRGBColorSpace: 'srgb',
    ACESFilmicToneMapping: 4,
    PCFSoftShadowMap: 2,
    BackSide: 1,
    DoubleSide: 2,
    FrontSide: 0,
    REVISION: '157-mock',
  };

  return new Proxy(known, {
    get(target, key) {
      if (key in target) return target[key];
      if (typeof key === 'symbol') return undefined;
      // Any other Three.js class (lights, geometries, materials) becomes a node.
      const ctor = function () { return node(); };
      target[key] = ctor;
      return ctor;
    },
    has() { return true; },
  });
}

