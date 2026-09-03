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
    PostgrestVersion: "14.17"
  }
  public: {
    Tables: {
      admin_allowlist: {
        Row: {
          created_at: string
          email: string
        }
        Insert: {
          created_at?: string
          email: string
        }
        Update: {
          created_at?: string
          email?: string
        }
        Relationships: []
      }
      cinema_films: {
        Row: {
          backdrop_url: string | null
          booking_url: string | null
          cast_names: string[] | null
          cast_credits: Json | null
          imdb_rating: number | null
          imdb_votes: number | null
          metascore: number | null
          rt_score: number | null
          tmdb_genres: string[] | null
          cinema: string
          city: string
          created_at: string
          director: string | null
          duration_mins: number | null
          first_seen_at: string
          formats: string[]
          genre: string | null
          id: string
          imdb_id: string | null
          is_active: boolean
          language: string | null
          last_seen_at: string
          poster_url: string | null
          rating: string | null
          showtimes: Json
          source_url: string | null
          synopsis: string | null
          title: string
          title_key: string
          updated_at: string
          venues: string[]
        }
        Insert: {
          backdrop_url?: string | null
          booking_url?: string | null
          cast_names?: string[] | null
          cast_credits?: Json | null
          imdb_rating?: number | null
          imdb_votes?: number | null
          metascore?: number | null
          rt_score?: number | null
          tmdb_genres?: string[] | null
          cinema: string
          city?: string
          created_at?: string
          director?: string | null
          duration_mins?: number | null
          first_seen_at?: string
          formats?: string[]
          genre?: string | null
          id?: string
          imdb_id?: string | null
          is_active?: boolean
          language?: string | null
          last_seen_at?: string
          poster_url?: string | null
          rating?: string | null
          showtimes?: Json
          source_url?: string | null
          synopsis?: string | null
          title: string
          title_key: string
          updated_at?: string
          venues?: string[]
        }
        Update: {
          backdrop_url?: string | null
          booking_url?: string | null
          cast_names?: string[] | null
          cast_credits?: Json | null
          imdb_rating?: number | null
          imdb_votes?: number | null
          metascore?: number | null
          rt_score?: number | null
          tmdb_genres?: string[] | null
          cinema?: string
          city?: string
          created_at?: string
          director?: string | null
          duration_mins?: number | null
          first_seen_at?: string
          formats?: string[]
          genre?: string | null
          id?: string
          imdb_id?: string | null
          is_active?: boolean
          language?: string | null
          last_seen_at?: string
          poster_url?: string | null
          rating?: string | null
          showtimes?: Json
          source_url?: string | null
          synopsis?: string | null
          title?: string
          title_key?: string
          updated_at?: string
          venues?: string[]
        }
        Relationships: []
      }
      cinema_scrape_runs: {
        Row: {
          changed: boolean
          cinema: string
          content_hash: string | null
          created_at: string
          error: string | null
          films_deactivated: number
          films_upserted: number
          id: string
          source_url: string | null
          status: string
        }
        Insert: {
          changed?: boolean
          cinema: string
          content_hash?: string | null
          created_at?: string
          error?: string | null
          films_deactivated?: number
          films_upserted?: number
          id?: string
          source_url?: string | null
          status?: string
        }
        Update: {
          changed?: boolean
          cinema?: string
          content_hash?: string | null
          created_at?: string
          error?: string | null
          films_deactivated?: number
          films_upserted?: number
          id?: string
          source_url?: string | null
          status?: string
        }
        Relationships: []
      }
      event_scrape_runs: {
        Row: {
          changed: boolean
          content_hash: string | null
          created_at: string
          error: string | null
          events_deactivated: number
          events_upserted: number
          id: string
          source: string
          source_url: string | null
          status: string
        }
        Insert: {
          changed?: boolean
          content_hash?: string | null
          created_at?: string
          error?: string | null
          events_deactivated?: number
          events_upserted?: number
          id?: string
          source: string
          source_url?: string | null
          status?: string
        }
        Update: {
          changed?: boolean
          content_hash?: string | null
          created_at?: string
          error?: string | null
          events_deactivated?: number
          events_upserted?: number
          id?: string
          source?: string
          source_url?: string | null
          status?: string
        }
        Relationships: []
      }
      listings: {
        Row: {
          certification: string | null
          city: string
          created_at: string
          created_by: string | null
          description: string | null
          duration_mins: number | null
          featured: boolean
          genre: string | null
          id: string
          kind: Database["public"]["Enums"]["listing_kind"]
          language: string | null
          poster_url: string | null
          price_aed: number
          starts_at: string | null
          title: string
          updated_at: string
          venue: string | null
        }
        Insert: {
          certification?: string | null
          city?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          duration_mins?: number | null
          featured?: boolean
          genre?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["listing_kind"]
          language?: string | null
          poster_url?: string | null
          price_aed?: number
          starts_at?: string | null
          title: string
          updated_at?: string
          venue?: string | null
        }
        Update: {
          certification?: string | null
          city?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          duration_mins?: number | null
          featured?: boolean
          genre?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["listing_kind"]
          language?: string | null
          poster_url?: string | null
          price_aed?: number
          starts_at?: string | null
          title?: string
          updated_at?: string
          venue?: string | null
        }
        Relationships: []
      }
      live_events: {
        Row: {
          category: string | null
          city: string | null
          created_at: string
          date_text: string | null
          description: string | null
          ends_on: string | null
          first_seen_at: string
          id: string
          image_url: string | null
          is_active: boolean
          last_seen_at: string
          price_text: string | null
          source: string
          source_url: string | null
          starts_on: string | null
          ticket_url: string | null
          title: string
          title_key: string
          updated_at: string
          venue: string | null
        }
        Insert: {
          category?: string | null
          city?: string | null
          created_at?: string
          date_text?: string | null
          description?: string | null
          ends_on?: string | null
          first_seen_at?: string
          id?: string
          image_url?: string | null
          is_active?: boolean
          last_seen_at?: string
          price_text?: string | null
          source: string
          source_url?: string | null
          starts_on?: string | null
          ticket_url?: string | null
          title: string
          title_key: string
          updated_at?: string
          venue?: string | null
        }
        Update: {
          category?: string | null
          city?: string | null
          created_at?: string
          date_text?: string | null
          description?: string | null
          ends_on?: string | null
          first_seen_at?: string
          id?: string
          image_url?: string | null
          is_active?: boolean
          last_seen_at?: string
          price_text?: string | null
          source?: string
          source_url?: string | null
          starts_on?: string | null
          ticket_url?: string | null
          title?: string
          title_key?: string
          updated_at?: string
          venue?: string | null
        }
        Relationships: []
      }
      notify_subscribers: {
        Row: {
          created_at: string
          email: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          email?: string | null
          user_id?: string
        }
        Relationships: []
      }
      scraper_auth: {
        Row: {
          id: number
          note: string | null
          token: string
          updated_at: string
        }
        Insert: {
          id?: number
          note?: string | null
          token: string
          updated_at?: string
        }
        Update: {
          id?: number
          note?: string | null
          token?: string
          updated_at?: string
        }
        Relationships: []
      }
      scraper_cursor: {
        Row: {
          id: number
          pos: number
          step: number
          total: number
          updated_at: string
        }
        Insert: {
          id?: number
          pos?: number
          step?: number
          total?: number
          updated_at?: string
        }
        Update: {
          id?: number
          pos?: number
          step?: number
          total?: number
          updated_at?: string
        }
        Relationships: []
      }
      scraper_page_cache: {
        Row: {
          content_hash: string | null
          etag: string | null
          fetched_at: string
          film_keys: string[]
          hit_count: number
          last_modified: string | null
          url: string
        }
        Insert: {
          content_hash?: string | null
          etag?: string | null
          fetched_at?: string
          film_keys?: string[]
          hit_count?: number
          last_modified?: string | null
          url: string
        }
        Update: {
          content_hash?: string | null
          etag?: string | null
          fetched_at?: string
          film_keys?: string[]
          hit_count?: number
          last_modified?: string | null
          url?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      claim_admin_role: { Args: never; Returns: boolean }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      ingest_cinema_films: {
        Args: { p_rows: Json; p_token: string }
        Returns: Json
      }
      page_cache_get: {
        Args: { p_token: string; p_urls: string[] }
        Returns: {
          content_hash: string
          etag: string
          fetched_at: string
          film_keys: string[]
          last_modified: string
          url: string
        }[]
      }
      page_cache_put: { Args: { p_rows: Json; p_token: string }; Returns: Json }
      retire_stale_films: { Args: { p_chains: string[] }; Returns: number }
      set_posters: { Args: { p_map: Json; p_token: string }; Returns: Json }
      touch_films: { Args: { p_keys: Json; p_token: string }; Returns: Json }
    }
    Enums: {
      app_role: "admin" | "user"
      listing_kind: "movie" | "event"
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
      app_role: ["admin", "user"],
      listing_kind: ["movie", "event"],
    },
  },
} as const
