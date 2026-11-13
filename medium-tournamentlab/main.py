#!/usr/bin/env python3
"""TournamentLab -- Esports League Manager.

Run:  python main.py [season.json]
      The optional argument is the default file used by the save/load options.
"""

import sys

from tournament.cli import main as cli_main


def main(argv):
    print(__doc__.strip().splitlines()[0])
    return cli_main(argv)


if __name__ == "__main__":
    sys.exit(main(sys.argv))
