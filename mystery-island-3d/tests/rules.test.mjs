/* Automated tests for the browser rules port.
 *
 *   node tests/rules.test.mjs
 *
 * Two layers:
 *   1. Rule tests (the T1-T10 acceptance rules plus input, menu, rest, swim,
 *      replay and ending behaviour).
 *   2. A parity check that replays the same command sequences through the
 *      original Python engine (easy-mystery-island/game.py) and this port,
 *      then compares every message and the final state. Skipped automatically
 *      if python3 is unavailable.
 */
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { execFileSync } from 'node:child_process';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const pyCandidates = [join(root, '..', 'easy-mystery-island'), join(root, '..', 'mystery_island_check')];
const pyDir = pyCandidates.find((d) => existsSync(join(d, 'game.py')));

// Load the browser script into this process the same way a page would.
new Function(readFileSync(join(root, 'src', 'rules.js'), 'utf8'))();
const R = globalThis.MI.rules;

let passed = 0;
const failures = [];
function test(name, fn) {
  try {
    fn();
    passed += 1;
  } catch (err) {
    failures.push(name + ' :: ' + err.message);
  }
}
function eq(actual, expected, label) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error((label || 'value') + ' expected ' + e + ' but got ' + a);
}
function ok(cond, label) {
  if (!cond) throw new Error(label || 'expected truthy');
}
const snapshot = (p) => JSON.stringify(p);

// ---------------------------------------------------------------- T1
test('T1 new game starts at the Beach with 5 energy and empty pockets', () => {
  const p = R.newGame('Ada');
  eq(p.location, 'Beach', 'location');
  eq(p.energy, 5, 'energy');
  eq(p.inventory, [], 'inventory');
  eq(p.rested, false, 'rested');
  eq(p.gameOver, false, 'gameOver');
});
test('T1b blank name falls back to Player', () => {
  eq(R.newGame('   ').name, 'Player');
});

// ---------------------------------------------------------------- T2
test('T2 unknown command leaves the state unchanged', () => {
  const p = R.newGame('Ada');
  const before = snapshot(p);
  R.applyAction(p, 'dance wildly');
  eq(snapshot(p), before, 'state');
});
test('T2b blank and noisy input does not crash', () => {
  const p = R.newGame('Ada');
  const before = snapshot(p);
  ['', '   ', '!!!', 'GO', 'take', 'go'].forEach((c) => R.applyAction(p, c));
  eq(snapshot(p), before, 'state');
});
test('T2c rejected input never costs energy', () => {
  const p = R.newGame('Ada');
  R.applyAction(p, 'go south');
  eq(p.energy, 5, 'energy');
});

// ---------------------------------------------------------------- T3 / T4
test('T3 a legal move changes location and costs exactly one energy', () => {
  const p = R.newGame('Ada');
  R.applyAction(p, 'go north');
  eq(p.location, 'Jungle', 'location');
  eq(p.energy, 4, 'energy');
  eq(p.turns, 1, 'turns');
});
test('T4 a wrong direction is rejected without cost', () => {
  const p = R.newGame('Ada');
  // east is not an exit from the Beach; west now is, by CEO approval
  R.applyAction(p, 'go east');
  eq(p.location, 'Beach', 'location');
  eq(p.energy, 5, 'energy');
});
test('moves are case and space insensitive', () => {
  const p = R.newGame('Ada');
  R.applyAction(p, '  GO    NoRtH ');
  eq(p.location, 'Jungle', 'location');
});

// ---------------------------------------------------------------- T5
test('T5 the rope can be collected once only', () => {
  const p = R.newGame('Ada');
  R.applyAction(p, 'go north');
  R.applyAction(p, 'take rope');
  eq(p.inventory, ['rope'], 'inventory');
  R.applyAction(p, 'take rope');
  eq(p.inventory, ['rope'], 'inventory after retry');
});
test('T5b an item cannot be taken from the wrong location', () => {
  const p = R.newGame('Ada');
  R.applyAction(p, 'take rope');
  eq(p.inventory, [], 'inventory');
});
test('T5c an unknown item is reported, not crashed', () => {
  const p = R.newGame('Ada');
  ok(/no 'treasure'/i.test(R.applyAction(p, 'take treasure')), 'message');
});

// ---------------------------------------------------------------- T6 / T7
test('T6 the bridge cannot be crossed without the rope', () => {
  const p = R.newGame('Ada');
  ['go north', 'go north', 'go east'].forEach((a) => R.applyAction(p, a));
  eq(p.location, 'Old Bridge', 'location');
  const energy = p.energy;
  const msg = R.applyAction(p, 'go north');
  eq(p.location, 'Old Bridge', 'location after block');
  eq(p.energy, energy, 'energy after block');
  ok(/rope/i.test(msg), 'blocked message mentions the rope');
});
test('T6b canCrossBridge answers one question', () => {
  eq(R.canCrossBridge(['rope']), true);
  eq(R.canCrossBridge(['lantern']), false);
  eq(R.canCrossBridge([]), false);
  eq(R.canCrossBridge('rope'), false);
});
test('T7 the beacon cannot be lit without the lantern', () => {
  const p = R.newGame('Ada');
  ['go north', 'take rope', 'go north', 'go east', 'go north'].forEach((a) => R.applyAction(p, a));
  eq(p.location, 'Lighthouse', 'location');
  R.applyAction(p, 'light beacon');
  eq(p.won, false, 'won');
  ok(!p.gameOver, 'game still running');
});

// ---------------------------------------------------------------- T8
test('T8 the winning path works with rope and lantern', () => {
  const p = R.newGame('Ada');
  ['go north', 'take rope', 'go north', 'take lantern', 'go east', 'go north'].forEach((a) => R.applyAction(p, a));
  R.applyAction(p, 'light beacon');
  eq(p.won, true, 'won');
  eq(p.gameOver, true, 'gameOver');
  eq(p.energy, 1, 'energy');
  ok(/escaped Mystery Island/.test(R.outcomeText(p)), 'outcome text');
});

// ---------------------------------------------------------------- T9
test('T9 energy exhaustion causes a loss', () => {
  const p = R.newGame('Ada');
  // Beach -> Jungle -> Cave -> Old Bridge -> Cave -> Jungle = five moves from 5 energy
  ['go north', 'go north', 'go east', 'go west', 'go south'].forEach((a) => R.applyAction(p, a));
  eq(p.energy, 0, 'energy');
  eq(p.gameOver, true, 'gameOver');
  eq(p.won, false, 'won');
  eq(p.lossReason, 'energy', 'lossReason');
});
test('energy never goes negative', () => {
  const p = R.newGame('Ada');
  for (let i = 0; i < 20; i += 1) R.applyAction(p, 'go north');
  ok(p.energy >= 0, 'energy is ' + p.energy);
});
test('the player cannot move after the game is over', () => {
  const p = R.newGame('Ada');
  R.applyAction(p, 'quit');
  const before = snapshot(p);
  R.applyAction(p, 'go north');
  eq(snapshot(p), before, 'state');
});

// ---------------------------------------------------------------- T10
test('T10 replay resets energy, location and inventory', () => {
  const p = R.newGame('Ada');
  ['go north', 'take rope', 'go north', 'take lantern'].forEach((a) => R.applyAction(p, a));
  const fresh = R.newGame('Ada');
  eq(fresh.location, 'Beach');
  eq(fresh.energy, 5);
  eq(fresh.inventory, []);
  ok(fresh.inventory !== p.inventory, 'fresh inventory is a new object');
});

// ---------------------------------------------------------------- rest
test('rest restores two energy, once', () => {
  const p = R.newGame('Ada');
  R.applyAction(p, 'go north');
  R.applyAction(p, 'go south');
  eq(p.energy, 3, 'energy before rest');
  R.applyAction(p, 'rest');
  eq(p.energy, 5, 'energy after rest');
  R.applyAction(p, 'go north');
  R.applyAction(p, 'go south');
  R.applyAction(p, 'rest');
  eq(p.energy, 3, 'second rest is refused');
});
test('rest cannot exceed the maximum', () => {
  const p = R.newGame('Ada');
  R.applyAction(p, 'rest');
  eq(p.energy, 5, 'energy');
});
test('rest only works on the Beach', () => {
  const p = R.newGame('Ada');
  R.applyAction(p, 'go north');
  R.applyAction(p, 'rest');
  eq(p.energy, 4, 'energy unchanged');
  eq(p.rested, false, 'rested');
});

// ---------------------------------------------------------------- swim
test('swimming too tired drowns', () => {
  const p = R.newGame('Ada');
  ['go north', 'go north', 'go east'].forEach((a) => R.applyAction(p, a));
  R.applyAction(p, 'swim');
  eq(p.gameOver, true, 'gameOver');
  eq(p.won, false, 'won');
  eq(p.lossReason, 'drowned', 'lossReason');
  ok(/drowned/i.test(R.outcomeText(p)), 'ending names drowning');
});
test('swimming with energy crosses without the rope', () => {
  const p = R.newGame('Ada');
  ['go north', 'go north', 'go east'].forEach((a) => R.applyAction(p, a));
  p.energy = 5; // the rule in isolation: enough energy means you reach the far bank
  R.applyAction(p, 'swim');
  eq(p.location, 'Lighthouse', 'location');
  eq(p.gameOver, false, 'gameOver');
});
test('calling for help loses the game', () => {
  const p = R.newGame('Ada');
  ['go north', 'take rope', 'go north', 'go east', 'go north'].forEach((a) => R.applyAction(p, a));
  R.applyAction(p, 'call for help');
  eq(p.gameOver, true, 'gameOver');
  eq(p.won, false, 'won');
  eq(p.lossReason, 'help', 'lossReason');
  eq(p.energy, 1, 'energy untouched by the shout');
  ok(!/ran out of energy/i.test(R.outcomeText(p)), 'ending does not blame energy');
});

// ---------------------------------------------------------------- menu
test('the menu lists reachable locations, items and quit', () => {
  const p = R.newGame('Ada');
  const actions = R.availableActions(p).map((a) => a.action);
  ok(actions.includes('go north'), 'north exit');
  ok(actions.includes('rest'), 'rest at the beach');
  ok(actions.includes('quit'), 'quit');
  R.applyAction(p, 'go north');
  const jungle = R.availableActions(p).map((a) => a.action);
  ok(jungle.includes('take rope'), 'rope offered where it lies');
  ok(jungle.includes('go south') && jungle.includes('go north'), 'both exits');
});
test('every menu key maps to a distinct action', () => {
  const p = R.newGame('Ada');
  const actions = R.availableActions(p);
  const keys = new Set(actions.map((a) => a.key));
  eq(keys.size, actions.length, 'unique keys');
});
test('menu actions do not mutate the player', () => {
  const p = R.newGame('Ada');
  const before = snapshot(p);
  R.availableActions(p);
  eq(snapshot(p), before, 'state');
});
test('the menu is empty after game over', () => {
  const p = R.newGame('Ada');
  R.applyAction(p, 'quit');
  eq(R.availableActions(p), [], 'menu');
});

// ---------------------------------------------------------------- parity
function pythonReplay(sequences) {
  const driver = `
import json, sys
sys.path.insert(0, ${JSON.stringify(pyDir)})
import game
seqs = json.loads(sys.stdin.read())
out = []
for seq in seqs:
    p = game.new_game(seq["name"])
    msgs = [game.apply_action(p, a) for a in seq["actions"]]
    out.append({"messages": msgs, "state": {k: p[k] for k in ("location","energy","inventory","rested","turns","game_over","won","quit")}})
print(json.dumps(out))
`;
  return JSON.parse(
    execFileSync('python3', ['-c', driver], { input: JSON.stringify(sequences), encoding: 'utf8' })
  );
}

const sequences = [
  { name: 'Ada', actions: ['look', 'go north', 'take rope', 'go north', 'take lantern', 'go east', 'go north', 'light beacon'] },
  { name: 'Ada', actions: ['go north', 'go north', 'go east', 'go north'] },
  { name: 'Ada', actions: ['go north', 'go south', 'rest', 'rest', 'inventory'] },
  { name: 'Ada', actions: ['go north', 'go north', 'go east', 'swim'] },
  // 'east' is not an exit from the Beach in either build, so this still
  // proves an invalid move is rejected. ('west' now IS valid here: the CEO
  // approved the Beach <-> Old Bridge link that main.py's VALID_MOVES has.)
  { name: 'Ada', actions: ['dance', '', 'go east', 'take lantern', 'go north'] },
  { name: 'Ada', actions: ['go north', 'take rope', 'go north', 'go east', 'go north', 'call for help'] },
  { name: 'Ada', actions: ['quit'] },
  { name: 'Ada', actions: ['go north', 'go north', 'go east', 'go north', 'go south', 'go south', 'go south', 'go south'] },
  { name: '', actions: ['help', 'go north', 'north', 'rope'] },
];

if (pyDir) {
  const py = pythonReplay(sequences);
  sequences.forEach((seq, i) => {
    test('parity with game.py on sequence ' + (i + 1) + ' (' + seq.actions.length + ' commands)', () => {
      const p = R.newGame(seq.name);
      const messages = seq.actions.map((a) => R.applyAction(p, a));
      eq(messages, py[i].messages, 'messages');
      const state = {
        location: p.location, energy: p.energy, inventory: p.inventory,
        rested: p.rested, turns: p.turns, game_over: p.gameOver, won: p.won, quit: p.quit,
      };
      eq(state, py[i].state, 'final state');
    });
  });
} else {
  console.log('! python3 or game.py unavailable — parity layer skipped');
}

// ---------------------------------------------------------------- report
console.log('\n' + passed + ' passed, ' + failures.length + ' failed');
if (failures.length) {
  failures.forEach((f) => console.log('  FAIL ' + f));
  process.exit(1);
}
