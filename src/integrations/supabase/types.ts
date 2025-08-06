export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instanciate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.4"
  }
  public: {
    Tables: {
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
      market_data: {
        Row: {
          asset_type: string
          created_at: string
          id: string
          market_cap: number | null
          price: number
          source: string | null
          symbol: string
          timestamp: string
          volume: number | null
        }
        Insert: {
          asset_type: string
          created_at?: string
          id?: string
          market_cap?: number | null
          price: number
          source?: string | null
          symbol: string
          timestamp: string
          volume?: number | null
        }
        Update: {
          asset_type?: string
          created_at?: string
          id?: string
          market_cap?: number | null
          price?: number
          source?: string | null
          symbol?: string
          timestamp?: string
          volume?: number | null
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
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
