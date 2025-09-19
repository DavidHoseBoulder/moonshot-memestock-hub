# Reddit Archive Backfill Guide

This note captures the repeatable process for taking a monthly Pushshift/Torrent
archive and loading the data back into the Moonshot Postgres instance. The
pipeline mirrors what `reddit_pipeline.sh` does, but lets us process large
backfills offline.

## Overview

1. **Download & stage** the raw archive (`.jsonl.gz` / `.zst`).
2. **Filter** the dump to the subreddits we track.
3. **Sanitize** JSON so every line is valid NDJSON.
4. **Prepare** the loader input (base64 for posts, raw NDJSON for comments).
5. **Load** via the existing SQL scripts with statement timeouts disabled.
6. **Verify** counts & spot-check for off-list subreddits.
7. **Clean up** partial loads and temporary files.

As of this writing step 1 (downloads for 2025-06 & 2025-07) is complete.

## Prerequisites

- Source `.env` so `$PGURI`, `$SUBREDDITS`, etc. are set: `source .env`.
- Ensure Supabase has free storage for the incoming batch. 18M comments can
  consume several GB; check the Supabase dashboard before large loads.
- Disable `statement_timeout` in the session: `psql "$PGURI" -c "SET
  statement_timeout = 0;"` before running the SQL loaders.

## 1. Filter by Subreddit

Use `reddit-utils/filter_subreddits.sh`. It accepts `.ndjson`, `.jsonl`,
`.jsonl.gz`, and `.zst` and writes filtered NDJSON.

```bash
SUBREDDITS="$SUBREDDITS" \
reddit-utils/filter_subreddits.sh \
  comments-RC_2025-06.jsonl.gz \
  /tmp/comments-2025-06-filtered.ndjson
```

Repeat for posts (`submissions-*.jsonl.gz`) or the July archives. The helper
reads the comma-separated `$SUBREDDITS` from `.env`, strips whitespace, and
drops any row whose `subreddit` is not in the allowlist.

## 2. Sanitize JSON

Normalize strings so embedded newlines are escaped and arrays are flattened to
one JSON object per line (matches `reddit_pipeline.sh`).

```bash
jq -c '
  objects
  | walk(
      if type == "string"
      then gsub("\r\n|\r|\n"; "\\n")
      else .
      end
    )
' /tmp/comments-2025-06-filtered.ndjson \
  > /tmp/reddit_clean_june_comments.ndjson
```

For posts swap the input path. Keep outputs in `/tmp` so the SQL loaders can
find them without editing (or update the loaders with the new path).

## 3. Convert for Loader

- **Posts**: Convert sanitized NDJSON to base64, one line per document (exactly
  what the pipeline does).

  ```bash
  jq -rc 'if type=="array" then .[] else . end | @base64' \
    /tmp/reddit_clean_june_posts.ndjson \
    > /tmp/reddit_clean.b64
  ```

- **Comments**: Already NDJSON; no base64 step required. Copy or rename the
  sanitized file to `/tmp/reddit_clean.ndjson` if using the hardcoded loader.

## 4. Load into Postgres

Run the existing SQL scripts after ensuring the scratch files are in place.

```bash
# Posts
psql "$PGURI" -c "SET statement_timeout = 0;"
cp /tmp/reddit_clean_june_posts.b64 /tmp/reddit_clean.b64   # if needed
psql "$PGURI" -v ON_ERROR_STOP=1 -f "$CODE_DIR/load_reddit_posts.sql"

# Comments
psql "$PGURI" -c "SET statement_timeout = 0;"
cp /tmp/reddit_clean_june_comments.ndjson /tmp/reddit_clean.ndjson
psql "$PGURI" -v ON_ERROR_STOP=1 -f "$CODE_DIR/load_reddit_comments.sql"
```

If you re-enable the environment variable support in the loaders, replace the
`cp` with `-v CLEANED_REDDIT_JSON_FILE=/path/to/file` when invoking `psql`.

## 5. Verify & Clean Up

- Confirm row counts:

  ```bash
  psql "$PGURI" -Atc "
    select count(*)
    from public.reddit_comments
    where created_utc >= '2025-06-01'::timestamptz
      and created_utc <  '2025-07-01'::timestamptz;
  "
  ```

- Spot-check top subreddits and ensure no off-list communities slipped through.
  If they did, delete by month and rerun the filtered load:

  ```bash
  psql "$PGURI" -c "
    delete from public.reddit_comments rc
    where rc.created_utc >= '2025-06-01'::timestamptz
      and rc.created_utc <  '2025-07-01'::timestamptz
      and lower(rc.subreddit) not in (
            select lower(name)
            from public.subreddit_universe
            where active = true
          );
  "
  ```

- Remove temporary files when finished: `rm /tmp/reddit_clean*`.

## Notes & Lessons

- Some Pushshift drops (e.g., `submissions-RC_2025-06.jsonl.gz`) are missing the
  `author` field entirely. Loads will refresh existing rows but cannot backfill
  missing author data unless a richer source is located.
- Always filter before generating `.b64`—once base64 encoded, filtering requires
  decoding each line.
- Supabase disk exhaustion aborts `COPY` with `FileFallocate()` errors. Monitor
  free space and rerun deletes/loads in month-sized batches to avoid partial
  state.
