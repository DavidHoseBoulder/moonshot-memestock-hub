#!/bin/sh
set -eu
if (set -o | grep -q pipefail) 2>/dev/null; then set -o pipefail; fi

# Load environment if present
if [ -f "$HOME/.env" ]; then
  set -a
  . "$HOME/.env"
  set +a
fi

: "${PGURI:?PGURI must be set (export in .env)}"

CODE_DIR=${CODE_DIR:-"/home/dhose/moonshot-memestock-hub/reddit-utils"}
WORKING_DIR=${WORKING_DIR:-"/home/dhose/reddit_work"}

mkdir -p "$WORKING_DIR"
cd "$WORKING_DIR"

SQL_PATH="$CODE_DIR/backtest_discovery.sql"
if [ ! -f "$SQL_PATH" ]; then
  echo "ERROR: backtest_discovery.sql not found at $SQL_PATH" >&2
  exit 1
fi

# Allow overrides via env
START_DATE=${START_DATE:-"2025-06-01"}
END_DATE=${END_DATE:-"2025-09-12"}
MODEL_VERSION=${MODEL_VERSION:-"gpt-sent-v1"}
MIN_CONF=${MIN_CONF:-"0.70"}
MIN_MENTIONS_REQ=${MIN_MENTIONS_REQ:-"3"}
POS_RATE_MIN=${POS_RATE_MIN:-"0.55"}
AVG_ABS_MIN=${AVG_ABS_MIN:-"0.10"}
DO_PERSIST=${DO_PERSIST:-"0"}

echo "Running discovery from: $SQL_PATH"
echo "Working dir: $WORKING_DIR"

psql "$PGURI" \
  -v START_DATE="$START_DATE" \
  -v END_DATE="$END_DATE" \
  -v MODEL_VERSION="$MODEL_VERSION" \
  -v MIN_CONF="$MIN_CONF" \
  -v MIN_MENTIONS_REQ="$MIN_MENTIONS_REQ" \
  -v POS_RATE_MIN="$POS_RATE_MIN" \
  -v AVG_ABS_MIN="$AVG_ABS_MIN" \
  -v DO_PERSIST="$DO_PERSIST" \
  -f "$SQL_PATH"

echo "Discovery complete. Summary printed above; optional pockets persisted if DO_PERSIST=1."

