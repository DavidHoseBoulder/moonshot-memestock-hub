-- Update existing views to use COALESCE for consistent number display
CREATE OR REPLACE VIEW v_reddit_candidates_today AS
SELECT 
    symbol,
    horizon,
    trade_date,
    triggered,
    COALESCE(n_mentions, 0) as n_mentions,
    COALESCE(used_score, 0.0) as used_score,
    pos_thresh,
    min_mentions,
    use_weighted,
    side
FROM daily_sentiment_candidates 
WHERE d = CURRENT_DATE;

-- Create fallback view for last trading day with data
CREATE OR REPLACE VIEW v_reddit_candidates_last_trading_day AS
WITH last_day AS (
    SELECT MAX(d) as last_date 
    FROM daily_sentiment_candidates 
    WHERE d < CURRENT_DATE 
    AND n_mentions > 0
)
SELECT 
    symbol,
    horizon,
    trade_date,
    triggered,
    COALESCE(n_mentions, 0) as n_mentions,
    COALESCE(used_score, 0.0) as used_score,
    pos_thresh,
    min_mentions,
    use_weighted,
    side,
    (SELECT last_date FROM last_day) as reference_date
FROM daily_sentiment_candidates d
CROSS JOIN last_day
WHERE d.d = (SELECT last_date FROM last_day);

-- Create fallback view for daily signals last trading day
CREATE OR REPLACE VIEW v_reddit_daily_signals_last_trading_day AS
WITH last_day AS (
    SELECT MAX(trade_date) as last_date 
    FROM v_reddit_daily_signals 
    WHERE trade_date < CURRENT_DATE
    AND n_mentions > 0
)
SELECT 
    symbol,
    trade_date,
    n_mentions,
    avg_score,
    used_score,
    (SELECT last_date FROM last_day) as reference_date
FROM v_reddit_daily_signals d
CROSS JOIN last_day
WHERE d.trade_date = (SELECT last_date FROM last_day);

-- Update live entries view to use COALESCE
CREATE OR REPLACE VIEW v_today_live_entries AS
SELECT 
    symbol,
    horizon,
    d,
    triggered,
    COALESCE(n_mentions, 0) as n_mentions,
    COALESCE(used_score, 0.0) as used_score,
    pos_thresh,
    min_mentions
FROM live_sentiment_candidates 
WHERE d = CURRENT_DATE;