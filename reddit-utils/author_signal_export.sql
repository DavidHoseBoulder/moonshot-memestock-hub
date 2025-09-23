\set ON_ERROR_STOP on

-- Exports derived from tmp_sided built by author_signal_backtest.sql
-- Requires: MIN_AUTHOR_TRADES, MIN_AUTHOR_SYMBOL_TRADES, MIN_UNIQUE_SYMBOLS
-- Required params: OUT_AUTHOR_TOP, OUT_AUTHOR_SYMBOL, OUT_AUTHOR_CONC (absolute file paths)

\if :{?OUT_AUTHOR_TOP} \else \echo 'ERROR: OUT_AUTHOR_TOP not set' \quit 1 \endif
\if :{?OUT_AUTHOR_SYMBOL} \else \echo 'ERROR: OUT_AUTHOR_SYMBOL not set' \quit 1 \endif
\if :{?OUT_AUTHOR_CONC} \else \echo 'ERROR: OUT_AUTHOR_CONC not set' \quit 1 \endif

\pset format csv
\pset tuples_only on

-- Author-level metrics (direct from tmp_sided)
\o :'OUT_AUTHOR_TOP'
WITH perf_author AS (
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
), conc AS (
  SELECT author, COUNT(DISTINCT symbol) AS n_symbols
  FROM tmp_sided WHERE raw_return IS NOT NULL
  GROUP BY author
)
SELECT 'author' AS level, a.author, NULL::text AS symbol, a.horizon_days, a.side,
       a.n_trades, a.avg_excess_ret, a.win_rate, a.sharpe_like
FROM perf_author a
JOIN conc c ON c.author = a.author
WHERE a.n_trades >= (:'MIN_AUTHOR_TRADES')::int
  AND c.n_symbols >= (:'MIN_UNIQUE_SYMBOLS')::int
ORDER BY a.sharpe_like DESC NULLS LAST, a.n_trades DESC
LIMIT 100;
\o

-- Author+symbol metrics
\o :'OUT_AUTHOR_SYMBOL'
WITH perf_author_symbol AS (
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
)
SELECT 'author_symbol' AS level, author, symbol, horizon_days, side,
       n_trades, avg_excess_ret, win_rate, sharpe_like
FROM perf_author_symbol
WHERE n_trades >= (:'MIN_AUTHOR_SYMBOL_TRADES')::int
ORDER BY sharpe_like DESC NULLS LAST, n_trades DESC
LIMIT 200;
\o

-- Concentration diagnostics
\o :'OUT_AUTHOR_CONC'
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
\o
