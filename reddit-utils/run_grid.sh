#!/bin/sh
# POSIX-compatible grid backtest runner using CODE_DIR and WORKING_DIR
set -eu
if (set -o | grep -q pipefail) 2>/dev/null; then set -o pipefail; fi

# Load environment if present
if [ -f "$HOME/.env" ]; then
  set -a
  . "$HOME/.env"
  set +a
fi

: "${PGURI:?PGURI must be set (export in .env)}"

# Repo/script locations
CODE_DIR=${CODE_DIR:-"/home/dhose/moonshot-memestock-hub/reddit-utils"}
WORKING_DIR=${WORKING_DIR:-"/home/dhose/reddit_work"}

mkdir -p "$WORKING_DIR"
cd "$WORKING_DIR"

SQL_PATH="$CODE_DIR/backtest_grid.sql"
if [ ! -f "$SQL_PATH" ]; then
  echo "ERROR: backtest_grid.sql not found at $SQL_PATH" >&2
  exit 1
fi

# Core filters / defaults (override via env)
START_DATE=${START_DATE:-"2025-06-01"}
END_DATE=${END_DATE:-"2025-09-12"}
MODEL_VERSION=${MODEL_VERSION:-"gpt-sent-v1"}
MIN_CONF=${MIN_CONF:-"0.70"}
MIN_MENTIONS_REQ=${MIN_MENTIONS_REQ:-"3"}
POS_RATE_MIN=${POS_RATE_MIN:-"0.55"}
AVG_ABS_MIN=${AVG_ABS_MIN:-"0.10"}

# Grid lists (CSV strings)
MIN_MENTIONS_LIST=${MIN_MENTIONS_LIST:-"1,2,3,4,5,6,7,8"}
POS_THRESH_LIST=${POS_THRESH_LIST:-"0.10,0.15,0.20,0.25,0.30,0.35,0.40"}
HORIZONS=${HORIZONS:-"1d,3d,5d"}
SIDES=${SIDES:-"LONG,SHORT"}

# Optional symbol filter and thresholds
SYMBOLS=${SYMBOLS:-""}       # empty means NULL (all symbols)
MIN_TRADES=${MIN_TRADES:-"10"}
MIN_SHARPE=${MIN_SHARPE:-"-999"}
DO_PERSIST=${DO_PERSIST:-"1"}
DEBUG=${DEBUG:-"1"}

echo "Running grid backtest from: $SQL_PATH"
echo "Working dir: $WORKING_DIR"

# Translate empty SYMBOLS to NULL literal for the SQL script’s check
SYMBOLS_ARG=${SYMBOLS:-NULL}

psql "$PGURI" \
  -v START_DATE="$START_DATE" \
  -v END_DATE="$END_DATE" \
  -v MODEL_VERSION="$MODEL_VERSION" \
  -v MIN_CONF="$MIN_CONF" \
  -v MIN_MENTIONS_REQ="$MIN_MENTIONS_REQ" \
  -v POS_RATE_MIN="$POS_RATE_MIN" \
  -v AVG_ABS_MIN="$AVG_ABS_MIN" \
  -v MIN_MENTIONS_LIST="$MIN_MENTIONS_LIST" \
  -v POS_THRESH_LIST="$POS_THRESH_LIST" \
  -v HORIZONS="$HORIZONS" \
  -v SIDES="$SIDES" \
  -v SYMBOLS="$SYMBOLS_ARG" \
  -v MIN_TRADES="$MIN_TRADES" \
  -v MIN_SHARPE="$MIN_SHARPE" \
  -v DO_PERSIST="$DO_PERSIST" \
  -v DEBUG="$DEBUG" \
  -f "$SQL_PATH"

echo "Grid backtest complete. Summary printed above; optional persistence controlled by DO_PERSIST."
