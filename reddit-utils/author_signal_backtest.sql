\set ON_ERROR_STOP on

-- Author signal backtest (exploratory, read-only)
-- Required inputs via psql -v:
--   START_DATE, END_DATE
--   HORIZONS (comma-separated ints, e.g., '1,3,5')
--   ENTRY_SESSION (accepted but ignored; uses close→close)
--   POS_THRESH (numeric; ≥ is LONG, else SHORT)
--   MIN_AUTHOR_TRADES (int)
--   MIN_AUTHOR_SYMBOL_TRADES (int)
--   ALLOWED_SUBS_CSV (e.g., 'wallstreetbets,stocks' or empty)
--   ALLOWED_TICKERS_CSV (e.g., 'AAPL,TSLA' or empty)

-- Build once into a temp table to reuse across result sets
DROP TABLE IF EXISTS tmp_sided;
CREATE TEMP TABLE tmp_sided AS
WITH
params AS (
  SELECT
    DATE :'START_DATE' AS start_date,
    DATE :'END_DATE'   AS end_date,
    :'ENTRY_SESSION'::text AS entry_session,
    :'POS_THRESH'::numeric AS pos_thresh,
    NULLIF(:'ALLOWED_SUBS_CSV','')::text AS allowed_subs_csv,
    NULLIF(:'ALLOWED_TICKERS_CSV','')::text AS allowed_tickers_csv,
    NULLIF(:'MODEL_VERSION','')::text AS model_version,
    COALESCE(NULLIF(:'MIN_CONF','')::numeric, 0)::numeric AS min_conf,
    NULLIF(:'EXCLUDE_AUTHORS_CSV','')::text AS exclude_authors_csv,
    COALESCE(NULLIF(:'MIN_UNIQUE_SYMBOLS','')::int, 0) AS min_unique_symbols,
    0 AS use_price_funcs
),
horizons AS (
  SELECT unnest(string_to_array(:'HORIZONS',','))::int AS h
),
src AS (
  SELECT
    (m.created_utc AT TIME ZONE 'UTC')::date AS trade_date,
    m.symbol::text     AS symbol,
    m.author::text     AS author,
    s.score::numeric   AS sentiment_score,
    m.subreddit::text  AS subreddit
  FROM reddit_mentions m
  JOIN reddit_sentiment s
    ON s.mention_id = m.mention_id
  JOIN params p ON (m.created_utc AT TIME ZONE 'UTC')::date BETWEEN p.start_date AND p.end_date
  WHERE (
          p.allowed_tickers_csv IS NULL
          OR position(',' || upper(m.symbol) || ',' in (',' || upper(p.allowed_tickers_csv) || ',')) > 0
        )
    AND (
          p.allowed_subs_csv IS NULL
          OR position(',' || lower(m.subreddit) || ',' in (',' || lower(p.allowed_subs_csv) || ',')) > 0
        )
    AND NOT (
           m.doc_type = 'post'
       AND p.exclude_authors_csv IS NOT NULL
       AND position(',' || lower(m.author) || ',' in (',' || lower(p.exclude_authors_csv) || ',')) > 0
        )
    AND m.symbol IS NOT NULL AND m.symbol <> ''
    AND m.author IS NOT NULL AND m.author <> ''
    AND m.doc_type IN ('post','comment')
    AND (p.model_version IS NULL OR s.model_version = p.model_version)
    AND COALESCE(s.confidence, 0) >= p.min_conf
),
author_day AS (
  SELECT
    trade_date,
    symbol,
    author,
    AVG(sentiment_score) AS author_score,
    COUNT(*) AS n_author_mentions
  FROM src
  GROUP BY trade_date, symbol, author
),
px AS (
  SELECT
    upper(symbol) AS symbol,
    data_date::date AS d,
    price_close::float8 AS close,
    lead(price_close, 1) OVER (PARTITION BY upper(symbol) ORDER BY data_date) AS close_t1,
    lead(price_close, 3) OVER (PARTITION BY upper(symbol) ORDER BY data_date) AS close_t3,
    lead(price_close, 5) OVER (PARTITION BY upper(symbol) ORDER BY data_date) AS close_t5
  FROM enhanced_market_data
),
priced AS (
  SELECT
    a.*, h.h AS horizon_days,
    p.close AS entry_px,
    CASE h.h WHEN 1 THEN p.close_t1 WHEN 3 THEN p.close_t3 WHEN 5 THEN p.close_t5 END AS exit_px
  FROM author_day a
  CROSS JOIN horizons h
  LEFT JOIN px p
    ON p.symbol = upper(a.symbol)
   AND p.d      = a.trade_date
),
retn AS (
  SELECT
    p.*,
    CASE WHEN p.entry_px IS NOT NULL AND p.exit_px IS NOT NULL
         THEN (p.exit_px / NULLIF(p.entry_px,0)) - 1
         ELSE NULL::numeric END AS raw_return
  FROM priced p
),
sided AS (
  SELECT
    r.*,
    CASE WHEN r.author_score >= (SELECT pos_thresh FROM params) THEN 'LONG' ELSE 'SHORT' END AS side,
    CASE WHEN r.author_score >= (SELECT pos_thresh FROM params) THEN 1 ELSE -1 END AS dir
  FROM retn r
)
SELECT * FROM sided;

-- Output 1: Top authors
SELECT 'author' AS level, perf_author.author, NULL::text AS symbol, perf_author.horizon_days, perf_author.side, n_trades, avg_excess_ret, win_rate, sharpe_like
FROM (
  SELECT
    author,
    horizon_days,
    side,
    COUNT(*) AS n_trades,
    AVG(raw_return * dir) AS avg_excess_ret,
    AVG(CASE WHEN (raw_return * dir) > 0 THEN 1 ELSE 0 END)::numeric AS win_rate,
    STDDEV_POP(raw_return * dir) AS std_excess_ret,
    CASE WHEN STDDEV_POP(raw_return * dir) > 0 THEN AVG(raw_return * dir) / NULLIF(STDDEV_POP(raw_return * dir),0) ELSE NULL END AS sharpe_like
  FROM tmp_sided
  WHERE raw_return IS NOT NULL
  GROUP BY author, horizon_days, side
) perf_author
JOIN (
  SELECT author, COUNT(DISTINCT symbol) AS n_symbols
  FROM tmp_sided
  WHERE raw_return IS NOT NULL
  GROUP BY author
) conc ON conc.author = perf_author.author
WHERE n_trades >= :MIN_AUTHOR_TRADES
  AND conc.n_symbols >= (:'MIN_UNIQUE_SYMBOLS')::int
ORDER BY sharpe_like DESC NULLS LAST, n_trades DESC
LIMIT 100;

-- Output 2: Top author+symbol pairs
SELECT 'author_symbol' AS level, author, symbol, horizon_days, side, n_trades, avg_excess_ret, win_rate, sharpe_like
FROM (
  SELECT
    author,
    symbol,
    horizon_days,
    side,
    COUNT(*) AS n_trades,
    AVG(raw_return * dir) AS avg_excess_ret,
    AVG(CASE WHEN (raw_return * dir) > 0 THEN 1 ELSE 0 END)::numeric AS win_rate,
    STDDEV_POP(raw_return * dir) AS std_excess_ret,
    CASE WHEN STDDEV_POP(raw_return * dir) > 0 THEN AVG(raw_return * dir) / NULLIF(STDDEV_POP(raw_return * dir),0) ELSE NULL END AS sharpe_like
  FROM tmp_sided
  WHERE raw_return IS NOT NULL
  GROUP BY author, symbol, horizon_days, side
) perf_author_symbol
WHERE n_trades >= :MIN_AUTHOR_SYMBOL_TRADES
ORDER BY sharpe_like DESC NULLS LAST, n_trades DESC
LIMIT 200;

-- Output 3: Author concentration diagnostics (optional helper view)
-- Shows symbols covered and top-symbol share per author.
WITH a AS (
  SELECT author, symbol, COUNT(*) AS n
  FROM tmp_sided
  WHERE raw_return IS NOT NULL
  GROUP BY author, symbol
),
tot AS (
  SELECT author, SUM(n) AS n_trades, COUNT(*) AS n_symbols
  FROM a GROUP BY author
),
ranked AS (
  SELECT a.*, tot.n_trades, tot.n_symbols,
         ROW_NUMBER() OVER (PARTITION BY a.author ORDER BY a.n DESC) AS rn
  FROM a JOIN tot USING (author)
)
SELECT 'author_conc' AS level,
       r.author,
       NULL::text AS symbol,
       NULL::int AS horizon_days,
       NULL::text AS side,
       r.n_trades,
       NULL::numeric AS avg_excess_ret,
       NULL::numeric AS win_rate,
       ROUND((r.n::numeric / NULLIF(r.n_trades,0)),3) AS top_symbol_share
FROM ranked r
WHERE r.rn = 1
ORDER BY top_symbol_share DESC NULLS LAST, n_trades DESC
LIMIT 50;

-- Optional: monthly stability breakdown for top authors by Sharpe
-- Shows per-month trades and avg_excess_ret for quick robustness sanity.
\if :{?SHOW_MONTHLY} \else \set SHOW_MONTHLY 0 \endif
\if :SHOW_MONTHLY
WITH top_authors AS (
  SELECT author
  FROM (
    SELECT
      author,
      COUNT(*) AS n_trades,
      AVG(raw_return * dir) / NULLIF(STDDEV_POP(raw_return * dir),0) AS sharpe_like
    FROM tmp_sided
    WHERE raw_return IS NOT NULL
    GROUP BY author
  ) t
  WHERE n_trades >= :MIN_AUTHOR_TRADES
  ORDER BY sharpe_like DESC NULLS LAST
  LIMIT 10
)
SELECT
  s.author,
  date_trunc('month', s.trade_date)::date AS month,
  COUNT(*) AS n_trades,
  AVG(s.raw_return * s.dir) AS avg_excess_ret,
  AVG(((s.raw_return * s.dir) > 0)::int)::numeric AS win_rate
FROM tmp_sided s
JOIN top_authors ta ON ta.author = s.author
WHERE s.raw_return IS NOT NULL
GROUP BY s.author, date_trunc('month', s.trade_date)
ORDER BY s.author, month;
\endif

-- Persist two-window stability splits as regular tables so they can be copied later
-- Params: STABILITY_SPLIT_DATE (optional), MIN_TRADES_PER_HALF (default 6), REQUIRE_POSITIVE_BOTH (default 1)
\if :{?MIN_TRADES_PER_HALF} \else \set MIN_TRADES_PER_HALF 6 \endif
\if :{?REQUIRE_POSITIVE_BOTH} \else \set REQUIRE_POSITIVE_BOTH 1 \endif
\if :{?STABILITY_HORIZON} \else \set STABILITY_HORIZON 3 \endif

-- Author stability (Option A: DROP then CREATE ... AS with a single WITH block)
DROP TABLE IF EXISTS public.tmp_export_author_stability;
CREATE TABLE public.tmp_export_author_stability AS
WITH bounds AS (
  SELECT MIN(trade_date) AS d0, MAX(trade_date) AS d1 FROM tmp_sided
), split AS (
  SELECT COALESCE(NULLIF(:'STABILITY_SPLIT_DATE','')::date,
                  (SELECT d0 + ((d1 - d0) / 2) FROM bounds)) AS split_date
), s AS (
  SELECT t.*, CASE WHEN t.trade_date < (SELECT split_date FROM split) THEN 'H1' ELSE 'H2' END AS half
  FROM tmp_sided t
  WHERE t.raw_return IS NOT NULL AND t.horizon_days = :STABILITY_HORIZON
), agg AS (
  SELECT author, horizon_days, side, half,
         COUNT(*) AS n_trades,
         AVG(raw_return * dir) AS avg_excess_ret,
         AVG(((raw_return * dir) > 0)::int)::numeric AS win_rate,
         STDDEV_POP(raw_return * dir) AS std_excess_ret,
         CASE WHEN STDDEV_POP(raw_return * dir) > 0
              THEN AVG(raw_return * dir) / NULLIF(STDDEV_POP(raw_return * dir),0)
              ELSE NULL END AS sharpe_like
  FROM s
  GROUP BY author, horizon_days, side, half
), p AS (
  SELECT a.author, a.horizon_days, a.side,
         COALESCE(a.n_trades,0) AS n_h1,
         a.avg_excess_ret      AS avg_h1,
         a.win_rate            AS win_h1,
         a.sharpe_like         AS sharpe_h1,
         COALESCE(b.n_trades,0) AS n_h2,
         b.avg_excess_ret       AS avg_h2,
         b.win_rate             AS win_h2,
         b.sharpe_like          AS sharpe_h2
  FROM agg a
  FULL JOIN agg b
    ON b.author=a.author AND b.horizon_days=a.horizon_days AND b.side=a.side AND b.half='H2'
  WHERE a.half='H1'
), total AS (
  SELECT author, horizon_days, side,
         COUNT(*) AS n_trades,
         AVG(raw_return * dir) AS avg_all,
         AVG(((raw_return * dir) > 0)::int)::numeric AS win_all,
         STDDEV_POP(raw_return * dir) AS std_all,
         CASE WHEN STDDEV_POP(raw_return * dir) > 0
              THEN AVG(raw_return * dir) / NULLIF(STDDEV_POP(raw_return * dir),0)
              ELSE NULL END AS sharpe_all
  FROM tmp_sided
  WHERE raw_return IS NOT NULL AND horizon_days = :STABILITY_HORIZON
  GROUP BY author, horizon_days, side
)
SELECT 'author'::text AS level,
       p.author,
       NULL::text AS symbol,
       p.horizon_days,
       p.side,
       t.n_trades,
       ROUND(COALESCE(p.sharpe_h1,0)::numeric,5) AS sharpe_h1,
       ROUND(COALESCE(p.sharpe_h2,0)::numeric,5) AS sharpe_h2,
       ROUND(COALESCE(t.sharpe_all,0)::numeric,5) AS sharpe_all,
       p.n_h1,
       p.n_h2,
       CASE WHEN (:'REQUIRE_POSITIVE_BOTH')::int=1
              THEN (COALESCE(p.sharpe_h1,0) > 0 AND COALESCE(p.sharpe_h2,0) > 0 AND p.n_h1 >= (:'MIN_TRADES_PER_HALF')::int AND p.n_h2 >= (:'MIN_TRADES_PER_HALF')::int)
              ELSE (p.n_h1 >= (:'MIN_TRADES_PER_HALF')::int AND p.n_h2 >= (:'MIN_TRADES_PER_HALF')::int)
       END AS stability_ok
FROM p
JOIN total t USING (author, horizon_days, side)
ORDER BY stability_ok DESC, sharpe_all DESC NULLS LAST;

-- Author+symbol stability (Option A)
DROP TABLE IF EXISTS public.tmp_export_author_symbol_stability;
CREATE TABLE public.tmp_export_author_symbol_stability AS
WITH bounds AS (
  SELECT MIN(trade_date) AS d0, MAX(trade_date) AS d1 FROM tmp_sided
), split AS (
  SELECT COALESCE(NULLIF(:'STABILITY_SPLIT_DATE','')::date,
                  (SELECT d0 + ((d1 - d0) / 2) FROM bounds)) AS split_date
), s AS (
  SELECT t.*, CASE WHEN t.trade_date < (SELECT split_date FROM split) THEN 'H1' ELSE 'H2' END AS half
  FROM tmp_sided t
  WHERE t.raw_return IS NOT NULL AND t.horizon_days = :STABILITY_HORIZON
), agg AS (
  SELECT author, symbol, horizon_days, side, half,
         COUNT(*) AS n_trades,
         AVG(raw_return * dir) AS avg_excess_ret,
         AVG(((raw_return * dir) > 0)::int)::numeric AS win_rate,
         STDDEV_POP(raw_return * dir) AS std_excess_ret,
         CASE WHEN STDDEV_POP(raw_return * dir) > 0
              THEN AVG(raw_return * dir) / NULLIF(STDDEV_POP(raw_return * dir),0)
              ELSE NULL END AS sharpe_like
  FROM s
  GROUP BY author, symbol, horizon_days, side, half
), p AS (
  SELECT a.author, a.symbol, a.horizon_days, a.side,
         COALESCE(a.n_trades,0) AS n_h1,
         a.avg_excess_ret      AS avg_h1,
         a.win_rate            AS win_h1,
         a.sharpe_like         AS sharpe_h1,
         COALESCE(b.n_trades,0) AS n_h2,
         b.avg_excess_ret       AS avg_h2,
         b.win_rate             AS win_h2,
         b.sharpe_like          AS sharpe_h2
  FROM agg a
  FULL JOIN agg b
    ON b.author=a.author AND b.symbol=a.symbol AND b.horizon_days=a.horizon_days AND b.side=a.side AND b.half='H2'
  WHERE a.half='H1'
), total AS (
  SELECT author, symbol, horizon_days, side,
         COUNT(*) AS n_trades,
         AVG(raw_return * dir) AS avg_all,
         AVG(((raw_return * dir) > 0)::int)::numeric AS win_all,
         STDDEV_POP(raw_return * dir) AS std_all,
         CASE WHEN STDDEV_POP(raw_return * dir) > 0
              THEN AVG(raw_return * dir) / NULLIF(STDDEV_POP(raw_return * dir),0)
              ELSE NULL END AS sharpe_all
  FROM tmp_sided
  WHERE raw_return IS NOT NULL AND horizon_days = :STABILITY_HORIZON
  GROUP BY author, symbol, horizon_days, side
)
SELECT 'author_symbol'::text AS level,
       p.author,
       p.symbol,
       p.horizon_days,
       p.side,
       t.n_trades,
       ROUND(COALESCE(p.sharpe_h1,0)::numeric,5) AS sharpe_h1,
       ROUND(COALESCE(p.sharpe_h2,0)::numeric,5) AS sharpe_h2,
       ROUND(COALESCE(t.sharpe_all,0)::numeric,5) AS sharpe_all,
       p.n_h1,
       p.n_h2,
       CASE WHEN (:'REQUIRE_POSITIVE_BOTH')::int=1
              THEN (COALESCE(p.sharpe_h1,0) > 0 AND COALESCE(p.sharpe_h2,0) > 0 AND p.n_h1 >= (:'MIN_TRADES_PER_HALF')::int AND p.n_h2 >= (:'MIN_TRADES_PER_HALF')::int)
              ELSE (p.n_h1 >= (:'MIN_TRADES_PER_HALF')::int AND p.n_h2 >= (:'MIN_TRADES_PER_HALF')::int)
       END AS stability_ok
FROM p
JOIN total t USING (author, symbol, horizon_days, side)
ORDER BY stability_ok DESC, sharpe_all DESC NULLS LAST;


-- Persist export helper tables (regular tables) for later \COPY in any session
DROP TABLE IF EXISTS public.tmp_export_author;
CREATE TABLE public.tmp_export_author AS
WITH perf_author AS (
  SELECT
    author,
    horizon_days,
    side,
    COUNT(*) AS n_trades,
    AVG(raw_return * dir) AS avg_excess_ret,
    AVG(((raw_return * dir) > 0)::int)::numeric AS win_rate,
    STDDEV_POP(raw_return * dir) AS std_excess_ret,
    CASE WHEN STDDEV_POP(raw_return * dir) > 0 THEN AVG(raw_return * dir) / NULLIF(STDDEV_POP(raw_return * dir),0) ELSE NULL END AS sharpe_like
  FROM tmp_sided
  WHERE raw_return IS NOT NULL
  GROUP BY author, horizon_days, side
), conc AS (
  SELECT author, COUNT(DISTINCT symbol) AS n_symbols
  FROM tmp_sided WHERE raw_return IS NOT NULL
  GROUP BY author
)
SELECT 'author'::text AS level, a.author, NULL::text AS symbol, a.horizon_days, a.side,
       a.n_trades, a.avg_excess_ret, a.win_rate, a.sharpe_like
FROM perf_author a
JOIN conc c ON c.author = a.author
WHERE a.n_trades >= (:'MIN_AUTHOR_TRADES')::int
  AND c.n_symbols >= (:'MIN_UNIQUE_SYMBOLS')::int
ORDER BY a.sharpe_like DESC NULLS LAST, a.n_trades DESC
LIMIT 100;

DROP TABLE IF EXISTS public.tmp_export_author_symbol;
CREATE TABLE public.tmp_export_author_symbol AS
WITH perf AS (
  SELECT
    author,
    symbol,
    horizon_days,
    side,
    COUNT(*) AS n_trades,
    AVG(raw_return * dir) AS avg_excess_ret,
    AVG(((raw_return * dir) > 0)::int)::numeric AS win_rate,
    STDDEV_POP(raw_return * dir) AS std_excess_ret,
    CASE WHEN STDDEV_POP(raw_return * dir) > 0 THEN AVG(raw_return * dir) / NULLIF(STDDEV_POP(raw_return * dir),0) ELSE NULL END AS sharpe_like
  FROM tmp_sided
  WHERE raw_return IS NOT NULL
  GROUP BY author, symbol, horizon_days, side
)
SELECT 'author_symbol'::text AS level, author, symbol, horizon_days, side,
       n_trades, avg_excess_ret, win_rate, sharpe_like
FROM perf
WHERE n_trades >= (:'MIN_AUTHOR_SYMBOL_TRADES')::int
ORDER BY sharpe_like DESC NULLS LAST, n_trades DESC
LIMIT 200;

DROP TABLE IF EXISTS public.tmp_export_author_conc;
CREATE TABLE public.tmp_export_author_conc AS
WITH a AS (
  SELECT author, symbol, COUNT(*) AS n
  FROM tmp_sided
  WHERE raw_return IS NOT NULL
  GROUP BY author, symbol
), tot AS (
  SELECT author, SUM(n) AS n_trades, COUNT(*) AS n_symbols
  FROM a GROUP BY author
), ranked AS (
  SELECT a.*, tot.n_trades, tot.n_symbols,
         ROW_NUMBER() OVER (PARTITION BY a.author ORDER BY a.n DESC) AS rn
  FROM a JOIN tot USING (author)
)
SELECT 'author_conc'::text AS level,
       r.author,
       NULL::text AS symbol,
       NULL::int AS horizon_days,
       NULL::text AS side,
       r.n_trades,
       NULL::numeric AS avg_excess_ret,
       NULL::numeric AS win_rate,
       ROUND((r.n::numeric / NULLIF(r.n_trades,0)),3) AS top_symbol_share
FROM ranked r
WHERE r.rn = 1
ORDER BY top_symbol_share DESC NULLS LAST, n_trades DESC
LIMIT 50;
