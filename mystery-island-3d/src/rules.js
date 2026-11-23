/* Mystery Island: The Lost Lighthouse — pure rules engine (browser port).
 *
 * This is a 1:1 port of easy-mystery-island/game.py. Same constants, same map,
 * same messages, same win/loss conditions. It performs no I/O and touches no
 * Three.js, so every rule is testable headlessly (see tests/rules.test.mjs).
 *
 * The original CLI remains the source of truth and is untouched.
 */
(function (root) {
  'use strict';

  const START_LOCATION = 'Beach';
  const START_ENERGY = 5;
  const MAX_ENERGY = 5;
  const SWIM_COST = 3;
  const REST_GAIN = 2;
  const WIN_LOCATION = 'Lighthouse';
  const CROSS_BRIDGE_ITEM = 'rope';
  const LIGHT_BEACON_ITEM = 'lantern';

  const LOCATIONS = {
    Beach: {
      description:
        'Cold surf drags at the wreck of your boat. A campfire still smoulders above the tideline, ' +
        'and a path of broken shells leads north into the trees.',
      exits: { north: { to: 'Jungle' } },
    },
    Jungle: {
      description:
        'Vines hang in curtains and something rustles in the leaves. A tangle of old ship\'s rope is ' +
        'caught in the branches, and the ground rises north towards a dark opening.',
      exits: { south: { to: 'Beach' }, north: { to: 'Cave' } },
    },
    Cave: {
      description:
        'Water drips somewhere in the dark. A rusted lantern sits on a rock, still half full of oil. ' +
        'A slope climbs east towards the sound of the sea.',
      exits: { south: { to: 'Jungle' }, east: { to: 'Old Bridge' } },
    },
    'Old Bridge': {
      description:
        'A rope-and-plank bridge crosses a deep channel. The planks are rotting and the water below ' +
        'churns. The lighthouse stands on the far side.',
      exits: {
        west: { to: 'Cave' },
        north: {
          to: 'Lighthouse',
          requires: 'rope',
          blocked:
            'The planks crumble under your boots. Without a rope to lash the railing you cannot ' +
            'cross safely.',
        },
      },
    },
    Lighthouse: {
      description:
        'The door hangs open. At the top of the stairs the great beacon waits, cold and dark, and a ' +
        'rescue boat\'s horn sounds far out at sea.',
      exits: { south: { to: 'Old Bridge' } },
    },
  };

  const ITEMS = {
    rope: {
      location: 'Jungle',
      label: 'the tangle of rope',
      taken: 'You work the rope free of the vines. It is sound.',
    },
    lantern: {
      location: 'Cave',
      label: 'the rusted lantern',
      taken: 'You lift the lantern from the rock. It still holds oil.',
    },
  };

  // ---------------------------------------------------------------- state
  function newGame(name) {
    return {
      name: (name || '').trim() || 'Player',
      location: START_LOCATION,
      energy: START_ENERGY,
      inventory: [],
      rested: false,
      turns: 0,
      gameOver: false,
      won: false,
      quit: false,
      lossReason: null,
    };
  }

  const locationData = (player) => LOCATIONS[player.location];
  const hasItem = (player, item) => player.inventory.indexOf(item) !== -1;

  function inventoryText(player) {
    return player.inventory.length ? player.inventory.join(', ') : 'empty';
  }

  function itemsHere(player) {
    return Object.keys(ITEMS).filter(
      (name) => ITEMS[name].location === player.location && !hasItem(player, name)
    );
  }

  function describeLocation(player) {
    const here = locationData(player);
    const lines = ['', '== ' + player.location + ' ==', here.description];
    const loot = itemsHere(player);
    if (loot.length) lines.push('You can see ' + loot.map((i) => ITEMS[i].label).join(', ') + '.');
    lines.push('Energy: ' + player.energy + '/' + MAX_ENERGY + '   Inventory: ' + inventoryText(player));
    return lines.join('\n');
  }

  function canCrossBridge(inventory) {
    if (!Array.isArray(inventory)) return false;
    return inventory.indexOf(CROSS_BRIDGE_ITEM) !== -1;
  }

  const canLightBeacon = (player) =>
    player.location === WIN_LOCATION && hasItem(player, LIGHT_BEACON_ITEM);

  const isWin = (player) => !!player.won;
  const isOver = (player) => !!player.gameOver;
  const isLost = (player) => !!player.gameOver && !player.won;

  function outcomeText(player) {
    if (player.won) {
      return (
        'The beacon catches, flares, and throws its light across the water. The boat turns towards ' +
        'the island.\n' + player.name + ', you escaped Mystery Island with ' + player.energy +
        ' energy to spare.'
      );
    }
    if (player.gameOver && player.quit) return player.name + ' gave up. The lighthouse stayed dark.';
    if (player.gameOver) {
      if (player.lossReason === 'drowned') {
        return 'The channel closes over your head and the boat sails past the island.\n' +
          player.name + ', you drowned within sight of the lighthouse.';
      }
      if (player.lossReason === 'help') {
        return player.name + ', the rescue boat sailed on without you. The lighthouse stayed dark.';
      }
      return (
        'Your legs give out in the dark. The boat passes Mystery Island without seeing you.\n' +
        player.name + ', you ran out of energy.'
      );
    }
    return '';
  }

  // -------------------------------------------------------------- actions
  function availableActions(player) {
    if (player.gameOver) return [];
    const actions = [];
    const exits = locationData(player).exits;
    Object.keys(exits).forEach((direction) => {
      const exit = exits[direction];
      const needed = exit.requires;
      const suffix = needed && !hasItem(player, needed) ? ' (needs ' + needed + ')' : '';
      actions.push({ label: 'Go ' + direction + ' to the ' + exit.to + suffix, action: 'go ' + direction });
    });
    itemsHere(player).forEach((item) => {
      actions.push({ label: 'Take ' + ITEMS[item].label, action: 'take ' + item });
    });
    if (player.location === 'Beach' && !player.rested) {
      actions.push({ label: 'Rest by the campfire (+' + REST_GAIN + ' energy)', action: 'rest' });
    }
    if (player.location === 'Old Bridge') {
      actions.push({ label: 'Swim the channel instead (-' + SWIM_COST + ' energy)', action: 'swim' });
    }
    if (player.location === 'Lighthouse') {
      actions.push({ label: 'Light the beacon', action: 'light beacon' });
      actions.push({ label: 'Call for help from the cliff edge', action: 'call for help' });
    }
    actions.push({ label: 'Look around', action: 'look' });
    actions.push({ label: 'Show inventory', action: 'inventory' });
    actions.push({ label: 'Quit', action: 'quit' });
    actions.forEach((entry, i) => { entry.key = String(i + 1); });
    return actions;
  }

  function applyAction(player, action) {
    if (player.gameOver) return 'The game is over. Choose replay to start again.';
    const command = String(action == null ? '' : action).trim().toLowerCase().split(/\s+/).join(' ');
    if (!command) return "Please type a number from the menu, or 'help'.";

    if (command === 'quit' || command === 'q' || command === 'exit' || command === 'stop') {
      player.gameOver = true;
      player.quit = true;
      player.lossReason = 'quit';
      return 'You sit down in the sand and wait. The lighthouse stays dark.';
    }
    if (command === 'look' || command === 'l' || command === 'look around') return describeLocation(player);
    if (command === 'inventory' || command === 'i' || command === 'bag' || command === 'items') {
      return 'You are carrying: ' + inventoryText(player) + '.';
    }
    if (command === 'help' || command === '?' || command === 'commands') {
      return "Type the number of a menu choice. You can also type 'look', 'inventory', 'go north', " +
        "'take rope', 'rest', 'swim', 'light beacon' or 'quit'.";
    }
    if (command === 'rest') return _rest(player);
    if (command === 'swim') return _swim(player);
    if (command === 'light beacon' || command === 'light' || command === 'light the beacon') {
      return _lightBeacon(player);
    }
    if (command === 'call for help' || command === 'call' || command === 'shout' || command === 'shout for help') {
      return _callForHelp(player);
    }
    if (command.indexOf('take ') === 0 || command.indexOf('pick up ') === 0) {
      let item = command.split(' ').slice(1).join(' ').trim();
      if (item.indexOf('up ') === 0) item = item.slice(3).trim();
      return _take(player, item);
    }
    if (command.indexOf('go ') === 0) return _move(player, command.slice(3).trim());
    if (Object.prototype.hasOwnProperty.call(locationData(player).exits, command)) return _move(player, command);
    if (Object.prototype.hasOwnProperty.call(ITEMS, command)) return _take(player, command);
    return "I don't understand '" + action + "'. Type 'help' to see your options.";
  }

  function _move(player, direction) {
    const exit = locationData(player).exits[direction];
    if (!exit) {
      return 'You cannot go ' + direction + ' from the ' + player.location +
        '. Nothing changed, and it cost you nothing.';
    }
    if (exit.requires && !hasItem(player, exit.requires)) {
      return exit.blocked || 'The way is blocked.';
    }
    player.location = exit.to;
    return _spendEnergy(player, exit.cost || 1, 'You follow the trail ' + direction + ' and reach the ' + exit.to + '.');
  }

  function _take(player, item) {
    if (!Object.prototype.hasOwnProperty.call(ITEMS, item)) return "There is no '" + item + "' to take.";
    if (hasItem(player, item)) return 'You already have the ' + item + '.';
    if (ITEMS[item].location !== player.location) return 'There is no ' + item + ' here.';
    player.inventory.push(item);
    return ITEMS[item].taken;
  }

  function _rest(player) {
    if (player.location !== 'Beach') return 'There is no safe place to rest here.';
    if (player.rested) return 'The campfire is cold ashes now. You cannot rest here again.';
    player.rested = true;
    const restored = Math.min(REST_GAIN, MAX_ENERGY - player.energy);
    player.energy += restored;
    return 'You rest and dry your clothes. Energy restored to ' + player.energy + '/' + MAX_ENERGY + '.';
  }

  function _swim(player) {
    if (player.location !== 'Old Bridge') return 'There is nothing to swim across here.';
    if (player.energy <= SWIM_COST) {
      const remaining = player.energy;
      player.energy = 0;
      player.gameOver = true;
      player.lossReason = 'drowned';
      return 'You dive into the channel with only ' + remaining + ' energy left in your legs. ' +
        'The current takes you.';
    }
    player.location = WIN_LOCATION;
    return _spendEnergy(player, SWIM_COST, 'You drag yourself onto the far bank, soaked and shaking.');
  }

  function _lightBeacon(player) {
    if (player.location !== WIN_LOCATION) return 'There is no beacon here.';
    if (!hasItem(player, LIGHT_BEACON_ITEM)) {
      return 'The beacon will not catch. Without a lantern and oil you are only striking sparks into the dark.';
    }
    player.won = true;
    player.gameOver = true;
    return 'You strike the match and the beacon roars into life.';
  }

  function _callForHelp(player) {
    if (player.location !== WIN_LOCATION) return 'Nobody is close enough to hear you.';
    player.gameOver = true;
    player.lossReason = 'help';
    return "You shout into the wind until your throat is raw. The boat's lights slide past the island and disappear.";
  }

  function _spendEnergy(player, amount, message) {
    player.energy = Math.max(0, player.energy - amount);
    player.turns += 1;
    if (player.energy === 0) {
      player.gameOver = true;
      player.lossReason = 'energy';
      return message + '\nYou have no energy left. You sink to your knees and the dark closes in.';
    }
    return message + ' (-' + amount + ' energy, ' + player.energy + ' left)';
  }

  root.MI = root.MI || {};
  root.MI.rules = {
    START_LOCATION, START_ENERGY, MAX_ENERGY, SWIM_COST, REST_GAIN, WIN_LOCATION,
    CROSS_BRIDGE_ITEM, LIGHT_BEACON_ITEM, LOCATIONS, ITEMS,
    newGame, locationData, describeLocation, inventoryText, itemsHere, hasItem,
    canCrossBridge, canLightBeacon, isWin, isOver, isLost, outcomeText,
    availableActions, applyAction,
  };
})(typeof window !== 'undefined' ? window : globalThis);
