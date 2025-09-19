#!/usr/bin/env bash
#
# Helper used during bulk backfills to trim archival Reddit exports down to the
# subreddits we actively ingest. Reads the source file (supports plain NDJSON,
# gzip, or zstd), filters rows whose `subreddit` field matches the comma-
# separated list in $SUBREDDITS, and writes the reduced NDJSON to the target
# path.
#
# Usage: filter_subreddits.sh INPUT_PATH OUTPUT_PATH
#   INPUT_PATH  - *.ndjson, *.jsonl, *.gz, or *.zst file containing one JSON
#                 Reddit post/comment per line.
#   OUTPUT_PATH - Destination NDJSON file containing only the whitelisted subs.

set -euo pipefail

trim() {
  local v="$1"
  v="${v#"${v%%[![:space:]]*}"}"
  v="${v%"${v##*[![:space:]]}"}"
  printf '%s' "$v"
}

if [[ $# -ne 2 ]]; then
  echo "Usage: $0 INPUT_PATH OUTPUT_PATH" >&2
  exit 64
fi

INPUT=$1
OUTPUT=$2

if [[ ! -f "$INPUT" ]]; then
  echo "ERROR: Input file not found: $INPUT" >&2
  exit 66
fi

if [[ -z "${SUBREDDITS:-}" ]]; then
  echo "ERROR: SUBREDDITS env var must be set (comma-separated list)." >&2
  exit 65
fi

IFS=',' read -r -a RAW_SUBS <<<"$SUBREDDITS"
SUBS=()
for s in "${RAW_SUBS[@]}"; do
  trimmed=$(trim "$s")
  [[ -n "$trimmed" ]] && SUBS+=("$trimmed")
done

if [[ ${#SUBS[@]} -eq 0 ]]; then
  echo "ERROR: SUBREDDITS env var did not yield any subreddit names." >&2
  exit 65
fi

SUBS_JSON=$(printf '%s\n' "${SUBS[@]}" | jq -Rsc 'split("\n")[:-1]')

reader_cmd=(cat -- "$INPUT")
case "$INPUT" in
  *.gz)  reader_cmd=(gunzip -c -- "$INPUT") ;;
  *.zst) reader_cmd=(zstdcat -- "$INPUT") ;;
esac

"${reader_cmd[@]}" \
  | jq -c --argjson subs "$SUBS_JSON" '
      . as $doc
      | $doc.subreddit as $sr
      | select($sr != null and ($subs | index($sr)) != null)
    ' \
  >"$OUTPUT"

echo "Wrote filtered NDJSON to $OUTPUT" >&2
