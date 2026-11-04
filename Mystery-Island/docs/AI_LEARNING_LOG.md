# AI LEARNING LOG — MYSTERY ISLAND

## Entry 1: Dictionary-Based Function Dispatch

### Topic
Using dictionaries to connect menu choices to functions.

### What AI explained
AI explained that Python dictionaries can store functions as values. This allows a program to use a dictionary to connect a user's input to the function that should execute.

Instead of writing several `if/elif` statements for every menu option, I could use a dictionary to make the program cleaner and easier to maintain.

I also learned the difference between storing a function and calling a function:

- `handle_move` stores a reference to the function.
- `handle_move()` executes the function immediately.

### My experiment
I implemented dictionary-based function dispatch in `main.py`:

```python
ACTIONS = {
    "1": handle_move,
    "2": handle_collect,
    "3": handle_status,
    "4": handle_light_lighthouse,
    "5": handle_quit,
    "quit": handle_quit,
    "exit": handle_quit,
}
```

I tested the menu by:
- Selecting different menu options.
- Entering invalid choices.
- Using the `quit` and `exit` commands.
- Confirming that the correct handler executed.

### My conclusion
I learned that functions can be stored in dictionaries and called later. This reduces repetitive conditional statements and makes it easier to add new menu options.

I also understood how `.get()` helps prevent the program from crashing when a user enters an option that does not exist in the dictionary.

---

## Entry 2: Unit Testing and Energy Management

### Topic
Using unit tests to check program behaviour and handle boundary conditions.

### What AI explained
AI explained that unit testing involves testing individual parts of a program to confirm that they behave as expected.

I also learned about boundary testing, which involves testing situations where a value reaches an important limit.

In Mystery Island, one important boundary is when the player's energy reaches zero.

### My experiment
I used a unit test to check what happens when a player has only one energy point remaining and makes a legal move.

```python
player = create_player("Tester")
player["energy"] = 1

success, message = move_player(player, "Jungle")

self.assertTrue(success)
self.assertEqual(player["energy"], 0)
self.assertTrue(player["game_over"])
```

I also examined the energy-management logic in `game.py`:

```python
if player["energy"] <= 0:
    player["energy"] = 0
    player["game_over"] = True
    return True, "Game over, energy exhausted!"
```

I ran the unit test suite and confirmed that all 12 tests passed.

### My conclusion
I learned that testing should cover both normal situations and unusual situations that could cause problems.

By setting the player's energy to one, I could test energy exhaustion directly without needing several movements.

I also understood why the program must prevent energy from becoming negative and automatically end the game when the player runs out of energy.