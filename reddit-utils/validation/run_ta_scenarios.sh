#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 2 ]]; then
  echo "Usage: $(basename "$0") START_DATE END_DATE [scenario_tsv]" >&2
  exit 1
fi

START_DATE="$1"
END_DATE="$2"

CODE_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
SCENARIO_FILE="${3:-$CODE_DIR/validation/ta_scenarios.tsv}"

if [[ -z "${PGURI:-}" ]]; then
  echo "PGURI must be set" >&2
  exit 1
fi
WORK_DIR="${WORKING_DIR:-$PWD}"
MODEL_VERSION="${MODEL_VERSION:-gpt-sent-v1}"

psql "$PGURI" \
  -v START_DATE="$START_DATE" \
  -v END_DATE="$END_DATE" \
  -f "$CODE_DIR/validation/init_ta_scenario_tables.sql"

# Helper to set or unset environment variables based on scenario values
set_or_unset() {
  local var_name="$1"
  local value="$2"
  if [[ -z "$value" || "$value" == "NULL" ]]; then
    unset "$var_name"
  else
    export "$var_name"="$value"
  fi
}

# Iterate scenarios
while IFS=$'\t' read -r RUN_FLAG SCENARIO RATIO_PCTL SHARE_PCTL MIN_RATIO MIN_SHARE MIN_Z RSI_LONG RSI_SHORT REQUIRE_LB; do
  [[ -z "$SCENARIO" ]] && continue
  [[ "$RUN_FLAG" == "run" ]] && continue

  if [[ -z "${RUN_FLAG:-}" ]]; then
    RUN_VALUE=1
  else
    RUN_VALUE=$(printf '%s' "$RUN_FLAG" | tr '[:upper:]' '[:lower:]')
  fi

  if [[ "$RUN_VALUE" == "0" || "$RUN_VALUE" == "false" || "$RUN_VALUE" == "no" ]]; then
    echo "Skipping scenario '$SCENARIO' (run flag=$RUN_FLAG)" >&2
    continue
  fi

  set_or_unset VOLUME_RATIO_PCTL "$RATIO_PCTL"
  set_or_unset VOLUME_SHARE_PCTL "$SHARE_PCTL"
  set_or_unset MIN_VOLUME_RATIO "$MIN_RATIO"
  set_or_unset MIN_VOLUME_SHARE "$MIN_SHARE"
  set_or_unset MIN_VOLUME_Z "$MIN_Z"
  set_or_unset RSI_LONG_MAX "$RSI_LONG"
  set_or_unset RSI_SHORT_MIN "$RSI_SHORT"

  if [[ -n "${REQUIRE_LB:-}" && "$REQUIRE_LB" != "NULL" ]]; then
    export REQUIRE_LB_POSITIVE="$REQUIRE_LB"
  else
    unset REQUIRE_LB_POSITIVE
  fi

  CSV_PATH="$WORK_DIR/ta_${SCENARIO}.csv"
  echo "Running scenario '$SCENARIO' (CSV: $CSV_PATH)" >&2
  echo "  volume_ratio_pctl=${RATIO_PCTL:-NULL} volume_share_pctl=${SHARE_PCTL:-NULL} min_volume_ratio=${MIN_RATIO:-NULL} min_volume_share=${MIN_SHARE:-NULL}" >&2
  echo "  min_volume_z=${MIN_Z:-NULL} rsi_long_max=${RSI_LONG:-NULL} rsi_short_min=${RSI_SHORT:-NULL} require_lb_positive=${REQUIRE_LB:-0}" >&2
  "$CODE_DIR/run_backtest_grid.sh" "$START_DATE" "$END_DATE" "$CSV_PATH"

  psql "$PGURI" <<SQL
TRUNCATE ta_scenario_staging;
\COPY ta_scenario_staging FROM '$CSV_PATH' WITH (FORMAT csv, HEADER true);
DELETE FROM ta_scenario_summary WHERE scenario = '$SCENARIO';
INSERT INTO ta_scenario_summary (
  scenario, start_date, end_date,
  volume_ratio_pctl, volume_share_pctl,
  min_volume_ratio, min_volume_share, min_volume_z,
  rsi_long_max, rsi_short_min,
  require_lb_positive,
  trades, avg_ret, median_ret, win_rate, sharpe, lb_avg
)
SELECT '$SCENARIO',
       '$START_DATE'::date,
       '$END_DATE'::date,
       NULLIF(NULLIF('$RATIO_PCTL',''), 'NULL')::numeric,
       NULLIF(NULLIF('$SHARE_PCTL',''), 'NULL')::numeric,
       NULLIF(NULLIF('$MIN_RATIO',''), 'NULL')::numeric,
       NULLIF(NULLIF('$MIN_SHARE',''), 'NULL')::numeric,
       NULLIF(NULLIF('$MIN_Z',''), 'NULL')::numeric,
       NULLIF(NULLIF('$RSI_LONG',''), 'NULL')::numeric,
       NULLIF(NULLIF('$RSI_SHORT',''), 'NULL')::numeric,
       COALESCE(NULLIF(NULLIF('$REQUIRE_LB',''), 'NULL'), '0')::int,
       SUM(trades),
       AVG(avg_ret),
       AVG(median_ret),
       AVG(win_rate),
       AVG(sharpe),
       AVG(lb)
FROM ta_scenario_staging;
SQL

done < "$SCENARIO_FILE"

psql "$PGURI" -c "SELECT * FROM ta_scenario_summary ORDER BY scenario;"
