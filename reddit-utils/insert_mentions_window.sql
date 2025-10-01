-- insert_mentions_window.sql (v2)
-- Expects psql vars :d0 (inclusive) and :d3 (exclusive), e.g.
--   -v d0="'2025-08-29 00:00:00+00'"  -v d3="'2025-08-31 00:00:00+00'"

BEGIN;
SET LOCAL statement_timeout = 0;
SET LOCAL lock_timeout = 0;
SET LOCAL idle_in_transaction_session_timeout = 0;
-- Speed up large sorts/regex; scoped to this transaction only
SET LOCAL work_mem = '128MB';
SET LOCAL jit = off;

-- Dedupe key creation moved to migrations; do not run DDL here.
-- (Index ux_mentions_doc_symbol should already exist.)

-- Stage base docs once for reuse across cashtags + keywords
CREATE TEMP TABLE IF NOT EXISTS tmp_base_docs ON COMMIT DROP AS
SELECT * FROM (
  -- Posts: filter window first, then dedupe within window by post_id
  (
  SELECT DISTINCT ON (p.post_id)
    'post'::text                 AS doc_type,
    p.post_id::text              AS doc_id,
    p.post_id::text              AS post_id,
    p.subreddit::text            AS subreddit,
    COALESCE(pf.author,'')::text AS author,
    NULL::numeric                AS author_karma,
    COALESCE(p.title,'')::text   AS title,
    COALESCE(p.selftext,'')::text AS body_text,
    p.created_utc::timestamptz   AS created_utc,
    char_length(COALESCE(p.title,'') || ' ' || COALESCE(p.selftext,'')) AS content_len
  FROM public.v_scoring_posts_union_src p
  LEFT JOIN public.reddit_finance_keep_norm pf
    ON pf.id::text = p.post_id::text
  WHERE p.created_utc >= :d0::timestamptz AND p.created_utc < :d3::timestamptz
  ORDER BY p.post_id, p.created_utc DESC
  )
  UNION ALL

  -- Comments (structured table)
  SELECT
    'comment'::text              AS doc_type,
    c.comment_id::text           AS doc_id,
    c.post_id::text              AS post_id,
    c.subreddit::text            AS subreddit,
    COALESCE(c.author,'')::text  AS author,
    NULL::numeric                AS author_karma,
    ''::text                     AS title,
    COALESCE(c.body,'')::text    AS body_text,
    c.created_utc::timestamptz   AS created_utc,
    char_length(COALESCE(c.body,'')) AS content_len
  FROM public.reddit_comments c
  WHERE c.created_utc >= :d0::timestamptz AND c.created_utc < :d3::timestamptz
    AND c.comment_id IS NOT NULL
) s;

-- Help planner choose better plans with temp stats
ANALYZE tmp_base_docs;

-- ==============
-- 1) CASETAGS ($TSLA etc.) from posts & comments
-- ==============

WITH base_docs AS (
  SELECT * FROM tmp_base_docs
),
filtered_title AS (
  SELECT * FROM base_docs WHERE doc_type = 'post' AND title LIKE '%$%'
),
filtered_body AS (
  SELECT * FROM base_docs WHERE body_text LIKE '%$%'
),
ctags_title AS (
  SELECT d.doc_type, d.doc_id, d.post_id, d.subreddit, d.author, d.author_karma,
         d.created_utc, d.content_len,
         UPPER(m[1]) AS sym, 'title'::text AS src
  FROM filtered_title d,
       LATERAL regexp_matches(NULLIF(d.title,''), '\$([A-Za-z]{1,5})(?![A-Za-z])', 'g') m
  
),
ctags_body AS (
  SELECT d.doc_type, d.doc_id, d.post_id, d.subreddit, d.author, d.author_karma,
         d.created_utc, d.content_len,
         UPPER(m[1]) AS sym, 'body'::text AS src
  FROM filtered_body d,
       LATERAL regexp_matches(NULLIF(d.body_text,''), '\$([A-Za-z]{1,5})(?![A-Za-z])', 'g') m
  
),
ctags AS (
  SELECT * FROM ctags_title
  UNION ALL
  SELECT * FROM ctags_body
),
cashtag_rows AS (
  SELECT
    c.doc_type,
    c.doc_id,
    c.post_id,
    u.symbol,
    c.created_utc,
    c.src,
    'cashtag'::text AS disambig_rule,
    c.content_len,
    c.subreddit,
    NULLIF(c.author,'')::text AS author,
    c.author_karma
  FROM ctags c
  JOIN public.ticker_universe u
    ON upper(c.sym) = upper(u.symbol)
  WHERE COALESCE(u.active, true)
    AND c.doc_id IS NOT NULL
),
ranked AS (
  SELECT
    r.doc_type,
    r.doc_id,
    r.post_id,
    r.symbol,
    r.created_utc,
    r.src            AS match_source,
    r.disambig_rule,
    r.content_len,
    r.subreddit,
    r.author,
    r.author_karma,
    CASE WHEN r.src = 'title' THEN 0 ELSE 1 END AS src_rank,
    CASE WHEN r.author IS NULL OR r.author = '' THEN 1 ELSE 0 END AS anon_rank
  FROM cashtag_rows r
)
INSERT INTO public.reddit_mentions
  (doc_type, doc_id, post_id, symbol, created_utc, match_source, disambig_rule, content_len, subreddit, author, author_karma)
SELECT DISTINCT ON (doc_type, doc_id, symbol)
  doc_type,
  doc_id,
  post_id,
  symbol,
  created_utc,
  match_source,
  disambig_rule,
  content_len,
  subreddit,
  author,
  author_karma
FROM ranked
ORDER BY doc_type, doc_id, symbol, src_rank, anon_rank
ON CONFLICT (doc_type, doc_id, symbol) DO UPDATE
  SET subreddit      = EXCLUDED.subreddit,
      author         = EXCLUDED.author,
      author_karma   = EXCLUDED.author_karma,
      created_utc    = EXCLUDED.created_utc,
      match_source   = EXCLUDED.match_source,
      disambig_rule  = EXCLUDED.disambig_rule,
      content_len    = EXCLUDED.content_len
  WHERE reddit_mentions.subreddit     IS DISTINCT FROM EXCLUDED.subreddit
     OR reddit_mentions.author        IS DISTINCT FROM EXCLUDED.author
     OR reddit_mentions.author_karma  IS DISTINCT FROM EXCLUDED.author_karma
     OR reddit_mentions.created_utc   IS DISTINCT FROM EXCLUDED.created_utc
     OR reddit_mentions.match_source  IS DISTINCT FROM EXCLUDED.match_source
     OR reddit_mentions.disambig_rule IS DISTINCT FROM EXCLUDED.disambig_rule
     OR reddit_mentions.content_len   IS DISTINCT FROM EXCLUDED.content_len;
-- REPLACE with upsert to refresh metadata
--ON CONFLICT (doc_type, doc_id, symbol) DO UPDATE
--  SET created_utc    = EXCLUDED.created_utc,
--      match_source   = EXCLUDED.match_source,
--      disambig_rule  = EXCLUDED.disambig_rule,
--      content_len    = EXCLUDED.content_len,
--      subreddit      = EXCLUDED.subreddit,
--      author         = EXCLUDED.author,
--      author_karma   = EXCLUDED.author_karma;

-- ==============
-- 2) KEYWORDS (whole-word symbols) in posts AND comments
-- ==============

WITH allow_short(sym) AS (
  VALUES ('SPY'),('QQQ'),('VTI'),('IWM'),('DIA'),('VOO'),('BTC'),('ETH')
),
docs_kw AS (
  SELECT
    d.doc_type, d.doc_id, d.post_id, d.subreddit, d.author, d.author_karma,
    d.created_utc, d.content_len,
    (COALESCE(NULLIF(d.title,''),'') || ' ' || COALESCE(NULLIF(d.body_text,''),'')) AS text_all
  FROM tmp_base_docs d
),
-- Tokenize text into candidate uppercase words once, then join to universe.
-- This avoids an O(N_docs × N_symbols) cross join and regex per-symbol.
tokens AS (
  SELECT
    d.doc_type,
    d.doc_id,
    d.post_id,
    d.subreddit,
    d.author,
    d.author_karma,
    d.created_utc,
    d.content_len,
    UPPER(m[1]) AS token
  FROM docs_kw d,
       LATERAL regexp_matches(d.text_all, '(?<![A-Za-z0-9])([A-Za-z]{2,5})(?![A-Za-z0-9])', 'g') m
),
tokens_distinct AS (
  SELECT DISTINCT
    doc_type, doc_id, post_id, subreddit, author, author_karma, created_utc, content_len, token
  FROM tokens
),
kw_hits AS (
  SELECT
    td.doc_type,
    td.doc_id,
    td.post_id,
    td.subreddit,
    td.author,
    td.author_karma,
    td.created_utc,
    td.content_len,
    u.symbol
  FROM tokens_distinct td
  JOIN public.ticker_universe u
    ON u.symbol = td.token
   AND COALESCE(u.active, true)
   AND (
         length(u.symbol) >= 3
         OR u.symbol IN (SELECT sym FROM allow_short)
       )
),
keyword_rows AS (
  SELECT
    h.doc_type,
    h.doc_id,
    h.post_id,
    h.symbol,
    h.created_utc,
    CASE WHEN h.doc_type='post' THEN 'title_body' ELSE 'body' END AS match_source,
    'keywords'::text AS disambig_rule,
    h.content_len,
    h.subreddit,
    NULLIF(h.author,'')::text AS author,
    h.author_karma
  FROM kw_hits h
),
ranked_kw AS (
  SELECT
    r.doc_type,
    r.doc_id,
    r.post_id,
    r.symbol,
    r.created_utc,
    r.match_source,
    r.disambig_rule,
    r.content_len,
    r.subreddit,
    r.author,
    r.author_karma,
    CASE WHEN r.author IS NULL OR r.author = '' THEN 1 ELSE 0 END AS anon_rank
  FROM keyword_rows r
)
INSERT INTO public.reddit_mentions
  (doc_type, doc_id, post_id, symbol, created_utc, match_source, disambig_rule, content_len, subreddit, author, author_karma)
SELECT DISTINCT ON (doc_type, doc_id, symbol)
  doc_type,
  doc_id,
  post_id,
  symbol,
  created_utc,
  match_source,
  disambig_rule,
  content_len,
  subreddit,
  author,
  author_karma
FROM ranked_kw
ORDER BY doc_type, doc_id, symbol, anon_rank
ON CONFLICT (doc_type, doc_id, symbol) DO UPDATE
  SET subreddit      = EXCLUDED.subreddit,
      author         = EXCLUDED.author,
      author_karma   = EXCLUDED.author_karma,
      created_utc    = EXCLUDED.created_utc,
      match_source   = EXCLUDED.match_source,
      disambig_rule  = EXCLUDED.disambig_rule,
      content_len    = EXCLUDED.content_len
  WHERE reddit_mentions.subreddit     IS DISTINCT FROM EXCLUDED.subreddit
     OR reddit_mentions.author        IS DISTINCT FROM EXCLUDED.author
     OR reddit_mentions.author_karma  IS DISTINCT FROM EXCLUDED.author_karma
     OR reddit_mentions.created_utc   IS DISTINCT FROM EXCLUDED.created_utc
     OR reddit_mentions.match_source  IS DISTINCT FROM EXCLUDED.match_source
     OR reddit_mentions.disambig_rule IS DISTINCT FROM EXCLUDED.disambig_rule
     OR reddit_mentions.content_len   IS DISTINCT FROM EXCLUDED.content_len;

COMMIT;

-- ======================================
-- Signals sanity snapshot (force UTC)
-- ======================================
-- === Signals snapshot (sanity, UTC) ===
SET TIME ZONE 'UTC';

-- how many mentions represented in today's signals (UTC)
SELECT COALESCE(SUM(n_mentions), 0) AS rows_today
FROM v_reddit_daily_signals
WHERE trade_date = (now() AT TIME ZONE 'UTC')::date;

-- recent day totals (mentions per day)
SELECT to_char(trade_date,'YYYY-MM-DD') || '|' || SUM(n_mentions) AS day_pipe
FROM v_reddit_daily_signals
WHERE trade_date >= ((now() AT TIME ZONE 'UTC')::date - INTERVAL '2 days')::date
GROUP BY trade_date
ORDER BY trade_date DESC;
