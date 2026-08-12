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
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      leagues: {
        Row: {
          current_week: number | null
          external_id: string
          id: string
          name: string
          platform: Database["public"]["Enums"]["platform"]
          roster_slots: Json | null
          scoring_raw: Json | null
          scoring_type: string | null
          season: number
          sport: Database["public"]["Enums"]["sport"]
          status: string | null
          synced_at: string | null
          team_count: number | null
        }
        Insert: {
          current_week?: number | null
          external_id: string
          id?: string
          name: string
          platform: Database["public"]["Enums"]["platform"]
          roster_slots?: Json | null
          scoring_raw?: Json | null
          scoring_type?: string | null
          season: number
          sport: Database["public"]["Enums"]["sport"]
          status?: string | null
          synced_at?: string | null
          team_count?: number | null
        }
        Update: {
          current_week?: number | null
          external_id?: string
          id?: string
          name?: string
          platform?: Database["public"]["Enums"]["platform"]
          roster_slots?: Json | null
          scoring_raw?: Json | null
          scoring_type?: string | null
          season?: number
          sport?: Database["public"]["Enums"]["sport"]
          status?: string | null
          synced_at?: string | null
          team_count?: number | null
        }
        Relationships: []
      }
      matchups: {
        Row: {
          id: string
          is_final: boolean
          league_id: string
          matchup_key: string
          opponent_team_id: string | null
          points: number | null
          projected_points: number | null
          team_id: string
          week: number
        }
        Insert: {
          id?: string
          is_final?: boolean
          league_id: string
          matchup_key: string
          opponent_team_id?: string | null
          points?: number | null
          projected_points?: number | null
          team_id: string
          week: number
        }
        Update: {
          id?: string
          is_final?: boolean
          league_id?: string
          matchup_key?: string
          opponent_team_id?: string | null
          points?: number | null
          projected_points?: number | null
          team_id?: string
          week?: number
        }
        Relationships: [
          {
            foreignKeyName: "matchups_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matchups_opponent_team_id_fkey"
            columns: ["opponent_team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matchups_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_accounts: {
        Row: {
          created_at: string
          expires_at: string | null
          external_user_id: string | null
          id: string
          last_ok_at: string | null
          platform: Database["public"]["Enums"]["platform"]
          secrets: Json
          username: string | null
        }
        Insert: {
          created_at?: string
          expires_at?: string | null
          external_user_id?: string | null
          id?: string
          last_ok_at?: string | null
          platform: Database["public"]["Enums"]["platform"]
          secrets?: Json
          username?: string | null
        }
        Update: {
          created_at?: string
          expires_at?: string | null
          external_user_id?: string | null
          id?: string
          last_ok_at?: string | null
          platform?: Database["public"]["Enums"]["platform"]
          secrets?: Json
          username?: string | null
        }
        Relationships: []
      }
      player_ids: {
        Row: {
          confidence: number
          external_id: string
          platform: Database["public"]["Enums"]["platform"]
          player_id: string
        }
        Insert: {
          confidence?: number
          external_id: string
          platform: Database["public"]["Enums"]["platform"]
          player_id: string
        }
        Update: {
          confidence?: number
          external_id?: string
          platform?: Database["public"]["Enums"]["platform"]
          player_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "player_ids_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      players: {
        Row: {
          first_name: string | null
          full_name: string
          gsis_id: string | null
          id: string
          last_name: string | null
          position: string | null
          sport: Database["public"]["Enums"]["sport"]
          sportradar_id: string | null
          status: string | null
          team_abbr: string | null
          updated_at: string
        }
        Insert: {
          first_name?: string | null
          full_name: string
          gsis_id?: string | null
          id?: string
          last_name?: string | null
          position?: string | null
          sport: Database["public"]["Enums"]["sport"]
          sportradar_id?: string | null
          status?: string | null
          team_abbr?: string | null
          updated_at?: string
        }
        Update: {
          first_name?: string | null
          full_name?: string
          gsis_id?: string | null
          id?: string
          last_name?: string | null
          position?: string | null
          sport?: Database["public"]["Enums"]["sport"]
          sportradar_id?: string | null
          status?: string | null
          team_abbr?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      roster_entries: {
        Row: {
          external_player_id: string
          id: string
          is_starter: boolean
          player_id: string | null
          slot: string | null
          team_id: string
          week: number | null
        }
        Insert: {
          external_player_id: string
          id?: string
          is_starter?: boolean
          player_id?: string | null
          slot?: string | null
          team_id: string
          week?: number | null
        }
        Update: {
          external_player_id?: string
          id?: string
          is_starter?: boolean
          player_id?: string | null
          slot?: string | null
          team_id?: string
          week?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "roster_entries_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "roster_entries_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      sync_runs: {
        Row: {
          error: string | null
          finished_at: string | null
          id: string
          league_id: string | null
          platform: Database["public"]["Enums"]["platform"]
          started_at: string
          stats: Json | null
          status: string
        }
        Insert: {
          error?: string | null
          finished_at?: string | null
          id?: string
          league_id?: string | null
          platform: Database["public"]["Enums"]["platform"]
          started_at?: string
          stats?: Json | null
          status?: string
        }
        Update: {
          error?: string | null
          finished_at?: string | null
          id?: string
          league_id?: string | null
          platform?: Database["public"]["Enums"]["platform"]
          started_at?: string
          stats?: Json | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "sync_runs_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
        ]
      }
      teams: {
        Row: {
          avatar_url: string | null
          external_id: string
          id: string
          is_mine: boolean
          league_id: string
          losses: number | null
          manager_name: string | null
          name: string | null
          points_against: number | null
          points_for: number | null
          standing: number | null
          ties: number | null
          wins: number | null
        }
        Insert: {
          avatar_url?: string | null
          external_id: string
          id?: string
          is_mine?: boolean
          league_id: string
          losses?: number | null
          manager_name?: string | null
          name?: string | null
          points_against?: number | null
          points_for?: number | null
          standing?: number | null
          ties?: number | null
          wins?: number | null
        }
        Update: {
          avatar_url?: string | null
          external_id?: string
          id?: string
          is_mine?: boolean
          league_id?: string
          losses?: number | null
          manager_name?: string | null
          name?: string | null
          points_against?: number | null
          points_for?: number | null
          standing?: number | null
          ties?: number | null
          wins?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "teams_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
        ]
      }
      transactions: {
        Row: {
          external_id: string
          id: string
          league_id: string
          occurred_at: string | null
          payload: Json
          type: string
          week: number | null
        }
        Insert: {
          external_id: string
          id?: string
          league_id: string
          occurred_at?: string | null
          payload: Json
          type: string
          week?: number | null
        }
        Update: {
          external_id?: string
          id?: string
          league_id?: string
          occurred_at?: string | null
          payload?: Json
          type?: string
          week?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "transactions_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      my_week: {
        Row: {
          is_final: boolean | null
          league: string | null
          my_team: string | null
          opponent: string | null
          opponent_points: number | null
          platform: Database["public"]["Enums"]["platform"] | null
          points: number | null
          projected_points: number | null
          season: number | null
          week: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      platform: "sleeper" | "espn" | "yahoo"
      sport: "nfl" | "nba" | "mlb" | "nhl"
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
    Enums: {
      platform: ["sleeper", "espn", "yahoo"],
      sport: ["nfl", "nba", "mlb", "nhl"],
    },
  },
} as const
