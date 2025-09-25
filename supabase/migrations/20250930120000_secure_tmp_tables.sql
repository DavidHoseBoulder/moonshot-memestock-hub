-- Enforce row-level security on internal staging/temp tables now exposed to PostgREST
DO $$
DECLARE
  tbl text;
  has_policy boolean;
  internal_tables text[] := ARRAY[
    'ta_scenario_staging',
    'tmp_trades'
  ];
BEGIN
  FOREACH tbl IN ARRAY internal_tables LOOP
    -- Ensure RLS is active and mandatory
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', tbl);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY;', tbl);

    -- Remove any lingering grants to non-service roles
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC;', tbl);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon;', tbl);
    EXECUTE format('REVOKE ALL ON public.%I FROM authenticated;', tbl);

    -- Drop old service-role policy if present to avoid spurious notices
    EXECUTE format(
      'SELECT EXISTS (
         SELECT 1
         FROM pg_policy
         WHERE polrelid = ''public.%I''::regclass
           AND polname = %L
       )',
      tbl,
      format('%s_service_role_only', tbl)
    )
    INTO has_policy;

    IF has_policy THEN
      EXECUTE format('DROP POLICY %I_service_role_only ON public.%I;', tbl, tbl);
    END IF;

    -- Keep access restricted to the Supabase service role
    EXECUTE format($sql$
      CREATE POLICY %I_service_role_only ON public.%I
      FOR ALL TO service_role
      USING (true)
      WITH CHECK (true);
    $sql$, tbl, tbl);
  END LOOP;
END $$;
