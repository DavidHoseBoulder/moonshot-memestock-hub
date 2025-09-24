-- Fix remaining database function security issues

-- Update remaining functions to have proper search_path security
CREATE OR REPLACE FUNCTION public.json_try(txt text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
DECLARE j jsonb;
BEGIN
  j := txt::jsonb;
  RETURN j;
EXCEPTION WHEN others THEN
  RETURN NULL;
END
$function$;

CREATE OR REPLACE FUNCTION public.try_parse_jsonb(txt text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
DECLARE j jsonb;
BEGIN
  j := txt::jsonb;
  RETURN j;
EXCEPTION WHEN others THEN
  RETURN NULL;
END
$function$;

CREATE OR REPLACE FUNCTION public.__parse_json_or_raise(p_rn bigint, p_line text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
DECLARE j jsonb;
BEGIN
  BEGIN
    j := p_line::jsonb;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'Bad JSON at line %: %', p_rn, left(p_line, 300);
  END;
  RETURN j;
END$function$;

CREATE OR REPLACE FUNCTION public.upsert_reddit_sentiment(p_mention_id bigint, p_model text, p_score numeric, p_label text, p_confidence numeric, p_rationale text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
BEGIN
  INSERT INTO public.reddit_sentiment
    (mention_id, model_version, overall_score, label, confidence, rationale)
  VALUES
    (p_mention_id, p_model, p_score, p_label, p_confidence, p_rationale)
  ON CONFLICT (mention_id, model_version) DO UPDATE
  SET overall_score = EXCLUDED.overall_score,
      label         = EXCLUDED.label,
      confidence    = EXCLUDED.confidence,
      rationale     = EXCLUDED.rationale,
      processed_at  = now();
END;
$function$;

CREATE OR REPLACE FUNCTION public._subreddit_universe_lower_name()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
BEGIN
  NEW.name := LOWER(NEW.name);
  RETURN NEW;
END$function$;

CREATE OR REPLACE FUNCTION public.sync_reddit_sentiment_to_history()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
BEGIN
  -- For each symbol mentioned in the sentiment analysis, create/update sentiment_history record
  IF NEW.symbols_mentioned IS NOT NULL AND array_length(NEW.symbols_mentioned, 1) > 0 THEN
    -- Insert/update sentiment_history for each symbol
    INSERT INTO sentiment_history (
      symbol,
      source,
      sentiment_score,
      confidence_score,
      data_timestamp,
      source_id,
      content_snippet,
      metadata,
      created_at,
      updated_at
    )
    SELECT
      symbol_name,
      'reddit',
      NEW.overall_sentiment,
      NEW.confidence_score,
      NEW.post_created_at,
      NEW.post_id,
      LEFT(NEW.title, 200),
      jsonb_build_object(
        'subreddit', NEW.subreddit,
        'score', NEW.score,
        'num_comments', NEW.num_comments,
        'themes', NEW.key_themes,
        'signals', NEW.investment_signals,
        'post_id', NEW.post_id
      ),
      NEW.created_at,
      NEW.created_at
    FROM unnest(NEW.symbols_mentioned) AS symbol_name
    ON CONFLICT (source, source_id) 
    DO UPDATE SET
      sentiment_score = EXCLUDED.sentiment_score,
      confidence_score = EXCLUDED.confidence_score,
      data_timestamp = EXCLUDED.data_timestamp,
      content_snippet = EXCLUDED.content_snippet,
      metadata = EXCLUDED.metadata,
      updated_at = EXCLUDED.updated_at;
  END IF;
  
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.add_trading_days(d date, n integer)
 RETURNS date
 LANGUAGE plpgsql
 IMMUTABLE
 SECURITY DEFINER
 SET search_path = public
AS $function$
DECLARE
  step int := 0;
  cur  date := d;
BEGIN
  IF n < 0 THEN
    RAISE EXCEPTION 'add_trading_days only supports n >= 0 in this version';
  END IF;

  WHILE step < n LOOP
    cur := cur + INTERVAL '1 day';
    IF is_trading_day(cur) THEN
      step := step + 1;
    END IF;
  END LOOP;

  RETURN cur;
END;
$function$;

CREATE OR REPLACE FUNCTION public.backfill_reddit_mentions(p_start timestamp with time zone, p_end timestamp with time zone)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
declare
  pat text;
begin
  -- keep it snappy; adjust if needed
  set local statement_timeout = '120000';

  -- Build alternation like AAPL|NVDA|BRK\.B from active tickers
  select string_agg(regexp_replace(upper(symbol),'([.^$|()\[\]\\+*?{}])','\\\1','g'),'|')
  into pat
  from public.ticker_universe
  where active = true;

  -- ===== TITLE MATCHES (with ambiguity rule) =====
  execute format($q$
    with src as (
      select
        p.id as post_id,
        upper(replace(coalesce(p.title,''), '-', '.')) as norm_title,
        upper(replace(coalesce(p.title,'') || ' ' || coalesce(p.selftext,''), '-', '.')) as norm_all,
        p.created_utc,
        char_length(coalesce(p.title,'') || ' ' || coalesce(p.selftext,'')) as content_len
      from public.reddit_finance_keep_norm p
      where p.created_utc >= %L::timestamptz
        and p.created_utc <  %L::timestamptz
    ),
    m as (
      select s.post_id, (mm)[2] as sym, s.norm_all, s.created_utc, s.content_len
      from src s,
      lateral regexp_matches(
        s.norm_title,
        '(^|[\s\(\[\$])(' || %L || ')(?=[$\s\)\]\.,!\?:;]|$)',
        'g'
      ) as mm
    ),
    with_rules as (
      select
        m.post_id,
        m.sym as symbol,
        m.created_utc,
        m.content_len,
        case
          when position('$' || m.sym in m.norm_all) > 0 then '$SYMB'
          when exists (
            select 1 from public.symbol_disambig d, unnest(d.keywords) kw
            where d.symbol = m.sym and position(upper(kw) in m.norm_all) > 0
          ) then 'keyword'
          else 'none'
        end as rule,
        exists (select 1 from public.symbol_disambig d where d.symbol = m.sym) as is_ambig
      from m
    )
    insert into public.reddit_mentions (post_id, symbol, created_utc, match_source, disambig_rule, content_len)
    select distinct wr.post_id, wr.symbol, wr.created_utc, 'title',
           wr.rule, wr.content_len
    from with_rules wr
    where (wr.is_ambig = false) or (wr.rule <> 'none')
    on conflict (post_id, symbol) do nothing;
  $q$, p_start, p_end, pat);

  -- ===== BODY-ONLY MATCHES (must pass disambiguation) =====
  execute format($q$
    with src as (
      select
        p.id as post_id,
        upper(replace(coalesce(p.selftext,''), '-', '.')) as norm_body,
        upper(replace(coalesce(p.title,'') || ' ' || coalesce(p.selftext,''), '-', '.')) as norm_all,
        p.created_utc,
        char_length(coalesce(p.title,'') || ' ' || coalesce(p.selftext,'')) as content_len
      from public.reddit_finance_keep_norm p
      where p.created_utc >= %L::timestamptz
        and p.created_utc <  %L::timestamptz
    ),
    m as (
      select s.post_id, (mm)[2] as sym, s.norm_all, s.created_utc, s.content_len
      from src s,
      lateral regexp_matches(
        s.norm_body,
        '(^|[\s\(\[\$])(' || %L || ')(?=[$\s\)\]\.,!\?:;]|$)',
        'g'
      ) as mm
    ),
    disambig as (
      select
        m.post_id,
        m.sym as symbol,
        m.created_utc,
        m.content_len,
        case
          when position('$' || m.sym in m.norm_all) > 0 then '$SYMB'
          when exists (
            select 1 from public.symbol_disambig d, unnest(d.keywords) kw
            where d.symbol = m.sym and position(upper(kw) in m.norm_all) > 0
          ) then 'keyword'
          else null
        end as rule
      from m
    )
    insert into public.reddit_mentions (post_id, symbol, created_utc, match_source, disambig_rule, content_len)
    select distinct d.post_id, d.symbol, d.created_utc, 'body', d.rule, d.content_len
    from disambig d
    where d.rule is not null
      and not exists (
        select 1 from public.reddit_mentions rm
        where rm.post_id = d.post_id and rm.symbol = d.symbol
      )
    on conflict (post_id, symbol) do nothing;
  $q$, p_start, p_end, pat);
end
$function$;