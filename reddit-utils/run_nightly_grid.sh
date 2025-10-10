#!/usr/bin/env bash
set -euo pipefail

LOG_TAG="[nightly-grid]"
MAIL_FILE=$(mktemp)
subj="Nightly grid job $(date -u '+%Y-%m-%d %H:%M UTC')"

cleanup() {
  rm -f "$MAIL_FILE"
}
trap cleanup EXIT

say() {
  printf '%s %s\n' "$LOG_TAG" "$*" | tee -a "$MAIL_FILE"
}

: "${PGURI:?PGURI must be set}"
: "${SUPABASE_URL:?SUPABASE_URL must be set}"
: "${SUPABASE_SERVICE_ROLE_KEY:?SUPABASE_SERVICE_ROLE_KEY must be set}"

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

PGURI="$PGURI" "$(dirname "$0")/run_backtest_grid.sh" "$START_DATE" "$END_DATE" 2>&1 | tee -a "$MAIL_FILE"

say "Grid sweep finished"

say "Refreshing hardened recommendations"
psql "$PGURI" -c "NOTIFY nightly_grid, 'refreshed';" >>"$MAIL_FILE" 2>&1 || true

say "Nightly grid job completed"

if [[ -n "${MAIL_TO:-}" ]]; then
  if command -v msmtp >/dev/null 2>&1; then
    MSMTP_ACCOUNT=${MSMTP_ACCOUNT:-"default"}
    {
      echo "Subject: $subj"
      echo "To: $MAIL_TO"
      echo "From: nightly-grid <noreply@localhost>"
      echo
      cat "$MAIL_FILE"
    } | msmtp -a "$MSMTP_ACCOUNT" "$MAIL_TO" || say "WARN: msmtp returned non-zero exit sending email"
  else
    say "INFO: msmtp not found; skipping email send"
  fi
else
  say "INFO: MAIL_TO not set; skipping email send"
fi
