-- Ensure views run with caller's privileges instead of elevated SECURITY DEFINER context
DO $$
DECLARE
  view_name text;
  views text[] := ARRAY[
    'reddit_mentions_all',
    'reddit_comments_clean',
    'v_reddit_candidates_today',
    'v_reddit_candidates_last_trading_day'
  ];
BEGIN
  FOREACH view_name IN ARRAY views LOOP
    EXECUTE format('ALTER VIEW public.%I SET (security_invoker = true);', view_name);
  END LOOP;
END $$;

-- Enable RLS across core domain tables; grant read-only to authenticated users, full to service_role
DO $$
DECLARE
  tbl text;
  domain_tables text[] := ARRAY[
    'backtest_signals_daily',
    'backtest_sweep_grid',
    'backtest_sweep_results',
    'cmp_per_symbol_baseline',
    'cmp_per_symbol_gated',
    'daily_trade_marks',
    'live_sentiment_entry_rules',
    'live_sentiment_entry_rules_backup',
    'market_holidays_us',
    'reddit_comments',
    'reddit_comments_raw',
    'reddit_finance_keep',
    'reddit_finance_keep_norm',
    'reddit_heuristics',
    'reddit_mentions',
    'reddit_raw_aug',
    'reddit_sentiment',
    'reddit_sentiment_daily',
    'sentiment_grade_config',
    'symbol_disambig',
    'ta_scenario_summary',
    'triggered_candidates',
    'trades'
  ];
BEGIN
  FOREACH tbl IN ARRAY domain_tables LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', tbl);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY;', tbl);
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC;', tbl);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon;', tbl);
    EXECUTE format('REVOKE ALL ON public.%I FROM authenticated;', tbl);

    EXECUTE format('DROP POLICY IF EXISTS %I_service_role_all ON public.%I;', tbl, tbl);
    EXECUTE format('DROP POLICY IF EXISTS %I_authenticated_select ON public.%I;', tbl, tbl);

    EXECUTE format($sql$
      CREATE POLICY %I_service_role_all ON public.%I
      FOR ALL TO service_role
      USING (true)
      WITH CHECK (true);
    $sql$, tbl, tbl);

    EXECUTE format($sql$
      CREATE POLICY %I_authenticated_select ON public.%I
      FOR SELECT TO authenticated
      USING (true);
    $sql$, tbl, tbl);
  END LOOP;
END $$;

-- Lock down staging/debug tables to service_role only
DO $$
DECLARE
  tbl text;
  internal_tables text[] := ARRAY[
    'dbg_final',
    'dbg_filtered',
    'dbg_priced',
    'dbg_ranked',
    'dbg_sched',
    'stage_lines_persist',
    'staging_reddit_comments',
    'staging_reddit_jsonl',
    'staging_reddit_submissions',
    'staging_reddit_submissions_buf',
    'staging_reddit_submissions_slim',
    'ta_scenario_staging',
    'tmp_cal',
    'tmp_entries',
    'tmp_export_author',
    'tmp_export_author_conc',
    'tmp_export_author_stability',
    'tmp_export_author_symbol',
    'tmp_trades',
    'reddit_comments_stage',
    'reddit_posts_stage'
  ];
BEGIN
  FOREACH tbl IN ARRAY internal_tables LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', tbl);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY;', tbl);
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC;', tbl);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon;', tbl);
    EXECUTE format('REVOKE ALL ON public.%I FROM authenticated;', tbl);

    EXECUTE format('DROP POLICY IF EXISTS %I_service_role_only ON public.%I;', tbl, tbl);
    EXECUTE format($sql$
      CREATE POLICY %I_service_role_only ON public.%I
      FOR ALL TO service_role
      USING (true)
      WITH CHECK (true);
    $sql$, tbl, tbl);
  END LOOP;
END $$;
