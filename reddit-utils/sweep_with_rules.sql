-- tmp4.sql — rules → signals → hits → pricing → performance
-- tmp4.sql — end-to-end builder with strong diagnostics
-- Run with:
-- psql "$PGURI" \
--   -v MODEL_VERSION="'gpt-sent-v1'" \
--   -v START_DATE="'2025-08-15'" \
--   -v END_DATE="'2025-08-31'" \
--   -v MIN_TRADES=0 \
--   -v MIN_SHARPE=-999 \
--   -v MIN_MENTIONS=0 \
--   -v POS_THRESH=0 \
--   -v TRADE_VALUE=1000.00 \
--   -v TP_PCT=0.00 \
--   -v DO_INSERT=0 \
--   -v SIDE='LONG' \
--   -v DEBUG=0 \
--   -v W_REDDIT=0.7 -v W_STOCKTWITS=0.3   # optional blended sentiment weights
--   -f tmp4.sql
-- psql "$PGURI"   -v MODEL_VERSION="'gpt-sent-v1'"   -v START_DATE="'2025-08-01'"   -v END_DATE="'2025-09-02'"   -v MIN_TRADES=0 -v MIN_SHARPE=-999 -v MIN_MENTIONS=0 -v POS_THRESH=0   -f tmp4.sql

\set ON_ERROR_STOP on

-- ===== psql variable defaults (safe) =====
\if :{?MODEL_VERSION} \else \set MODEL_VERSION '''gpt-sent-v1''' \endif      
\if :{?START_DATE}    \else \set START_DATE  '''2025-08-01'''      \endif      
\if :{?END_DATE}      \else \set END_DATE    '''2025-09-30'''      \endif
\if :{?MIN_MENTIONS}  \else \set MIN_MENTIONS 1                    \endif      
\if :{?POS_THRESH}    \else \set POS_THRESH   0.20                 \endif
\if :{?MIN_TRADES}    \else \set MIN_TRADES   0                    \endif
\if :{?MIN_SHARPE}    \else \set MIN_SHARPE   -999                 \endif
\if :{?SIDE} 	      \else \set SIDE         LONG 		   \endif         
\if :{?TP_PCT} 	      \else \set TP_PCT       0 		   \endif
\if :{?TRADE_VALUE}   \else \set TRADE_VALUE  1000.00  		   \endif
\if :{?DO_INSERT}     \else \set DO_INSERT    0  		   \endif
\if :{?W_REDDIT}      \else \set W_REDDIT      1.0                 \endif
\if :{?W_STOCKTWITS}  \else \set W_STOCKTWITS  0.0                 \endif
\if :{?MIN_VOLUME_Z}      \else \set MIN_VOLUME_Z      'NULL'      \endif
\if :{?MIN_VOLUME_RATIO}  \else \set MIN_VOLUME_RATIO  'NULL'      \endif
\if :{?MIN_VOLUME_SHARE}  \else \set MIN_VOLUME_SHARE  'NULL'      \endif
\if :{?RSI_LONG_MAX}      \else \set RSI_LONG_MAX      'NULL'      \endif
\if :{?RSI_SHORT_MIN}     \else \set RSI_SHORT_MIN     'NULL'      \endif
\if :{?W_REDDIT}      \else \set W_REDDIT      1.0                 \endif
\if :{?W_STOCKTWITS}  \else \set W_STOCKTWITS  0.0                 \endif
-- Default DEBUG=1 (verbose) if not passed in
\if :{?DEBUG}
\else
  \set DEBUG 1
\endif
DROP TABLE IF EXISTS tmp_params;
DROP TABLE IF EXISTS tmp_rules_raw;
DROP TABLE IF EXISTS tmp_rules;
DROP TABLE IF EXISTS tmp_signals_all;
DROP TABLE IF EXISTS tmp_paired;
DROP TABLE IF EXISTS tmp_hits;
DROP TABLE IF EXISTS tmp_snap_entry;
DROP TABLE IF EXISTS tmp_snap_exit;
DROP TABLE IF EXISTS tmp_priced;
DROP TABLE IF EXISTS tmp_calc;
DROP TABLE IF EXISTS tmp_eligible;
DROP TABLE IF EXISTS tmp_tp_hits;
DROP TABLE IF EXISTS tmp_cal;
DROP TABLE IF EXISTS tmp_entries;
DROP TABLE IF EXISTS tmp_calc_tp;

-- Params (handle quoted or unquoted -v values safely)
CREATE TEMP TABLE tmp_params AS
SELECT
  (:MODEL_VERSION)::text                         AS model_version,
  (:START_DATE)::date                            AS start_date,
  (:END_DATE)::date                              AS end_date,
  (CASE WHEN UPPER(:'SIDE')='SHORT' THEN -1 ELSE 1 END)::int AS dir,
  COALESCE(:MIN_TRADES,     0)    AS min_trades,
  COALESCE(:MIN_SHARPE, -999) AS min_sharpe,
  COALESCE(:MIN_MENTIONS,     0)    AS min_mentions,
  COALESCE(:TRADE_VALUE,1000.00)::numeric AS notional,
  COALESCE(:POS_THRESH, 0)    AS pos_thresh,
  (:W_REDDIT)::numeric        AS w_reddit,
  (:W_STOCKTWITS)::numeric    AS w_stocktwits,
  NULLIF(:'MIN_VOLUME_Z','NULL')::numeric       AS min_volume_z,
  NULLIF(:'MIN_VOLUME_RATIO','NULL')::numeric   AS min_volume_ratio,
  NULLIF(:'MIN_VOLUME_SHARE','NULL')::numeric   AS min_volume_share,
  NULLIF(:'RSI_LONG_MAX','NULL')::numeric       AS rsi_long_max,
  NULLIF(:'RSI_SHORT_MIN','NULL')::numeric      AS rsi_short_min;

-- Rules (filter by model_version if present in your table)
-- If your rules table DOESN'T have model_version, remove that WHERE line.
CREATE TEMP TABLE tmp_rules_raw AS
SELECT
  r.symbol,
  r.horizon,
  r.side,
  r.min_mentions,
  r.pos_thresh,
  r.trades,
  r.sharpe,
  r.is_enabled
FROM live_sentiment_entry_rules r
JOIN tmp_params p ON TRUE
WHERE r.model_version = p.model_version;

CREATE TEMP TABLE tmp_rules AS
SELECT r.*
FROM tmp_rules_raw r
JOIN tmp_params p ON TRUE
WHERE r.is_enabled IS TRUE
  AND COALESCE(r.trades,0) >= p.min_trades
  AND (r.sharpe IS NULL OR r.sharpe >= p.min_sharpe);

-- Signals (use your actual columns)
CREATE TEMP TABLE tmp_signals_all AS
SELECT
  sub.trade_date::date AS trade_date,
  sub.symbol,
  COALESCE(sub.reddit_n_mentions, 0)                 AS reddit_mentions,
  COALESCE(sub.stocktwits_total_messages, 0)         AS stocktwits_mentions,
  COALESCE(sub.reddit_n_mentions, 0) + COALESCE(sub.stocktwits_total_messages, 0) AS total_mentions,
  COALESCE(sub.reddit_used_score, 0)::numeric        AS reddit_used_score,
  COALESCE(sub.stocktwits_sentiment_score, 0)::numeric AS stocktwits_sentiment_score,
  CASE
    WHEN sub.denom_weighted > 0 THEN sub.blended_score
    ELSE COALESCE(sub.reddit_used_score, sub.stocktwits_sentiment_score, 0)::numeric
  END AS used_score,
  COALESCE(sub.reddit_n_mentions, 0)                 AS n_mentions,
  m.volume_zscore_20,
  m.volume_ratio_avg_20,
  m.volume_share_20,
  m.rsi_14
FROM (
  SELECT
    o.*,
    (p.w_reddit * COALESCE(o.reddit_n_mentions, 0) +
     p.w_stocktwits * COALESCE(o.stocktwits_total_messages, 0)) AS denom_weighted,
    CASE
      WHEN (p.w_reddit * COALESCE(o.reddit_n_mentions, 0) +
            p.w_stocktwits * COALESCE(o.stocktwits_total_messages, 0)) > 0
      THEN (
        p.w_reddit * COALESCE(o.reddit_used_score, 0)::numeric * COALESCE(o.reddit_n_mentions, 0) +
        p.w_stocktwits * COALESCE(o.stocktwits_sentiment_score, 0)::numeric * COALESCE(o.stocktwits_total_messages, 0)
      ) / (p.w_reddit * COALESCE(o.reddit_n_mentions, 0) +
            p.w_stocktwits * COALESCE(o.stocktwits_total_messages, 0))
      ELSE NULL
    END AS blended_score
  FROM v_sentiment_daily_overlap o
  JOIN tmp_params p ON TRUE
  WHERE o.trade_date BETWEEN p.start_date AND p.end_date
) sub
LEFT JOIN v_market_rolling_features m
  ON m.symbol = sub.symbol
 AND m.data_date = sub.trade_date;

-- Pair signals to rules (inherit horizon/side from rule)
CREATE TEMP TABLE tmp_paired AS
SELECT
  s.trade_date,
  r.symbol,
  r.horizon,
  r.side,
  s.n_mentions,
  s.reddit_mentions,
  s.stocktwits_mentions,
  s.total_mentions,
  s.used_score,
  s.volume_zscore_20,
  s.volume_ratio_avg_20,
  s.volume_share_20,
  s.rsi_14,
  r.min_mentions AS rule_min_mentions,
  r.pos_thresh   AS rule_pos_thresh,
  r.trades       AS rule_trades,
  r.sharpe       AS rule_sharpe
FROM tmp_signals_all s
JOIN tmp_rules r USING (symbol)
JOIN tmp_params p ON TRUE
WHERE s.n_mentions >= GREATEST(COALESCE(r.min_mentions,0), p.min_mentions)
  AND s.used_score >= GREATEST(COALESCE(r.pos_thresh,0),   p.pos_thresh)
  AND (
        p.min_volume_z IS NULL
        OR (s.volume_zscore_20 IS NOT NULL AND s.volume_zscore_20 >= p.min_volume_z)
      )
  AND (
        p.min_volume_ratio IS NULL
        OR (s.volume_ratio_avg_20 IS NOT NULL AND s.volume_ratio_avg_20 >= p.min_volume_ratio)
      )
  AND (
        p.min_volume_share IS NULL
        OR (s.volume_share_20 IS NOT NULL AND s.volume_share_20 >= p.min_volume_share)
      )
  AND (
        p.rsi_long_max IS NULL
        OR r.side <> 'LONG'
        OR (s.rsi_14 IS NOT NULL AND s.rsi_14 <= p.rsi_long_max)
      )
  AND (
        p.rsi_short_min IS NULL
        OR r.side <> 'SHORT'
        OR (s.rsi_14 IS NOT NULL AND s.rsi_14 >= p.rsi_short_min)
      );

-- Hits = unique (date, symbol, horizon, side)
CREATE TEMP TABLE tmp_hits AS
SELECT DISTINCT
  trade_date, symbol, horizon, side,
  MAX(n_mentions) AS n_mentions,
  MAX(total_mentions) AS total_mentions,
  MAX(stocktwits_mentions) AS stocktwits_mentions,
  MAX(reddit_mentions) AS reddit_mentions,
  MAX(used_score) AS used_score
FROM tmp_paired
GROUP BY trade_date, symbol, horizon, side;

-- Entry: first market day >= trade_date + 1 day
CREATE TEMP TABLE tmp_snap_entry AS
SELECT
  h.trade_date,
  h.symbol,
  h.horizon,
  h.side,
  e.data_date AS entry_date,
  e.price     AS entry_price
FROM tmp_hits h
JOIN LATERAL (
  SELECT m.data_date, m.price
  FROM enhanced_market_data m
  WHERE m.symbol = h.symbol
    AND m.data_date >= h.trade_date + INTERVAL '1 day'
  ORDER BY m.data_date
  LIMIT 1
) e ON TRUE;

-- Exit: first market day >= (entry + horizon)
CREATE TEMP TABLE tmp_snap_exit AS
WITH x AS (
  SELECT
    se.trade_date,
    se.symbol,
    se.horizon,
    se.side,
    se.entry_date,
    se.entry_price,
    (se.entry_date
       + CASE se.horizon
           WHEN '1d' THEN INTERVAL '1 day'
           WHEN '3d' THEN INTERVAL '3 days'
           WHEN '5d' THEN INTERVAL '5 days'
           ELSE INTERVAL '1 day'
         END) AS target_exit_ts
  FROM tmp_snap_entry se
)
SELECT
  x.trade_date, x.symbol, x.horizon, x.side,
  x.entry_date, x.entry_price,
  ex.data_date AS exit_date,
  ex.price     AS exit_price
FROM x
JOIN LATERAL (
  SELECT m.data_date, m.price
  FROM enhanced_market_data m
  WHERE m.symbol = x.symbol
    AND m.data_date >= x.target_exit_ts::date
  ORDER BY m.data_date
  LIMIT 1
) ex ON TRUE;

-- Calendar of trading days spanning window (+padding for lookahead)
CREATE TABLE tmp_cal AS
SELECT DISTINCT data_date
FROM enhanced_market_data
WHERE data_date BETWEEN (:START_DATE::date - INTERVAL '7 days')
                    AND (:END_DATE::date   + INTERVAL '7 days')
ORDER BY 1;

-- Index helps the joins
CREATE INDEX IF NOT EXISTS ix_tmp_cal_date ON tmp_cal(data_date);

-- tmp_entries: compute entry_date and exit_date based on horizon
CREATE TABLE tmp_entries AS
WITH cal AS (
  SELECT data_date, row_number() OVER (ORDER BY data_date) AS rn
  FROM tmp_cal
),
sig AS (
  SELECT p.symbol, p.horizon, p.side, p.trade_date
  FROM tmp_paired p
),
anchored AS (
  SELECT
    s.symbol,
    s.horizon,
    s.side,
    s.trade_date,
    c0.rn AS trade_rn
  FROM sig s
  JOIN cal c0 ON c0.data_date = s.trade_date
),
dated AS (
  SELECT
    a.symbol, a.horizon, a.side, a.trade_date,
    c_entry.data_date AS entry_date,
    c_exit.data_date  AS exit_date
  FROM anchored a
  -- Entry = next trading day
  LEFT JOIN cal c_entry ON c_entry.rn = a.trade_rn + 1
  -- Exit depends on horizon: 1d -> trade_rn+2; 3d -> trade_rn+4 (entry + 1 / +3)
  LEFT JOIN cal c_exit  ON c_exit.rn  = CASE a.horizon
                                          WHEN '1d' THEN a.trade_rn + 2
                                          WHEN '3d' THEN a.trade_rn + 4
                                          ELSE a.trade_rn + 2  -- sensible default
                                        END
)
SELECT * FROM dated;

-- Price the entries using OHLC (fallback to price if needed)
CREATE TEMP TABLE tmp_priced AS
SELECT
  e.symbol,
  e.horizon,
  e.trade_date,
  e.entry_date,
  ex.exit_date,
  en.price_close  AS entry_price,
  exl.price_close AS exit_price
FROM tmp_entries e
-- ENTRY: first bar on/after entry_date
LEFT JOIN LATERAL (
  SELECT m.price_close
  FROM enhanced_market_data m
  WHERE m.symbol = e.symbol
    AND m.data_date >= e.entry_date
  ORDER BY m.data_date
  LIMIT 1
) en ON TRUE
-- EXIT: first bar on/after exit_date
LEFT JOIN LATERAL (
  SELECT m.data_date, m.price_close
  FROM enhanced_market_data m
  WHERE m.symbol = e.symbol
    AND m.data_date >= e.exit_date
  ORDER BY m.data_date
  LIMIT 1
) exl ON TRUE
-- Keep the original requested exit_date for reporting
LEFT JOIN LATERAL (
  SELECT e.exit_date
) ex ON TRUE;

-- Returns (use priced entries that already resolved entry/exit dates & prices)
CREATE TEMP TABLE tmp_calc AS
SELECT
  p.symbol, p.horizon, p.trade_date,
  p.entry_date, p.exit_date, p.entry_price, p.exit_price,
  CASE
    WHEN p.entry_price IS NOT NULL AND p.exit_price IS NOT NULL AND p.entry_price <> 0
    THEN (SELECT dir FROM tmp_params) * ((p.exit_price / p.entry_price) - 1)
    ELSE NULL
  END AS ret
FROM tmp_priced p;

-- First day where price_high reaches entry_price * (1 + TP_PCT)
CREATE TEMP TABLE tmp_tp_hits AS
WITH t AS (
  SELECT
    c.symbol, c.horizon, c.trade_date,
    c.entry_date, c.exit_date, c.entry_price, c.exit_price,
    (SELECT dir FROM tmp_params) AS dir,
    c.entry_price * (1 + (SELECT dir FROM tmp_params) * :TP_PCT::numeric) AS tp_price
  FROM tmp_calc c
),
scan AS (
  SELECT
    t.symbol, t.horizon, t.trade_date, m.data_date, m.price_high, m.price_low, t.tp_price, t.dir
  FROM t
  JOIN enhanced_market_data m
    ON m.symbol = t.symbol
   AND m.data_date >= t.entry_date
   AND m.data_date <= t.exit_date
   AND (
        (t.dir =  1 AND m.price_high >= t.tp_price) OR
        (t.dir = -1 AND m.price_low  <= t.tp_price)
       )
)
SELECT
  s.symbol, s.horizon, s.trade_date,
  MIN(s.data_date) AS hit_date
FROM scan s
GROUP BY 1,2,3;

CREATE INDEX ON tmp_tp_hits(symbol, horizon, trade_date);

-- Merge TP into priced trades
CREATE TEMP TABLE tmp_calc_tp AS
SELECT
  c.*,
  CASE
    WHEN :TP_PCT::numeric > 0 AND h.hit_date IS NOT NULL THEN h.hit_date
    ELSE c.exit_date
  END AS sim_exit_date,
  CASE
    WHEN :TP_PCT::numeric > 0 AND h.hit_date IS NOT NULL
      THEN ROUND(c.entry_price * (1 + :TP_PCT::numeric), 6) -- conservative fill
    ELSE c.exit_price
  END AS sim_exit_price
FROM tmp_calc c
LEFT JOIN tmp_tp_hits h
  ON h.symbol = c.symbol
 AND h.horizon = c.horizon
 AND h.trade_date = c.trade_date;

ALTER TABLE tmp_calc_tp ADD COLUMN sim_ret numeric;
UPDATE tmp_calc_tp
SET sim_ret = CASE
  WHEN entry_price IS NOT NULL AND sim_exit_price IS NOT NULL AND entry_price <> 0
    THEN (sim_exit_price / entry_price) - 1
  ELSE NULL
END;

-- Eligible results
CREATE TEMP TABLE tmp_eligible AS
SELECT * FROM tmp_calc WHERE ret IS NOT NULL;

-- Debug counts
\if :DEBUG
SELECT 'rules_raw'      AS label, COUNT(*) AS n FROM tmp_rules_raw;
SELECT 'rules_filtered' AS label, COUNT(*) AS n FROM tmp_rules;
SELECT 'signals_all'    AS label, COUNT(*) AS n FROM tmp_signals_all;
SELECT 'paired'         AS label, COUNT(*) AS n FROM tmp_paired;
SELECT 'hits'           AS label, COUNT(*) AS n FROM tmp_hits;
SELECT 'snap_entry_nonnull' AS label, COUNT(*) AS n FROM tmp_snap_entry;
SELECT 'snap_exit_nonnull'  AS label, COUNT(*) AS n FROM tmp_snap_exit;
SELECT 'priced_with_entry'  AS label, COUNT(*) AS n FROM tmp_priced;
SELECT 'priced_with_exit'   AS label, COUNT(*) AS n FROM tmp_priced WHERE exit_price IS NOT NULL;
SELECT 'calc_ret_nonnull'   AS label, COUNT(*) AS n FROM tmp_calc    WHERE ret IS NOT NULL;
SELECT 'eligible'           AS label, COUNT(*) AS n FROM tmp_eligible;
SELECT 'rules_raw_sample' AS label, r.symbol, r.horizon, r.side,
       r.min_mentions, r.pos_thresh, r.trades, r.sharpe, r.is_enabled
FROM tmp_rules_raw r
ORDER BY r.symbol, r.horizon, r.side
LIMIT 10;

\if :{?DEBUG}
\echo 'priced_sample'
SELECT 'priced_sample' AS label, p.trade_date, p.entry_date, p.exit_date,
       p.symbol, p.horizon, p.entry_price, p.exit_price
FROM tmp_priced p
LIMIT 10;
\endif

-- Performance (normalized $1000/trade)
WITH params AS (SELECT 100.0::numeric AS notional)
SELECT
  COUNT(*) AS n_trades,
  AVG(ret) AS avg_ret,
  SUM(ret) AS total_ret,
  AVG(CASE WHEN ret > 0 THEN 1 ELSE 0 END)::numeric AS win_rate,
  STDDEV_POP(ret) AS vol,
  CASE WHEN STDDEV_POP(ret) IS NULL OR STDDEV_POP(ret)=0 THEN NULL
       ELSE AVG(ret)/STDDEV_POP(ret)
  END AS sharpe,
  (SELECT notional FROM params) * SUM(ret) AS total_pnl_usd
FROM tmp_eligible;

WITH params AS (SELECT notional FROM tmp_params)
SELECT
  symbol, horizon,
  COUNT(*) AS n_trades,
  AVG(ret) AS avg_ret,
  SUM(ret) AS total_ret,
  AVG(CASE WHEN ret > 0 THEN 1 ELSE 0 END)::numeric AS win_rate,
  STDDEV_POP(ret) AS vol,
  CASE WHEN STDDEV_POP(ret) IS NULL OR STDDEV_POP(ret)=0 THEN NULL
       ELSE AVG(ret)/STDDEV_POP(ret)
  END AS sharpe,
  (SELECT notional FROM params) * SUM(ret) AS total_pnl_usd
FROM tmp_eligible
GROUP BY symbol, horizon
ORDER BY total_pnl_usd DESC;
\endif
WITH base AS (
  SELECT
    (CASE WHEN :TP_PCT::numeric > 0 THEN sim_ret ELSE ret END) AS used_ret,
    entry_price,
    (CASE WHEN :TP_PCT::numeric > 0 THEN sim_exit_price ELSE exit_price END) AS used_exit_price
  FROM tmp_calc_tp
),
params AS (SELECT notional FROM tmp_params)
SELECT
  COUNT(*) AS n_trades,
  AVG(used_ret) AS avg_ret,
  SUM(used_ret) AS total_ret,
  AVG(CASE WHEN used_ret > 0 THEN 1.0 ELSE 0.0 END) AS win_rate,
  STDDEV_SAMP(used_ret) AS vol,
  CASE WHEN STDDEV_SAMP(used_ret) IS NULL OR STDDEV_SAMP(used_ret)=0 THEN NULL
       ELSE AVG(used_ret)/STDDEV_SAMP(used_ret) END AS sharpe,
  (SELECT notional FROM params) * SUM(used_ret) AS total_pnl_usd
FROM base;

WITH base AS (
  SELECT
    symbol, horizon, entry_price,
    (CASE WHEN :TP_PCT::numeric > 0 THEN sim_exit_price ELSE exit_price END) AS used_exit_price,
    (CASE WHEN :TP_PCT::numeric > 0 THEN sim_ret        ELSE ret        END) AS used_ret
  FROM tmp_calc_tp
),
params AS (SELECT notional FROM tmp_params)
SELECT
  symbol,
  horizon,
  COUNT(*) AS n_trades,
  AVG(used_ret) AS avg_ret,
  SUM(used_ret) AS total_ret,
  AVG(CASE WHEN used_ret > 0 THEN 1.0 ELSE 0.0 END) AS win_rate,
  STDDEV_SAMP(used_ret) AS vol,
  CASE WHEN STDDEV_SAMP(used_ret) IS NULL OR STDDEV_SAMP(used_ret)=0 THEN NULL
       ELSE AVG(used_ret)/STDDEV_SAMP(used_ret) END AS sharpe,
  (SELECT notional FROM params) * SUM(used_ret) AS total_pnl_usd
FROM base
GROUP BY 1,2
ORDER BY 1,2;

-- Optionally Insert the trades
\if :DO_INSERT
INSERT INTO trades (
    symbol,
    side,
    horizon,
    mode,
    source,
    trade_date,
    entry_ts,
    entry_price,
    exit_ts,
    exit_price,
    qty,
    fees_total,
    status,
    notes,
    audit,
    opened_by
)
SELECT
    c.symbol,
    :'SIDE'::text                            AS side,
    c.horizon,
    :MODE::text                              AS mode,
    (:MODEL_VERSION)::text                   AS source,
    c.trade_date,
    c.entry_date::timestamptz                AS entry_ts,
    c.entry_price,
    c.exit_date::timestamptz                 AS exit_ts,
    CASE WHEN :TP_PCT::numeric > 0
         THEN c.sim_exit_price
         ELSE c.exit_price
    END                                       AS exit_price,
    (p.notional / NULLIF(c.entry_price,0))::numeric AS qty,
    0::numeric                                AS fees_total,
    'CLOSED'::text                            AS status,
    concat('TP=', CASE WHEN :TP_PCT::numeric > 0 THEN :TP_PCT::text ELSE '0' END) AS notes,
    jsonb_build_object(
        'ret',      CASE WHEN :TP_PCT::numeric > 0 THEN c.sim_ret ELSE c.ret END,
        'pnl_usd',  p.notional * (CASE WHEN :TP_PCT::numeric > 0 THEN c.sim_ret ELSE c.ret END),
        'notional', p.notional,
        'side',     :'SIDE'
    )                                          AS audit,
    current_user                               AS opened_by
FROM tmp_calc_tp c
CROSS JOIN tmp_params p
WHERE (CASE WHEN :TP_PCT::numeric > 0 THEN c.sim_ret ELSE c.ret END) IS NOT NULL;
\endif
