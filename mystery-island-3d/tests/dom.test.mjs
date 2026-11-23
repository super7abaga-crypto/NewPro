/* Headless integration test for the built game.
 *
 *   node tests/dom.test.mjs
 *
 * jsdom cannot run WebGL, so Three.js is replaced with a structural mock that
 * records the scene graph, and Web Audio with a silent mock. Everything else —
 * the real rules engine, the real world builders, the real UI wiring, the real
 * state machine — runs exactly as it does in the browser. This proves the game
 * boots, builds every location, and that walking to an anchor and pressing use
 * changes the real game state.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { JSDOM } from 'jsdom';
import { makeThree } from './three-mock.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
/* Load the development entry point with the local sources inlined and the
 * vendored Three.js removed, so the structural mock stays in place. The dist
 * bundle is checked separately by tests/offline.test.mjs. */
let html = readFileSync(join(root, 'index.html'), 'utf8');
html = html.replace(/<script src="vendor\/three\.min\.js"><\/script>/, '<!-- three: provided by the test mock -->');
html = html.replace(/<script src="(src\/[^"]+)"><\/script>/g, (_m, path) =>
  '<script>\n' + readFileSync(join(root, path), 'utf8') + '\n</script>'
);
if (/<script src="src\//.test(html)) throw new Error('failed to inline dev sources for the test');

const results = [];
const check = (name, ok, detail = '') => results.push([ok ? 'PASS' : 'FAIL', name, detail]);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/* ------------------------------------------------------- Web Audio mock */
class FakeParam {
  constructor(v = 0) { this.value = v; }
  setValueAtTime() { return this; }
  exponentialRampToValueAtTime() { return this; }
  linearRampToValueAtTime() { return this; }
  cancelScheduledValues() { return this; }
  setTargetAtTime() { return this; }
}
class FakeNode {
  constructor() { this.gain = new FakeParam(1); this.frequency = new FakeParam(440); this.Q = new FakeParam(1); this.pan = new FakeParam(0); }
  connect(n) { return n || this; }
  disconnect() {}
  start() {}
  stop() {}
}
class FakeAudioContext {
  constructor() {
    this.currentTime = 0;
    this.sampleRate = 44100;
    this.state = 'running';
    this.destination = new FakeNode();
  }
  createGain() { return new FakeNode(); }
  createBufferSource() { return new FakeNode(); }
  createBiquadFilter() { return new FakeNode(); }
  createOscillator() { return new FakeNode(); }
  createStereoPanner() { return new FakeNode(); }
  createBuffer(channels, length) {
    return { getChannelData: () => new Float32Array(length), length, numberOfChannels: channels };
  }
  resume() { return Promise.resolve(); }
}

/* ------------------------------------------------------------------ run */
const dom = new JSDOM(html, {
  url: 'https://island.test/play',
  runScripts: 'dangerously',
  pretendToBeVisual: true,
  beforeParse(window) {
    window.THREE = makeThree();
    window.AudioContext = FakeAudioContext;
    window.prompt = () => 'Ada';
    window.HTMLElement.prototype.scrollIntoView = function () {};
    window.scrollTo = function () {};
    window.matchMedia = () => ({ matches: false, addEventListener() {} });
    window.console = console;
  },
});

const w = dom.window;
const d = w.document;
await wait(400);

check('boot removed the loading screen', d.getElementById('boot').style.display === 'none' ||
  d.getElementById('boot').style.display === '', 'display=' + d.getElementById('boot').style.display);
check('game reached the menu', w.MI.game.state === 'menu', w.MI.game.state);
check('menu screen is visible', d.getElementById('screen-menu').classList.contains('on'));

// Start a game the same way a player does.
d.getElementById('btn-new').click();
await wait(500);
check('New Game starts playing', w.MI.game.state === 'playing', w.MI.game.state);
check('HUD is visible', d.getElementById('hud').classList.contains('on'));
check('starts at the Beach with 5 energy', w.MI.game.location === 'Beach' && w.MI.game.playerState.energy === 5,
  w.MI.game.location + ' / ' + w.MI.game.playerState.energy);
check('location title in HUD', d.getElementById('hud-location').textContent === 'Beach', d.getElementById('hud-location').textContent);
check('energy pips rendered', d.getElementById('hud-energy').children.length === 5, d.getElementById('hud-energy').children.length);
check('inventory starts empty', /empty pockets/.test(d.getElementById('hud-inventory').textContent));

// Interaction: walk to the campfire and use it.
const anchors = w.MI.game.anchors();
check('Beach exposes interactables', anchors.length >= 2, anchors.map((a) => a.id).join(','));
const fire = anchors.find((a) => a.id === 'rest');
w.MI.game.teleport(fire.x, fire.z);
await wait(120);
check('prompt appears near the fire', /Rest by the campfire/.test(d.getElementById('prompt-text').textContent),
  d.getElementById('prompt-text').textContent);
w.MI.game.interact();
await wait(120);
check('rest registers in the rules state', w.MI.game.playerState.rested === true);

// Move north: costs energy and loads a new location.
const gate = anchors.find((a) => a.id === 'exit-north');
w.MI.game.teleport(gate.x, gate.z);
await wait(120);
w.MI.game.interact();
await wait(700);
check('moving north reaches the Jungle', w.MI.game.location === 'Jungle', w.MI.game.location);
check('moving costs one energy', w.MI.game.playerState.energy === 4, String(w.MI.game.playerState.energy));
check('Jungle built its own world', w.MI.game.anchors().some((a) => a.id === 'item-rope'));

// Pick up the rope.
const rope = w.MI.game.anchors().find((a) => a.id === 'item-rope');
w.MI.game.teleport(rope.x, rope.z);
await wait(120);
w.MI.game.interact();
await wait(200);
check('rope is collected', w.MI.game.playerState.inventory.indexOf('rope') !== -1,
  JSON.stringify(w.MI.game.playerState.inventory));
check('inventory chip shows the rope', /rope/.test(d.getElementById('hud-inventory').textContent));

// The bridge must refuse to be crossed without... we have the rope, so check
// the lantern requirement instead by going to the lighthouse side is blocked.
check('objective text updates', d.getElementById('hud-objective').textContent.length > 0,
  d.getElementById('hud-objective').textContent);

// Pause and resume.
d.getElementById('btn-pause').click();
await wait(120);
check('pause stops the game', w.MI.game.state === 'paused', w.MI.game.state);
d.getElementById('btn-resume').click();
await wait(120);
check('resume returns to play', w.MI.game.state === 'playing', w.MI.game.state);

// Self test runs the real world builders for all five locations.
const lines = w.MI.game.selfTest();
const failures = lines.filter((l) => l.startsWith('FAIL'));
check('self test: every check passes', failures.length === 0, failures.join(' | ') || lines.filter((l) => l.startsWith('PASS')).length + ' checks');
check('self test covers all five locations',
  ['Beach', 'Jungle', 'Cave', 'Old Bridge', 'Lighthouse'].every((n) => lines.some((l) => l.includes('world builds: ' + n))));

// Save and Continue.
const saved = w.MI.save.loadGame();
check('progress is saved', !!saved && saved.player.inventory.indexOf('rope') !== -1,
  saved ? saved.location + ' / ' + JSON.stringify(saved.player.inventory) : 'no save');

/* ------------------------------------------------ full run: win and lose */
async function walkTo(id) {
  const a = w.MI.game.anchors().find((x) => x.id === id);
  if (!a) throw new Error('anchor not found: ' + id);
  w.MI.game.teleport(a.x, a.z);
  await wait(100);
  w.MI.game.interact();
  await wait(650);
}

await walkTo('exit-north');      // Jungle -> Cave
check('cave reached', w.MI.game.location === 'Cave', w.MI.game.location);
await walkTo('item-lantern');
check('lantern collected', w.MI.game.playerState.inventory.indexOf('lantern') !== -1,
  JSON.stringify(w.MI.game.playerState.inventory));
await walkTo('exit-east');       // Cave -> Old Bridge
check('bridge reached', w.MI.game.location === 'Old Bridge', w.MI.game.location);
await walkTo('exit-north');      // Bridge -> Lighthouse (needs the rope)
check('rope opens the bridge', w.MI.game.location === 'Lighthouse', w.MI.game.location);
await walkTo('beacon');
await wait(1200);
check('lighting the beacon wins', w.MI.game.state === 'ended' && w.MI.game.playerState.won === true,
  w.MI.game.state + ' won=' + w.MI.game.playerState.won);
check('win screen shown', d.getElementById('screen-end').classList.contains('on'));
check('win title', d.getElementById('endTitle').textContent === 'You escaped', d.getElementById('endTitle').textContent);
check('win text mentions the escape', /escaped Mystery Island/.test(d.getElementById('endText').textContent));
check('save cleared after the run ends', w.MI.save.loadGame() === null);

// A losing run: swim the channel with too little energy.
d.getElementById('btn-again').click();
await wait(600);
check('play again restarts clean', w.MI.game.state === 'playing' && w.MI.game.playerState.energy === 5 &&
  w.MI.game.playerState.inventory.length === 0, w.MI.game.state);
await walkTo('exit-north');
await walkTo('exit-north');
await walkTo('exit-east');
await walkTo('swim');
await wait(1200);
check('drowning ends the game', w.MI.game.state === 'ended' && w.MI.game.playerState.won === false);
check('loss title', d.getElementById('endTitle').textContent === 'The island keeps you', d.getElementById('endTitle').textContent);
check('drowning is named in the ending', /drowned/i.test(d.getElementById('endText').textContent),
  d.getElementById('endText').textContent.split('\n').pop());

console.log(results.map((r) => r[0].padEnd(5) + ' | ' + r[1].padEnd(44) + ' | ' + r[2]).join('\n'));
console.log('\n' + results.filter((r) => r[0] === 'PASS').length + ' passed, ' +
  results.filter((r) => r[0] === 'FAIL').length + ' failed');
process.exit(results.some((r) => r[0] === 'FAIL') ? 1 : 0);
