-- Recreate v_home_kpis view with current data
CREATE OR REPLACE VIEW v_home_kpis AS
WITH dates AS (
  SELECT CURRENT_DATE::date as today
),
trades_summary AS (
  SELECT 
    t.mode,
    COUNT(CASE WHEN t.status = 'OPEN' THEN 1 END) as open_positions,
    COALESCE(SUM(CASE WHEN t.status = 'OPEN' THEN t.entry_price * t.qty END), 0) as exposure_usd,
    COALESCE(SUM(CASE WHEN t.status = 'OPEN' AND emd.price IS NOT NULL THEN 
      CASE WHEN t.side = 'LONG' THEN (emd.price - t.entry_price) * t.qty
           ELSE (t.entry_price - emd.price) * t.qty END
    END), 0) as unrealized_usd,
    COUNT(CASE WHEN t.status = 'CLOSED' AND t.exit_ts >= CURRENT_DATE - INTERVAL '30 days' THEN 1 END) as closed_30d,
    COALESCE(AVG(CASE WHEN t.status = 'CLOSED' AND t.exit_ts >= CURRENT_DATE - INTERVAL '30 days' THEN 
      CASE WHEN t.side = 'LONG' THEN (t.exit_price - t.entry_price) / t.entry_price
           ELSE (t.entry_price - t.exit_price) / t.entry_price END
    END), 0) as avg_realized_pct,
    COALESCE(SUM(CASE WHEN t.status = 'CLOSED' AND t.exit_ts >= CURRENT_DATE - INTERVAL '30 days' THEN 
      CASE WHEN t.side = 'LONG' THEN (t.exit_price - t.entry_price) * t.qty
           ELSE (t.entry_price - t.exit_price) * t.qty END
    END), 0) as realized_30d_usd,
    COALESCE(AVG(CASE WHEN t.status = 'CLOSED' AND t.exit_ts >= CURRENT_DATE - INTERVAL '30 days' AND
      CASE WHEN t.side = 'LONG' THEN t.exit_price > t.entry_price
           ELSE t.exit_price < t.entry_price END THEN 1.0 ELSE 0.0 END), 0) as hit_rate
  FROM trades t
  LEFT JOIN enhanced_market_data emd ON t.symbol = emd.symbol 
    AND emd.data_date = (SELECT MAX(data_date) FROM enhanced_market_data WHERE symbol = t.symbol)
  GROUP BY t.mode
)
SELECT 
  d.today as header_as_of_date,
  d.today as kpi_as_of_date,
  d.today as signals_as_of_date,
  NULL::date as candidates_as_of_date,
  ts.mode,
  ts.open_positions,
  ts.exposure_usd,
  ts.unrealized_usd,
  CASE WHEN ts.exposure_usd > 0 THEN ts.unrealized_usd / ts.exposure_usd ELSE 0 END as unrealized_pct,
  ts.closed_30d,
  ts.hit_rate,
  ts.realized_30d_usd,
  ts.avg_realized_pct
FROM dates d
CROSS JOIN trades_summary ts;