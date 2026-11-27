#!/usr/bin/env bash
# Enforce the documentation evidence rules. See tools/check_docs.py.
set -euo pipefail

cd "$(dirname "$0")/.."

# On Windows, `python3` can be the Microsoft Store stub; verify the interpreter runs.
for candidate in python3 python py; do
    if command -v "$candidate" >/dev/null 2>&1 && "$candidate" -c 'import sys' >/dev/null 2>&1; then
        exec "$candidate" tools/check_docs.py "$@"
    fi
done

echo "check-docs: no working Python interpreter found" >&2
exit 1
