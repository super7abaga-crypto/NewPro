#!/usr/bin/env python3
"""Mystery Island: The Lost Lighthouse -- terminal front end.

Run: python main.py
All game rules live in game.py; this file only talks to the player.
"""

import sys

import game

TITLE = r"""
============================================================
   MYSTERY  ISLAND  --  THE  LOST  LIGHTHOUSE
============================================================
"""

INSTRUCTIONS = """How to play
-----------
You were shipwrecked on Mystery Island. The lighthouse is dark, the old
bridge is broken, and the rescue boat only comes if the beacon burns.

* You start on the Beach with 5 energy and empty pockets.
* Every move you make costs 1 energy. Being refused costs nothing.
* The rope is in the Jungle. The lantern is in the Cave.
* Rest once at the Beach campfire to recover 2 energy.
* Cross the bridge with the rope, then light the beacon with the lantern.
* If your energy reaches 0 before the beacon burns, you lose.
"""

# Words a player may type instead of a menu number.
COMMAND_WORDS = {
    "look", "l", "look around", "inventory", "i", "bag", "items", "help", "?",
    "commands", "rest", "swim", "light beacon", "light", "light the beacon",
    "call for help", "call", "shout", "quit", "q", "exit",
}
COMMAND_PREFIXES = ("go ", "take ", "pick up ")


def is_known_command(text):
    """True when the typed text is a command, not a menu number."""
    return text in COMMAND_WORDS or text.startswith(COMMAND_PREFIXES)


def read_choice(actions):
    """Ask for a menu number until the player gives one that exists."""
    while True:
        raw = " ".join(input("\n> ").strip().lower().split())
        if not raw:
            print("Type the number of a choice, or 'help'.")
            continue
        if raw in ("help", "?", "commands"):
            print(HELP_TEXT)
            continue
        for entry in actions:
            if raw == entry["key"]:
                return entry["action"]
        if is_known_command(raw):
            return raw
        print(f"'{raw}' is not on the menu. Choose 1-{len(actions)}.")


HELP_TEXT = (
    "Type the number of a menu choice. You can also type commands such as "
    "'go north', 'take rope', 'rest', 'inventory' or 'quit'."
)


def show_menu(actions):
    print("\nWhat do you do?")
    for entry in actions:
        print(f"  {entry['key']}) {entry['label']}")


def play_once():
    """Play a full game and return the finished player state."""
    name = input("\nWhat is your name, survivor? ").strip()
    player = game.new_game(name)
    print(f"\nWelcome, {player['name']}. You have {player['energy']} energy.")
    print(game.describe_location(player))

    while not game.is_over(player):
        actions = game.available_actions(player)
        show_menu(actions)
        action = read_choice(actions)
        print(f"\n{game.apply_action(player, action)}")
        if not game.is_over(player):
            print(game.describe_location(player))

    print("\n" + game.outcome_text(player))
    return player


def main():
    print(TITLE)
    print(INSTRUCTIONS)
    while True:
        play_once()
        again = input("\nPlay again? (y/n) ").strip().lower()
        if again not in ("y", "yes"):
            print("\nStay dry out there.")
            return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (KeyboardInterrupt, EOFError):
        print("\n\nGame closed.")
        sys.exit(0)
