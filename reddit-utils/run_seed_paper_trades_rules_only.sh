#!/usr/bin/env bash
set -euo pipefail

# Runner for seed_paper_trades_rules_only.sql
# Seeds paper trades from rules-only entry candidates over a date window.
#
# Usage:
#   PGURI=postgres://... ./run_seed_paper_trades_rules_only.sh START_DATE END_DATE [MODEL_VERSION]
#
# Examples:
#   PGURI="$PGURI" ./run_seed_paper_trades_rules_only.sh 2025-06-01 2025-09-12
#   PGURI="$PGURI" ./run_seed_paper_trades_rules_only.sh 2025-06-01 2025-09-12 gpt-sent-v1
#
# Environment overrides (optional):
#   DPT=1000 DAILY_MAX=5 MIN_MARGIN=0.00 DEBUG=0

if [[ ${1:-} == "-h" || ${1:-} == "--help" ]]; then
  cat <<EOF
Usage: PGURI=postgres://... $(basename "$0") START_DATE END_DATE [MODEL_VERSION]

Seeds paper trades from v_entry_candidates using next open -> close horizon pricing.

Positional args:
  START_DATE    Window start (YYYY-MM-DD)
  END_DATE      Window end (YYYY-MM-DD)
  MODEL_VERSION Optional; defaults to "+${MODEL_VERSION:-gpt-sent-v1}+"

Env overrides:
  DPT           Dollars per trade (default 1000)
  DAILY_MAX     Max trades per trading day (default 5)
  MIN_MARGIN    Minimum candidate margin (default 0.00)
  DEBUG         0/1 for diagnostic tables and prints (default 0)
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
DPT="${DPT:-1000}"
DAILY_MAX="${DAILY_MAX:-5}"
MIN_MARGIN="${MIN_MARGIN:-0.00}"
DEBUG="${DEBUG:-0}"

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
CODE_DIR="$SCRIPT_DIR"

echo "Seeding paper trades for $START_DATE..$END_DATE (model=$MODEL_VERSION)" >&2
echo "DPT=$DPT DAILY_MAX=$DAILY_MAX MIN_MARGIN=$MIN_MARGIN DEBUG=$DEBUG" >&2

psql "$PGURI" \
  -v MODEL_VERSION="$MODEL_VERSION" \
  -v START_DATE="$START_DATE" \
  -v END_DATE="$END_DATE" \
  -v DPT="$DPT" \
  -v DAILY_MAX="$DAILY_MAX" \
  -v MIN_MARGIN="$MIN_MARGIN" \
  -v DEBUG="$DEBUG" \
  -f "$CODE_DIR/seed_paper_trades_rules_only.sql"

