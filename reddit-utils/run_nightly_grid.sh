#!/usr/bin/env bash
set -euo pipefail

LOG_TAG="[nightly-grid]"

say() {
  printf '%s %s\n' "$LOG_TAG" "$*"
}

: "${PGURI:?PGURI must be set}"
: "${SUPABASE_URL:?SUPABASE_URL must be set}"
: "${SUPABASE_SERVICE_ROLE_KEY:?SUPABASE_SERVICE_ROLE_KEY must be set}"

REPO_DIR=${REPO_DIR:-"/home/dhose/moonshot-memestock-hub"}
GRID_SCRIPT="$REPO_DIR/reddit-utils/run_backtest_grid.sh"
WRAPPER_SCRIPT="$REPO_DIR/reddit-utils/run_nightly_grid.sh"  # self path when running locally
HARDENED_VIEW_REFRESH=${HARDENED_VIEW_REFRESH:-0}

if ! [[ -f "$GRID_SCRIPT" ]]; then
  say "FATAL: run_backtest_grid.sh not found at $GRID_SCRIPT"
  exit 127
fi

# Date helpers (GNU date on Linux, gdate on macOS if invoked manually)
if command -v date >/dev/null 2>&1 && date -d '1 day' >/dev/null 2>&1; then
  START_DATE=${START_DATE:-$(date -u -d '90 days ago' +%F)}
  END_DATE=${END_DATE:-$(date -u -d 'yesterday' +%F)}
else
  START_DATE=${START_DATE:-$(gdate -u -d '90 days ago' +%F)}
  END_DATE=${END_DATE:-$(gdate -u -d 'yesterday' +%F)}
fi

say "Running grid sweep for window ${START_DATE}..${END_DATE}"

export MODEL_VERSION=${MODEL_VERSION:-gpt-sent-v1}
export W_REDDIT=${W_REDDIT:-0.7}
export W_STOCKTWITS=${W_STOCKTWITS:-0.3}
export PERSIST_FULL_GRID=${PERSIST_FULL_GRID:-1}
export DO_PERSIST=${DO_PERSIST:-1}
export USE_FOLDS=${USE_FOLDS:-1}
export FOLD_FRAC=${FOLD_FRAC:-0.70}
export REQUIRE_LB_POSITIVE=${REQUIRE_LB_POSITIVE:-0}
export LB_Z=${LB_Z:-1.64}

say "Grid env: MODEL_VERSION=$MODEL_VERSION W_REDDIT=$W_REDDIT W_STOCKTWITS=$W_STOCKTWITS"

(
  cd "$REPO_DIR"
  PGURI="$PGURI" "$GRID_SCRIPT" "$START_DATE" "$END_DATE"
) 2>&1 | while IFS= read -r line; do
  say "$line"
done

say "Grid sweep finished"

if [[ "$HARDENED_VIEW_REFRESH" == "1" ]]; then
  say "Refreshing hardened recommendations"
  psql "$PGURI" -c "REFRESH MATERIALIZED VIEW CONCURRENTLY v_recommended_trades_today_conf_hardened;" 2>&1 | while IFS= read -r line; do
    say "$line"
  done || true
fi

say "Nightly grid job completed"
