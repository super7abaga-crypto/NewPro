LOCATIONS = [
    "Beach",
    "Jungle",
    "Cave",
    "Old Bridge",
    "Lighthouse",
]

# item -> the only location where it can be collected
ITEM_LOCATIONS = {
    "Rope": "Beach",
    "Lantern": "Cave",
}

# destination -> (required item, message shown if the player lacks it)
REQUIREMENTS = {
    "Old Bridge": ("Rope", "You need a rope to cross the bridge."),
}

def create_player(name):
    return {
        "name": name,
        "energy": 5,
        "location": "Beach",
        "inventory": [],
        "game_over": False,
        "won": False,
    }

def move_player(player, destination):
    if player["game_over"]:
        return False, "The game has already ended."

    if destination not in LOCATIONS:
        return False, "That location does not exist."

    current = LOCATIONS.index(player["location"])
    target = LOCATIONS.index(destination)

    if abs(target - current) != 1:
        return False, "You cannot jump directly there."

    requirement = REQUIREMENTS.get(destination)

    if requirement:
        required_item, message = requirement
        if required_item not in player["inventory"]:
            return False, message

    player["energy"] -= 1
    player["location"] = destination

    if player["energy"] <= 0:
        player["energy"] = 0
        player["game_over"] = True
        return True, "Game over, energy exhausted!"

    return True, f"You have travelled to {destination}."

def collect_item(player, item):
    if player["game_over"]:
        return False, "The game has already ended."

    required_location = ITEM_LOCATIONS.get(item)

    if required_location is None:
        return False, "This item is not available."

    if item in player["inventory"]:
        return False, f"You already have {item}."

    if player["location"] != required_location:
        return False, f"You can only find {item} at the {required_location}."

    player["inventory"].append(item)

    return True, f"You collected the {item}!"

def light_lighthouse(player):
    if player["game_over"]:
        return False, "The game has already ended."

    if player["location"] != "Lighthouse":
        return False, "You must reach the Lighthouse first."

    if "Lantern" not in player["inventory"]:
        return False, "You need a lantern to light the lighthouse."

    player["won"] = True
    player["game_over"] = True

    return True, "Congratulations! You have restored the lighthouse!"