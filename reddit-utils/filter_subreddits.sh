#!/usr/bin/env bash
#
# Helper used during bulk backfills to trim archival Reddit exports down to the
# subreddits we actively ingest. Reads the source file (supports plain NDJSON,
# gzip, or zstd), filters rows whose `subreddit` field matches the comma-
# separated list in $SUBREDDITS, optionally sanitizes JSON strings, and can
# optionally load the resulting file into Postgres via the existing loader SQL.
#
# Usage: filter_subreddits.sh [--sanitize] [--load-comments] [--load-posts]
#                             INPUT_PATH OUTPUT_PATH
#   INPUT_PATH      - *.ndjson, *.jsonl, *.gz, or *.zst file containing one
#                     JSON Reddit post/comment per line.
#   OUTPUT_PATH     - Destination NDJSON file containing only the whitelisted
#                     subs (post-sanitization when enabled).
#
# Flags:
#   --sanitize      Run the standard jq sanitization pass (escape newlines,
#                   flatten arrays). Default: off.
#   --load-comments Run load_reddit_comments.sql after writing OUTPUT_PATH.
#   --load-posts    Run load_reddit_posts.sql after writing OUTPUT_PATH (will
#                   also convert to base64 before loading).

set -euo pipefail

trim() {
  local v="$1"
  v="${v#"${v%%[![:space:]]*}"}"
  v="${v%"${v##*[![:space:]]}"}"
  printf '%s' "$v"
}

SANITIZE=0
DO_LOAD_COMMENTS=0
DO_LOAD_POSTS=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --sanitize) SANITIZE=1; shift ;;
    --load-comments) DO_LOAD_COMMENTS=1; shift ;;
    --load-posts) DO_LOAD_POSTS=1; shift ;;
    --) shift; break ;;
    -*) echo "Unknown flag: $1" >&2; exit 64 ;;
    *) break ;;
  esac
done

if [[ $# -ne 2 ]]; then
  echo "Usage: $0 [--sanitize] [--load-comments] [--load-posts] INPUT_PATH OUTPUT_PATH" >&2
  exit 64
fi

INPUT=$1
OUTPUT=$2

if [[ -f "$OUTPUT" ]]; then
  echo "ERROR: Output file already exists: $OUTPUT" >&2
  exit 70
fi

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

SUBS_JSON=$(printf '%s\n' "${SUBS[@]}" | jq -Rsc 'split("\n")[:-1] | map(ascii_downcase)')

reader_cmd=(cat -- "$INPUT")
case "$INPUT" in
  *.gz)  reader_cmd=(gunzip -c -- "$INPUT") ;;
  *.zst) reader_cmd=(zstdcat -- "$INPUT") ;;
esac

JQ_PROGRAM='select((.subreddit? // empty) as $sr
                   | ($sr | type) == "string"
                   and ($subs | index(($sr | ascii_downcase))) != null)
           | if $sanitize == 1 then
               walk(if type == "string" then gsub("\r\n|\r|\n"; "\\n") else . end)
             else .
             end'

"${reader_cmd[@]}" \
  | jq -c --argjson subs "$SUBS_JSON" --argjson sanitize "$SANITIZE" "$JQ_PROGRAM" \
  >"$OUTPUT"

echo "Wrote filtered NDJSON to $OUTPUT" >&2

if [[ $DO_LOAD_COMMENTS -eq 1 || $DO_LOAD_POSTS -eq 1 ]]; then
  if [[ -z "${PGURI:-}" ]]; then
    echo "ERROR: PGURI must be set to load into Postgres." >&2
    exit 72
  fi
  if [[ -z "${CODE_DIR:-}" ]]; then
    echo "ERROR: CODE_DIR must be set to locate loader SQL files." >&2
    exit 72
  fi
  psql "$PGURI" -c "SET statement_timeout = 0;" >/dev/null
fi

if [[ $DO_LOAD_COMMENTS -eq 1 ]]; then
  echo "Loading comments via load_reddit_comments.sql" >&2
  cp "$OUTPUT" /tmp/reddit_clean.ndjson
  psql "$PGURI" -v ON_ERROR_STOP=1 -f "$CODE_DIR/load_reddit_comments.sql"
fi

if [[ $DO_LOAD_POSTS -eq 1 ]]; then
  if [[ $SANITIZE -eq 0 ]]; then
    echo "WARNING: --load-posts used without --sanitize; ensure input is already normalized." >&2
  fi
  echo "Converting filtered NDJSON to /tmp/reddit_clean.b64" >&2
  jq -rc 'if type=="array" then .[] else . end | @base64' "$OUTPUT" > /tmp/reddit_clean.b64
  echo "Loading posts via load_reddit_posts.sql" >&2
  psql "$PGURI" -v ON_ERROR_STOP=1 -f "$CODE_DIR/load_reddit_posts.sql"
fi
