-- insert_mentions_window.sql (v2)
-- Expects psql vars :d0 (inclusive) and :d3 (exclusive), e.g.
--   -v d0="'2025-08-29 00:00:00+00'"  -v d3="'2025-08-31 00:00:00+00'"

BEGIN;
SET LOCAL statement_timeout = 0;
SET LOCAL lock_timeout = 0;
SET LOCAL idle_in_transaction_session_timeout = 0;

-- Dedupe key
CREATE UNIQUE INDEX IF NOT EXISTS ux_mentions_doc_symbol
  ON public.reddit_mentions(doc_type, doc_id, symbol);

-- ==============
-- 1) CASETAGS ($TSLA etc.) from posts & comments
-- ==============

WITH base_docs AS (
  /* Posts (use unioned/deduped source) */
  SELECT
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
  FROM public.v_scoring_posts p               -- <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<
  LEFT JOIN public.reddit_finance_keep_norm pf
    ON pf.id::text = p.post_id::text
  WHERE p.created_utc >= :d0::timestamptz AND p.created_utc < :d3::timestamptz

  UNION ALL

  /* Comments */
  SELECT
    'comment'::text              AS doc_type,
    c.comment_id::text           AS doc_id,
    c.post_id::text              AS post_id,
    c.subreddit::text            AS subreddit,
    COALESCE(rc.author,'')::text AS author,
    NULL::numeric                AS author_karma,
    ''::text                     AS title,
    COALESCE(c.body,'')::text    AS body_text,
    c.created_utc::timestamptz   AS created_utc,
    char_length(COALESCE(c.body,'')) AS content_len
  FROM public.reddit_comments_clean c
  LEFT JOIN public.reddit_comments rc
    ON rc.comment_id::text = c.comment_id::text
  WHERE c.created_utc >= :d0::timestamptz AND c.created_utc < :d3::timestamptz
    AND c.comment_id IS NOT NULL
),
ctags_title AS (
  SELECT d.doc_type, d.doc_id, d.post_id, d.subreddit, d.author, d.author_karma,
         d.created_utc, d.content_len,
         UPPER(m[1]) AS sym, 'title'::text AS src
  FROM base_docs d,
       LATERAL regexp_matches(NULLIF(d.title,''), '\$([A-Za-z]{1,5})(?![A-Za-z])', 'g') m
  WHERE d.doc_type = 'post'
),
ctags_body AS (
  SELECT d.doc_type, d.doc_id, d.post_id, d.subreddit, d.author, d.author_karma,
         d.created_utc, d.content_len,
         UPPER(m[1]) AS sym, 'body'::text AS src
  FROM base_docs d,
       LATERAL regexp_matches(NULLIF(d.body_text,''), '\$([A-Za-z]{1,5})(?![A-Za-z])', 'g') m
),
ctags AS (
  SELECT * FROM ctags_title
  UNION ALL
  SELECT * FROM ctags_body
)
INSERT INTO public.reddit_mentions
  (doc_type, doc_id, post_id, symbol, created_utc, match_source, disambig_rule, content_len, subreddit, author, author_karma)
SELECT
  c.doc_type,
  c.doc_id,
  c.post_id,
  u.symbol,
  c.created_utc,
  c.src,
  'cashtag',
  c.content_len,
  c.subreddit,
  NULLIF(c.author,'')::text,
  c.author_karma
FROM ctags c
JOIN public.ticker_universe u
  ON upper(c.sym) = upper(u.symbol)
WHERE COALESCE(u.active, true)
  AND c.doc_id IS NOT NULL
ON CONFLICT (doc_type, doc_id, symbol) DO NOTHING;

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
  FROM (
    /* Reuse same sources & window */
    SELECT
      'post'::text               AS doc_type,
      p.post_id::text            AS doc_id,
      p.post_id::text            AS post_id,
      p.subreddit::text          AS subreddit,
      COALESCE(pf.author,'')::text AS author,
      NULL::numeric              AS author_karma,
      p.created_utc::timestamptz AS created_utc,
      char_length(COALESCE(p.title,'') || ' ' || COALESCE(p.selftext,'')) AS content_len,
      COALESCE(p.title,'')::text AS title,
      COALESCE(p.selftext,'')::text AS body_text
    FROM public.v_scoring_posts p
    LEFT JOIN public.reddit_finance_keep_norm pf
      ON pf.id::text = p.post_id::text
    WHERE p.created_utc >= :d0::timestamptz AND p.created_utc < :d3::timestamptz

    UNION ALL

    SELECT
      'comment'::text            AS doc_type,
      c.comment_id::text         AS doc_id,
      c.post_id::text            AS post_id,
      c.subreddit::text          AS subreddit,
      COALESCE(rc.author,'')::text AS author,
      NULL::numeric              AS author_karma,
      c.created_utc::timestamptz AS created_utc,
      char_length(COALESCE(c.body,'')) AS content_len,
      ''::text                   AS title,
      COALESCE(c.body,'')::text  AS body_text
    FROM public.reddit_comments c
    LEFT JOIN public.reddit_comments rc
      ON rc.comment_id::text = c.comment_id::text
    WHERE c.created_utc >= :d0::timestamptz AND c.created_utc < :d3::timestamptz
      AND c.comment_id IS NOT NULL
  ) d
),
kw_candidates AS (
  SELECT
    d.doc_type,
    d.doc_id,
    d.post_id,
    d.subreddit,
    d.author,
    d.author_karma,
    d.created_utc,
    d.content_len,
    d.text_all,
    u.symbol,
    '(?<![A-Za-z0-9])' ||
      regexp_replace(u.symbol, '([.^$*+?()[{\|\\])', '\\1', 'g') ||
    '(?![A-Za-z0-9])' AS pat
  FROM docs_kw d
  JOIN public.ticker_universe u
    ON COALESCE(u.active, true)
   AND (
         length(u.symbol) >= 3
         OR u.symbol IN (SELECT sym FROM allow_short)
       )
),
kw_hits AS (
  SELECT
    k.doc_type,
    k.doc_id,
    k.post_id,
    k.subreddit,
    k.author,
    k.author_karma,
    k.created_utc,
    k.content_len,
    k.symbol
  FROM kw_candidates k
  WHERE k.text_all ~* k.pat
)
INSERT INTO public.reddit_mentions
  (doc_type, doc_id, post_id, symbol, created_utc, match_source, disambig_rule, content_len, subreddit, author, author_karma)
SELECT
  h.doc_type, h.doc_id, h.post_id, h.symbol, h.created_utc,
  CASE WHEN h.doc_type='post' THEN 'title_body' ELSE 'body' END AS match_source,
  'keywords',
  h.content_len,
  h.subreddit,
  NULLIF(h.author,'')::text,
  h.author_karma
FROM kw_hits h
ON CONFLICT (doc_type, doc_id, symbol) DO NOTHING;

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
