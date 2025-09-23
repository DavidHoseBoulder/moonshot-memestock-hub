# Agent Guidelines for Moonshot

## Project context
- Repo: moonshot-memestock-hub
- Primary stack: Lovable, Postgres (Supabase), bash ETL, SQL backtests, GCP VM (less used - for now only to execute the daily reddit-loader cron job)

## Directives
- Prefer Postgres-optimized SQL (CTEs over temp tables only when they reduce I/O).
- Preserve idempotency of daily snapshots and views (v_*) - so we don't screw up Lovable
- Ask before altering tables.
- Never invent columns; infer from schema comments "schema_dump.sql"


## Files of interest
- RedditPipeline.md - scrapes Reddit for sentiment, brings it into Postgres
- PipelineOptimizations.md - tasks for improving the pipeline
- BacktestingPipeline.md - testing trades
- RecommendingTrades.md - trade recommendations based on backtests & sentiment
- RedditArchiveDownload.md - processes Reddit archives to prep into the Reddit Pipeline
- CleanupTasks.md - random tasks

## Style
- Deterministic changes, explain reasoning, provide `psql`-ready blocks.
