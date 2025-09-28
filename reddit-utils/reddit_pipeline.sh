#!/usr/bin/env bash
set -euo pipefail

# ======================================
# Bootstrap env and directories (COMMENTED OUT)
# ======================================
# Source ~/.env if present so PGURI, SUBREDDITS, etc. load in
# if [[ -f "$HOME/.env" ]]; then
#   set -a
#  . "$HOME/.env"
#   set +a
# fi

: "${PGURI:?PGURI must be set (postgres connection string)}"

# Standard repo paths
CODE_DIR=${CODE_DIR:-"/home/dhose/moonshot-memestock-hub/reddit-utils"}
WORKING_DIR=${WORKING_DIR:-"/home/dhose/reddit_work"}
DEBUG=${DEBUG:-"0"}

# Inputs
: "${SUBREDDITS:=}"
: "${COMMENTS_FILTER:=${SUBREDDITS}}"

# All outputs live under WORKING_DIR
OUT_DIR=${OUT_DIR:-"$WORKING_DIR/out"}
OUT_COMMENTS_DIR=${OUT_COMMENTS_DIR:-"$WORKING_DIR/out_comments"}
# Scratch file used when piping data between stages. SQL loaders currently read
# their hardcoded /tmp targets directly, but keeping the variable lets us point
# the pipeline elsewhere if those scripts are updated.
CLEANED_REDDIT_JSON_FILE=${CLEANED_REDDIT_JSON_FILE:-"/tmp/reddit_clean.b64"}
# Comments loader expects newline-delimited JSON rather than base64.
CLEANED_REDDIT_COMMENTS_FILE=${CLEANED_REDDIT_COMMENTS_FILE:-"/tmp/reddit_clean.ndjson"}

# Hardcoded asset paths (prefer CODE_DIR)
LOAD_POSTS_SQL="$CODE_DIR/load_reddit_posts.sql"
LOAD_COMMENTS_SQL="$CODE_DIR/load_reddit_comments.sql"
INSERT_MENTIONS_SQL="$CODE_DIR/insert_mentions_window.sql"
SCORE_CMD="deno run --allow-env --allow-net --allow-read --allow-write \"$CODE_DIR/reddit_score_mentions.ts\""

mkdir -p "$WORKING_DIR" "$OUT_DIR" "$OUT_COMMENTS_DIR"
cd "$WORKING_DIR"

echo "Using CODE_DIR=$CODE_DIR WORKING_DIR=$WORKING_DIR DEBUG=$DEBUG"
echo "SUBREDDITS=${SUBREDDITS:-<empty>}"

# ======================================
# Helpers
# ======================================
usage() {
  cat <<'USAGE'
reddit_pipeline.sh
Fetch + Load Reddit posts/comments, build mentions, score, and surface daily signals.

Date window:
  --start-date YYYY-MM-DD     Start (UTC) inclusive. Default: most recent day found in DB (posts/comments)
  --end-date   YYYY-MM-DD     End (UTC) exclusive.   Default: tomorrow (UTC)

Stage control (names are comma-separated; order is always preserved):
  --only fetch_posts,load_posts,fetch_comments,load_comments,build_mentions,score,signals
     Run only the listed stages.
  --from-stage STAGE
     Run from STAGE through the end (STAGE ∈ the list above).
  If neither is provided, all stages run.

Environment:
  PGURI (required), SUBREDDITS, COMMENTS_FILTER, CODE_DIR, WORKING_DIR, DEBUG,
  OUT_DIR, OUT_COMMENTS_DIR.

Examples:
  ./reddit_pipeline.sh
  ./reddit_pipeline.sh --start-date 2025-08-27 --end-date 2025-08-30 --from-stage fetch_comments
  DEBUG=1 ./reddit_pipeline.sh --only build_mentions,score
USAGE
  exit 1
}

say() { printf '%s\n' "$*" >&2; }

require_file() {
  local f="$1"
  if [[ ! -f "$f" ]]; then
    say "ERROR: required file not found: $f"
    exit 2
  fi
}

# Get most recent date present in either posts or comments (UTC date).
detect_last_date_in_db() {
  psql "$PGURI" -Atc "
    with dates as (
      select max(created_utc)::date as d from public.reddit_posts
      union all
      select max(created_utc)::date as d from public.reddit_comments
    )
    select coalesce(max(d), (now() at time zone 'utc')::date - 1) from dates;
  "
}

# Portable date helper: prefer GNU date, fall back to python shim
_date_iso_utc() {
  local expr="$1"
  if command -v gdate >/dev/null 2>&1; then
    gdate -u -d "$expr" +"%Y-%m-%d"
  else
    python3 - "$expr" <<'PY'
import sys
from datetime import datetime, timedelta, timezone

expr = sys.argv[1].strip()
now = datetime.now(timezone.utc)

aliases = {
    "today": 0,
    "now": 0,
    "tomorrow": 1,
    "yesterday": -1,
}

if expr in aliases:
    dt = now + timedelta(days=aliases[expr])
else:
    try:
        dt = datetime.fromisoformat(expr)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        else:
            dt = dt.astimezone(timezone.utc)
    except ValueError:
        # Support bare YYYYMMDD or other simple forms
        for fmt in ("%Y-%m-%d", "%Y%m%d"):
            try:
                dt = datetime.strptime(expr, fmt).replace(tzinfo=timezone.utc)
                break
            except ValueError:
                continue
        else:
            print(expr, file=sys.stderr)
            raise

print(dt.strftime("%Y-%m-%d"))
PY
  fi
}

# ISO helpers
iso_date() {
  _date_iso_utc "$1"
}
tomorrow_utc() {
  _date_iso_utc "tomorrow"
}

# ======================================
# Parse args
# ======================================
START_DATE="${START_DATE:-}"
END_DATE="${END_DATE:-}"
ONLY="${ONLY:-}"
FROM_STAGE="${FROM_STAGE:-}"

# Normalize any env-provided dates so they behave like CLI input does.
if [[ -n "$START_DATE" ]]; then
  START_DATE="$(iso_date "$START_DATE")"
fi
if [[ -n "$END_DATE" ]]; then
  END_DATE="$(iso_date "$END_DATE")"
fi

while [[ $# -gt 0 ]]; do
  case "$1" in
    --start-date) START_DATE="$(iso_date "$2")"; shift 2 ;;
    --end-date)   END_DATE="$(iso_date "$2")";   shift 2 ;;
    --only)       ONLY="$2";                     shift 2 ;;
    --from-stage) FROM_STAGE="$2";               shift 2 ;;
    -h|--help)    usage ;;
    *)            say "Unknown arg: $1"; usage ;;
  esac
done

# Compute defaults for date window
if [[ -z "$START_DATE" ]]; then
  LAST_DB_DATE="$(detect_last_date_in_db)"
  START_DATE="$(iso_date "$LAST_DB_DATE")"
fi
if [[ -z "$END_DATE" ]]; then
  END_DATE="$(tomorrow_utc)"
fi

say "Backfill window: ${START_DATE} .. ${END_DATE} (UTC, end-exclusive)"

# ======================================
# Stage selection
# ======================================
ALL_STAGES=(fetch_posts load_posts fetch_comments load_comments build_mentions score signals)

normalize_csv() {
  # lowercases and removes spaces
  tr '[:upper:]' '[:lower:]' | tr -d ' '
}

# Build the list to run
STAGES_TO_RUN=("${ALL_STAGES[@]}")

if [[ -n "$ONLY" && -n "$FROM_STAGE" ]]; then
  say "ERROR: Use either --only or --from-stage (not both)."
  exit 3
fi

  if [[ -n "$ONLY" ]]; then
    IFS=',' read -r -a requested <<<"$(printf '%s' "$ONLY" | normalize_csv)"
    # Validate
    STAGES_TO_RUN=()
    matched=0
    for s in "${ALL_STAGES[@]}"; do
      for r in "${requested[@]}"; do
        [[ -z "$r" ]] && continue
        if [[ "$s" == "$r" ]]; then
          STAGES_TO_RUN+=("$s")
          matched=$((matched + 1))
          break
        fi
      done
    done
    if [[ $matched -eq 0 ]]; then
      say "ERROR: --only did not match any known stages."
      exit 4
    fi
elif [[ -n "$FROM_STAGE" ]]; then
  FROM_STAGE="$(printf '%s' "$FROM_STAGE" | normalize_csv)"
  found=""
  STAGES_TO_RUN=()
  for s in "${ALL_STAGES[@]}"; do
    if [[ -z "$found" && "$s" == "$FROM_STAGE" ]]; then
      found=1
    fi
    if [[ -n "$found" ]]; then STAGES_TO_RUN+=("$s"); fi
  done
  if [[ -z "$found" ]]; then
    say "ERROR: --from-stage '$FROM_STAGE' is not a valid stage."
    exit 5
  fi
fi

say "Stages to run: ${STAGES_TO_RUN[*]}"

# ======================================
# Ensure required files exist
# (We only require the ones needed for the selected stages.)
# ======================================
for s in "${STAGES_TO_RUN[@]}"; do
  case "$s" in
    load_posts)    require_file "$LOAD_POSTS_SQL" ;;
    load_comments) require_file "$LOAD_COMMENTS_SQL" ;;
    build_mentions)require_file "$INSERT_MENTIONS_SQL" ;;
  esac
done

# Ensure output dirs
mkdir -p "$OUT_DIR" "$OUT_COMMENTS_DIR"

# ======================================
# Stage implementations
# ======================================

fetch_posts() {
  say ">> Fetching posts..."
  START_DATE="$START_DATE" \
  END_DATE="$END_DATE" \
  SUBREDDITS="$SUBREDDITS" \
  deno run --allow-env --allow-net --allow-read --allow-write "$CODE_DIR/reddit_fetch_posts_date_range.ts"
}

load_posts() {
  say ">> Loading posts into Postgres..."
  find "$OUT_DIR" -type f -name '*.ndjson' -print0 \
    | sort -z \
    | while IFS= read -r -d '' f; do
        d="$(basename "$f" .ndjson)"
        # require YYYY-MM-DD and within [START_DATE, END_DATE)
        if [[ ! "$d" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]]; then
          echo "  (skip) not a date-stamped file: $f"; continue
        fi
        if [[ "$d" < "$START_DATE" || "$d" == "$END_DATE" || "$d" > "$END_DATE" ]]; then
	  echo "  (skip) outside window $START_DATE..$END_DATE: $f"; continue
        fi

        say "BEGIN load $f"

        # One-object-per-line → one-base64-line-per-object
        if ! jq -rc 'if type=="array" then .[] else . end | @base64' "$f" > "$CLEANED_REDDIT_JSON_FILE" ; then
          echo "  (skip) jq parse error" ; continue
        fi

        clean_lines=$(wc -l < "$CLEANED_REDDIT_JSON_FILE" || echo 0)
        orig_lines=$(wc -l < "$f" || echo 0)
        echo "  kept ${clean_lines}/${orig_lines} lines (dropped $((orig_lines - clean_lines)))"

        [ "$clean_lines" -eq 0 ] && { echo "  (skip) no valid JSON rows after cleaning"; continue; }

        psql "$PGURI" -v ON_ERROR_STOP=1 -X \
          -v DEBUG="$DEBUG" \
          -v CLEANED_REDDIT_JSON_FILE="$CLEANED_REDDIT_JSON_FILE" \
          -f "$LOAD_POSTS_SQL"

        say "DONE load $f"
      done
}

fetch_comments() {
  say ">> Fetching comments..."
  # Run from CODE_DIR so the script can read supabase_pooler_ca_chain.pem
  (
    cd "$CODE_DIR"
    START_DATE="$START_DATE" \
    END_DATE="$END_DATE" \
    SUBREDDITS="$COMMENTS_FILTER" \
    COMMENTS_OUT_DIR="$OUT_COMMENTS_DIR" \
    deno run --allow-env --allow-net --allow-read --allow-write "./reddit_fetch_comments_date_range.ts"
  )
}

load_comments() {
  say ">> Loading comments (raw) into Postgres..."
  find "$OUT_COMMENTS_DIR" -type f -name '*.ndjson' -print0 \
    | sort -z \
    | while IFS= read -r -d '' f; do
        d="$(basename "$f" .ndjson)"
        if [[ ! "$d" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]]; then
          echo "  (skip) not a date-stamped file: $f"; continue
        fi
	if [[ "$d" < "$START_DATE" || "$d" == "$END_DATE" || "$d" > "$END_DATE" ]]; then
          echo "  (skip) outside window $START_DATE..$END_DATE: $f"; continue
        fi

        say "BEGIN load  $f"

        # Derive subreddit from the folder name (…/out_comments/<sub>/<date>.ndjson)
        sub="$(basename "$(dirname "$f")")"

        # Normalize to strict NDJSON; escape embedded newlines in strings
        if ! jq -c '
          objects
          | walk(
              if type == "string"
              then gsub("\r\n|\r|\n"; "\\n")
              else .
              end
            )
        ' "$f" > "$CLEANED_REDDIT_COMMENTS_FILE" ; then
          echo "  (skip) jq parse error" ; continue
        fi

        clean_lines=$(wc -l < "$CLEANED_REDDIT_COMMENTS_FILE" || echo 0)
        orig_lines=$(wc -l < "$f" || echo 0)
        echo "  kept ${clean_lines}/${orig_lines} lines (dropped $((orig_lines - clean_lines)))"

        [ "$clean_lines" -eq 0 ] && { echo "  (skip) no valid JSON rows after cleaning"; continue; }

        psql "$PGURI" -v ON_ERROR_STOP=1 -X \
          -v DEBUG="$DEBUG" \
          -v sub="$sub" \
          -v CLEANED_REDDIT_JSON_FILE="$CLEANED_REDDIT_COMMENTS_FILE" \
          -f "$LOAD_COMMENTS_SQL"

        say "DONE load $f"
      done
}

build_mentions() {
  say ">> Building mentions for window: ${START_DATE} .. ${END_DATE} (UTC, END exclusive)"

  # Form full timestamptz literals (if START_DATE/END_DATE are dates like 2025-08-29)
  # If you already set full timestamps upstream, these lines are still fine.
  local D0="${START_DATE} 00:00:00+00"
  local D3="${END_DATE} 00:00:00+00"

  # Pass psql vars that match insert_mentions_window.sql placeholders: :'d0' and :'d3'
  psql "$PGURI" -v ON_ERROR_STOP=1 -X \
    -v DEBUG="$DEBUG" \
    -v d0="'$D0'" \
    -v d3="'$D3'" \
    -f "$INSERT_MENTIONS_SQL"
}

score() {
  say ">> Scoring mentions..."
  if [[ -z "$SCORE_CMD" ]]; then
    say "No SCORE_CMD set; skipping scoring step."
    return 0
  fi
  # Run from CODE_DIR so deno picks up deno.json/package.json and npm deps
  (
    cd "$CODE_DIR"
    START_DATE="$START_DATE" \
    END_DATE="$END_DATE" \
    deno run --allow-env --allow-net --allow-read --allow-write ./reddit_score_mentions.ts
  )
}

signals() {
  say ">> Signals snapshot (sanity)…"
  # Touch the views to ensure data exists for today; this also makes nice logs.
  psql "$PGURI" -Atc "
    select count(*) as rows_today
    from public.v_reddit_daily_signals
    where trade_date = (now() at time zone 'utc')::date;
  " | awk '{print "v_reddit_daily_signals rows_today=" $1}'

  psql "$PGURI" -Atc "
    select trade_date, count(*) as n
    from public.v_reddit_daily_signals
    where trade_date >= (date_trunc('day', now() at time zone 'utc')::date - interval '2 day')::date
    group by 1
    order by 1 desc;
  " | sed 's/^/  /'
}

# ======================================
# Execute selected stages
# ======================================
for s in "${STAGES_TO_RUN[@]}"; do
  case "$s" in
    fetch_posts)    fetch_posts ;;
    load_posts)     load_posts ;;
    fetch_comments) fetch_comments ;;
    load_comments)  load_comments ;;
    build_mentions) build_mentions ;;
    score)          score ;;
    signals)        signals ;;
    *) say "Unknown stage in dispatcher: $s"; exit 6 ;;
  esac
done

say "Pipeline finished for ${START_DATE} .. ${END_DATE}"
