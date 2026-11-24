/* The four original survivors, their attributes, and the Beach <-> Bridge link.
 * Attributes are taken from the reference project's web/world.js CHARACTERS. */
import { readFileSync } from 'node:fs';

globalThis.window = globalThis;
new Function(readFileSync('src/rules.js', 'utf8'))();
const R = globalThis.MI.rules;

let pass = 0, fail = 0;
function check(name, ok, info) {
  if (ok) pass++; else fail++;
  console.log((ok ? 'PASS  | ' : 'FAIL  | ') + name.padEnd(52) + '| ' + (info === undefined ? '' : info));
}
const eq = (a, b, name) => check(name, a === b, a + ' vs ' + b);

/* ------------------------------------------------------------- the roster */
eq(R.CHARACTER_KEYS.length, 4, 'four survivors are offered');
eq(R.CHARACTER_KEYS.join(','), 'castaway,explorer,sailor,scavenger', 'the original roster, in order');

const sheet = (k) => R.CHARACTERS[k];
eq(sheet('castaway').energy, 5, 'castaway carries 5 energy');
eq(sheet('explorer').energy, 5, 'explorer carries 5 energy');
eq(sheet('sailor').energy, 6, 'sailor carries 6 energy');
eq(sheet('scavenger').energy, 4, 'scavenger carries only 4');
eq(sheet('explorer').drain, 0.75, 'explorer tires 25% slower');

/* --------------------------------------------------------- starting state */
const def = R.newGame('Ada');
eq(def.character, 'castaway', 'a run with no choice defaults to the castaway');
eq(def.energy, 5, 'and starts on 5 energy');
eq(R.newGame('Ada', 'bogus').character, 'castaway', 'an unknown survivor falls back to the castaway');

const sail = R.newGame('Ada', 'sailor');
eq(sail.energy, 6, 'the sailor starts on 6');
eq(sail.maxEnergy, 6, 'and can hold 6');
const scav = R.newGame('Ada', 'scavenger');
eq(scav.energy, 4, 'the scavenger starts on 4');

/* --------------------------------------------------------- drain behaviour */
function walk(player, times) {
  const path = ['north', 'south'];
  for (let i = 0; i < times; i++) R.applyAction(player, 'go ' + path[i % 2]);
  return player;
}
const fourPlain = walk(R.newGame('Ada', 'castaway'), 4);
eq(fourPlain.energy, 1, 'the castaway spends 1 per move');

const fourQuick = walk(R.newGame('Ada', 'explorer'), 4);
eq(fourQuick.energy, 2, 'the explorer spends only 3 across four moves');

function movesUntilDry(key) {
  const p = R.newGame('Ada', key);
  const path = ['north', 'south'];
  let n = 0;
  while (!R.isOver(p) && n < 40) { R.applyAction(p, 'go ' + path[n % 2]); n++; }
  return n;
}
const castMoves = movesUntilDry('castaway');
const expMoves = movesUntilDry('explorer');
check('the explorer lasts longer than the castaway', expMoves > castMoves, expMoves + ' moves vs ' + castMoves);

/* ------------------------------------------------------------ sailor tax */
const bridge = R.newGame('Ada', 'sailor');
bridge.location = 'Old Bridge';
bridge.inventory = ['rope'];
const beforeSail = bridge.energy;
R.applyAction(bridge, 'go north');
eq(bridge.location, 'Lighthouse', 'the sailor crosses with the rope');
eq(beforeSail - bridge.energy, 2, 'the old planks cost the sailor 1 extra');

const plainCross = R.newGame('Ada', 'castaway');
plainCross.location = 'Old Bridge';
plainCross.inventory = ['rope'];
const beforePlain = plainCross.energy;
R.applyAction(plainCross, 'go north');
eq(beforePlain - plainCross.energy, 1, 'everyone else pays the normal price');

/* ------------------------------------------------------- scavenger bonus */
const lucky = R.newGame('Ada', 'scavenger');
R.applyAction(lucky, 'go north');
eq(lucky.energy, 3, 'the scavenger is down to 3 after the walk');
R.applyAction(lucky, 'take rope');
eq(lucky.energy, 4, 'the rope pickup gives the scavenger 1 energy back');
eq(lucky.inventory.join(','), 'rope', 'and the rope is still collected');

const capped = R.newGame('Ada', 'scavenger');
capped.location = 'Jungle';
R.applyAction(capped, 'take rope');
eq(capped.energy, 4, 'the bonus never exceeds the maximum');

/* --------------------------------------------- Beach <-> Old Bridge, both ways */
const shore = R.newGame('Ada', 'castaway');
R.applyAction(shore, 'go west');
eq(shore.location, 'Old Bridge', 'the beach reaches the old bridge directly');
R.applyAction(shore, 'go east');
eq(shore.location, 'Beach', 'and the bridge returns to the beach');
eq(R.LOCATIONS.Beach.exits.west.to, 'Old Bridge', 'the link is declared on the beach');
eq(R.LOCATIONS['Old Bridge'].exits.east.to, 'Beach', 'and on the bridge');

/* the rope gate is untouched by the new link */
const noRope = R.newGame('Ada', 'castaway');
noRope.location = 'Old Bridge';
R.applyAction(noRope, 'go north');
eq(noRope.location, 'Old Bridge', 'crossing to the lighthouse still needs the rope');
check('and the refusal explains why', /rope/i.test(R.applyAction(noRope, 'go north')), 'blocked message');

/* ------------------------------------------------ save keeps the survivor */
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
  clear: () => store.clear(),
};
new Function(readFileSync('src/save.js', 'utf8'))();
const S = globalThis.MI.save;
const keeper = R.newGame('Ada', 'explorer');
keeper.inventory = ['rope'];
keeper.location = 'Cave';
S.saveGame(keeper, 'Cave');
const back = S.loadGame();
check('a saved run restores the survivor', back && back.player.character === 'explorer', back && back.player.character);
eq(back.player.maxEnergy, 5, 'with the right maximum energy');
eq(back.player.inventory.join(','), 'rope', 'and the inventory intact');

console.log('\n' + pass + ' passed, ' + fail + ' failed');
if (fail) process.exit(1);
