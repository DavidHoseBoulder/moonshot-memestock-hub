# Cleanup Tasks

### Duplicate Index Review (all Postgres tables)

- Goal: remove redundant indexes across the warehouse to speed up writes and reduce storage.
- Context: `\d+ public.reddit_mentions` shows multiple overlapping btree indexes on `(doc_type, doc_id)`, `(symbol, created_utc)`, etc.; perform the same audit for other high-write tables.
- Action items:
  - [x] Catalog existing indexes per table (start with `\d+` or pg_catalog queries; Sept 19 output covers `reddit_mentions`).
  - [x] Identify duplicates/redundant indexes (e.g., `reddit_mentions_doc_idx` vs `idx_reddit_mentions_doc` vs `ux_mentions_doc_symbol`, repeat for other tables).
  - [x] Drop unused/overlapping indexes (ensure they are not referenced by constraints or queries). *2025-09-23: removed `idx_reddit_mentions_doc`, `ix_mentions_created`, and redundant `reddit_sentiment` indexes; verified only `reddit_sentiment_model_idx` remains active via `pg_stat_user_indexes`.*
  - [x] Re-run EXPLAIN on inserts/upserts to confirm reduced overhead. *2025-09-23: insert/upsert paths on `reddit_mentions` and `reddit_sentiment` completed in 12.4 ms and 4.2 ms respectively with expected plans.*

### Dormant Views / Tables Audit

- Goal: find and remove unused views/tables in `reddit_utils` schema to reduce maintenance.
- Action items:
  - [ ] Inventory views in use (grep repo for `v_` references, last access in logs).
  - [ ] Flag views/tables with no usage.
  - [ ] Drop or archive unused objects.
  - [ ] Update documentation/runbooks accordingly.
  - Findings:
    - Views actively referenced: `v_daily_pnl_rollups`, `v_daily_pnl_by_symbol`, `v_home_kpis`, `v_recommended_trades_today_conf`, `v_reddit_daily_signals`, `v_reddit_candidates_today`, `v_reddit_candidates_last_trading_day`, `v_latest_reddit_trade_date`, `v_today_velocity_ranked`, `v_sentiment_history`, `v_sentiment_velocity_lite`, `v_reddit_monitoring_signals`, `v_entry_candidates`, `v_market_rolling_features`, `v_scoring_posts_union_src`, `v_trade_mentions_primary`, `v_trade_perf_by_subreddit`, `v_trade_perf_by_author_tier`.
    - Views with no repository consumers (needs pg_stat confirmation before drop): `v_backtest_summary`, `v_import_runs_daily_summary`, `v_import_runs_latest`, `v_live_sentiment_rules`, `v_live_sentiment_signals`, `v_live_rules_effective`, `v_post_attrs`, `v_reddit_backtest_lookup`, `v_reddit_mentions_all`, `v_reddit_mentions_aug`, `v_reddit_mentions_june`, `v_recommended_trades_today`.
    - `pg_stat_statements` check (2025-09-23; stats last reset 2025-08-20): `v_reddit_candidates_raw`, `v_reddit_mentions_july`, `v_today_velocity_spikes` reported zero executions and no dependents—dropped 2025-09-23. Remaining views show low but non-zero traffic; revisit after next stats reset.
    - Tables with minimal/zero repo references: `import_runs`, `backtesting_results`, `reddit_comments_raw`, `sentiment_analysis`, `trading_signals`, `enhanced_sentiment_data`, `live_sentiment_entry_rules_backup`, `triggered_candidates`, `reddit_finance_keep`, `ticker_universe`, `reddit_comments_stage`, `staging_reddit_comments`, `staging_reddit_submissions`, `staging_reddit_submissions_buf`, `staging_reddit_submissions_slim`, `reddit_posts_stage`, `stage_lines_persist`, `ta_scenario_summary`, `ta_scenario_staging`, `tmp_entries`, `tmp_cal`, `tmp_trades`, `tmp_export_author`, `tmp_export_author_conc`, `tmp_export_author_stability`, `tmp_export_author_symbol`. Recommend double-checking pg activity and upstream jobs before decommissioning.

### General

- Track TODOs that don’t have a home (like index cleanup) here until they are built into the main pipeline roadmap.
- [ ] Add ticker-merge alias handling to Polygon/Yahoo loaders so `PARA`→`PSKY` (and similar) keep a continuous history. Notes: capture rename map in `ticker_universe`, fan out to backfills + edge functions, rehydrate missing 2025-09 gaps once alias support lands.

### GitHub Repo Hardening (public → restricted)

- Goal: lock down the public repo and enforce minimum-security standards.
- Action items:
  - [ ] Make repository private (Settings → General → Danger Zone → Change visibility).
    - ✅ Already private (verified 2025-09-24). No change needed.
  - [x] Review collaborators/teams; remove unused access and enforce least privilege. *2025-09-24: repository owner only; no external collaborators.*
  - [ ] Enable branch protection on `main` (require PRs, reviews, status checks, linear history, and signed commits if feasible). *Blocked by free-tier rulesets; revisit if we migrate to GitHub Team.*
  - [x] Require GitHub Actions to use `GITHUB_TOKEN` with least scopes; restrict which actions can run (allowlist). *Workflow permissions tightened 2025-09-24; workflows verified to rely on `secrets.GITHUB_TOKEN` only.*
  - [x] Rotate and prune repository secrets; remove unused secrets and audit environments. *Checked 2025-09-24; no stale or unused secrets present.*
  - [x] Disable forking if not needed; disable public issues/discussions if not used. *Forking/issues already disabled on private repo.*
  - [ ] Enable Dependabot alerts and security updates; fix critical/high alerts.
  - [ ] Configure CODEOWNERS for critical paths and require code owner review.
  - [ ] Audit past PRs/commits for accidental secrets; run secret scan (e.g., GitHub Advanced Security or trufflehog locally) and remediate.
  - [ ] Add SECURITY.md with disclosure policy and contact.

### Supabase Security (RLS and access control)

- Goal: ensure data access is restricted by default; enable RLS and write explicit policies.
- Action items:
  - [x] Enable RLS on all user-facing tables and views (run `alter table ... enable row level security;`).
  - [x] Add default deny policies (no select/insert/update/delete) then selectively allow per role.
  - [x] Define roles and grants (e.g., `anon`, `authenticated`, service role) with least privilege.
  - [x] Write per-table RLS policies using `auth.uid()` and ownership columns (e.g., `user_id` matches `auth.uid()`), including INSERT checks.
  - [x] For public/aggregated data, expose via secure views or edge functions rather than granting table-wide access.
  - [x] Remove direct client access to sensitive tables; route via RPCs (Postgres functions) with `security definer` only when necessary and safe.
  - [x] Restrict Supabase API keys: rotate anon/service keys, store as secrets (not in code), and limit exposure.
  - [x] Verify storage policies (Supabase Storage buckets): disable public buckets unless required; add object-level policies.
  - [x] Review Realtime and REST settings; disable channels not in use.
  - [x] Add tests/checks: script to assert RLS enabled on all tables and that no broad `using (true)` or `with check (true)` remain.
  - [x] Run the checklist: `psql "$SUPABASE_DB_URL" -f reddit-utils/db/rls_checklist.sql` and remediate findings.
  - Notes (2025-09-24): Supabase lint clean after applying `supabase/migrations/20250924_security_invoker_and_rls.sql`; Lovable confirmed ProtectedRoute auth covers app, remaining platform settings (password policy, PG upgrade, extension schema) tracked separately.
