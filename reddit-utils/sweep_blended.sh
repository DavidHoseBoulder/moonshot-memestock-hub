#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 2 ]]; then
  echo "Usage: PGURI=postgres://... $(basename "$0") START_DATE END_DATE" >&2
  exit 1
fi

START_DATE="$1"
END_DATE="$2"
MODEL_VERSION="${MODEL_VERSION:-'gpt-sent-v1'}"
SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
REPO_ROOT=$(cd "$SCRIPT_DIR/.." && pwd)
OUTPUT_DIR="${OUTPUT_DIR:-$REPO_ROOT/results/blended_runs}"
mkdir -p "$OUTPUT_DIR"

MIN_MENTIONS_LIST=(1 3 5)
POS_THRESH_LIST=(0.03 0.05 0.08 0.10)
POS_RATE_LIST=(0.20 0.35 0.50)
WEIGHT_LIST=("1.0,0.0" "0.7,0.3" "0.5,0.5" "0.3,0.7" "0.0,1.0")
GATE_SCENARIOS=(
  "name=base vz=NULL vr=NULL vs=NULL rl=NULL rs=NULL"
  "name=vr15 vz=NULL vr=1.5 vs=NULL rl=NULL rs=NULL"
  "name=vr20_vs025 vz=NULL vr=2.0 vs=0.25 rl=NULL rs=NULL"
  "name=vz05 vz=0.5 vr=NULL vs=NULL rl=NULL rs=NULL"
  "name=vz10_rl65 vz=1.0 vr=NULL vs=NULL rl=65 rs=NULL"
  "name=vs03 vz=NULL vr=NULL vs=0.3 rl=NULL rs=NULL"
  "name=vr15_rl60_rs35 vz=NULL vr=1.5 vs=NULL rl=60 rs=35"
)

LOG_SUMMARY="$OUTPUT_DIR/summary_$(date +%Y%m%d_%H%M%S).csv"
if [[ ! -s "$LOG_SUMMARY" ]]; then
  echo "start_date,end_date,gate_name,min_mentions,pos_thresh,pos_rate,w_reddit,w_stocktwits,min_volume_z,min_volume_ratio,min_volume_share,rsi_long_max,rsi_short_min,n_trades,avg_ret,sharpe" > "$LOG_SUMMARY"
fi

for gate in "${GATE_SCENARIOS[@]}"; do
  gate_name=""
  min_volume_z="NULL"
  min_volume_ratio="NULL"
  min_volume_share="NULL"
  rsi_long_max="NULL"
  rsi_short_min="NULL"

  for token in $gate; do
    key="${token%%=*}"
    val="${token#*=}"
    case "$key" in
      name) gate_name="$val" ;;
      vz) min_volume_z="$val" ;;
      vr) min_volume_ratio="$val" ;;
      vs) min_volume_share="$val" ;;
      rl) rsi_long_max="$val" ;;
      rs) rsi_short_min="$val" ;;
    esac
  done

  [[ -z "$gate_name" ]] && gate_name="gate"

  for min_mentions in "${MIN_MENTIONS_LIST[@]}"; do
    for pos_rate in "${POS_RATE_LIST[@]}"; do
      for pos_thresh in "${POS_THRESH_LIST[@]}"; do
        for weights in "${WEIGHT_LIST[@]}"; do
          w_reddit="${weights%%,*}"
          w_stocktwits="${weights##*,}"
          tag="${gate_name}_mm${min_mentions}_pr${pos_rate}_pt${pos_thresh}_wr${w_reddit}_ws${w_stocktwits}"
          tag=${tag//./p}
          log_file="$OUTPUT_DIR/${START_DATE}_${END_DATE}_${tag}.log"
          echo "Running sweep $tag (vz=${min_volume_z}, vr=${min_volume_ratio}, vs=${min_volume_share}, rl=${rsi_long_max}, rs=${rsi_short_min})" >&2
          (cd "$SCRIPT_DIR" && psql "$PGURI" \
            -v MODEL_VERSION="'$MODEL_VERSION'" \
            -v START_DATE="'$START_DATE'" \
            -v END_DATE="'$END_DATE'" \
            -v MIN_MENTIONS="$min_mentions" \
            -v POS_THRESH="$pos_thresh" \
            -v POS_RATE_MIN="$pos_rate" \
            -v MIN_TRADES=0 \
            -v MIN_SHARPE=-999 \
            -v W_REDDIT="$w_reddit" \
            -v W_STOCKTWITS="$w_stocktwits" \
            -v MIN_VOLUME_Z="$min_volume_z" \
            -v MIN_VOLUME_RATIO="$min_volume_ratio" \
            -v MIN_VOLUME_SHARE="$min_volume_share" \
            -v RSI_LONG_MAX="$rsi_long_max" \
            -v RSI_SHORT_MIN="$rsi_short_min" \
            -v DEBUG=0 \
            -f sweep_with_rules.sql \
            ) > "$log_file" 2>&1 || {
              echo "Run failed for $tag, see $log_file" >&2
              continue
            }
          summary_line=$(awk '/^ n_trades / {getline; gsub(/^ +| +$/,"",$0); gsub(/ +/,",",$0); print $0}' "$log_file")
          if [[ -n "$summary_line" ]]; then
            echo "$START_DATE,$END_DATE,$gate_name,$min_mentions,$pos_thresh,$pos_rate,$w_reddit,$w_stocktwits,$min_volume_z,$min_volume_ratio,$min_volume_share,$rsi_long_max,$rsi_short_min,$summary_line" >> "$LOG_SUMMARY"
          fi
        done
      done
    done
  done
done

echo "Sweep complete. Summary: $LOG_SUMMARY" >&2
