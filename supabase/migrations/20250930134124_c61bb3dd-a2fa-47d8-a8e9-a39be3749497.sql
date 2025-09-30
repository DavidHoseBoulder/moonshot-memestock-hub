-- Grant access to views for authenticated users
GRANT SELECT ON v_reddit_daily_signals TO authenticated;
GRANT SELECT ON v_entry_candidates TO authenticated;
GRANT SELECT ON v_reddit_monitoring_signals TO authenticated;
GRANT SELECT ON v_recommended_trades_today_conf TO authenticated;

-- Grant access to the live_sentiment_entry_rules table
GRANT SELECT ON live_sentiment_entry_rules TO authenticated;

-- Grant access to reddit_sentiment table
GRANT SELECT ON reddit_sentiment TO authenticated;

-- Grant access to sentiment_history table  
GRANT SELECT ON sentiment_history TO authenticated;