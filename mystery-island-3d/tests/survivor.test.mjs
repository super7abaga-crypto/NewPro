/* Regression tests for survivor creation: the name rules and the
 * New Game -> name -> confirm -> Beach transition.
 *
 *   node tests/survivor.test.mjs
 *
 * Boots the real page in jsdom with structural Three.js and Web Audio mocks,
 * then drives the flow the way a player does: click the button, press Enter,
 * and confirm the game is actually running afterwards.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { JSDOM, VirtualConsole } from 'jsdom';
import { makeThree } from './three-mock.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');

let html = readFileSync(join(root, 'index.html'), 'utf8');
html = html.replace(/<script src="vendor\/three\.min\.js"><\/script>/, '<!-- mock -->');
html = html.replace(/<script src="(src\/[^"]+)"><\/script>/g, (_m, p) => '<script>\n' + readFileSync(join(root, p), 'utf8') + '\n</script>');
if (/<script src="src\//.test(html)) throw new Error('failed to inline sources');

const results = [];
const check = (name, ok, detail = '') => results.push([ok ? 'PASS' : 'FAIL', name, detail]);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const errors = [];
const vc = new VirtualConsole();
vc.on('jsdomError', (e) => errors.push(String(e && e.message ? e.message : e)));

function audioNode() {
  const p = { value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {}, linearRampToValueAtTime() {}, cancelScheduledValues() {}, setTargetAtTime() {} };
  return { gain: p, frequency: p, Q: p, pan: p, detune: p, type: '', buffer: null, loop: false, connect(n) { return n; }, disconnect() {}, start() {}, stop() {} };
}

const dom = new JSDOM(html, {
  url: 'https://island.test/play',
  runScripts: 'dangerously',
  pretendToBeVisual: true,
  virtualConsole: vc,
  beforeParse(w) {
    w.THREE = makeThree();
    w.HTMLCanvasElement.prototype.getContext = () => null; // no 2d canvas in jsdom
    w.AudioContext = class {
      constructor() { this.state = 'running'; this.currentTime = 0; this.sampleRate = 44100; this.destination = {}; }
      createGain() { return audioNode(); } createBufferSource() { return audioNode(); }
      createBiquadFilter() { return audioNode(); } createOscillator() { return audioNode(); }
      createStereoPanner() { return audioNode(); }
      createBuffer(c, l) { return { getChannelData: () => new Float32Array(l) }; }
      resume() { return Promise.resolve(); }
    };
  },
});

const w = dom.window;
const d = w.document;
await wait(400);

/* --------------------------------------------------- A. name acceptance */
const validate = (n) => w.MI.game.validateName(n);

const ACCEPT = [
  'Myles', 'John Paul', "O'Connor", 'O\u2019Connor', 'Jean-Luc', 'Chukwuemeka',
  'José', 'Ñoño', 'Zoë', 'Аня', 'Björk', 'Anne-Marie', "Niamh O'Neill", '李雷',
];
ACCEPT.forEach((name) => {
  const r = validate(name);
  check('accepts "' + name + '"', r.ok === true, r.ok ? r.name : r.error);
});

const REJECT = [
  ['', 'empty'],
  ['   ', 'only spaces'],
  ['   ', 'whitespace'],
  ['x'.repeat(40), 'far too long'],
];
REJECT.forEach(([name, why]) => {
  const r = validate(name);
  check('rejects ' + why, r.ok === false && !!r.error, r.error || 'accepted: ' + r.name);
});

check('trims and collapses spaces', validate('   John    Paul  ').name === 'John Paul',
  JSON.stringify(validate('   John    Paul  ').name));
check('a single-letter name is allowed', validate('A').ok === true, 'A');
check('digits alone are allowed, as in the original CLI', validate('123').ok === true, '123');
check('a bare accent mark still passes as a non-empty name', validate('\u0301').ok === true, 'combining mark');
check('a two-letter name passes', validate('Bo').ok === true);
check('length limit is 24', validate('a'.repeat(24)).ok === true && validate('a'.repeat(25)).ok === false);

/* ------------------------------------- B. the transition into gameplay */
check('menu is up', w.MI.game.state === 'menu', w.MI.game.state);
d.getElementById('btn-new').click();
await wait(250);
check('New Game opens survivor creation', d.getElementById('screen-survivor').classList.contains('on'));

const input = d.getElementById('survivor-name');
input.value = 'José';
check('the field accepts an accented name', input.value === 'José', input.value);
check('no native constraint blocks submit', d.getElementById('form-survivor').checkValidity() === true);

d.getElementById('survivor-go').click();
await wait(600);

check('confirming starts the game', w.MI.game.state === 'playing', w.MI.game.state);
check('survivor screen is gone', !d.getElementById('screen-survivor').classList.contains('on'));
check('HUD is on', d.getElementById('hud').classList.contains('on'));
check('player is at the Beach', w.MI.game.location === 'Beach', w.MI.game.location);
check('energy is 5', w.MI.game.playerState.energy === 5, String(w.MI.game.playerState.energy));
check('the name is carried into the story', w.MI.game.playerState.name === 'José', w.MI.game.playerState.name);
check('no error is left on screen', d.getElementById('survivor-error').textContent === '',
  d.getElementById('survivor-error').textContent);

const player = w.MI.game.player;
const cam = w.MI.game.camera;
const back = Math.hypot(cam.position.x - player.pos.x, cam.position.z - player.pos.z);
check('third-person character exists', !!(player.character && player.character.group));
check('camera sits behind the player', back > 3 && back < 12, back.toFixed(2) + ' m back');
check('camera is above the player', cam.position.y > 1.4, cam.position.y.toFixed(2));

check('guidance names the next step', (d.getElementById('guide-text').textContent || '').length > 0,
  d.getElementById('guide-text').textContent);
check('objective line is filled', (d.getElementById('hud-objective').textContent || '').length > 0,
  d.getElementById('hud-objective').textContent);
check('minimap canvas is present', !!d.getElementById('minimap'));

const before = { x: player.pos.x, z: player.pos.z };
for (let i = 0; i < 20; i += 1) player.update(0.033, { forward: 1, right: 0, lookX: 0, lookY: 0 });
const moved = Math.hypot(player.pos.x - before.x, player.pos.z - before.z);
check('the player can move immediately', moved > 0.3, moved.toFixed(2) + ' m');
check('the character followed the player', player.character.group.position.x === player.pos.x ||
  Math.abs(player.character.group.position.x - player.pos.x) < 0.01, 'x=' + player.character.group.position.x);

/* --------------------------------- Enter key path and error visibility */
// leave the run the way a player does: pause, then quit to the menu
d.getElementById('btn-quit').click();
await wait(250);
check('quitting returns to the menu', w.MI.game.state === 'menu', w.MI.game.state);
d.getElementById('btn-new').click();
await wait(200);
const input2 = d.getElementById('survivor-name');
input2.value = '';
d.getElementById('survivor-go').click();
await wait(200);
check('an empty name keeps the player on the screen', w.MI.game.state === 'menu', w.MI.game.state);
check('the reason is shown to the player', d.getElementById('survivor-error').textContent.length > 0,
  d.getElementById('survivor-error').textContent);
check('the confirm button is usable again', d.getElementById('survivor-go').disabled === false);

input2.value = 'Myles';
input2.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
await wait(600);
check('pressing Enter also starts the game', w.MI.game.state === 'playing', w.MI.game.state);
check('and lands at the Beach', w.MI.game.location === 'Beach', w.MI.game.location);

check('no uncaught errors during the flow', errors.length === 0, errors.slice(0, 3).join(' | '));

/* ------------------------------------------------------------- report */
console.log(results.map((r) => r[0].padEnd(5) + ' | ' + r[1].padEnd(48) + ' | ' + r[2]).join('\n'));
const failed = results.filter((r) => r[0] === 'FAIL').length;
console.log('\n' + (results.length - failed) + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
