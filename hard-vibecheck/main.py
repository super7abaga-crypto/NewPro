#!/usr/bin/env python3
"""VibeCheck AI -- Festival Feedback Detective.

Run:  python main.py

Environment (all optional; without a key the app runs in clearly labelled
offline keyword mode):
    VIBECHECK_PROVIDER   openai | openai_compatible | anthropic | gemini
    VIBECHECK_API_KEY    your key -- never committed, never printed
    VIBECHECK_MODEL      override the default model name
    VIBECHECK_BASE_URL   override the API base URL
    VIBECHECK_TIMEOUT    seconds per request (default 30)
    VIBECHECK_RETRIES    retries for 429/5xx (default 2)
"""

import sys

from app.cli import VibeCheckApp


def main(argv=None):
    argv = argv if argv is not None else sys.argv
    paths = {}
    if len(argv) > 1:
        paths["dataset"] = argv[1]
    app = VibeCheckApp(paths=paths)
    app.run()
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (KeyboardInterrupt, EOFError):
        print("\nClosed.")
        sys.exit(0)
