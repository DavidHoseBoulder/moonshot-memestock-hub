#!/usr/bin/env bash
set -euo pipefail

# Simple runner for backtest_grid.sql with sane defaults and CSV export.
# Adds optional flags for folds, conservative LB ranking/gating, uplift, and bands.
# Usage:
#   PGURI=postgres://... ./run_backtest_grid.sh START_DATE END_DATE [CSV_PATH]
# Examples:
#   PGURI="$PGURI" ./run_backtest_grid.sh 2025-06-01 2025-09-12 /tmp/grid.csv

if [[ ${1:-} == "-h" || ${1:-} == "--help" ]]; then
  cat <<EOF
Usage: PGURI=postgres://... $(basename "$0") START_DATE END_DATE [CSV_PATH]

Environment overrides (optional):
  MODEL_VERSION       Default: gpt-sent-v1
  MIN_CONF            Default: 0.70
  MIN_MENTIONS_REQ    Default: 3
  POS_RATE_MIN        Default: 0.55
  AVG_ABS_MIN         Default: 0.10
  MIN_MENTIONS_LIST   Default: 1,2,3,4,5,6,7,8
  POS_THRESH_LIST     Default: 0.10,0.15,0.20,0.25,0.30,0.35,0.40
  HORIZONS            Default: 1d,3d,5d
  SIDES               Default: LONG,SHORT
  SYMBOLS             Default: NULL (all symbols)
  MIN_TRADES          Default: 10
  MIN_SHARPE          Default: -999
  DO_PERSIST          Default: 0 (set to 1 to persist winners)
  PERSIST_FULL_GRID   Default: 0 (set to 1 to persist full grid)

Stability & ranking (optional):
  USE_FOLDS               Default: 0 (alias for REQUIRE_STABLE)
  FOLD_FRAC               Default: 0.70
  REQUIRE_RANK_CONSISTENT Default: 0
  RANK_TOP_K              Default: 3
  USE_LB_RANKING          Default: 0
  REQUIRE_LB_POSITIVE     Default: 0
  LB_Z                    Default: 1.64
  REQUIRE_UPLIFT_POSITIVE Default: 0
  BAND_STRONG             Default: 0.35
  BAND_MODERATE           Default: 0.20
  BAND_WEAK               Default: 0.10

CSV export:
  If CSV_PATH arg is provided, CSV is written client-side via psql (\\g :CSV_PATH).
  Pass client path without quotes. Example: /tmp/grid.csv
EOF
  exit 0
fi

if [[ -z "${PGURI:-}" ]]; then
  echo "ERROR: PGURI is required in environment" >&2
  exit 1
fi

if [[ $# -lt 2 ]]; then
  echo "ERROR: Expected START_DATE and END_DATE. See --help." >&2
  exit 1
fi

START_DATE="$1"
END_DATE="$2"
CSV_PATH_ARG="${3:-}"

# Defaults (override via env)
MODEL_VERSION="${MODEL_VERSION:-gpt-sent-v1}"
MIN_CONF="${MIN_CONF:-0.70}"
MIN_MENTIONS_REQ="${MIN_MENTIONS_REQ:-3}"
POS_RATE_MIN="${POS_RATE_MIN:-0.55}"
AVG_ABS_MIN="${AVG_ABS_MIN:-0.10}"
MIN_MENTIONS_LIST="${MIN_MENTIONS_LIST:-1,2,3,4,5,6,7,8}"
POS_THRESH_LIST="${POS_THRESH_LIST:-0.10,0.15,0.20,0.25,0.30,0.35,0.40}"
HORIZONS="${HORIZONS:-1d,3d,5d}"
SIDES="${SIDES:-LONG,SHORT}"
SYMBOLS="${SYMBOLS:-NULL}"
MIN_TRADES="${MIN_TRADES:-10}"
MIN_SHARPE="${MIN_SHARPE:--999}"
DO_PERSIST="${DO_PERSIST:-0}"
PERSIST_FULL_GRID="${PERSIST_FULL_GRID:-0}"

# New stability/ranking/baseline flags (override via env)
USE_FOLDS="${USE_FOLDS:-0}"
FOLD_FRAC="${FOLD_FRAC:-0.70}"
REQUIRE_RANK_CONSISTENT="${REQUIRE_RANK_CONSISTENT:-0}"
RANK_TOP_K="${RANK_TOP_K:-3}"
USE_LB_RANKING="${USE_LB_RANKING:-0}"
REQUIRE_LB_POSITIVE="${REQUIRE_LB_POSITIVE:-0}"
LB_Z="${LB_Z:-1.64}"
REQUIRE_UPLIFT_POSITIVE="${REQUIRE_UPLIFT_POSITIVE:-0}"
BAND_STRONG="${BAND_STRONG:-0.35}"
BAND_MODERATE="${BAND_MODERATE:-0.20}"
BAND_WEAK="${BAND_WEAK:-0.10}"

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
CODE_DIR="$SCRIPT_DIR"

EXPORT_FLAGS=()
if [[ -n "$CSV_PATH_ARG" ]]; then
  EXPORT_FLAGS+=( -v EXPORT_CSV=1 -v CSV_PATH="$CSV_PATH_ARG" )
else
  EXPORT_FLAGS+=( -v EXPORT_CSV=0 )
fi

echo "Running grid backtest from $START_DATE to $END_DATE (model=$MODEL_VERSION)" >&2
if [[ -n "$CSV_PATH_ARG" ]]; then
  echo "CSV export to $CSV_PATH_ARG" >&2
fi

psql "$PGURI" \
  -v MODEL_VERSION="$MODEL_VERSION" \
  -v START_DATE="$START_DATE" \
  -v END_DATE="$END_DATE" \
  -v MIN_CONF="$MIN_CONF" \
  -v MIN_MENTIONS_REQ="$MIN_MENTIONS_REQ" \
  -v POS_RATE_MIN="$POS_RATE_MIN" \
  -v AVG_ABS_MIN="$AVG_ABS_MIN" \
  -v MIN_MENTIONS_LIST="$MIN_MENTIONS_LIST" \
  -v POS_THRESH_LIST="$POS_THRESH_LIST" \
  -v HORIZONS="$HORIZONS" \
  -v SIDES="$SIDES" \
  -v SYMBOLS="$SYMBOLS" \
  -v MIN_TRADES="$MIN_TRADES" \
  -v MIN_SHARPE="$MIN_SHARPE" \
  -v DO_PERSIST="$DO_PERSIST" \
  -v PERSIST_FULL_GRID="$PERSIST_FULL_GRID" \
  -v USE_FOLDS="$USE_FOLDS" \
  -v FOLD_FRAC="$FOLD_FRAC" \
  -v REQUIRE_RANK_CONSISTENT="$REQUIRE_RANK_CONSISTENT" \
  -v RANK_TOP_K="$RANK_TOP_K" \
  -v USE_LB_RANKING="$USE_LB_RANKING" \
  -v REQUIRE_LB_POSITIVE="$REQUIRE_LB_POSITIVE" \
  -v LB_Z="$LB_Z" \
  -v REQUIRE_UPLIFT_POSITIVE="$REQUIRE_UPLIFT_POSITIVE" \
  -v BAND_STRONG="$BAND_STRONG" \
  -v BAND_MODERATE="$BAND_MODERATE" \
  -v BAND_WEAK="$BAND_WEAK" \
  "${EXPORT_FLAGS[@]}" \
  -f "$CODE_DIR/backtest_grid.sql"
