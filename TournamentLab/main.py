
from teams import register_team, MAX_TEAMS

BLUE = "\033[94m"
GREEN = "\033[92m"
BOLD = "\033[1m"
RESET = "\033[0m"


teams = []

print(BLUE + BOLD + "================================")
print("       TOURNAMENTLAB")
print("================================" + RESET)

while len(teams) < MAX_TEAMS:
    print(f"\nRegistering team {len(teams) + 1} of {MAX_TEAMS}")

    name = input("Enter team name: ")

    try:
        team = register_team(name, teams)
        print(GREEN + f"Success! {team['name']} registered with ID {team['id']}." + RESET)

    except ValueError as error:
        print(f"Error: {error}")

print("\nAll 10 teams have been registered!")

print("\nREGISTERED TEAMS")

for team in teams:
    print(f"{team['id']} - {team['name']}")
