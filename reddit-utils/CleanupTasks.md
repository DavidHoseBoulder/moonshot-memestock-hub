# Cleanup Tasks

### Duplicate Index Review (all Postgres tables)

- Goal: remove redundant indexes across the warehouse to speed up writes and reduce storage.
- Context: `\d+ public.reddit_mentions` shows multiple overlapping btree indexes on `(doc_type, doc_id)`, `(symbol, created_utc)`, etc.; perform the same audit for other high-write tables.
- Action items:
  - [ ] Catalog existing indexes per table (start with `\d+` or pg_catalog queries; Sept 19 output covers `reddit_mentions`).
  - [ ] Identify duplicates/redundant indexes (e.g., `reddit_mentions_doc_idx` vs `idx_reddit_mentions_doc` vs `ux_mentions_doc_symbol`, repeat for other tables).
  - [ ] Drop unused/overlapping indexes (ensure they are not referenced by constraints or queries).
  - [ ] Re-run EXPLAIN on inserts/upserts to confirm reduced overhead.

### Dormant Views / Tables Audit

- Goal: find and remove unused views/tables in `reddit_utils` schema to reduce maintenance.
- Action items:
  - [ ] Inventory views in use (grep repo for `v_` references, last access in logs).
  - [ ] Flag views/tables with no usage.
  - [ ] Drop or archive unused objects.
  - [ ] Update documentation/runbooks accordingly.

### General

- Track TODOs that don’t have a home (like index cleanup) here until they are built into the main pipeline roadmap.

### GitHub Repo Hardening (public → restricted)

- Goal: lock down the public repo and enforce minimum-security standards.
- Action items:
  - [ ] Make repository private (Settings → General → Danger Zone → Change visibility).
  - [ ] Review collaborators/teams; remove unused access and enforce least privilege.
  - [ ] Enable branch protection on `main` (require PRs, reviews, status checks, linear history, and signed commits if feasible).
  - [ ] Require GitHub Actions to use `GITHUB_TOKEN` with least scopes; restrict which actions can run (allowlist).
  - [ ] Rotate and prune repository secrets; remove unused secrets and audit environments.
  - [ ] Disable forking if not needed; disable public issues/discussions if not used.
  - [ ] Enable Dependabot alerts and security updates; fix critical/high alerts.
  - [ ] Configure CODEOWNERS for critical paths and require code owner review.
  - [ ] Audit past PRs/commits for accidental secrets; run secret scan (e.g., GitHub Advanced Security or trufflehog locally) and remediate.
  - [ ] Add SECURITY.md with disclosure policy and contact.

### Supabase Security (RLS and access control)

- Goal: ensure data access is restricted by default; enable RLS and write explicit policies.
- Action items:
  - [ ] Enable RLS on all user-facing tables and views (run `alter table ... enable row level security;`).
  - [ ] Add default deny policies (no select/insert/update/delete) then selectively allow per role.
  - [ ] Define roles and grants (e.g., `anon`, `authenticated`, service role) with least privilege.
  - [ ] Write per-table RLS policies using `auth.uid()` and ownership columns (e.g., `user_id` matches `auth.uid()`), including INSERT checks.
  - [ ] For public/aggregated data, expose via secure views or edge functions rather than granting table-wide access.
  - [ ] Remove direct client access to sensitive tables; route via RPCs (Postgres functions) with `security definer` only when necessary and safe.
  - [ ] Restrict Supabase API keys: rotate anon/service keys, store as secrets (not in code), and limit exposure.
  - [ ] Verify storage policies (Supabase Storage buckets): disable public buckets unless required; add object-level policies.
  - [ ] Review Realtime and REST settings; disable channels not in use.
  - [ ] Add tests/checks: script to assert RLS enabled on all tables and that no broad `using (true)` or `with check (true)` remain.
  - [ ] Run the checklist: `psql "$SUPABASE_DB_URL" -f reddit-utils/db/rls_checklist.sql` and remediate findings.
