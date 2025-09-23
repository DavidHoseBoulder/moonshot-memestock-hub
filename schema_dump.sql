                                                                         List of relations
   Schema   |                  Name                   |   Type   |  Owner   | Persistence | Access method |    Size    |                Description                
------------+-----------------------------------------+----------+----------+-------------+---------------+------------+-------------------------------------------
 extensions | pg_stat_statements                      | view     | postgres | permanent   |               | 0 bytes    | 
 extensions | pg_stat_statements_info                 | view     | postgres | permanent   |               | 0 bytes    | 
 pg_temp_15 | tmp_sided                               | table    | postgres | temporary   | heap          | 9736 kB    | 
 public     | backtest_signals_daily                  | table    | postgres | permanent   | heap          | 520 kB     | 
 public     | backtest_sweep_grid                     | table    | postgres | permanent   | heap          | 1584 kB    | 
 public     | backtest_sweep_results                  | table    | postgres | permanent   | heap          | 112 kB     | 
 public     | backtesting_results                     | table    | postgres | permanent   | heap          | 176 kB     | 
 public     | cmp_per_symbol_baseline                 | table    | postgres | permanent   | heap          | 16 kB      | 
 public     | cmp_per_symbol_gated                    | table    | postgres | permanent   | heap          | 16 kB      | 
 public     | daily_trade_marks                       | table    | postgres | permanent   | heap          | 16 kB      | 
 public     | dbg_filtered                            | table    | postgres | permanent   | heap          | 40 kB      | 
 public     | dbg_final                               | table    | postgres | permanent   | heap          | 40 kB      | 
 public     | dbg_priced                              | table    | postgres | permanent   | heap          | 72 kB      | 
 public     | dbg_ranked                              | table    | postgres | permanent   | heap          | 72 kB      | 
 public     | dbg_sched                               | table    | postgres | permanent   | heap          | 72 kB      | 
 public     | enhanced_market_data                    | table    | postgres | permanent   | heap          | 32 MB      | 
 public     | enhanced_sentiment_data                 | table    | postgres | permanent   | heap          | 152 kB     | 
 public     | import_queue                            | table    | postgres | permanent   | heap          | 16 kB      | 
 public     | import_runs                             | table    | postgres | permanent   | heap          | 48 kB      | 
 public     | live_sentiment_entry_rules              | table    | postgres | permanent   | heap          | 104 kB     | 
 public     | live_sentiment_entry_rules_backup       | table    | postgres | permanent   | heap          | 56 kB      | 
 public     | market_holidays_us                      | table    | postgres | permanent   | heap          | 16 kB      | 
 public     | prices_daily                            | view     | postgres | permanent   |               | 0 bytes    | 
 public     | reddit_comments                         | table    | postgres | permanent   | heap          | 876 MB     | 
 public     | reddit_comments_clean                   | view     | postgres | permanent   |               | 0 bytes    | 
 public     | reddit_comments_raw                     | table    | postgres | permanent   | heap          | 8192 bytes | 
 public     | reddit_comments_stage                   | table    | postgres | permanent   | heap          | 8192 bytes | 
 public     | reddit_daily_sentiment_v1               | view     | postgres | permanent   |               | 0 bytes    | 
 public     | reddit_finance_keep                     | table    | postgres | permanent   | heap          | 8192 bytes | 
 public     | reddit_finance_keep_norm                | table    | postgres | permanent   | heap          | 1741 MB    | 
 public     | reddit_heuristics                       | table    | postgres | permanent   | heap          | 16 kB      | 
 public     | reddit_heuristics_id_seq                | sequence | postgres | permanent   |               | 8192 bytes | 
 public     | reddit_mentions                         | table    | postgres | permanent   | heap          | 32 MB      | 
 public     | reddit_mentions_all                     | view     | postgres | permanent   |               | 0 bytes    | 
 public     | reddit_mentions_mention_id_seq          | sequence | postgres | permanent   |               | 8192 bytes | 
 public     | reddit_posts                            | view     | postgres | permanent   |               | 0 bytes    | 
 public     | reddit_posts_stage                      | table    | postgres | permanent   | heap          | 64 kB      | 
 public     | reddit_posts_std                        | view     | postgres | permanent   |               | 0 bytes    | 
 public     | reddit_raw_aug                          | table    | postgres | permanent   | heap          | 1048 kB    | 
 public     | reddit_sentiment                        | table    | postgres | permanent   | heap          | 21 MB      | 
 public     | reddit_sentiment_daily                  | table    | postgres | permanent   | heap          | 64 kB      | 
 public     | sentiment_analysis                      | table    | postgres | permanent   | heap          | 2344 kB    | 
 public     | sentiment_grade_config                  | table    | postgres | permanent   | heap          | 16 kB      | 
 public     | sentiment_history                       | table    | postgres | permanent   | heap          | 4168 kB    | 
 public     | stage_lines_persist                     | table    | postgres | permanent   | heap          | 1472 kB    | 
 public     | staging_reddit_comments                 | table    | postgres | permanent   | heap          | 8192 bytes | 
 public     | staging_reddit_jsonl                    | table    | postgres | permanent   | heap          | 1913 MB    | 
 public     | staging_reddit_submissions              | table    | postgres | permanent   | heap          | 146 MB     | 
 public     | staging_reddit_submissions_buf          | table    | postgres | unlogged    | heap          | 16 kB      | 
 public     | staging_reddit_submissions_slim         | table    | postgres | unlogged    | heap          | 16 kB      | 
 public     | subreddit_universe                      | table    | postgres | permanent   | heap          | 64 kB      | 
 public     | symbol_disambig                         | table    | postgres | permanent   | heap          | 56 kB      | 
 public     | ticker_universe                         | table    | postgres | permanent   | heap          | 48 kB      | 
 public     | tmp_cal                                 | table    | postgres | permanent   | heap          | 8192 bytes | 
 public     | tmp_entries                             | table    | postgres | permanent   | heap          | 16 kB      | 
 public     | tmp_export_author                       | table    | postgres | permanent   | heap          | 24 kB      | 
 public     | tmp_export_author_conc                  | table    | postgres | permanent   | heap          | 16 kB      | 
 public     | tmp_export_author_stability             | table    | postgres | permanent   | heap          | 1344 kB    | 
 public     | tmp_export_author_symbol                | table    | postgres | permanent   | heap          | 24 kB      | 
 public     | tmp_symbol_disambig                     | view     | postgres | permanent   |               | 0 bytes    | 
 public     | tmp_trades                              | table    | postgres | permanent   | heap          | 8192 bytes | 
 public     | trades                                  | table    | postgres | permanent   | heap          | 144 kB     | 
 public     | trading_signals                         | table    | postgres | permanent   | heap          | 16 kB      | 
 public     | triggered_candidates                    | table    | postgres | permanent   | heap          | 8192 bytes | 
 public     | v_backtest_summary                      | view     | postgres | permanent   |               | 0 bytes    | Standardized backtest performance summary
 public     | v_daily_pnl_by_symbol                   | view     | postgres | permanent   |               | 0 bytes    | 
 public     | v_daily_pnl_rollups                     | view     | postgres | permanent   |               | 0 bytes    | 
 public     | v_entry_candidates                      | view     | postgres | permanent   |               | 0 bytes    | 
 public     | v_home_kpis                             | view     | postgres | permanent   |               | 0 bytes    | 
 public     | v_import_runs_daily_summary             | view     | postgres | permanent   |               | 0 bytes    | 
 public     | v_import_runs_latest                    | view     | postgres | permanent   |               | 0 bytes    | 
 public     | v_latest_reddit_trade_date              | view     | postgres | permanent   |               | 0 bytes    | 
 public     | v_live_sentiment_rules                  | view     | postgres | permanent   |               | 0 bytes    | 
 public     | v_live_sentiment_signals                | view     | postgres | permanent   |               | 0 bytes    | 
 public     | v_post_attrs                            | view     | postgres | permanent   |               | 0 bytes    | 
 public     | v_recommended_trades_today              | view     | postgres | permanent   |               | 0 bytes    | 
 public     | v_recommended_trades_today_conf         | view     | postgres | permanent   |               | 0 bytes    | 
 public     | v_reddit_backtest_lookup                | view     | postgres | permanent   |               | 0 bytes    | 
 public     | v_reddit_candidates_last_trading_day    | view     | postgres | permanent   |               | 0 bytes    | 
 public     | v_reddit_candidates_raw                 | view     | postgres | permanent   |               | 0 bytes    | 
 public     | v_reddit_candidates_today               | view     | postgres | permanent   |               | 0 bytes    | 
 public     | v_reddit_daily_signals                  | view     | postgres | permanent   |               | 0 bytes    | 
 public     | v_reddit_daily_signals_last_trading_day | view     | postgres | permanent   |               | 0 bytes    | 
 public     | v_reddit_mentions_all                   | view     | postgres | permanent   |               | 0 bytes    | 
 public     | v_reddit_mentions_aug                   | view     | postgres | permanent   |               | 0 bytes    | 
 public     | v_reddit_mentions_july                  | view     | postgres | permanent   |               | 0 bytes    | 
 public     | v_reddit_mentions_june                  | view     | postgres | permanent   |               | 0 bytes    | 
 public     | v_reddit_monitoring_signals             | view     | postgres | permanent   |               | 0 bytes    | 
 public     | v_scoring_posts                         | view     | postgres | permanent   |               | 0 bytes    | 
 public     | v_scoring_posts_union_src               | view     | postgres | permanent   |               | 0 bytes    | 
 public     | v_sentiment_history                     | view     | postgres | permanent   |               | 0 bytes    | 
 public     | v_sentiment_velocity_lite               | view     | postgres | permanent   |               | 0 bytes    | 
 public     | v_today_velocity_ranked                 | view     | postgres | permanent   |               | 0 bytes    | 
 public     | v_today_velocity_spikes                 | view     | postgres | permanent   |               | 0 bytes    | 
 public     | v_trade_mentions_primary                | view     | postgres | permanent   |               | 0 bytes    | 
 public     | v_trade_perf_by_author_tier             | view     | postgres | permanent   |               | 0 bytes    | 
 public     | v_trade_perf_by_subreddit               | view     | postgres | permanent   |               | 0 bytes    | 
 public     | v_triggered_with_backtest               | view     | postgres | permanent   |               | 0 bytes    | 
(98 rows)

