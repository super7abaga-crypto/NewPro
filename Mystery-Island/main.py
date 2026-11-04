from game import create_player, move_player, collect_item, light_lighthouse

BOLD = "\033[1m"
RESET = "\033[0m"

LOCATION_ITEMS = {
    "Beach": "Rope",
    "Cave": "Lantern",
}


def show_status(player):
    print(f"\n{BOLD}========== PLAYER STATUS =========={RESET}")
    print(f"Name: {player['name']}")
    print(f"Energy: {player['energy']}")
    print(f"Location: {player['location']}")
    print(f"Inventory: {player['inventory']}")
    print("===================================")


def handle_move(player):
    destination = input("Where do you want to go? ").strip().title()
    success, message = move_player(player, destination)
    print(message)

def handle_collect(player):
    item = LOCATION_ITEMS.get(player["location"])

    if item is None:
        print("There are no useful items to collect here.")
        return

    if item in player["inventory"]:
        print(f"You have already collected the {item}.")
        return

    print("\nYou search the area...")
    print(f"\nYou found an item: {BOLD}{item}{RESET}")

    handle_collection_choice(player, item)


def accept_item(player, item):
    _, message = collect_item(player, item)
    print(message)


def reject_item(player, item):
    print(f"You decided to leave the {item} behind.")
    print("You can collect it later.")


def handle_invalid_choice():
    print("Invalid choice. Please enter yes or no.")


def handle_collection_choice(player, item):
    choices = {
        "yes": accept_item,
        "y": accept_item,
        "no": reject_item,
        "n": reject_item,
    }

    while True:
        choice = input(
            f"\nWould you like to collect the {item}? (yes/no): "
        ).strip().lower()

        action = choices.get(choice)

        if action is None:
            handle_invalid_choice()
            continue

        action(player, item)
        return

def handle_status(player):
    show_status(player)

def handle_light_lighthouse(player):
    success, message = light_lighthouse(player)
    print(message)

def handle_quit(player):
    print(
        f"{BOLD}{player['name']}{RESET}, you have decided to leave the island. "
        f"We hope to see you again!"
    )
    return "quit"

ACTIONS = {
    "1": handle_move,
    "2": handle_collect,
    "3": handle_status,
    "4": handle_light_lighthouse,
    "5": handle_quit,
    "quit": handle_quit,
    "exit": handle_quit,
}

def print_menu():
    print(f"\n{BOLD}========== MAIN MENU =========={RESET}")
    print("1. Travel to another location")
    print("2. Search for an item")
    print("3. View player status")
    print("4. Light the lighthouse")
    print("5. Quit game")
    print("===============================")

def play_game():
    print("\n===================================")
    print(f"{BOLD}       MYSTERY ISLAND")
    print(f"{BOLD}      THE LOST LIGHTHOUSE{RESET}")
    print("===================================")

    name = input("Enter your name, adventurer: ").strip()

    if not name:
        name = "Player 1"

    player = create_player(name)

    print(f"\n{BOLD}Welcome, {name}!")
    print(f"{BOLD}You are stranded on a mysterious island.")
    print(f"{BOLD}Your mission is to restore the lost lighthouse.")
    print(f"{BOLD}Find the Rope and Lantern. Watch your energy!{RESET}")

    while not player["game_over"]:
        print_menu()

        choice = input("Choose an option (1-5): ").strip().lower()
        action = ACTIONS.get(choice)

        if action is None:
            print("Invalid choice. Please select an option from 1 to 5.")
            continue

        if action(player) == "quit":
            return "quit", name

    if player["won"]:
        print(f"\nCONGRATULATIONS, {BOLD}{player['name'].upper()}{RESET}!")
        print("You successfully restored the lighthouse!")
        print("Your courage has saved the island!")

    elif player["energy"] <= 0:
        print(f"\nOH NO, {BOLD}{player['name'].upper()}{RESET}!")
        print("You have exhausted all your energy.")
        print("The island has defeated you this time!")

    return "finished", name


def main():
    while True:
        result, name = play_game()

        if result == "quit":
            break

        replay = input(
            f"\n{name}, would you like to play again? (yes/no): "
        ).strip().lower()

        if replay not in ["yes", "y"]:
            break

    print("\nThank you for playing Mystery Island!")


if __name__ == "__main__":
    main()