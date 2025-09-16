#!/bin/sh
# POSIX-compatible; enable strict mode
set -eu
# pipefail is not POSIX; enable if available
if (set -o | grep -q pipefail) 2>/dev/null; then
  set -o pipefail
fi

# Load environment if present
if [ -f "$HOME/.env" ]; then
  set -a
  . "$HOME/.env"
  set +a
fi

: "${PGURI:?PGURI must be set (export in .env)}"

# Defaults (can be overridden via env or -v in psql)
CODE_DIR=${CODE_DIR:-"/home/dhose/moonshot-memestock-hub/reddit-utils"}
WORKING_DIR=${WORKING_DIR:-"/home/dhose/reddit_work"}

mkdir -p "$WORKING_DIR"
cd "$WORKING_DIR"

# Prefer SQL from CODE_DIR; fall back to home path if not moved yet
SQL_PATH="$CODE_DIR/backtest_enabled_rules.sql"
if [ ! -f "$SQL_PATH" ]; then
  # One directory up from this script or home fallback
  HERE_DIR="$(cd "$(dirname "$0")" && pwd)"
  [ -f "$HERE_DIR/../backtest_enabled_rules.sql" ] && SQL_PATH="$HERE_DIR/../backtest_enabled_rules.sql"
  [ -f "$HOME/backtest_enabled_rules.sql" ] && SQL_PATH="$HOME/backtest_enabled_rules.sql"
fi

if [ ! -f "$SQL_PATH" ]; then
  echo "ERROR: backtest_enabled_rules.sql not found in CODE_DIR or fallbacks." >&2
  exit 1
fi

# Allow overrides via environment
START_DATE=${START_DATE:-"2025-06-01"}
END_DATE=${END_DATE:-"2025-09-12"}
MODEL_VERSION=${MODEL_VERSION:-"gpt-sent-v1"}
MIN_CONF=${MIN_CONF:-"0.70"}
MIN_MENTIONS_REQ=${MIN_MENTIONS_REQ:-"NULL"}
POS_RATE_MIN=${POS_RATE_MIN:-"0.60"}
AVG_ABS_MIN=${AVG_ABS_MIN:-"0.30"}
DEBUG=${DEBUG:-"0"}

echo "Running backtest from: $SQL_PATH"
echo "Working dir: $WORKING_DIR"

psql "$PGURI" \
  -v START_DATE="$START_DATE" \
  -v END_DATE="$END_DATE" \
  -v MODEL_VERSION="$MODEL_VERSION" \
  -v MIN_CONF="$MIN_CONF" \
  -v MIN_MENTIONS_REQ="$MIN_MENTIONS_REQ" \
  -v POS_RATE_MIN="$POS_RATE_MIN" \
  -v AVG_ABS_MIN="$AVG_ABS_MIN" \
  -v DEBUG="$DEBUG" \
  -f "$SQL_PATH"

echo "Backtest complete. Summary printed above; per-pocket saved to backtest_sweep_results."
