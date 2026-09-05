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
    PostgrestVersion: "14.5"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      follows: {
        Row: {
          created_at: string
          follower_id: string
          following_id: string
        }
        Insert: {
          created_at?: string
          follower_id: string
          following_id: string
        }
        Update: {
          created_at?: string
          follower_id?: string
          following_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "follows_follower_id_fkey"
            columns: ["follower_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "follows_following_id_fkey"
            columns: ["following_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      indexer_state: {
        Row: {
          indexer_name: string
          last_processed_block: number
          updated_at: string
        }
        Insert: {
          indexer_name: string
          last_processed_block: number
          updated_at?: string
        }
        Update: {
          indexer_name?: string
          last_processed_block?: number
          updated_at?: string
        }
        Relationships: []
      }
      likes: {
        Row: {
          created_at: string
          post_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          post_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          post_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "likes_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "likes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          actor_id: string
          created_at: string
          id: string
          post_id: string | null
          read_at: string | null
          recipient_id: string
          type: string
        }
        Insert: {
          actor_id: string
          created_at?: string
          id?: string
          post_id?: string | null
          read_at?: string | null
          recipient_id: string
          type: string
        }
        Update: {
          actor_id?: string
          created_at?: string
          id?: string
          post_id?: string | null
          read_at?: string | null
          recipient_id?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      pons_curve_events: {
        Row: {
          account_address: string | null
          block_number: number
          block_timestamp: string
          curve_address: string
          event_type: string
          log_index: number
          quote_amount: string
          token_address: string
          token_amount: string
          tx_hash: string
        }
        Insert: {
          account_address?: string | null
          block_number: number
          block_timestamp: string
          curve_address: string
          event_type: string
          log_index: number
          quote_amount?: string
          token_address: string
          token_amount?: string
          tx_hash: string
        }
        Update: {
          account_address?: string | null
          block_number?: number
          block_timestamp?: string
          curve_address?: string
          event_type?: string
          log_index?: number
          quote_amount?: string
          token_address?: string
          token_amount?: string
          tx_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "pons_curve_events_token_address_fkey"
            columns: ["token_address"]
            isOneToOne: false
            referencedRelation: "pons_launches"
            referencedColumns: ["token_address"]
          },
        ]
      }
      pons_launches: {
        Row: {
          created_at: string
          creator_profile_id: string | null
          curve_address: string
          deployer_address: string
          graduated_block: number | null
          graduation_threshold: string
          indexed_at: string
          is_ponside_launch: boolean
          last_synced_block: number | null
          launch_block: number
          launch_config_id: string
          launch_timestamp: string
          launch_tx_hash: string
          pair_token: string
          pair_token_decimals: number | null
          pair_token_symbol: string | null
          phase: number
          swept_block: number | null
          token_address: string
          token_decimals: number | null
          token_description: string | null
          token_logo_url: string | null
          token_name: string | null
          token_symbol: string | null
          total_supply: string | null
        }
        Insert: {
          created_at?: string
          creator_profile_id?: string | null
          curve_address: string
          deployer_address: string
          graduated_block?: number | null
          graduation_threshold: string
          indexed_at?: string
          is_ponside_launch?: boolean
          last_synced_block?: number | null
          launch_block: number
          launch_config_id: string
          launch_timestamp: string
          launch_tx_hash: string
          pair_token: string
          pair_token_decimals?: number | null
          pair_token_symbol?: string | null
          phase?: number
          swept_block?: number | null
          token_address: string
          token_decimals?: number | null
          token_description?: string | null
          token_logo_url?: string | null
          token_name?: string | null
          token_symbol?: string | null
          total_supply?: string | null
        }
        Update: {
          created_at?: string
          creator_profile_id?: string | null
          curve_address?: string
          deployer_address?: string
          graduated_block?: number | null
          graduation_threshold?: string
          indexed_at?: string
          is_ponside_launch?: boolean
          last_synced_block?: number | null
          launch_block?: number
          launch_config_id?: string
          launch_timestamp?: string
          launch_tx_hash?: string
          pair_token?: string
          pair_token_decimals?: number | null
          pair_token_symbol?: string | null
          phase?: number
          swept_block?: number | null
          token_address?: string
          token_decimals?: number | null
          token_description?: string | null
          token_logo_url?: string | null
          token_name?: string | null
          token_symbol?: string | null
          total_supply?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pons_launches_creator_profile_id_fkey"
            columns: ["creator_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      pons_market_snapshots: {
        Row: {
          created_at: string
          graduation_progress_bps: number | null
          latest_buy_at: string | null
          latest_buy_block: number | null
          market_cap_usd_e18: string
          observed_at: string
          price_usd_e18: string | null
          source: string
          token_address: string
        }
        Insert: {
          created_at?: string
          graduation_progress_bps?: number | null
          latest_buy_at?: string | null
          latest_buy_block?: number | null
          market_cap_usd_e18: string
          observed_at: string
          price_usd_e18?: string | null
          source?: string
          token_address: string
        }
        Update: {
          created_at?: string
          graduation_progress_bps?: number | null
          latest_buy_at?: string | null
          latest_buy_block?: number | null
          market_cap_usd_e18?: string
          observed_at?: string
          price_usd_e18?: string | null
          source?: string
          token_address?: string
        }
        Relationships: [
          {
            foreignKeyName: "pons_market_snapshots_token_address_fkey"
            columns: ["token_address"]
            isOneToOne: false
            referencedRelation: "pons_launches"
            referencedColumns: ["token_address"]
          },
        ]
      }
      pons_trades: {
        Row: {
          block_number: number
          block_timestamp: string
          created_at: string
          creator_tax_amount: string
          curve_address: string
          fee_amount: string
          log_index: number
          quote_amount: string
          recipient_address: string
          side: string
          token_address: string
          token_amount: string
          trader_address: string
          tx_hash: string
        }
        Insert: {
          block_number: number
          block_timestamp: string
          created_at?: string
          creator_tax_amount: string
          curve_address: string
          fee_amount: string
          log_index: number
          quote_amount: string
          recipient_address: string
          side: string
          token_address: string
          token_amount: string
          trader_address: string
          tx_hash: string
        }
        Update: {
          block_number?: number
          block_timestamp?: string
          created_at?: string
          creator_tax_amount?: string
          curve_address?: string
          fee_amount?: string
          log_index?: number
          quote_amount?: string
          recipient_address?: string
          side?: string
          token_address?: string
          token_amount?: string
          trader_address?: string
          tx_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "pons_trades_token_address_fkey"
            columns: ["token_address"]
            isOneToOne: false
            referencedRelation: "pons_launches"
            referencedColumns: ["token_address"]
          },
        ]
      }
      post_media: {
        Row: {
          created_at: string
          id: string
          media_type: string
          media_url: string
          post_id: string
          sort_order: number
          storage_path: string
        }
        Insert: {
          created_at?: string
          id?: string
          media_type: string
          media_url: string
          post_id: string
          sort_order?: number
          storage_path: string
        }
        Update: {
          created_at?: string
          id?: string
          media_type?: string
          media_url?: string
          post_id?: string
          sort_order?: number
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_media_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      posts: {
        Row: {
          author_id: string
          content: string
          created_at: string
          deleted_at: string | null
          id: string
          launch_tx_hash: string | null
          reply_to_post_id: string | null
          token_address: string | null
          updated_at: string
        }
        Insert: {
          author_id: string
          content?: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          launch_tx_hash?: string | null
          reply_to_post_id?: string | null
          token_address?: string | null
          updated_at?: string
        }
        Update: {
          author_id?: string
          content?: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          launch_tx_hash?: string | null
          reply_to_post_id?: string | null
          token_address?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "posts_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "posts_reply_to_post_id_fkey"
            columns: ["reply_to_post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          bio: string
          created_at: string
          display_name: string
          id: string
          is_public: boolean
          privy_user_id: string
          updated_at: string
          wallet_address: string
          x_handle: string | null
          x_user_id: string | null
        }
        Insert: {
          avatar_url?: string | null
          bio?: string
          created_at?: string
          display_name: string
          id?: string
          is_public?: boolean
          privy_user_id: string
          updated_at?: string
          wallet_address: string
          x_handle?: string | null
          x_user_id?: string | null
        }
        Update: {
          avatar_url?: string | null
          bio?: string
          created_at?: string
          display_name?: string
          id?: string
          is_public?: boolean
          privy_user_id?: string
          updated_at?: string
          wallet_address?: string
          x_handle?: string | null
          x_user_id?: string | null
        }
        Relationships: []
      }
      rate_limit_events: {
        Row: {
          action: string
          created_at: string
          id: number
          profile_id: string
        }
        Insert: {
          action: string
          created_at?: string
          id?: never
          profile_id: string
        }
        Update: {
          action?: string
          created_at?: string
          id?: never
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "rate_limit_events_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      reposts: {
        Row: {
          created_at: string
          post_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          post_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          post_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reposts_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reposts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      advance_indexer_state: {
        Args: { p_indexer_name: string; p_last_processed_block: number }
        Returns: number
      }
      advance_launch_phase: {
        Args: {
          p_last_synced_block: number
          p_lifecycle_block: number
          p_phase: number
          p_token_address: string
        }
        Returns: number
      }
      backfill_launch_creators: { Args: never; Returns: number }
      create_post_with_media: {
        Args: {
          p_author_id: string
          p_content?: string
          p_media?: Json
          p_reply_to_post_id?: string
          p_token_address?: string
        }
        Returns: {
          author_id: string
          content: string
          created_at: string
          deleted_at: string | null
          id: string
          launch_tx_hash: string | null
          reply_to_post_id: string | null
          token_address: string | null
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "posts"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      enforce_rate_limit: {
        Args: {
          p_action: string
          p_limit: number
          p_profile_id: string
          p_window_seconds: number
        }
        Returns: boolean
      }
      get_feed_page: {
        Args: {
          p_cursor_created_at?: string
          p_cursor_id?: string
          p_following_only: boolean
          p_limit: number
          p_viewer_id: string
        }
        Returns: {
          author_id: string
          content: string
          created_at: string
          id: string
          reply_to_post_id: string
          token_address: string
        }[]
      }
      get_notifications: {
        Args: { p_limit?: number; p_recipient_id: string }
        Returns: {
          actor_id: string
          created_at: string
          id: string
          post_id: string
          read_at: string
          type: string
        }[]
      }
      get_post_engagement: {
        Args: { p_post_ids: string[] }
        Returns: {
          likes: number
          post_id: string
          replies: number
          reposts: number
        }[]
      }
      get_profile_stats: {
        Args: { p_profile_ids: string[] }
        Returns: {
          followers: number
          following: number
          launches_count: number
          posts_count: number
          profile_id: string
        }[]
      }
      get_public_token_social_engagement: {
        Args: { p_since?: string | null; p_token_addresses: string[] }
        Returns: {
          social_engagement: number
          token_address: string
        }[]
      }
      get_token_24h_metrics: {
        Args: { p_token_address: string }
        Returns: {
          first_quote_amount: string
          first_token_amount: string
          last_quote_amount: string
          last_token_amount: string
          trade_count_24h: number
          volume_24h: string
        }[]
      }
      get_token_discovery_metrics: {
        Args: { p_since?: string | null; p_token_addresses: string[] }
        Returns: {
          first_quote_amount: string | null
          first_token_amount: string | null
          last_quote_amount: string | null
          last_token_amount: string | null
          social_engagement: number
          token_address: string
          trade_count: number
          volume_raw: string
        }[]
      }
      get_token_market_snapshot_metrics: {
        Args: { p_since?: string | null; p_token_addresses: string[] }
        Returns: {
          activity_count: number
          first_price_usd_e18: string | null
          graduation_progress_bps: number | null
          last_price_usd_e18: string | null
          latest_snapshot_at: string | null
          market_cap_usd_e18: string | null
          observation_count: number
          price_usd_e18: string | null
          social_engagement: number
          token_address: string
        }[]
      }
      get_tokens_24h_metrics: {
        Args: { p_token_addresses: string[] }
        Returns: {
          first_quote_amount: string
          first_token_amount: string
          last_quote_amount: string
          last_token_amount: string
          token_address: string
          trade_count_24h: number
          volume_24h: string
        }[]
      }
      get_trending_profile_ids: {
        Args: { p_limit?: number }
        Returns: {
          profile_id: string
          score: number
        }[]
      }
      get_trending_token_addresses: {
        Args: { p_limit?: number }
        Returns: {
          token_address: string
          trade_count_24h: number
          volume_24h: string
        }[]
      }
      invoke_pons_discovery_refresh: { Args: never; Returns: number }
      record_verified_launch_activity: {
        Args: {
          p_content: string
          p_profile_id: string
          p_token_address: string
          p_transaction_hash: string
          p_wallet_address: string
        }
        Returns: string
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const
