-- Lock down public access and fix security issues

-- Remove public policies and require authentication for sensitive tables
-- Keep public access only for tables that truly need it (like market data)

-- 1. Lock down sentiment_history - remove public policies
DROP POLICY IF EXISTS "Allow public insert to sentiment history" ON public.sentiment_history;
DROP POLICY IF EXISTS "Allow public read access to sentiment history" ON public.sentiment_history;
DROP POLICY IF EXISTS "Allow public update to sentiment history" ON public.sentiment_history;

-- Create authenticated-only policies for sentiment_history
CREATE POLICY "Authenticated users can insert sentiment history" 
ON public.sentiment_history FOR INSERT 
TO authenticated 
WITH CHECK (true);

CREATE POLICY "Authenticated users can read sentiment history" 
ON public.sentiment_history FOR SELECT 
TO authenticated 
USING (true);

CREATE POLICY "Authenticated users can update sentiment history" 
ON public.sentiment_history FOR UPDATE 
TO authenticated 
USING (true);

-- 2. Lock down sentiment_analysis - remove public policies  
DROP POLICY IF EXISTS "Allow all operations" ON public.sentiment_analysis;

-- Create authenticated-only policies for sentiment_analysis
CREATE POLICY "Authenticated users can manage sentiment analysis" 
ON public.sentiment_analysis FOR ALL 
TO authenticated 
USING (true) 
WITH CHECK (true);

-- 3. Lock down import_runs - remove public policies
DROP POLICY IF EXISTS "Import runs are publicly readable" ON public.import_runs;
DROP POLICY IF EXISTS "Import runs can be inserted" ON public.import_runs;
DROP POLICY IF EXISTS "Import runs can be updated" ON public.import_runs;

-- Create authenticated-only policies for import_runs
CREATE POLICY "Authenticated users can read import runs" 
ON public.import_runs FOR SELECT 
TO authenticated 
USING (true);

CREATE POLICY "Authenticated users can insert import runs" 
ON public.import_runs FOR INSERT 
TO authenticated 
WITH CHECK (true);

CREATE POLICY "Authenticated users can update import runs" 
ON public.import_runs FOR UPDATE 
TO authenticated 
USING (true);

-- 4. Lock down backtesting_results - remove public insert
DROP POLICY IF EXISTS "Allow public insert to backtesting results" ON public.backtesting_results;

-- Create authenticated-only policy for backtesting_results
CREATE POLICY "Authenticated users can insert backtesting results" 
ON public.backtesting_results FOR INSERT 
TO authenticated 
WITH CHECK (true);

-- 5. Fix database function security issues by setting search_path
-- Update functions to have proper search_path security

CREATE OR REPLACE FUNCTION public.extract_symbols_from_text(s text)
 RETURNS text[]
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path = public
AS $function$
with hits as (
  select unnest(regexp_matches(coalesce(s,''), $re$
    (?:
      \$([A-Z]{1,5})                                 -- $TSLA
      |
      \b([A-Z]{2,5})(?:\b)                           -- TSLA, NVDA, AMD, SPY
      |
      \b(NVIDIA|NVidia|Nvidia|Apple|Tesla|Google|Alphabet|Amazon|Microsoft|Meta|Palantir)\b
    )
  $re$, 'g')) AS m
)
select nullif(array(
  select distinct upper(
    case
      when m like '$%' then substring(m from 2)
      when m ~* '^(nvidia|apple|tesla|google|alphabet|amazon|microsoft|meta|palantir)$' then
        case lower(m)
          when 'nvidia' then 'NVDA'
          when 'apple' then 'AAPL'
          when 'tesla' then 'TSLA'
          when 'google' then 'GOOGL'
          when 'alphabet' then 'GOOGL'
          when 'amazon' then 'AMZN'
          when 'microsoft' then 'MSFT'
          when 'meta' then 'META'
          when 'palantir' then 'PLTR'
        end
      else m
    end
  )
  from hits
  where m is not null and length(m) > 0
), '{}');
$function$;

CREATE OR REPLACE FUNCTION public.build_keywords_from_name(p_symbol text, p_name text)
 RETURNS text[]
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE
 SECURITY DEFINER
 SET search_path = public
AS $function$
  WITH stop AS (
    SELECT ARRAY[
      -- corporate suffixes
      'inc','inc.','corp','corp.','corporation','company','co','co.',
      'plc','sa','nv','llc','ltd','ltd.','limited',
      -- fluff words
      'the','and','&','holdings','technology','technologies','systems','services','group',
      -- class variants
      'class','classa','classb','classc'
    ]::text[] AS sw
  ),
  toks AS (
    SELECT DISTINCT t
    FROM regexp_split_to_table(lower(coalesce(p_name,'')), '[^a-z0-9]+') t
    WHERE length(t) >= 3
      AND t <> ''
      AND NOT (t = ANY( (SELECT sw FROM stop)::text[] ))
  )
  SELECT ARRAY(
    SELECT DISTINCT x FROM unnest(ARRAY[
      lower(p_symbol)   -- always include the ticker itself
    ]) x
    UNION
    SELECT t FROM toks
  );
$function$;

CREATE OR REPLACE FUNCTION public.from_epochish(txt text)
 RETURNS timestamp with time zone
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE
 SECURITY DEFINER
 SET search_path = public
AS $function$
  SELECT CASE
    WHEN txt ~ '^\d+(\.\d+)?$' THEN
      to_timestamp(
        CASE
          WHEN txt::numeric > 20000000000 THEN (txt::numeric / 1000.0)  -- ms→s
          ELSE txt::numeric
        END
      ) AT TIME ZONE 'UTC'
    ELSE NULL
  END
$function$;

CREATE OR REPLACE FUNCTION public.is_trading_day(d date)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SECURITY DEFINER
 SET search_path = public
AS $function$
  SELECT (EXTRACT(ISODOW FROM d) BETWEEN 1 AND 5)
         AND NOT EXISTS (SELECT 1 FROM market_holidays_us h WHERE h.holiday = d);
$function$;

CREATE OR REPLACE FUNCTION public.is_market_open(ts timestamp with time zone)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path = public
AS $function$
  SELECT EXTRACT(ISODOW FROM ts) BETWEEN 1 AND 5     -- Mon–Fri
         AND NOT EXISTS (
           SELECT 1
           FROM market_holidays_us h
           WHERE h.holiday = ts::date
         );
$function$;

-- Keep enhanced_market_data public as it's needed for market data access
-- Keep only the necessary public access for data ingestion

-- Create service role policies for data processing functions
CREATE POLICY "Service role can read all tables" 
ON public.sentiment_history FOR ALL 
TO service_role 
USING (true) 
WITH CHECK (true);

CREATE POLICY "Service role can manage sentiment analysis" 
ON public.sentiment_analysis FOR ALL 
TO service_role 
USING (true) 
WITH CHECK (true);

CREATE POLICY "Service role can manage import runs" 
ON public.import_runs FOR ALL 
TO service_role 
USING (true) 
WITH CHECK (true);

-- Ensure anon key can still access market data (needed for public data feeds)
-- but everything else requires authentication