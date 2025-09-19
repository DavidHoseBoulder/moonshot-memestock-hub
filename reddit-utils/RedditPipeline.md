# Reddit Ingest + Scoring Pipeline

This document explains how to fetch Reddit posts and comments, load them into Postgres, build mentions, score sentiment, and snapshot signals.

## Overview

- Fetch posts for configured subreddits and date window.
- Load posts and comments into raw/clean tables.
- Build symbol mentions from posts/comments in the window.
- Score mentions using the OpenAI model and persist per-mention sentiment.
- Surface daily signals via views for downstream selection/backtests.

## Runner

- Script: `moonshot-memestock-hub/reddit-utils/reddit_pipeline.sh`
- Stages: `fetch_posts`, `load_posts`, `fetch_comments`, `load_comments`, `build_mentions`, `score`, `signals`
- Date args: `--start-date YYYY-MM-DD`, `--end-date YYYY-MM-DD` (end exclusive)
- Stage filters:
  - `--only fetch_posts,load_posts,...`
  - `--from-stage load_comments`

## Environment

Provide these via `~/.env` (pipeline sources it) or the shell environment:

- `PGURI` (required): Postgres connection string (e.g., Supabase pooler URL).
- `GIT_REPO` (informational): `https://github.com/DavidHoseBoulder/moonshot-memestock-hub`
- `CODE_DIR`: Default `/home/dhose/moonshot-memestock-hub/reddit-utils`
- `WORKING_DIR`: Default `/home/dhose/reddit_work`
- `SUBREDDITS`: Comma list of subs for posts (also basis for comments unless filtered)
- `COMMENTS_SUBS` (optional): Comma list of subs for comments. If not set, defaults to a core finance/trading set in the comments fetcher. The pipeline passes `COMMENTS_FILTER` to comments fetch as `SUBREDDITS`.
- `START_DATE`, `END_DATE`: Optional defaults (pipeline will detect latest DB date and tomorrow if unset)
- `DEBUG`: `0`/`1` to control debug blocks in SQL (passed as `-v DEBUG=...`)
- Scoring:
  - `OPENAI_API_KEY` (required for scoring)
  - `MODEL_TAG` (e.g. `gpt-sent-v1`), `BATCH_SIZE`, `MAX_BATCHES`, `SLEEP_MS`
  - Optional: `SYMBOLS` for restricting scoring to a comma list

Notes:
- Output folders live under `WORKING_DIR` by default:
  - `OUT_DIR=$WORKING_DIR/out`
  - `OUT_COMMENTS_DIR=$WORKING_DIR/out_comments`
- SQL and scorer paths are fixed under `CODE_DIR`:
  - `load_reddit_posts.sql`, `load_reddit_comments.sql`, `insert_mentions_window.sql`, `reddit_score_mentions.ts`

## Dependencies

- `deno` (fetch and scoring scripts). For Deno v2, this repo includes `deno.json` with `"nodeModulesDir": "auto"` and a `package.json` declaring `pg@8.11.3`.
- `psql` and `jq`
- Network access to Reddit API and Postgres

TLS/CA for Postgres (comments fetcher):
- If `PGSSLROOTCERT` (or `PGSSLCA`) is set to a PEM path, it will be used.
- Otherwise, the fetcher relies on the system trust store (set `DENO_TLS_CA_STORE=system` in `.env`).

## Quick Start

1) Set up `~/.env` (sample excerpt):

```
PGURI='postgres://...'
GIT_REPO='https://github.com/DavidHoseBoulder/moonshot-memestock-hub'
CODE_DIR='/home/dhose/moonshot-memestock-hub/reddit-utils'
WORKING_DIR='/home/dhose/reddit_work'
SUBREDDITS='stocks,investing,StockMarket,wallstreetbets,...'
COMMENTS_SUBS='stocks,investing,StockMarket,wallstreetbets,...'
OPENAI_API_KEY='sk-...'
MODEL_TAG='gpt-sent-v1'
```

2) Run the entire pipeline for the default window:

```
moonshot-memestock-hub/reddit-utils/reddit_pipeline.sh

# First run on Deno v2 will auto-install npm deps under node_modules
# If needed, you can bootstrap explicitly:
#   (cd moonshot-memestock-hub/reddit-utils && deno install)
```

3) Examples:

```
# Only build mentions and score for a window
DEBUG=1 moonshot-memestock-hub/reddit-utils/reddit_pipeline.sh \
  --start-date 2025-08-27 --end-date 2025-08-30 \
  --only build_mentions,score

# From loading comments onward
moonshot-memestock-hub/reddit-utils/reddit_pipeline.sh \
  --from-stage load_comments
```

## Stages

- `fetch_posts`: Deno script reads `SUBREDDITS`, `START_DATE`, `END_DATE`; writes NDJSON to `OUT_DIR/<sub>/<YYYY-MM-DD>.ndjson`.
- `load_posts`: Cleans and loads posts NDJSON using `load_reddit_posts.sql` (persists `subreddit`, `author`, title/body, score fields into `reddit_finance_keep_norm`).
- `fetch_comments`: Deno script reads `SUBREDDITS` (sourced from `COMMENTS_FILTER`), `START_DATE`, `END_DATE`; writes NDJSON to `OUT_COMMENTS_DIR/<sub>/<YYYY-MM-DD>.ndjson`.
- `load_comments`: Normalizes and loads comments NDJSON using `load_reddit_comments.sql`.
- `build_mentions`: Executes `insert_mentions_window.sql` over the date window; populates `reddit_mentions` (now includes `doc_type`, `doc_id`, `subreddit`, `author`, `author_karma` when available).
- `score`: Runs `reddit_score_mentions.ts` (OpenAI); writes per-mention sentiment back to DB.
- `signals`: Touches and prints `v_reddit_daily_signals` counts for sanity.

## Outputs

- Files:
  - `WORKING_DIR/out/<sub>/<YYYY-MM-DD>.ndjson`
  - `WORKING_DIR/out_comments/<sub>/<YYYY-MM-DD>.ndjson`
- Tables/Views (typical):
  - `reddit_finance_keep_norm` (post metadata including `author`)
  - `reddit_comments[_clean]` (comment metadata with `author`)
  - `reddit_mentions` (symbol mentions carrying doc metadata + author fields)
  - `v_scoring_posts`, `v_reddit_daily_signals`

## Scheduling

Recommended: use the cron wrapper to handle PATH, `.env`, logging, and email notifications.

- Wrapper script: `~/cron_reddit_pipeline.sh` (adjust path if different)
- What it does:
  - Sources `~/.env` for `PGURI`, `CODE_DIR`, `WORKING_DIR`, `OPENAI_API_KEY`, etc.
  - Sets a robust `PATH` including Deno (`~/.deno/bin`).
  - Computes a UTC window of `yesterday .. tomorrow` (end-exclusive) for a safe nightly sweep.
  - Runs `reddit_pipeline.sh` from `WORKING_DIR` and appends to `cron_reddit_pipeline.log`.
  - Sends a summary email via `msmtp` with the last 150 log lines.

Example crontab entries:

```
# Daily at 06:10 Mountain Time (cron runs in system time)
10 6 * * * /home/dhose/cron_reddit_pipeline.sh >/dev/null 2>&1

# Generic one-liner (no email). Ensure PATH and .env are in scope.
0 7 * * * /bin/bash -lc 'source ~/.env && moonshot-memestock-hub/reddit-utils/reddit_pipeline.sh >> "$WORKING_DIR/cron_reddit_pipeline.log" 2>&1'
```

Email configuration (optional, for wrapper):

- In `~/.env` set:
  - `MAIL_TO="you@example.com"`
  - `MSMTP_ACCOUNT="default"` (or your named account from `~/.msmtprc`)
- The wrapper writes a human-readable body to `"$WORKING_DIR/reddit_pipeline_mail.txt"` and sends via `msmtp` if present.

Logs and rotation:

- Rolling log: `"$WORKING_DIR/cron_reddit_pipeline.log"`
- Consider rotating by date, e.g. write to `"$WORKING_DIR/logs/cron_$(date +%F).log"` and keep a `cron_reddit_pipeline.log` symlink to the latest.

Manual run and test:

```
# Run once interactively (uses your ~/.env)
bash ~/cron_reddit_pipeline.sh

# Send a test email (if provided by repo setup)
bash ~/send_test_email.sh "Pipeline test" "This is a test."
```

## Troubleshooting

- `deno: command not found`: Ensure Deno is installed and on PATH for the user/cron.
- Connection/auth errors to Postgres: verify `PGURI` and SSL options; pipeline uses pooler-friendly settings.
- Empty outputs: check `SUBREDDITS`, `COMMENTS_SUBS`, date ranges, and Reddit API rate limiting.
- Scoring errors: verify `OPENAI_API_KEY`, `MODEL_TAG`, and network egress.

## Conventions and Notes

- The pipeline exports dates to the Deno fetchers via env to ensure the window is respected.
- Comments fetch runs from `CODE_DIR` to access `supabase_pooler_ca_chain.pem` for DB reads prior to fetching (post IDs).
- `DEBUG` is passed to psql as `-v DEBUG=...`; SQL can use `\if :DEBUG` blocks for diagnostics.
- Hardcoded asset names reduce env variability; if you want alternate file names, edit `reddit_pipeline.sh` once in `CODE_DIR`.

## Proposed Follow-ups

- Unify naming (`OUT_COMMENTS_DIR` vs. `COMMENTS_OUT_DIR`)—currently bridged by exporting `COMMENTS_OUT_DIR="$OUT_COMMENTS_DIR"` when running the comments fetcher.
- Consider a small wrapper `run_reddit_pipeline.sh` mirroring backtest wrappers for ergonomic daily runs and logs.

## TODOs

- Remove the local copy of `supabase_pooler_ca_chain.pem` from `reddit-utils` and standardize on TLS trust via environment:
  - Prefer `PGSSLROOTCERT=/path/to/ca_chain.pem` when a custom chain is required, otherwise rely on system trust with `DENO_TLS_CA_STORE=system`.
- After cleanup, update any references in docs/scripts to avoid assuming the PEM file is colocated with code.
