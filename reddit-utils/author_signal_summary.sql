\set ON_ERROR_STOP on

-- Summary reads the CSV-backed temp export tables (must be created in-session)
-- Required param: OUT_SUMMARY (absolute file path)

\if :{?OUT_SUMMARY} \else \echo 'ERROR: OUT_SUMMARY not set' \quit 1 \endif

-- Echo a header with a timestamp
SELECT to_char(now(), 'YYYY-MM-DD HH24:MI:SS') AS generated_at \g :'OUT_SUMMARY'
\echo 'Params' >> :'OUT_SUMMARY'
SELECT :'MIN_AUTHOR_TRADES'::text AS min_author_trades,
       :'MIN_AUTHOR_SYMBOL_TRADES'::text AS min_author_symbol_trades,
       :'MIN_UNIQUE_SYMBOLS'::text AS min_unique_symbols,
       :'POS_THRESH'::text AS pos_thresh >> :'OUT_SUMMARY'

\echo '' >> :'OUT_SUMMARY'
\echo 'Author counts by Sharpe threshold' >> :'OUT_SUMMARY'
WITH b AS (
  SELECT horizon_days, side,
         SUM((sharpe_like >= 0.50)::int) AS n_ge_050,
         SUM((sharpe_like >= 1.00)::int) AS n_ge_100,
         COUNT(*) AS n_total
  FROM tmp_export_author
  GROUP BY horizon_days, side
)
SELECT * FROM b ORDER BY horizon_days, side \g >> :'OUT_SUMMARY'

\echo '' >> :'OUT_SUMMARY'
\echo 'Top 10 authors by Sharpe' >> :'OUT_SUMMARY'
SELECT level, author, symbol, horizon_days, side, n_trades, round(avg_excess_ret::numeric,5) AS avg_excess_ret,
       round(win_rate::numeric,3) AS win_rate, round(sharpe_like::numeric,3) AS sharpe
FROM tmp_export_author
ORDER BY sharpe_like DESC NULLS LAST, n_trades DESC
LIMIT 10 \g >> :'OUT_SUMMARY'

\echo '' >> :'OUT_SUMMARY'
\echo 'Top 10 author+symbol by Sharpe' >> :'OUT_SUMMARY'
SELECT level, author, symbol, horizon_days, side, n_trades, round(avg_excess_ret::numeric,5) AS avg_excess_ret,
       round(win_rate::numeric,3) AS win_rate, round(sharpe_like::numeric,3) AS sharpe
FROM tmp_export_author_symbol
ORDER BY sharpe_like DESC NULLS LAST, n_trades DESC
LIMIT 10 \g >> :'OUT_SUMMARY'

\echo '' >> :'OUT_SUMMARY'
\echo 'Concentration (top_symbol_share) – top 10' >> :'OUT_SUMMARY'
SELECT level, author, top_symbol_share, n_trades
FROM tmp_export_author_conc
ORDER BY top_symbol_share DESC NULLS LAST, n_trades DESC
LIMIT 10 \g >> :'OUT_SUMMARY'
