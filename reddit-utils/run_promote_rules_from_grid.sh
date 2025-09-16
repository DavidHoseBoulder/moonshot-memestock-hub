#!/usr/bin/env bash
set -euo pipefail

# Runner for promote_rules_from_grid.sql
# Promotes best grid configs from backtest_sweep_results/backtest_sweep_grid
# into live_sentiment_entry_rules with optional robustness and FDR gating.
#
# Usage:
#   PGURI=postgres://... ./run_promote_rules_from_grid.sh START_DATE END_DATE [MODEL_VERSION]
#
# Examples:
#   PGURI="$PGURI" ./run_promote_rules_from_grid.sh 2025-06-01 2025-09-12
#   PGURI="$PGURI" ./run_promote_rules_from_grid.sh 2025-06-01 2025-09-12 gpt-sent-v1
#
# Environment overrides (optional):
#   MIN_TRADES=10 MIN_SHARPE=0.40 MIN_WIN_RATE=0.55 MIN_AVG_RET=0.00 \
#   SIDE_FILTER=NULL MIN_CONF=0.70 REQUIRE_ROBUST=1 NEIGHBOR_POS_EPS=0.05 \
#   NEIGHBOR_MM_EPS=1 MIN_NEIGHBORS=1 SHARPE_FRAC=0.75 USE_FULL_GRID=1 \
#   Q_MAX=NULL   # e.g., 0.10 to enable BH FDR gating

if [[ ${1:-} == "-h" || ${1:-} == "--help" ]]; then
  cat <<EOF
Usage: PGURI=postgres://... $(basename "$0") START_DATE END_DATE [MODEL_VERSION]

Promotes rules from the grid results window (backtest_sweep_results) into live_sentiment_entry_rules.

Positional args:
  START_DATE   Backtest window start (YYYY-MM-DD)
  END_DATE     Backtest window end (YYYY-MM-DD)
  MODEL_VERSION (optional) defaults to "+${MODEL_VERSION:-gpt-sent-v1}+"

Environment overrides:
  MIN_TRADES, MIN_SHARPE, MIN_WIN_RATE, MIN_AVG_RET,
  SIDE_FILTER (LONG/SHORT/NULL), MIN_CONF,
  REQUIRE_ROBUST (0/1), NEIGHBOR_POS_EPS, NEIGHBOR_MM_EPS,
  MIN_NEIGHBORS, SHARPE_FRAC
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
MODEL_VERSION_ARG="${3:-}"

# Defaults (override via env)
MODEL_VERSION="${MODEL_VERSION_ARG:-${MODEL_VERSION:-gpt-sent-v1}}"
MIN_TRADES="${MIN_TRADES:-10}"
MIN_SHARPE="${MIN_SHARPE:-0.40}"
MIN_WIN_RATE="${MIN_WIN_RATE:-0.55}"
MIN_AVG_RET="${MIN_AVG_RET:-0.00}"
SIDE_FILTER="${SIDE_FILTER:-NULL}"
MIN_CONF="${MIN_CONF:-0.70}"
REQUIRE_ROBUST="${REQUIRE_ROBUST:-1}"
NEIGHBOR_POS_EPS="${NEIGHBOR_POS_EPS:-0.05}"
NEIGHBOR_MM_EPS="${NEIGHBOR_MM_EPS:-1}"
MIN_NEIGHBORS="${MIN_NEIGHBORS:-1}"
SHARPE_FRAC="${SHARPE_FRAC:-0.75}"
USE_FULL_GRID="${USE_FULL_GRID:-0}"
Q_MAX="${Q_MAX:-NULL}"

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
CODE_DIR="$SCRIPT_DIR"

echo "Promoting rules from grid window $START_DATE..$END_DATE (model=$MODEL_VERSION)" >&2
echo "Filters: min_trades=$MIN_TRADES min_sharpe=$MIN_SHARPE min_win=$MIN_WIN_RATE min_avg=$MIN_AVG_RET side_filter=$SIDE_FILTER require_robust=$REQUIRE_ROBUST" >&2

psql "$PGURI" \
  -v MODEL_VERSION="$MODEL_VERSION" \
  -v START_DATE="$START_DATE" \
  -v END_DATE="$END_DATE" \
  -v MIN_TRADES="$MIN_TRADES" \
  -v MIN_SHARPE="$MIN_SHARPE" \
  -v MIN_WIN_RATE="$MIN_WIN_RATE" \
  -v MIN_AVG_RET="$MIN_AVG_RET" \
  -v SIDE_FILTER="$SIDE_FILTER" \
  -v MIN_CONF="$MIN_CONF" \
  -v REQUIRE_ROBUST="$REQUIRE_ROBUST" \
  -v NEIGHBOR_POS_EPS="$NEIGHBOR_POS_EPS" \
  -v NEIGHBOR_MM_EPS="$NEIGHBOR_MM_EPS" \
  -v MIN_NEIGHBORS="$MIN_NEIGHBORS" \
  -v SHARPE_FRAC="$SHARPE_FRAC" \
  -v USE_FULL_GRID="$USE_FULL_GRID" \
  -v Q_MAX="$Q_MAX" \
  -f "$CODE_DIR/promote_rules_from_grid.sql"
