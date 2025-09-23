-- Supabase RLS Verification Checklist
-- Usage: psql "$SUPABASE_DB_URL" -f rls_checklist.sql

\t on
\pset pager off

-- 1) Tables with RLS disabled
select
  n.nspname as schema,
  c.relname as table,
  case when relrowsecurity then 'enabled' else 'DISABLED' end as rls,
  case when relforcerowsecurity then 'forced' else 'not_forced' end as rls_mode
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where c.relkind = 'r'
  and n.nspname not in ('pg_catalog','information_schema')
  and n.nspname !~ '^pg_toast'
order by rls desc, schema, table;

-- 2) Tables lacking any policies (potentially over-permissive if RLS enabled)
with policies as (
  select polrelid, count(*) cnt from pg_policy group by 1
)
select n.nspname as schema, c.relname as table, coalesce(p.cnt,0) as policy_count
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
left join policies p on p.polrelid = c.oid
where c.relkind = 'r'
  and n.nspname not in ('pg_catalog','information_schema')
order by policy_count, schema, table;

-- 3) Policies that are effectively allow-all (flag simple true conditions)
select n.nspname as schema,
       c.relname as table,
       pol.polname,
       pol.polcmd,
       pg_get_expr(pol.polqual, pol.polrelid)   as using_expr,
       pg_get_expr(pol.polwithcheck, pol.polrelid) as with_check_expr
from pg_policy pol
join pg_class c on c.oid = pol.polrelid
join pg_namespace n on n.oid = c.relnamespace
where n.nspname not in ('pg_catalog','information_schema')
  and (
    coalesce(pg_get_expr(pol.polqual, pol.polrelid),'') ~* '^\s*true\s*$' or
    coalesce(pg_get_expr(pol.polwithcheck, pol.polrelid),'') ~* '^\s*true\s*$'
  )
order by schema, table, pol.polname;

-- 4) Quick view of grants (ensure least privilege)
select n.nspname as schema,
       c.relname as table,
       pg_catalog.array_to_string(c.relacl, '\n') as grants
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where c.relkind in ('r','v','m')
  and n.nspname not in ('pg_catalog','information_schema')
order by schema, table;

-- 5) Storage note (manual): verify storage bucket policies separately via Supabase dashboard or APIs.

