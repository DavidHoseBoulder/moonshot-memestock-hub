export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.4"
  }
  public: {
    Tables: {
      backtest_signals_daily: {
        Row: {
          avg_score: number
          avg_score_w: number
          created_at: string
          entry_date: string
          mentions: number
          min_mentions: number
          model_version: string
          pos_thresh: number
          ret_1d: number | null
          ret_3d: number | null
          ret_5d: number | null
          sent_date: string
          signal_score: number
          symbol: string
          use_weighted: boolean
          window_d0: string
          window_d1: string
        }
        Insert: {
          avg_score: number
          avg_score_w: number
          created_at?: string
          entry_date: string
          mentions: number
          min_mentions: number
          model_version: string
          pos_thresh: number
          ret_1d?: number | null
          ret_3d?: number | null
          ret_5d?: number | null
          sent_date: string
          signal_score: number
          symbol: string
          use_weighted: boolean
          window_d0: string
          window_d1: string
        }
        Update: {
          avg_score?: number
          avg_score_w?: number
          created_at?: string
          entry_date?: string
          mentions?: number
          min_mentions?: number
          model_version?: string
          pos_thresh?: number
          ret_1d?: number | null
          ret_3d?: number | null
          ret_5d?: number | null
          sent_date?: string
          signal_score?: number
          symbol?: string
          use_weighted?: boolean
          window_d0?: string
          window_d1?: string
        }
        Relationships: []
      }
      backtest_sweep_results: {
        Row: {
          avg_ret: number | null
          created_at: string
          end_date: string | null
          horizon: string
          median_ret: number | null
          min_mentions: number
          model_version: string
          pos_thresh: number
          sharpe: number | null
          side: string
          start_date: string | null
          stdev_ret: number | null
          symbol: string
          trades: number
          use_weighted: boolean
          win_rate: number | null
        }
        Insert: {
          avg_ret?: number | null
          created_at?: string
          end_date?: string | null
          horizon: string
          median_ret?: number | null
          min_mentions: number
          model_version: string
          pos_thresh: number
          sharpe?: number | null
          side: string
          start_date?: string | null
          stdev_ret?: number | null
          symbol: string
          trades: number
          use_weighted: boolean
          win_rate?: number | null
        }
        Update: {
          avg_ret?: number | null
          created_at?: string
          end_date?: string | null
          horizon?: string
          median_ret?: number | null
          min_mentions?: number
          model_version?: string
          pos_thresh?: number
          sharpe?: number | null
          side?: string
          start_date?: string | null
          stdev_ret?: number | null
          symbol?: string
          trades?: number
          use_weighted?: boolean
          win_rate?: number | null
        }
        Relationships: []
      }
      backtesting_results: {
        Row: {
          annualized_return: number | null
          created_at: string
          end_date: string
          holding_period_days: number | null
          id: string
          max_drawdown: number | null
          position_size: number | null
          sentiment_accuracy: number | null
          sentiment_correlation: number | null
          sentiment_threshold: number | null
          sharpe_ratio: number | null
          signal_quality: number | null
          start_date: string
          strategy_name: string
          symbol: string
          total_return: number | null
          trades_data: Json | null
          volatility: number | null
          win_rate: number | null
        }
        Insert: {
          annualized_return?: number | null
          created_at?: string
          end_date: string
          holding_period_days?: number | null
          id?: string
          max_drawdown?: number | null
          position_size?: number | null
          sentiment_accuracy?: number | null
          sentiment_correlation?: number | null
          sentiment_threshold?: number | null
          sharpe_ratio?: number | null
          signal_quality?: number | null
          start_date: string
          strategy_name: string
          symbol: string
          total_return?: number | null
          trades_data?: Json | null
          volatility?: number | null
          win_rate?: number | null
        }
        Update: {
          annualized_return?: number | null
          created_at?: string
          end_date?: string
          holding_period_days?: number | null
          id?: string
          max_drawdown?: number | null
          position_size?: number | null
          sentiment_accuracy?: number | null
          sentiment_correlation?: number | null
          sentiment_threshold?: number | null
          sharpe_ratio?: number | null
          signal_quality?: number | null
          start_date?: string
          strategy_name?: string
          symbol?: string
          total_return?: number | null
          trades_data?: Json | null
          volatility?: number | null
          win_rate?: number | null
        }
        Relationships: []
      }
      daily_trade_marks: {
        Row: {
          created_at: string
          entry_price: number
          exit_price: number | null
          fees_total: number
          mark_date: string
          mark_price: number | null
          mode: string
          qty: number
          realized_pnl: number | null
          status_on_mark: string
          symbol: string
          trade_id: string
          unrealized_pnl: number | null
        }
        Insert: {
          created_at?: string
          entry_price: number
          exit_price?: number | null
          fees_total?: number
          mark_date: string
          mark_price?: number | null
          mode: string
          qty?: number
          realized_pnl?: number | null
          status_on_mark: string
          symbol: string
          trade_id: string
          unrealized_pnl?: number | null
        }
        Update: {
          created_at?: string
          entry_price?: number
          exit_price?: number | null
          fees_total?: number
          mark_date?: string
          mark_price?: number | null
          mode?: string
          qty?: number
          realized_pnl?: number | null
          status_on_mark?: string
          symbol?: string
          trade_id?: string
          unrealized_pnl?: number | null
        }
        Relationships: []
      }
      enhanced_market_data: {
        Row: {
          created_at: string | null
          data_date: string
          id: string
          price: number | null
          price_change_1d: number | null
          price_change_5d: number | null
          price_close: number | null
          price_high: number | null
          price_low: number | null
          price_open: number | null
          symbol: string
          technical_indicators: Json | null
          timestamp: string
          updated_at: string | null
          volume: number | null
        }
        Insert: {
          created_at?: string | null
          data_date?: string
          id?: string
          price?: number | null
          price_change_1d?: number | null
          price_change_5d?: number | null
          price_close?: number | null
          price_high?: number | null
          price_low?: number | null
          price_open?: number | null
          symbol: string
          technical_indicators?: Json | null
          timestamp: string
          updated_at?: string | null
          volume?: number | null
        }
        Update: {
          created_at?: string | null
          data_date?: string
          id?: string
          price?: number | null
          price_change_1d?: number | null
          price_change_5d?: number | null
          price_close?: number | null
          price_high?: number | null
          price_low?: number | null
          price_open?: number | null
          symbol?: string
          technical_indicators?: Json | null
          timestamp?: string
          updated_at?: string | null
          volume?: number | null
        }
        Relationships: []
      }
      enhanced_sentiment_data: {
        Row: {
          confidence: number
          created_at: string | null
          current_sentiment: number
          id: string
          key_themes: string[] | null
          sentiment_velocity: Json | null
          social_signals: string[] | null
          symbol: string
          timestamp: string
          updated_at: string | null
        }
        Insert: {
          confidence: number
          created_at?: string | null
          current_sentiment: number
          id?: string
          key_themes?: string[] | null
          sentiment_velocity?: Json | null
          social_signals?: string[] | null
          symbol: string
          timestamp: string
          updated_at?: string | null
        }
        Update: {
          confidence?: number
          created_at?: string | null
          current_sentiment?: number
          id?: string
          key_themes?: string[] | null
          sentiment_velocity?: Json | null
          social_signals?: string[] | null
          symbol?: string
          timestamp?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      import_queue: {
        Row: {
          batch_size: number | null
          concurrency: number | null
          created_at: string
          error_message: string | null
          id: string
          jsonl_url: string
          max_items: number | null
          processed_at: string | null
          run_id: string
          start_line: number
          status: string | null
          subreddits: string[] | null
          symbols: string[] | null
        }
        Insert: {
          batch_size?: number | null
          concurrency?: number | null
          created_at?: string
          error_message?: string | null
          id?: string
          jsonl_url: string
          max_items?: number | null
          processed_at?: string | null
          run_id: string
          start_line?: number
          status?: string | null
          subreddits?: string[] | null
          symbols?: string[] | null
        }
        Update: {
          batch_size?: number | null
          concurrency?: number | null
          created_at?: string
          error_message?: string | null
          id?: string
          jsonl_url?: string
          max_items?: number | null
          processed_at?: string | null
          run_id?: string
          start_line?: number
          status?: string | null
          subreddits?: string[] | null
          symbols?: string[] | null
        }
        Relationships: []
      }
      import_runs: {
        Row: {
          analyzed_total: number | null
          batch_size: number | null
          created_at: string
          error: string | null
          file: string | null
          finished_at: string | null
          id: string
          inserted_total: number | null
          queued_total: number | null
          run_id: string
          scanned_total: number | null
          started_at: string
          status: string
          updated_at: string
        }
        Insert: {
          analyzed_total?: number | null
          batch_size?: number | null
          created_at?: string
          error?: string | null
          file?: string | null
          finished_at?: string | null
          id?: string
          inserted_total?: number | null
          queued_total?: number | null
          run_id: string
          scanned_total?: number | null
          started_at?: string
          status?: string
          updated_at?: string
        }
        Update: {
          analyzed_total?: number | null
          batch_size?: number | null
          created_at?: string
          error?: string | null
          file?: string | null
          finished_at?: string | null
          id?: string
          inserted_total?: number | null
          queued_total?: number | null
          run_id?: string
          scanned_total?: number | null
          started_at?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      live_sentiment_entry_rules: {
        Row: {
          avg_ret: number | null
          created_at: string
          end_date: string | null
          horizon: string
          is_enabled: boolean
          median_ret: number | null
          min_conf: number
          min_mentions: number
          model_version: string
          notes: string | null
          pos_thresh: number
          priority: number
          sharpe: number | null
          side: string
          start_date: string | null
          symbol: string
          trades: number | null
          use_weighted: boolean
          win_rate: number | null
        }
        Insert: {
          avg_ret?: number | null
          created_at?: string
          end_date?: string | null
          horizon: string
          is_enabled?: boolean
          median_ret?: number | null
          min_conf?: number
          min_mentions: number
          model_version: string
          notes?: string | null
          pos_thresh: number
          priority?: number
          sharpe?: number | null
          side?: string
          start_date?: string | null
          symbol: string
          trades?: number | null
          use_weighted: boolean
          win_rate?: number | null
        }
        Update: {
          avg_ret?: number | null
          created_at?: string
          end_date?: string | null
          horizon?: string
          is_enabled?: boolean
          median_ret?: number | null
          min_conf?: number
          min_mentions?: number
          model_version?: string
          notes?: string | null
          pos_thresh?: number
          priority?: number
          sharpe?: number | null
          side?: string
          start_date?: string | null
          symbol?: string
          trades?: number | null
          use_weighted?: boolean
          win_rate?: number | null
        }
        Relationships: []
      }
      live_sentiment_entry_rules_backup: {
        Row: {
          avg_ret: number | null
          created_at: string | null
          end_date: string | null
          horizon: string | null
          is_enabled: boolean | null
          median_ret: number | null
          min_conf: number | null
          min_mentions: number | null
          model_version: string | null
          notes: string | null
          pos_thresh: number | null
          priority: number | null
          sharpe: number | null
          side: string | null
          start_date: string | null
          symbol: string | null
          trades: number | null
          use_weighted: boolean | null
          win_rate: number | null
        }
        Insert: {
          avg_ret?: number | null
          created_at?: string | null
          end_date?: string | null
          horizon?: string | null
          is_enabled?: boolean | null
          median_ret?: number | null
          min_conf?: number | null
          min_mentions?: number | null
          model_version?: string | null
          notes?: string | null
          pos_thresh?: number | null
          priority?: number | null
          sharpe?: number | null
          side?: string | null
          start_date?: string | null
          symbol?: string | null
          trades?: number | null
          use_weighted?: boolean | null
          win_rate?: number | null
        }
        Update: {
          avg_ret?: number | null
          created_at?: string | null
          end_date?: string | null
          horizon?: string | null
          is_enabled?: boolean | null
          median_ret?: number | null
          min_conf?: number | null
          min_mentions?: number | null
          model_version?: string | null
          notes?: string | null
          pos_thresh?: number | null
          priority?: number | null
          sharpe?: number | null
          side?: string | null
          start_date?: string | null
          symbol?: string | null
          trades?: number | null
          use_weighted?: boolean | null
          win_rate?: number | null
        }
        Relationships: []
      }
      reddit_comments: {
        Row: {
          author: string | null
          body: string
          comment_id: string
          created_at: string
          created_utc: string
          depth: number | null
          is_submitter: boolean | null
          parent_id: string | null
          permalink: string | null
          post_id: string
          score: number | null
          subreddit: string
        }
        Insert: {
          author?: string | null
          body: string
          comment_id: string
          created_at?: string
          created_utc: string
          depth?: number | null
          is_submitter?: boolean | null
          parent_id?: string | null
          permalink?: string | null
          post_id: string
          score?: number | null
          subreddit: string
        }
        Update: {
          author?: string | null
          body?: string
          comment_id?: string
          created_at?: string
          created_utc?: string
          depth?: number | null
          is_submitter?: boolean | null
          parent_id?: string | null
          permalink?: string | null
          post_id?: string
          score?: number | null
          subreddit?: string
        }
        Relationships: []
      }
      reddit_comments_raw: {
        Row: {
          ingested_at: string
          src_line: string
        }
        Insert: {
          ingested_at?: string
          src_line: string
        }
        Update: {
          ingested_at?: string
          src_line?: string
        }
        Relationships: []
      }
      reddit_comments_stage: {
        Row: {
          line: string | null
        }
        Insert: {
          line?: string | null
        }
        Update: {
          line?: string | null
        }
        Relationships: []
      }
      reddit_finance_keep: {
        Row: {
          author: string | null
          created_at: string | null
          num_comments: number | null
          post_id: string | null
          score: number | null
          selftext: string | null
          subreddit: string | null
          title: string | null
        }
        Insert: {
          author?: string | null
          created_at?: string | null
          num_comments?: number | null
          post_id?: string | null
          score?: number | null
          selftext?: string | null
          subreddit?: string | null
          title?: string | null
        }
        Update: {
          author?: string | null
          created_at?: string | null
          num_comments?: number | null
          post_id?: string | null
          score?: number | null
          selftext?: string | null
          subreddit?: string | null
          title?: string | null
        }
        Relationships: []
      }
      reddit_finance_keep_norm: {
        Row: {
          created_utc: string | null
          id: string | null
          num_comments: number | null
          permalink: string | null
          post_id: string | null
          score: number | null
          selftext: string | null
          subreddit: string | null
          title: string | null
        }
        Insert: {
          created_utc?: string | null
          id?: string | null
          num_comments?: number | null
          permalink?: string | null
          post_id?: string | null
          score?: number | null
          selftext?: string | null
          subreddit?: string | null
          title?: string | null
        }
        Update: {
          created_utc?: string | null
          id?: string | null
          num_comments?: number | null
          permalink?: string | null
          post_id?: string | null
          score?: number | null
          selftext?: string | null
          subreddit?: string | null
          title?: string | null
        }
        Relationships: []
      }
      reddit_mentions: {
        Row: {
          content_len: number | null
          created_utc: string
          disambig_rule: string
          doc_id: string
          doc_type: string
          match_source: string
          mention_id: number
          post_id: string | null
          symbol: string
        }
        Insert: {
          content_len?: number | null
          created_utc: string
          disambig_rule: string
          doc_id: string
          doc_type?: string
          match_source: string
          mention_id?: number
          post_id?: string | null
          symbol: string
        }
        Update: {
          content_len?: number | null
          created_utc?: string
          disambig_rule?: string
          doc_id?: string
          doc_type?: string
          match_source?: string
          mention_id?: number
          post_id?: string | null
          symbol?: string
        }
        Relationships: [
          {
            foreignKeyName: "reddit_mentions_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "reddit_finance_keep_norm"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reddit_mentions_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "reddit_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reddit_mentions_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "v_post_attrs"
            referencedColumns: ["post_id"]
          },
        ]
      }
      reddit_posts_stage: {
        Row: {
          line: string | null
        }
        Insert: {
          line?: string | null
        }
        Update: {
          line?: string | null
        }
        Relationships: []
      }
      reddit_raw_aug: {
        Row: {
          doc: Json
          loaded_at: string
          src_file: string | null
          src_sub: string | null
        }
        Insert: {
          doc: Json
          loaded_at?: string
          src_file?: string | null
          src_sub?: string | null
        }
        Update: {
          doc?: Json
          loaded_at?: string
          src_file?: string | null
          src_sub?: string | null
        }
        Relationships: []
      }
      reddit_sentiment: {
        Row: {
          confidence: number | null
          doc_id: string | null
          doc_type: string | null
          label: string | null
          mention_id: number
          model: string | null
          model_version: string
          overall_score: number | null
          processed_at: string | null
          rationale: string | null
          score: number | null
        }
        Insert: {
          confidence?: number | null
          doc_id?: string | null
          doc_type?: string | null
          label?: string | null
          mention_id: number
          model?: string | null
          model_version: string
          overall_score?: number | null
          processed_at?: string | null
          rationale?: string | null
          score?: number | null
        }
        Update: {
          confidence?: number | null
          doc_id?: string | null
          doc_type?: string | null
          label?: string | null
          mention_id?: number
          model?: string | null
          model_version?: string
          overall_score?: number | null
          processed_at?: string | null
          rationale?: string | null
          score?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "reddit_sentiment_mention_id_fkey"
            columns: ["mention_id"]
            isOneToOne: false
            referencedRelation: "reddit_mentions"
            referencedColumns: ["mention_id"]
          },
          {
            foreignKeyName: "reddit_sentiment_mention_id_fkey"
            columns: ["mention_id"]
            isOneToOne: false
            referencedRelation: "v_reddit_mentions_all"
            referencedColumns: ["mention_id"]
          },
          {
            foreignKeyName: "reddit_sentiment_mention_id_fkey"
            columns: ["mention_id"]
            isOneToOne: false
            referencedRelation: "v_reddit_mentions_aug"
            referencedColumns: ["mention_id"]
          },
          {
            foreignKeyName: "reddit_sentiment_mention_id_fkey"
            columns: ["mention_id"]
            isOneToOne: false
            referencedRelation: "v_reddit_mentions_july"
            referencedColumns: ["mention_id"]
          },
          {
            foreignKeyName: "reddit_sentiment_mention_id_fkey"
            columns: ["mention_id"]
            isOneToOne: false
            referencedRelation: "v_reddit_mentions_june"
            referencedColumns: ["mention_id"]
          },
        ]
      }
      reddit_sentiment_daily: {
        Row: {
          avg_confidence: number | null
          avg_score: number | null
          day: string
          mentions: number
          neg: number
          neu: number
          pos: number
          symbol: string
        }
        Insert: {
          avg_confidence?: number | null
          avg_score?: number | null
          day: string
          mentions: number
          neg: number
          neu: number
          pos: number
          symbol: string
        }
        Update: {
          avg_confidence?: number | null
          avg_score?: number | null
          day?: string
          mentions?: number
          neg?: number
          neu?: number
          pos?: number
          symbol?: string
        }
        Relationships: []
      }
      sentiment_analysis: {
        Row: {
          author: string | null
          confidence_score: number | null
          content: string | null
          created_at: string
          id: string
          investment_signals: string[] | null
          key_themes: string[] | null
          num_comments: number
          overall_sentiment: number | null
          post_created_at: string
          post_id: string
          score: number
          sentiment_label: string | null
          subreddit: string
          symbols_mentioned: string[] | null
          title: string
        }
        Insert: {
          author?: string | null
          confidence_score?: number | null
          content?: string | null
          created_at?: string
          id?: string
          investment_signals?: string[] | null
          key_themes?: string[] | null
          num_comments?: number
          overall_sentiment?: number | null
          post_created_at: string
          post_id: string
          score?: number
          sentiment_label?: string | null
          subreddit: string
          symbols_mentioned?: string[] | null
          title: string
        }
        Update: {
          author?: string | null
          confidence_score?: number | null
          content?: string | null
          created_at?: string
          id?: string
          investment_signals?: string[] | null
          key_themes?: string[] | null
          num_comments?: number
          overall_sentiment?: number | null
          post_created_at?: string
          post_id?: string
          score?: number
          sentiment_label?: string | null
          subreddit?: string
          symbols_mentioned?: string[] | null
          title?: string
        }
        Relationships: []
      }
      sentiment_grade_config: {
        Row: {
          horizon: string
          model_version: string
          moderate_sharpe: number
          moderate_trades: number
          require_pos_avg: boolean
          side: string
          strong_sharpe: number
          strong_trades: number
          updated_at: string
        }
        Insert: {
          horizon: string
          model_version: string
          moderate_sharpe?: number
          moderate_trades?: number
          require_pos_avg?: boolean
          side: string
          strong_sharpe?: number
          strong_trades?: number
          updated_at?: string
        }
        Update: {
          horizon?: string
          model_version?: string
          moderate_sharpe?: number
          moderate_trades?: number
          require_pos_avg?: boolean
          side?: string
          strong_sharpe?: number
          strong_trades?: number
          updated_at?: string
        }
        Relationships: []
      }
      sentiment_history: {
        Row: {
          collected_at: string
          confidence_score: number | null
          content_snippet: string | null
          created_at: string
          data_timestamp: string
          engagement_score: number | null
          id: string
          metadata: Json | null
          raw_sentiment: number | null
          sentiment_score: number | null
          source: string
          source_id: string | null
          symbol: string
          updated_at: string
          volume_indicator: number | null
        }
        Insert: {
          collected_at?: string
          confidence_score?: number | null
          content_snippet?: string | null
          created_at?: string
          data_timestamp: string
          engagement_score?: number | null
          id?: string
          metadata?: Json | null
          raw_sentiment?: number | null
          sentiment_score?: number | null
          source: string
          source_id?: string | null
          symbol: string
          updated_at?: string
          volume_indicator?: number | null
        }
        Update: {
          collected_at?: string
          confidence_score?: number | null
          content_snippet?: string | null
          created_at?: string
          data_timestamp?: string
          engagement_score?: number | null
          id?: string
          metadata?: Json | null
          raw_sentiment?: number | null
          sentiment_score?: number | null
          source?: string
          source_id?: string | null
          symbol?: string
          updated_at?: string
          volume_indicator?: number | null
        }
        Relationships: []
      }
      stage_lines_persist: {
        Row: {
          line: string | null
        }
        Insert: {
          line?: string | null
        }
        Update: {
          line?: string | null
        }
        Relationships: []
      }
      staging_reddit_comments: {
        Row: {
          author: string | null
          body: string | null
          comment_id: string
          created_at: string
          link_id: string | null
          parent_id: string | null
          score: number | null
          subreddit: string
        }
        Insert: {
          author?: string | null
          body?: string | null
          comment_id: string
          created_at: string
          link_id?: string | null
          parent_id?: string | null
          score?: number | null
          subreddit: string
        }
        Update: {
          author?: string | null
          body?: string | null
          comment_id?: string
          created_at?: string
          link_id?: string | null
          parent_id?: string | null
          score?: number | null
          subreddit?: string
        }
        Relationships: []
      }
      staging_reddit_jsonl: {
        Row: {
          raw: string
        }
        Insert: {
          raw: string
        }
        Update: {
          raw?: string
        }
        Relationships: []
      }
      staging_reddit_submissions: {
        Row: {
          created_utc: string
          id: string
          selftext: string | null
          subreddit: string | null
          title: string | null
        }
        Insert: {
          created_utc: string
          id: string
          selftext?: string | null
          subreddit?: string | null
          title?: string | null
        }
        Update: {
          created_utc?: string
          id?: string
          selftext?: string | null
          subreddit?: string | null
          title?: string | null
        }
        Relationships: []
      }
      staging_reddit_submissions_buf: {
        Row: {
          author: string | null
          created_at: string
          num_comments: number | null
          post_id: string
          score: number | null
          selftext: string | null
          subreddit: string
          title: string
        }
        Insert: {
          author?: string | null
          created_at: string
          num_comments?: number | null
          post_id: string
          score?: number | null
          selftext?: string | null
          subreddit: string
          title: string
        }
        Update: {
          author?: string | null
          created_at?: string
          num_comments?: number | null
          post_id?: string
          score?: number | null
          selftext?: string | null
          subreddit?: string
          title?: string
        }
        Relationships: []
      }
      staging_reddit_submissions_slim: {
        Row: {
          author: string | null
          created_at: string | null
          num_comments: number | null
          post_id: string | null
          score: number | null
          selftext: string | null
          subreddit: string | null
          title: string | null
        }
        Insert: {
          author?: string | null
          created_at?: string | null
          num_comments?: number | null
          post_id?: string | null
          score?: number | null
          selftext?: string | null
          subreddit?: string | null
          title?: string | null
        }
        Update: {
          author?: string | null
          created_at?: string | null
          num_comments?: number | null
          post_id?: string | null
          score?: number | null
          selftext?: string | null
          subreddit?: string | null
          title?: string | null
        }
        Relationships: []
      }
      subreddit_universe: {
        Row: {
          active: boolean
          category: string
          created_at: string
          description: string | null
          id: string
          name: string
          priority: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          category: string
          created_at?: string
          description?: string | null
          id?: string
          name: string
          priority?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          category?: string
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          priority?: number
          updated_at?: string
        }
        Relationships: []
      }
      symbol_disambig: {
        Row: {
          cashtag_only: boolean
          keywords: string[]
          symbol: string
        }
        Insert: {
          cashtag_only?: boolean
          keywords: string[]
          symbol: string
        }
        Update: {
          cashtag_only?: boolean
          keywords?: string[]
          symbol?: string
        }
        Relationships: []
      }
      ticker_universe: {
        Row: {
          active: boolean
          created_at: string
          name: string | null
          priority: number
          sector: string | null
          symbol: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          name?: string | null
          priority?: number
          sector?: string | null
          symbol: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          name?: string | null
          priority?: number
          sector?: string | null
          symbol?: string
          updated_at?: string
        }
        Relationships: []
      }
      trades: {
        Row: {
          audit: Json | null
          created_at: string
          entry_price: number
          entry_ts: string
          exit_price: number | null
          exit_ts: string | null
          fees_total: number
          horizon: string
          mode: string
          notes: string | null
          opened_by: string | null
          qty: number
          side: string
          source: string | null
          status: string
          symbol: string
          trade_date: string
          trade_id: string
        }
        Insert: {
          audit?: Json | null
          created_at?: string
          entry_price: number
          entry_ts?: string
          exit_price?: number | null
          exit_ts?: string | null
          fees_total?: number
          horizon: string
          mode: string
          notes?: string | null
          opened_by?: string | null
          qty?: number
          side: string
          source?: string | null
          status?: string
          symbol: string
          trade_date: string
          trade_id?: string
        }
        Update: {
          audit?: Json | null
          created_at?: string
          entry_price?: number
          entry_ts?: string
          exit_price?: number | null
          exit_ts?: string | null
          fees_total?: number
          horizon?: string
          mode?: string
          notes?: string | null
          opened_by?: string | null
          qty?: number
          side?: string
          source?: string | null
          status?: string
          symbol?: string
          trade_date?: string
          trade_id?: string
        }
        Relationships: []
      }
      trading_signals: {
        Row: {
          actual_return: number | null
          category: string
          confidence: number
          created_at: string | null
          data_sources_used: string[] | null
          days_held: number | null
          entry_price: number | null
          exit_price: number | null
          id: string
          outcome: string | null
          pipeline_run_id: string | null
          price: number
          reasoning: string | null
          rsi: number | null
          sentiment_score: number | null
          sentiment_velocity: number | null
          signal_type: string
          technical_signals: string[] | null
          ticker: string
          updated_at: string | null
          volume_ratio: number | null
        }
        Insert: {
          actual_return?: number | null
          category: string
          confidence: number
          created_at?: string | null
          data_sources_used?: string[] | null
          days_held?: number | null
          entry_price?: number | null
          exit_price?: number | null
          id?: string
          outcome?: string | null
          pipeline_run_id?: string | null
          price: number
          reasoning?: string | null
          rsi?: number | null
          sentiment_score?: number | null
          sentiment_velocity?: number | null
          signal_type: string
          technical_signals?: string[] | null
          ticker: string
          updated_at?: string | null
          volume_ratio?: number | null
        }
        Update: {
          actual_return?: number | null
          category?: string
          confidence?: number
          created_at?: string | null
          data_sources_used?: string[] | null
          days_held?: number | null
          entry_price?: number | null
          exit_price?: number | null
          id?: string
          outcome?: string | null
          pipeline_run_id?: string | null
          price?: number
          reasoning?: string | null
          rsi?: number | null
          sentiment_score?: number | null
          sentiment_velocity?: number | null
          signal_type?: string
          technical_signals?: string[] | null
          ticker?: string
          updated_at?: string | null
          volume_ratio?: number | null
        }
        Relationships: []
      }
      triggered_candidates: {
        Row: {
          horizon: string
          mentions: number
          min_mentions: number
          model_version: string
          pos_thresh: number
          score: number
          side: string
          symbol: string
          triggered_at: string
        }
        Insert: {
          horizon: string
          mentions: number
          min_mentions: number
          model_version: string
          pos_thresh: number
          score: number
          side: string
          symbol: string
          triggered_at?: string
        }
        Update: {
          horizon?: string
          mentions?: number
          min_mentions?: number
          model_version?: string
          pos_thresh?: number
          score?: number
          side?: string
          symbol?: string
          triggered_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      prices_daily: {
        Row: {
          close: number | null
          d: string | null
          symbol: string | null
          volume: number | null
        }
        Relationships: []
      }
      reddit_comments_clean: {
        Row: {
          author: string | null
          body: string | null
          comment_id: string | null
          created_utc: string | null
          depth: number | null
          is_submitter: boolean | null
          parent_id: string | null
          permalink: string | null
          post_id: string | null
          score: number | null
          subreddit: string | null
        }
        Relationships: []
      }
      reddit_daily_sentiment_v1: {
        Row: {
          avg_confidence: number | null
          avg_score: number | null
          day: string | null
          doc_type: string | null
          label: string | null
          n_mentions: number | null
          n_scored: number | null
          symbol: string | null
        }
        Relationships: []
      }
      reddit_mentions_all: {
        Row: {
          body_text: string | null
          content_len: number | null
          created_utc: string | null
          doc_id: string | null
          doc_type: string | null
          post_id: string | null
          subreddit: string | null
          title: string | null
        }
        Relationships: []
      }
      reddit_posts: {
        Row: {
          created_utc: string | null
          id: string | null
          num_comments: number | null
          permalink: string | null
          score: number | null
          selftext: string | null
          subreddit: string | null
          title: string | null
        }
        Insert: {
          created_utc?: string | null
          id?: string | null
          num_comments?: number | null
          permalink?: string | null
          score?: number | null
          selftext?: string | null
          subreddit?: string | null
          title?: string | null
        }
        Update: {
          created_utc?: string | null
          id?: string | null
          num_comments?: number | null
          permalink?: string | null
          score?: number | null
          selftext?: string | null
          subreddit?: string | null
          title?: string | null
        }
        Relationships: []
      }
      reddit_posts_std: {
        Row: {
          created_utc: string | null
          num_comments: number | null
          permalink: string | null
          post_id: string | null
          score: number | null
          selftext: string | null
          subreddit: string | null
          title: string | null
        }
        Insert: {
          created_utc?: string | null
          num_comments?: number | null
          permalink?: string | null
          post_id?: never
          score?: number | null
          selftext?: string | null
          subreddit?: string | null
          title?: string | null
        }
        Update: {
          created_utc?: string | null
          num_comments?: number | null
          permalink?: string | null
          post_id?: never
          score?: number | null
          selftext?: string | null
          subreddit?: string | null
          title?: string | null
        }
        Relationships: []
      }
      tmp_symbol_disambig: {
        Row: {
          exclude_keywords: string[] | null
          keywords: string[] | null
          symbol: string | null
        }
        Relationships: []
      }
      v_backtest_summary: {
        Row: {
          avg_ret: number | null
          composite_score: number | null
          horizon: string | null
          median_ret: number | null
          sharpe: number | null
          symbol: string | null
          trades: number | null
          win_rate: number | null
        }
        Relationships: []
      }
      v_daily_pnl_by_symbol: {
        Row: {
          mark_date: string | null
          mode: string | null
          n_closed: number | null
          n_open: number | null
          realized_pnl: number | null
          symbol: string | null
          total_pnl: number | null
          unrealized_pnl: number | null
        }
        Relationships: []
      }
      v_daily_pnl_rollups: {
        Row: {
          mark_date: string | null
          mode: string | null
          n_closed: number | null
          n_open: number | null
          realized_pnl: number | null
          total_pnl: number | null
          unrealized_pnl: number | null
        }
        Relationships: []
      }
      v_home_kpis: {
        Row: {
          avg_realized_pct: number | null
          candidates_as_of_date: string | null
          closed_30d: number | null
          exposure_usd: number | null
          header_as_of_date: string | null
          hit_rate: number | null
          kpi_as_of_date: string | null
          mode: string | null
          open_positions: number | null
          realized_30d_usd: number | null
          signals_as_of_date: string | null
          unrealized_pct: number | null
          unrealized_usd: number | null
        }
        Relationships: []
      }
      v_import_runs_daily_summary: {
        Row: {
          analyzed_total: number | null
          build_date: string | null
          error: string | null
          file: string | null
          finished_at: string | null
          inserted_total: number | null
          queued_total: number | null
          run_id: string | null
          scanned_total: number | null
          started_at: string | null
          status: string | null
        }
        Relationships: []
      }
      v_import_runs_latest: {
        Row: {
          analyzed_total: number | null
          batch_size: number | null
          build_date: string | null
          error: string | null
          file: string | null
          finished_at: string | null
          inserted_total: number | null
          queued_total: number | null
          run_id: string | null
          scanned_total: number | null
          started_at: string | null
          status: string | null
        }
        Relationships: []
      }
      v_latest_reddit_trade_date: {
        Row: {
          data_date: string | null
        }
        Relationships: []
      }
      v_live_sentiment_rules: {
        Row: {
          avg_ret: number | null
          end_date: string | null
          horizon: string | null
          median_ret: number | null
          min_mentions: number | null
          model_version: string | null
          pos_thresh: number | null
          sharpe: number | null
          side: string | null
          start_date: string | null
          symbol: string | null
          trades: number | null
          use_weighted: boolean | null
          win_rate: number | null
        }
        Relationships: []
      }
      v_live_sentiment_signals: {
        Row: {
          avg_score: number | null
          d: string | null
          horizon: string | null
          min_mentions: number | null
          model_version: string | null
          n_mentions: number | null
          pos_thresh: number | null
          side: string | null
          sig_score: number | null
          symbol: string | null
          triggered: boolean | null
          use_weighted: boolean | null
          wt_score: number | null
        }
        Relationships: []
      }
      v_post_attrs: {
        Row: {
          permalink: string | null
          post_id: string | null
          selftext: string | null
          subreddit: string | null
          title: string | null
        }
        Insert: {
          permalink?: string | null
          post_id?: string | null
          selftext?: string | null
          subreddit?: string | null
          title?: string | null
        }
        Update: {
          permalink?: string | null
          post_id?: string | null
          selftext?: string | null
          subreddit?: string | null
          title?: string | null
        }
        Relationships: []
      }
      v_recommended_trades_today: {
        Row: {
          avg_ret: number | null
          confidence_label: string | null
          confidence_score: number | null
          end_date: string | null
          grade: string | null
          grade_explain: string | null
          has_open_any: boolean | null
          has_open_paper: boolean | null
          has_open_real: boolean | null
          horizon: string | null
          mentions: number | null
          min_mentions: number | null
          rule_threshold: number | null
          score: number | null
          sharpe: number | null
          side: string | null
          start_date: string | null
          symbol: string | null
          trades: number | null
          triggered_at: string | null
          win_rate: number | null
        }
        Relationships: []
      }
      v_recommended_trades_today_conf: {
        Row: {
          avg_ret: number | null
          confidence_label: string | null
          confidence_score: number | null
          end_date: string | null
          grade: string | null
          grade_explain: string | null
          has_open_any: boolean | null
          has_open_paper: boolean | null
          has_open_real: boolean | null
          horizon: string | null
          mentions: number | null
          min_mentions: number | null
          rule_threshold: number | null
          score: number | null
          sharpe: number | null
          side: string | null
          start_date: string | null
          symbol: string | null
          trades: number | null
          triggered_at: string | null
          win_rate: number | null
        }
        Relationships: []
      }
      v_reddit_backtest_lookup: {
        Row: {
          avg_ret: number | null
          composite_score: number | null
          hit_rate: number | null
          horizon: string | null
          median_ret: number | null
          min_mentions: number | null
          pos_thresh: number | null
          sharpe: number | null
          side: string | null
          symbol: string | null
          trades: number | null
          use_weighted: boolean | null
        }
        Relationships: []
      }
      v_reddit_candidates_last_trading_day: {
        Row: {
          avg_confidence: number | null
          horizon: string | null
          min_conf: number | null
          min_mentions: number | null
          model_version: string | null
          n_mentions: number | null
          pos_thresh: number | null
          side: string | null
          symbol: string | null
          trade_date: string | null
          triggered: boolean | null
          use_weighted: boolean | null
          used_score: number | null
        }
        Relationships: []
      }
      v_reddit_candidates_raw: {
        Row: {
          avg_confidence: number | null
          horizon: string | null
          min_conf: number | null
          min_mentions: number | null
          model_version: string | null
          n_mentions: number | null
          pos_thresh: number | null
          side: string | null
          symbol: string | null
          trade_date: string | null
          triggered: boolean | null
          use_weighted: boolean | null
          used_score: number | null
        }
        Relationships: []
      }
      v_reddit_candidates_today: {
        Row: {
          avg_ret: number | null
          avg_ret_display: number | null
          end_date: string | null
          entry_date: string | null
          exit_date: string | null
          grade: string | null
          grade_explain: string | null
          hold_days: number | null
          horizon: string | null
          is_enabled: boolean | null
          mentions: number | null
          min_mentions: number | null
          model_version: string | null
          moderate_sharpe: number | null
          moderate_trades: number | null
          priority: number | null
          rule_threshold: number | null
          score: number | null
          sharpe: number | null
          sharpe_display: number | null
          side: string | null
          start_date: string | null
          strong_sharpe: number | null
          strong_trades: number | null
          symbol: string | null
          trades: number | null
          triggered_at: string | null
          use_weighted: boolean | null
          win_rate: number | null
          win_rate_display: number | null
        }
        Relationships: []
      }
      v_reddit_daily_signals: {
        Row: {
          avg_score: number | null
          n_mentions: number | null
          symbol: string | null
          trade_date: string | null
          used_score: number | null
        }
        Relationships: []
      }
      v_reddit_daily_signals_last_trading_day: {
        Row: {
          avg_score: number | null
          n_mentions: number | null
          reference_date: string | null
          symbol: string | null
          trade_date: string | null
          used_score: number | null
        }
        Relationships: []
      }
      v_reddit_mentions_all: {
        Row: {
          content_len: number | null
          created_utc: string | null
          disambig_rule: string | null
          match_source: string | null
          mention_id: number | null
          permalink: string | null
          post_id: string | null
          selftext: string | null
          subreddit: string | null
          symbol: string | null
          title: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reddit_mentions_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "reddit_finance_keep_norm"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reddit_mentions_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "reddit_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reddit_mentions_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "v_post_attrs"
            referencedColumns: ["post_id"]
          },
        ]
      }
      v_reddit_mentions_aug: {
        Row: {
          content_len: number | null
          created_utc: string | null
          disambig_rule: string | null
          match_source: string | null
          mention_id: number | null
          permalink: string | null
          post_id: string | null
          selftext: string | null
          subreddit: string | null
          symbol: string | null
          title: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reddit_mentions_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "reddit_finance_keep_norm"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reddit_mentions_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "reddit_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reddit_mentions_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "v_post_attrs"
            referencedColumns: ["post_id"]
          },
        ]
      }
      v_reddit_mentions_july: {
        Row: {
          content_len: number | null
          created_utc: string | null
          disambig_rule: string | null
          match_source: string | null
          mention_id: number | null
          permalink: string | null
          post_id: string | null
          selftext: string | null
          subreddit: string | null
          symbol: string | null
          title: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reddit_mentions_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "reddit_finance_keep_norm"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reddit_mentions_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "reddit_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reddit_mentions_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "v_post_attrs"
            referencedColumns: ["post_id"]
          },
        ]
      }
      v_reddit_mentions_june: {
        Row: {
          content_len: number | null
          created_utc: string | null
          disambig_rule: string | null
          match_source: string | null
          mention_id: number | null
          permalink: string | null
          post_id: string | null
          selftext: string | null
          subreddit: string | null
          symbol: string | null
          title: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reddit_mentions_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "reddit_finance_keep_norm"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reddit_mentions_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "reddit_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reddit_mentions_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "v_post_attrs"
            referencedColumns: ["post_id"]
          },
        ]
      }
      v_reddit_monitoring_signals: {
        Row: {
          avg_score: number | null
          n_mentions: number | null
          sentiment: string | null
          sig_score: number | null
          symbol: string | null
          trade_date: string | null
          used_score: number | null
        }
        Relationships: []
      }
      v_scoring_posts: {
        Row: {
          created_utc: string | null
          permalink: string | null
          post_id: string | null
          selftext: string | null
          subreddit: string | null
          title: string | null
        }
        Relationships: []
      }
      v_scoring_posts_union_src: {
        Row: {
          created_utc: string | null
          permalink: string | null
          post_id: string | null
          selftext: string | null
          subreddit: string | null
          title: string | null
        }
        Relationships: []
      }
      v_sentiment_history: {
        Row: {
          avg_score: number | null
          data_date: string | null
          n_mentions: number | null
          symbol: string | null
          used_score: number | null
        }
        Relationships: []
      }
      v_sentiment_velocity_lite: {
        Row: {
          avg_score: number | null
          data_date: string | null
          delta_mentions: number | null
          delta_score: number | null
          n_mentions: number | null
          symbol: string | null
          trailing_avg_mentions: number | null
          trailing_avg_score: number | null
          trailing_stddev_score: number | null
          used_score: number | null
          z_score_score: number | null
        }
        Relationships: []
      }
      v_today_velocity_ranked: {
        Row: {
          avg_score: number | null
          data_date: string | null
          delta_mentions: number | null
          delta_score: number | null
          n_mentions: number | null
          rank: number | null
          symbol: string | null
          trailing_avg_mentions: number | null
          trailing_avg_score: number | null
          trailing_stddev_score: number | null
          used_score: number | null
          z_score_score: number | null
        }
        Relationships: []
      }
      v_today_velocity_spikes: {
        Row: {
          avg_score: number | null
          data_date: string | null
          delta_mentions: number | null
          delta_score: number | null
          n_mentions: number | null
          symbol: string | null
          trailing_avg_mentions: number | null
          trailing_avg_score: number | null
          trailing_stddev_score: number | null
          used_score: number | null
          z_score_score: number | null
        }
        Relationships: []
      }
      v_triggered_with_backtest: {
        Row: {
          avg_ret: number | null
          end_date: string | null
          grade: string | null
          grade_explain: string | null
          horizon: string | null
          is_enabled: boolean | null
          mentions: number | null
          min_mentions: number | null
          model_version: string | null
          moderate_sharpe: number | null
          moderate_trades: number | null
          notes: string | null
          priority: number | null
          require_pos_avg: boolean | null
          rule_threshold: number | null
          score: number | null
          sharpe: number | null
          side: string | null
          start_date: string | null
          strong_sharpe: number | null
          strong_trades: number | null
          symbol: string | null
          trades: number | null
          triggered_at: string | null
          use_weighted: boolean | null
          win_rate: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      __parse_json_or_raise: {
        Args: { p_line: string; p_rn: number }
        Returns: Json
      }
      backfill_reddit_mentions: {
        Args: { p_end: string; p_start: string }
        Returns: undefined
      }
      build_keywords_from_name: {
        Args: { p_name: string; p_symbol: string }
        Returns: string[]
      }
      extract_symbols_from_text: {
        Args: { s: string }
        Returns: string[]
      }
      fetch_mentions_batch: {
        Args: { p_limit?: number; p_model: string }
        Returns: {
          created_utc: string
          mention_id: number
          permalink: string
          post_id: string
          selftext: string
          subreddit: string
          symbol: string
          title: string
        }[]
      }
      from_epochish: {
        Args: { txt: string }
        Returns: string
      }
      get_active_subreddits_by_priority: {
        Args: { max_priority?: number }
        Returns: {
          category: string
          name: string
          priority: number
        }[]
      }
      is_market_data_fresh: {
        Args: { hours_threshold?: number; symbol_param: string }
        Returns: boolean
      }
      json_try: {
        Args: { txt: string }
        Returns: Json
      }
      try_parse_jsonb: {
        Args: { txt: string }
        Returns: Json
      }
      upsert_daily_marks: {
        Args: { p_mark_date: string }
        Returns: undefined
      }
      upsert_reddit_sentiment: {
        Args: {
          p_confidence: number
          p_label: string
          p_mention_id: number
          p_model: string
          p_rationale: string
          p_score: number
        }
        Returns: undefined
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
