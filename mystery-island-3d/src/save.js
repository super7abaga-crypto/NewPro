/* Mystery Island 3D — persistence. Settings and a single save slot. */
(function (root) {
  'use strict';

  const SETTINGS_KEY = 'mi3d.settings.v1';
  const SAVE_KEY = 'mi3d.save.v1';
  // Bumped whenever the save shape changes. Old saves are discarded rather than
  // half-loaded into a game that would then behave strangely.
  const SAVE_VERSION = 2;
  const LOCATIONS = ['Beach', 'Jungle', 'Cave', 'Old Bridge', 'Lighthouse'];
  const MAX_ENERGY = 5;

  const DEFAULT_SETTINGS = {
    volume: 75,
    brightness: 100,
    look: 100,
    quality: 'medium',
    subtitles: true,
  };

  // Storage can be blocked (private mode, sandboxed frames). Keep a mirror so
  // the session still works and nothing throws.
  const mirror = {};
  function backend() {
    try {
      const s = root.localStorage;
      const probe = '__mi_probe__';
      s.setItem(probe, '1');
      s.removeItem(probe);
      return s;
    } catch (err) {
      return null;
    }
  }
  const store = backend();

  function read(key) {
    try {
      const raw = store ? store.getItem(key) : mirror[key];
      return raw ? JSON.parse(raw) : null;
    } catch (err) {
      return null;
    }
  }
  function write(key, value) {
    let raw;
    try { raw = JSON.stringify(value); } catch (err) { return false; }
    mirror[key] = raw;
    if (!store) return false;
    try { store.setItem(key, raw); return true; } catch (err) { return false; }
  }
  function drop(key) {
    delete mirror[key];
    try { if (store) store.removeItem(key); } catch (err) { /* ignore */ }
  }

  function clamp(num, lo, hi, fallback) {
    const n = Number(num);
    if (!isFinite(n)) return fallback;
    return Math.min(hi, Math.max(lo, n));
  }

  function loadSettings() {
    const saved = read(SETTINGS_KEY) || {};
    const quality = ['low', 'medium', 'high'].indexOf(saved.quality) === -1
      ? DEFAULT_SETTINGS.quality
      : saved.quality;
    return {
      volume: clamp(saved.volume, 0, 100, DEFAULT_SETTINGS.volume),
      brightness: clamp(saved.brightness, 40, 160, DEFAULT_SETTINGS.brightness),
      look: clamp(saved.look, 25, 300, DEFAULT_SETTINGS.look),
      quality,
      subtitles: typeof saved.subtitles === 'boolean' ? saved.subtitles : DEFAULT_SETTINGS.subtitles,
    };
  }
  function saveSettings(settings) {
    return write(SETTINGS_KEY, settings);
  }

  function validSave(data) {
    if (!data || data.version !== SAVE_VERSION) return false;
    if (LOCATIONS.indexOf(data.location) === -1) return false;
    const p = data.player;
    if (!p || typeof p !== 'object') return false;
    if (typeof p.name !== 'string' || !p.name.trim()) return false;
    if (typeof p.energy !== 'number' || !isFinite(p.energy)) return false;
    if (p.energy < 0 || p.energy > MAX_ENERGY) return false;
    if (!Array.isArray(p.inventory)) return false;
    if (p.inventory.some((item) => typeof item !== 'string')) return false;
    return true;
  }

  function hasRaw(key) {
    try {
      return !!(store ? store.getItem(key) : mirror[key]);
    } catch (err) {
      return false;
    }
  }

  function loadGame() {
    const data = read(SAVE_KEY);
    if (!data) {
      // A slot that exists but cannot be parsed is worse than no slot at all.
      if (hasRaw(SAVE_KEY)) drop(SAVE_KEY);
      return null;
    }
    if (!validSave(data)) {
      // Corrupt, hand-edited or from an older build: drop it so "Continue"
      // never resumes into an impossible state.
      drop(SAVE_KEY);
      return null;
    }
    return data;
  }
  function saveGame(player, location) {
    return write(SAVE_KEY, {
      version: SAVE_VERSION,
      player,
      location,
      savedAt: new Date().toISOString(),
    });
  }
  function clearGame() {
    drop(SAVE_KEY);
  }
  function hasGame() {
    return !!loadGame();
  }
  function describeSave() {
    const data = loadGame();
    if (!data) return null;
    const when = new Date(data.savedAt);
    const stamp = isNaN(when.getTime())
      ? ''
      : when.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) + ' ' +
        when.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
    return {
      location: data.location,
      energy: data.player.energy,
      name: data.player.name,
      stamp,
    };
  }

  root.MI = root.MI || {};
  root.MI.save = {
    DEFAULT_SETTINGS, SAVE_VERSION, loadSettings, saveSettings, loadGame, saveGame, clearGame,
    hasGame, describeSave, validSave, persistent: !!store,
  };
})(typeof window !== 'undefined' ? window : globalThis);
