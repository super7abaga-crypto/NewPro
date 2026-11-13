"""Mystery Island: The Lost Lighthouse -- pure game logic.

This module contains every rule of the game and performs no I/O: no input(),
no print(). main.py handles the terminal, this file decides what happens.
That separation is what makes the rules testable with unittest.
"""

START_LOCATION = "Beach"
START_ENERGY = 5
MAX_ENERGY = 5
SWIM_COST = 3
REST_GAIN = 2
WIN_LOCATION = "Lighthouse"

# The map. Each exit may carry a requirement: a direction that needs an item
# in the inventory, and the sentence to show when the item is missing.
LOCATIONS = {
    "Beach": {
        "description": (
            "Cold surf drags at the wreck of your boat. A campfire still "
            "smoulders above the tideline, and a path of broken shells leads "
            "north into the trees."
        ),
        "exits": {"north": {"to": "Jungle"}},
    },
    "Jungle": {
        "description": (
            "Vines hang in curtains and something rustles in the leaves. A "
            "tangle of old ship's rope is caught in the branches, and the "
            "ground rises north towards a dark opening."
        ),
        "exits": {"south": {"to": "Beach"}, "north": {"to": "Cave"}},
    },
    "Cave": {
        "description": (
            "Water drips somewhere in the dark. A rusted lantern sits on a "
            "rock, still half full of oil. A slope climbs east towards the "
            "sound of the sea."
        ),
        "exits": {"south": {"to": "Jungle"}, "east": {"to": "Old Bridge"}},
    },
    "Old Bridge": {
        "description": (
            "A rope-and-plank bridge crosses a deep channel. The planks are "
            "rotting and the water below churns. The lighthouse stands on the "
            "far side."
        ),
        "exits": {
            "west": {"to": "Cave"},
            "north": {
                "to": "Lighthouse",
                "requires": "rope",
                "blocked": (
                    "The planks crumble under your boots. Without a rope to lash "
                    "the railing you cannot cross safely."
                ),
            },
        },
    },
    "Lighthouse": {
        "description": (
            "The door hangs open. At the top of the stairs the great beacon "
            "waits, cold and dark, and a rescue boat's horn sounds far out at sea."
        ),
        "exits": {"south": {"to": "Old Bridge"}},
    },
}

ITEMS = {
    "rope": {
        "location": "Jungle",
        "label": "the tangle of rope",
        "taken": "You work the rope free of the vines. It is sound.",
    },
    "lantern": {
        "location": "Cave",
        "label": "the rusted lantern",
        "taken": "You lift the lantern from the rock. It still holds oil.",
    },
}

CROSS_BRIDGE_ITEM = "rope"
LIGHT_BEACON_ITEM = "lantern"


# --------------------------------------------------------------------------
# State
# --------------------------------------------------------------------------
def new_game(name="Player"):
    """Return a fresh player state. Every replay must start from this."""
    return {
        "name": name.strip() or "Player",
        "location": START_LOCATION,
        "energy": START_ENERGY,
        "inventory": [],
        "rested": False,
        "turns": 0,
        "game_over": False,
        "won": False,
        "quit": False,
    }


def location_data(player):
    """Return the map entry for the player's current location."""
    return LOCATIONS[player["location"]]


def describe_location(player):
    """Return a one-block description of where the player is standing."""
    here = location_data(player)
    lines = ["", f"== {player['location']} ==", here["description"]]
    loot = items_here(player)
    if loot:
        labels = ", ".join(ITEMS[item]["label"] for item in loot)
        lines.append(f"You can see {labels}.")
    lines.append(f"Energy: {player['energy']}/{MAX_ENERGY}   Inventory: {inventory_text(player)}")
    return "\n".join(lines)


def inventory_text(player):
    """Return a readable inventory, e.g. 'rope, lantern' or 'empty'."""
    return ", ".join(player["inventory"]) if player["inventory"] else "empty"


def items_here(player):
    """Return the names of items lying at the player's location, un-taken only."""
    return [
        name
        for name, item in ITEMS.items()
        if item["location"] == player["location"] and name not in player["inventory"]
    ]


def has_item(player, item_name):
    """True when the item is in the player's inventory."""
    return item_name in player["inventory"]


def can_cross_bridge(inventory):
    """True when the inventory holds what the bridge demands.

    Takes the inventory list rather than the whole player so the rule can be
    tested as a single question with a single answer.
    """
    if not isinstance(inventory, (list, tuple, set)):
        return False
    return CROSS_BRIDGE_ITEM in inventory


def can_light_beacon(player):
    """True when the player is at the lighthouse holding a lantern."""
    return player["location"] == WIN_LOCATION and has_item(player, LIGHT_BEACON_ITEM)


def is_win(player):
    return bool(player["won"])


def is_over(player):
    return bool(player["game_over"])


def is_lost(player):
    """The game ended without a win: energy gone, quit, or a losing choice."""
    return player["game_over"] and not player["won"]


def outcome_text(player):
    """Return the closing paragraph, or '' while the game is still running."""
    if player["won"]:
        return (
            f"The beacon catches, flares, and throws its light across the water. "
            f"The boat turns towards the island.\n{player['name']}, you escaped "
            f"Mystery Island with {player['energy']} energy to spare."
        )
    if player["game_over"] and player["quit"]:
        return f"{player['name']} gave up. The lighthouse stayed dark."
    if player["game_over"]:
        return (
            f"Your legs give out in the dark. The boat passes Mystery Island "
            f"without seeing you.\n{player['name']}, you ran out of energy."
        )
    return ""


# --------------------------------------------------------------------------
# Actions
# --------------------------------------------------------------------------
def available_actions(player):
    """Return the menu for the current state.

    Each entry is {'key': '1', 'label': '...', 'action': 'go north'}. The label
    is for humans, the action string is what apply_action() understands.
    """
    if player["game_over"]:
        return []

    actions = []
    for direction, exit_data in location_data(player)["exits"].items():
        needed = exit_data.get("requires")
        suffix = f" (needs {needed})" if needed and not has_item(player, needed) else ""
        actions.append(
            {
                "label": f"Go {direction} to the {exit_data['to']}{suffix}",
                "action": f"go {direction}",
            }
        )

    for item in items_here(player):
        actions.append({"label": f"Take {ITEMS[item]['label']}", "action": f"take {item}"})

    if player["location"] == "Beach" and not player["rested"]:
        actions.append({"label": "Rest by the campfire (+2 energy)", "action": "rest"})
    if player["location"] == "Old Bridge":
        actions.append(
            {"label": f"Swim the channel instead (-{SWIM_COST} energy)", "action": "swim"}
        )
    if player["location"] == "Lighthouse":
        actions.append({"label": "Light the beacon", "action": "light beacon"})
        actions.append({"label": "Call for help from the cliff edge", "action": "call for help"})

    actions.append({"label": "Look around", "action": "look"})
    actions.append({"label": "Show inventory", "action": "inventory"})
    actions.append({"label": "Quit", "action": "quit"})

    for number, entry in enumerate(actions, start=1):
        entry["key"] = str(number)
    return actions


def apply_action(player, action):
    """Apply one action to the player dict and return the message to show.

    Unknown, blank or impossible actions change nothing: they never cost
    energy, they never move the player, they never end the game.
    """
    if player["game_over"]:
        return "The game is over. Choose replay to start again."

    command = " ".join(str(action).strip().lower().split())
    if not command:
        return "Please type a number from the menu, or 'help'."

    if command in ("quit", "q", "exit", "stop"):
        player["game_over"] = True
        player["quit"] = True
        return "You sit down in the sand and wait. The lighthouse stays dark."

    if command in ("look", "l", "look around"):
        return describe_location(player)

    if command in ("inventory", "i", "bag", "items"):
        return f"You are carrying: {inventory_text(player)}."

    if command in ("help", "?", "commands"):
        return (
            "Type the number of a menu choice. You can also type "
            "'look', 'inventory', 'go north', 'take rope', 'rest', 'swim', "
            "'light beacon' or 'quit'."
        )

    if command == "rest":
        return _rest(player)

    if command == "swim":
        return _swim(player)

    if command in ("light beacon", "light", "light the beacon"):
        return _light_beacon(player)

    if command in ("call for help", "call", "shout", "shout for help"):
        return _call_for_help(player)

    if command.startswith("take ") or command.startswith("pick up "):
        item = command.split(" ", 1)[1].strip()
        item = item[3:].strip() if item.startswith("up ") else item
        return _take(player, item)

    if command.startswith("go "):
        return _move(player, command[3:].strip())

    if command in LOCATIONS[player["location"]]["exits"]:
        return _move(player, command)

    if command in ITEMS:
        return _take(player, command)

    return f"I don't understand '{action}'. Type 'help' to see your options."


def _move(player, direction):
    """Move the player one location and charge the energy for it."""
    here = location_data(player)
    exit_data = here["exits"].get(direction)
    if exit_data is None:
        return (
            f"You cannot go {direction} from the {player['location']}. "
            f"Nothing changed, and it cost you nothing."
        )

    needed = exit_data.get("requires")
    if needed and not has_item(player, needed):
        return exit_data.get("blocked", "The way is blocked.")

    player["location"] = exit_data["to"]
    message = f"You follow the trail {direction} and reach the {exit_data['to']}."
    return _spend_energy(player, exit_data.get("cost", 1), message)


def _take(player, item):
    """Pick up an item that is lying here, once only."""
    if item not in ITEMS:
        return f"There is no '{item}' to take."
    if item in player["inventory"]:
        return f"You already have the {item}."
    if ITEMS[item]["location"] != player["location"]:
        return f"There is no {item} here."
    player["inventory"].append(item)
    return ITEMS[item]["taken"]


def _rest(player):
    """Recover energy at the Beach campfire, once per game."""
    if player["location"] != "Beach":
        return "There is no safe place to rest here."
    if player["rested"]:
        return "The campfire is cold ashes now. You cannot rest here again."
    player["rested"] = True
    restored = min(REST_GAIN, MAX_ENERGY - player["energy"])
    player["energy"] += restored
    return f"You rest and dry your clothes. Energy restored to {player['energy']}/{MAX_ENERGY}."


def _swim(player):
    """Risky alternative to the bridge: costs a lot of energy, needs no rope."""
    if player["location"] != "Old Bridge":
        return "There is nothing to swim across here."
    if player["energy"] <= SWIM_COST:
        remaining = player["energy"]
        player["energy"] = 0
        player["game_over"] = True
        return (
            f"You dive into the channel with only {remaining} energy left in your "
            f"legs. The current takes you."
        )
    player["location"] = WIN_LOCATION
    return _spend_energy(
        player, SWIM_COST, "You drag yourself onto the far bank, soaked and shaking."
    )


def _light_beacon(player):
    """The winning action."""
    if player["location"] != WIN_LOCATION:
        return "There is no beacon here."
    if not has_item(player, LIGHT_BEACON_ITEM):
        return (
            "The beacon will not catch. Without a lantern and oil you are only "
            "striking sparks into the dark."
        )
    player["won"] = True
    player["game_over"] = True
    return "You strike the match and the beacon roars into life."


def _call_for_help(player):
    """A documented losing choice: shouting instead of lighting the beacon."""
    if player["location"] != WIN_LOCATION:
        return "Nobody is close enough to hear you."
    player["game_over"] = True
    return (
        "You shout into the wind until your throat is raw. The boat's lights "
        "slide past the island and disappear."
    )


def _spend_energy(player, amount, message):
    """Charge energy for a legal action and end the game if it hits zero."""
    player["energy"] = max(0, player["energy"] - amount)
    player["turns"] += 1
    if player["energy"] == 0:
        player["game_over"] = True
        return (
            f"{message}\nYou have no energy left. You sink to your knees and the "
            f"dark closes in."
        )
    return f"{message} (-{amount} energy, {player['energy']} left)"
