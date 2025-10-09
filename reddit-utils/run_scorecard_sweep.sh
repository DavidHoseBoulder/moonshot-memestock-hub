#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 2 ]]; then
  echo "Usage: PGURI=postgres://... $(basename "$0") START_DATE END_DATE [STAT|SIMPLE|WEIGHTED]" >&2
  exit 1
fi

START_DATE="$1"
END_DATE="$2"
ST_MODE="${3:-STAT}"
ST_MODE=$(echo "$ST_MODE" | tr '[:lower:]' '[:upper:]')

case "$ST_MODE" in
  STAT|SIMPLE|WEIGHTED) ;;
  *)
    echo "Invalid ST_SENTIMENT_MODE '$ST_MODE' (expected STAT, SIMPLE, or WEIGHTED)" >&2
    exit 1
    ;;
esac
MODEL_VERSION="${MODEL_VERSION:-'gpt-sent-v1'}"
SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
REPO_ROOT=$(cd "$SCRIPT_DIR/.." && pwd)
OUTPUT_DIR="${OUTPUT_DIR:-$REPO_ROOT/results/scorecard_runs}"
mkdir -p "$OUTPUT_DIR"

timestamp=$(date +%Y%m%d_%H%M%S)
SUMMARY_FILE="$OUTPUT_DIR/summary_${timestamp}_${ST_MODE}.csv"
echo "start_date,end_date,st_mode,tag,gate,min_mentions,pos_rate,pos_thresh,w_reddit,w_stocktwits,min_volume_share,n_trades,avg_ret,sharpe" > "$SUMMARY_FILE"

declare -a COMBOS=(
  "tag=vs03_mm1_wr1p0_ws0p0 gate=vs03 min=1 pr=0.20 pt=0.03 wr=1.0 ws=0.0 share=0.30"
  "tag=vs03_mm3_wr0p7_ws0p3 gate=vs03 min=3 pr=0.20 pt=0.03 wr=0.7 ws=0.3 share=0.30"
  "tag=vs03_mm3_wr0p5_ws0p5 gate=vs03 min=3 pr=0.20 pt=0.03 wr=0.5 ws=0.5 share=0.30"
  "tag=vs03_mm3_wr0p3_ws0p7 gate=vs03 min=3 pr=0.20 pt=0.03 wr=0.3 ws=0.7 share=0.30"
  "tag=vs03_mm3_wr0p0_ws1p0 gate=vs03 min=3 pr=0.20 pt=0.03 wr=0.0 ws=1.0 share=0.30"
  "tag=base_mm3_wr0p3_ws0p7 gate=base min=3 pr=0.20 pt=0.03 wr=0.3 ws=0.7 share=NULL"
  "tag=vs018_mm3_wr0p3_ws0p7 gate=vs018 min=3 pr=0.20 pt=0.03 wr=0.3 ws=0.7 share=0.18"
)

for combo in "${COMBOS[@]}"; do
  tag=""
  gate=""
  min=""
  pr=""
  pt=""
  wr=""
  ws=""
  share=""
  for part in $combo; do
    key=${part%%=*}
    val=${part#*=}
    case "$key" in
      tag) tag="$val" ;;
      gate) gate="$val" ;;
      min) min="$val" ;;
      pr) pr="$val" ;;
      pt) pt="$val" ;;
      wr) wr="$val" ;;
      ws) ws="$val" ;;
      share) share="$val" ;;
    esac
  done

  if [[ -z "$tag" ]]; then
    echo "Skipping malformed combo: $combo" >&2
    continue
  fi

  log_tag=${tag//./p}
  log_file="$OUTPUT_DIR/${START_DATE}_${END_DATE}_${ST_MODE}_${log_tag}.log"

  min_volume_share=$share
  [[ "$share" == "NULL" ]] && min_volume_share="NULL"

echo "Running scorecard sweep $tag ($ST_MODE)" >&2
if ! (cd "$SCRIPT_DIR" && psql "$PGURI" \
    -v MODEL_VERSION="'$MODEL_VERSION'" \
    -v START_DATE="'$START_DATE'" \
    -v END_DATE="'$END_DATE'" \
    -v MIN_MENTIONS="$min" \
    -v POS_RATE_MIN="$pr" \
    -v POS_THRESH="$pt" \
    -v W_REDDIT="$wr" \
    -v W_STOCKTWITS="$ws" \
    -v MIN_VOLUME_SHARE="$min_volume_share" \
    -v MIN_VOLUME_Z='NULL' \
    -v MIN_VOLUME_RATIO='NULL' \
    -v RSI_LONG_MAX='NULL' \
    -v RSI_SHORT_MIN='NULL' \
    -v ST_SENTIMENT_MODE="'$ST_MODE'" \
    -v MIN_TRADES=0 \
    -v MIN_SHARPE=-999 \
    -v DEBUG=0 \
    -f sweep_with_rules.sql \
    ) > "$log_file" 2>&1
then
  echo "Run failed for $tag (see $log_file)" >&2
  continue
fi

  summary_line=$(awk '
    /^ n_trades / {
      # skip the header and horizontal rule lines, then capture the first data row
      getline; getline;
      while ($0 ~ /^[[:space:]-+]+$/) { if (getline <= 0) exit }
      gsub(/^ +| +$/, "", $0)
      gsub(/[[:space:]]*\|[[:space:]]*/, ",", $0)
      gsub(/[[:space:]]+/, ",", $0)
      print $0
      exit
    }
  ' "$log_file")
  if [[ -z "$summary_line" ]]; then
    echo "Warning: no summary parsed for $tag" >&2
    continue
  fi

  IFS=',' read -r n_trades avg_ret total_ret win_rate vol sharpe total_pnl <<< "$summary_line"
  echo "$START_DATE,$END_DATE,$ST_MODE,$tag,$gate,$min,$pr,$pt,$wr,$ws,$share,$n_trades,$avg_ret,$sharpe" >> "$SUMMARY_FILE"
done

echo "Scorecard sweep finished. Summary: $SUMMARY_FILE" >&2
