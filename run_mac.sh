#!/bin/sh
set -eu

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
cd "$SCRIPT_DIR"

if [ ! -x ".venv/bin/python" ]; then
  echo "Python virtual environment not found at .venv/bin/python"
  echo "Create it first with:"
  echo "  python3 -m venv .venv"
  echo "  source .venv/bin/activate"
  echo "  python -m pip install -r requirements.txt"
  exit 1
fi

HOST="${DILIAT_HOST:-0.0.0.0}"
PORT="${DILIAT_PORT:-8000}"

echo "Starting DILIAT on http://${HOST}:${PORT}"
exec .venv/bin/python -m uvicorn apps.api.app.main:app --host "$HOST" --port "$PORT"
