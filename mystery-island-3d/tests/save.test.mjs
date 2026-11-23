/* Save-data reliability.
 *
 *   node tests/save.test.mjs
 *
 * The game stores one save slot and a settings blob in localStorage. Browsers
 * lie about localStorage: private mode throws on write, sandboxed frames throw
 * on read, and a save can be corrupted by a half-finished write or by hand.
 * None of that may crash the game or resume the player into an impossible state.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const source = readFileSync(join(root, 'src', 'save.js'), 'utf8');

const results = [];
const check = (name, ok, detail = '') => results.push([ok ? 'PASS' : 'FAIL', name, detail]);
const eq = (actual, expected, name) =>
  check(name, JSON.stringify(actual) === JSON.stringify(expected), 'got ' + JSON.stringify(actual));

/** Fresh module instance with the storage behaviour we want to test. */
function loadSaveModule({ mode }) {
  const store = {};
  const localStorage = {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => {
      if (mode === 'write-throws') throw new Error('QuotaExceededError');
      store[k] = String(v);
    },
    removeItem: (k) => {
      if (mode === 'write-throws') throw new Error('SecurityError');
      delete store[k];
    },
  };
  const win = { localStorage };
  if (mode === 'blocked') {
    Object.defineProperty(win, 'localStorage', {
      get() { throw new Error('SecurityError: access denied'); },
    });
  }
  const fn = new Function('window', 'globalThis', 'var self = this;' + source);
  fn.call(win, win, win);
  return { save: win.MI.save, store };
}

const goodPlayer = {
  name: 'Ada', location: 'Jungle', energy: 4, inventory: ['rope'],
  rested: false, turns: 2, gameOver: false, won: false, quit: false,
};

/* ------------------------------------------------ normal, working storage */
{
  const { save } = loadSaveModule({ mode: 'ok' });
  check('reports persistent storage', save.persistent === true);
  check('no save before playing', save.loadGame() === null);

  save.saveGame(goodPlayer, 'Jungle');
  const loaded = save.loadGame();
  check('round-trips a save', loaded !== null);
  eq(loaded.player.inventory, ['rope'], 'inventory survives the round trip');
  eq(loaded.location, 'Jungle', 'location survives the round trip');
  eq(loaded.version, save.SAVE_VERSION, 'save is versioned');

  const described = save.describeSave();
  eq(described.name, 'Ada', 'describeSave reports the survivor');
  eq(described.energy, 4, 'describeSave reports energy');

  save.clearGame();
  check('clearing removes the save', save.loadGame() === null);

  /* ------------------------------------------------------ corrupt payloads */
  const corrupt = [
    ['not json at all', '{{{'],
    ['missing player', JSON.stringify({ version: 2, location: 'Jungle' })],
    ['unknown location', JSON.stringify({ version: 2, location: 'Atlantis', player: goodPlayer })],
    ['negative energy', JSON.stringify({ version: 2, location: 'Jungle', player: { ...goodPlayer, energy: -3 } })],
    ['energy above max', JSON.stringify({ version: 2, location: 'Jungle', player: { ...goodPlayer, energy: 99 } })],
    ['energy not a number', JSON.stringify({ version: 2, location: 'Jungle', player: { ...goodPlayer, energy: 'lots' } })],
    ['inventory not a list', JSON.stringify({ version: 2, location: 'Jungle', player: { ...goodPlayer, inventory: 'rope' } })],
    ['blank name', JSON.stringify({ version: 2, location: 'Jungle', player: { ...goodPlayer, name: '  ' } })],
    ['older save version', JSON.stringify({ version: 1, location: 'Jungle', player: goodPlayer })],
  ];
  corrupt.forEach(([label, raw]) => {
    const { save: s, store } = loadSaveModule({ mode: 'ok' });
    store['mi3d.save.v1'] = raw;
    let threw = false;
    let loadedBad = null;
    try { loadedBad = s.loadGame(); } catch (err) { threw = true; }
    check('refuses ' + label + ' without throwing', !threw && loadedBad === null);
    check('discards ' + label, !('mi3d.save.v1' in store));
  });

  /* -------------------------------------------------------------- settings */
  const defaults = save.loadSettings();
  eq(defaults.quality, 'medium', 'settings fall back to defaults');
  save.saveSettings({ volume: 999, brightness: -40, look: 'fast', quality: 'ultra', subtitles: 'yes' });
  const fixed = save.loadSettings();
  check('volume is clamped', fixed.volume === 100, String(fixed.volume));
  check('brightness is clamped', fixed.brightness === 40, String(fixed.brightness));
  check('bad look value falls back', fixed.look === 100, String(fixed.look));
  check('bad quality falls back', fixed.quality === 'medium', fixed.quality);
  check('bad subtitles flag falls back', fixed.subtitles === true, String(fixed.subtitles));
}

/* --------------------------------------------- storage that refuses writes */
{
  const { save } = loadSaveModule({ mode: 'write-throws' });
  check('detects a store that refuses writes', save.persistent === false);
  let threw = false;
  try {
    save.saveGame(goodPlayer, 'Jungle');
    save.saveSettings({ volume: 50 });
  } catch (err) { threw = true; }
  check('writing never throws', !threw);
  check('game still runs after a failed write', save.loadGame() !== null);
}

/* -------------------------------------------- storage that refuses any use */
{
  const { save } = loadSaveModule({ mode: 'blocked' });
  check('reports non-persistent storage', save.persistent === false);
  let threw = false;
  try {
    save.saveGame(goodPlayer, 'Cave');
    save.saveSettings({ volume: 20 });
    save.loadSettings();
  } catch (err) { threw = true; }
  check('no call throws when storage is denied', !threw);
  check('session-only save still readable', save.loadGame() !== null);
  eq(save.loadGame().location, 'Cave', 'session save keeps the location');

  let clearThrew = false;
  try { save.clearGame(); } catch (err) { clearThrew = true; }
  check('clearing works with no storage', !clearThrew && save.loadGame() === null);
}

const failed = results.filter((r) => r[0] === 'FAIL').length;
console.log(results.map((r) => r[0].padEnd(5) + ' | ' + r[1].padEnd(46) + ' | ' + r[2]).join('\n'));
console.log('\n' + (results.length - failed) + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
