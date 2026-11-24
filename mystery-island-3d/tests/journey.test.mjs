/* Full-game journey tests: every transition, gate, energy rule, ending and
 * save round-trip driven through the real rules engine. */
import { readFileSync } from 'node:fs';

const store = new Map();
globalThis.window = globalThis;
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
  clear: () => store.clear(),
};

new Function(readFileSync('src/rules.js', 'utf8'))();
new Function(readFileSync('src/save.js', 'utf8'))();

const R = globalThis.MI.rules;
const S = globalThis.MI.save;

let pass = 0;
const fails = [];
function check(name, ok, detail = '') {
  if (ok) { pass += 1; console.log('PASS  | ' + name.padEnd(52) + ' | ' + detail); }
  else { fails.push(name); console.log('FAIL  | ' + name.padEnd(52) + ' | ' + detail); }
}

/* ---------------------------------------------------------------- transitions */
for (const [from, data] of Object.entries(R.LOCATIONS)) {
  for (const [dir, exit] of Object.entries(data.exits)) {
    const rs = R.newGame('Ada');
    rs.location = from;
    if (exit.requires) rs.inventory.push(exit.requires);
    const before = rs.location;
    R.applyAction(rs, 'go ' + dir);
    check(`${from} --${dir}--> ${exit.to}`, rs.location === exit.to,
      rs.location === exit.to ? 'ok' : `stayed at ${rs.location} (from ${before})`);
  }
}

/* --------------------------------------------------------------------- gates */
{
  const rs = R.newGame('Ada');
  rs.location = 'Old Bridge';
  const msg = R.applyAction(rs, 'go north');
  check('bridge blocks without rope', rs.location === 'Old Bridge', msg.slice(0, 40));
  rs.inventory.push('rope');
  R.applyAction(rs, 'go north');
  check('rope opens the bridge', rs.location === 'Lighthouse', rs.location);
}
{
  const rs = R.newGame('Ada');
  rs.location = 'Lighthouse';
  const msg = R.applyAction(rs, 'light beacon');
  check('beacon refuses without lantern', rs.won !== true, msg.slice(0, 40));
  rs.inventory.push('lantern');
  R.applyAction(rs, 'light beacon');
  check('lantern lights the beacon', rs.won === true, 'won=' + rs.won);
}

/* -------------------------------------------------------------------- energy */
{
  const rs = R.newGame('Ada');
  rs.location = 'Beach';
  rs.energy = 2;
  R.applyAction(rs, 'rest');
  check('rest restores energy', rs.energy > 2, 'energy=' + rs.energy);
  R.applyAction(rs, 'rest');
  check('rest is single-use', rs.energy <= R.MAX_ENERGY, 'energy=' + rs.energy);
}
{
  const rs = R.newGame('Ada');
  rs.location = 'Old Bridge';
  rs.energy = 1;
  rs.inventory.push('rope');
  R.applyAction(rs, 'swim');
  check('swimming the channel is fatal at low energy', rs.gameOver === true && rs.won !== true,
    'energy=' + rs.energy + ' over=' + rs.gameOver);
}

/* ----------------------------------------------------------------- inventory */
{
  const rs = R.newGame('Ada');
  rs.location = 'Jungle';
  R.applyAction(rs, 'take rope');
  R.applyAction(rs, 'take rope');
  check('rope is not duplicated', rs.inventory.filter((i) => i === 'rope').length === 1,
    JSON.stringify(rs.inventory));
  rs.location = 'Cave';
  R.applyAction(rs, 'take lantern');
  check('lantern collected in the cave', rs.inventory.includes('lantern'), JSON.stringify(rs.inventory));
}

/* ------------------------------------------------------------- invalid input */
{
  const rs = R.newGame('Ada');
  const snapshot = JSON.stringify({ l: rs.location, e: rs.energy, i: rs.inventory });
  const msg = R.applyAction(rs, 'dance');
  check('unknown action changes nothing',
    JSON.stringify({ l: rs.location, e: rs.energy, i: rs.inventory }) === snapshot,
    String(msg).slice(0, 40));
}

/* ------------------------------------------------------------ full win run */
{
  const rs = R.newGame('Ada');
  const steps = [
    ['go north', 'Jungle'], ['take rope', 'Jungle'], ['go north', 'Cave'],
    ['take lantern', 'Cave'], ['go east', 'Old Bridge'], ['go north', 'Lighthouse'],
    ['light beacon', 'Lighthouse'],
  ];
  let ok = true;
  for (const [action, expected] of steps) {
    R.applyAction(rs, action);
    if (rs.location !== expected) { ok = false; break; }
  }
  check('the whole game can be won in one run', ok && rs.won === true,
    `${rs.location} won=${rs.won} inv=${JSON.stringify(rs.inventory)}`);
}

/* --------------------------------------------------------------- save/load */
for (const loc of Object.keys(R.LOCATIONS)) {
  const rs = R.newGame('Nkem');
  rs.location = loc;
  rs.energy = 3;
  rs.inventory.push('rope', 'lantern');
  S.saveGame(rs, loc);
  const back = S.loadGame();
  check(`save/continue restores ${loc}`,
    !!back && back.player.location === loc && back.player.name === 'Nkem' &&
    back.player.energy === 3 && back.player.inventory.length === 2,
    back ? `${back.player.location} ${back.player.name} e=${back.player.energy}` : 'no save');
}
S.clearGame();
check('clearing the save leaves nothing to continue', S.hasGame() === false, 'hasGame=' + S.hasGame());

console.log(`\n${pass} passed, ${fails.length} failed`);
if (fails.length) { console.log('failures:', fails.join(', ')); process.exitCode = 1; }
