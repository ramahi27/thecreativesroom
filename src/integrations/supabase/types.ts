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
  public: {
    Tables: {
      app_settings: {
        Row: {
          key: string
          updated_at: string
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          value: Json
        }
        Update: {
          key?: string
          updated_at?: string
          value?: Json
        }
        Relationships: []
      }
      bookmarks: {
        Row: {
          created_at: string
          id: string
          reference_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          reference_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          reference_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bookmarks_reference_id_fkey"
            columns: ["reference_id"]
            isOneToOne: false
            referencedRelation: "references"
            referencedColumns: ["id"]
          },
        ]
      }
      duplicate_dismissals: {
        Row: {
          created_at: string
          dismissed_by: string | null
          id: string
          ref_a_id: string
          ref_b_id: string
        }
        Insert: {
          created_at?: string
          dismissed_by?: string | null
          id?: string
          ref_a_id: string
          ref_b_id: string
        }
        Update: {
          created_at?: string
          dismissed_by?: string | null
          id?: string
          ref_a_id?: string
          ref_b_id?: string
        }
        Relationships: []
      }
      folder_follows: {
        Row: {
          created_at: string
          folder_id: string
          id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          folder_id: string
          id?: string
          user_id: string
        }
        Update: {
          created_at?: string
          folder_id?: string
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      folder_items: {
        Row: {
          created_at: string
          folder_id: string
          id: string
          reference_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          folder_id: string
          id?: string
          reference_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          folder_id?: string
          id?: string
          reference_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "folder_items_folder_id_fkey"
            columns: ["folder_id"]
            isOneToOne: false
            referencedRelation: "folders"
            referencedColumns: ["id"]
          },
        ]
      }
      folders: {
        Row: {
          color: string | null
          created_at: string
          id: string
          is_public: boolean
          name: string
          position: number
          updated_at: string
          user_id: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          id?: string
          is_public?: boolean
          name: string
          position?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          color?: string | null
          created_at?: string
          id?: string
          is_public?: boolean
          name?: string
          position?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      page_views: {
        Row: {
          created_at: string
          duration_seconds: number
          id: string
          path: string
          reference_id: string | null
          user_id: string | null
          visitor_id: string
        }
        Insert: {
          created_at?: string
          duration_seconds?: number
          id?: string
          path: string
          reference_id?: string | null
          user_id?: string | null
          visitor_id: string
        }
        Update: {
          created_at?: string
          duration_seconds?: number
          id?: string
          path?: string
          reference_id?: string | null
          user_id?: string | null
          visitor_id?: string
        }
        Relationships: []
      }
      pending_refs: {
        Row: {
          agency: string | null
          award_level: string | null
          brand: string | null
          category: string | null
          created_at: string
          curatorial_note: string | null
          format: string | null
          id: string
          image_url: string | null
          source: string
          source_url: string
          status: string
          tags: string[]
          title: string
          updated_at: string
          year: number | null
        }
        Insert: {
          agency?: string | null
          award_level?: string | null
          brand?: string | null
          category?: string | null
          created_at?: string
          curatorial_note?: string | null
          format?: string | null
          id?: string
          image_url?: string | null
          source?: string
          source_url: string
          status?: string
          tags?: string[]
          title: string
          updated_at?: string
          year?: number | null
        }
        Update: {
          agency?: string | null
          award_level?: string | null
          brand?: string | null
          category?: string | null
          created_at?: string
          curatorial_note?: string | null
          format?: string | null
          id?: string
          image_url?: string | null
          source?: string
          source_url?: string
          status?: string
          tags?: string[]
          title?: string
          updated_at?: string
          year?: number | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          bio: string | null
          created_at: string
          submissions_public: boolean
          updated_at: string
          user_id: string
          username: string
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          submissions_public?: boolean
          updated_at?: string
          user_id: string
          username: string
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          submissions_public?: boolean
          updated_at?: string
          user_id?: string
          username?: string
        }
        Relationships: []
      }
      references: {
        Row: {
          agency: string | null
          approved_at: string | null
          approved_by: string | null
          brand: string | null
          categories: string[]
          created_at: string
          created_by: string | null
          editing_style: string | null
          id: string
          media_items: Json
          media_url: string | null
          notes: string | null
          published: boolean
          source: string | null
          source_url: string | null
          tag_synonyms: string[]
          tags: string[] | null
          thumbnail_url: string | null
          title: string
          type: string
          updated_at: string
          year: number | null
        }
        Insert: {
          agency?: string | null
          approved_at?: string | null
          approved_by?: string | null
          brand?: string | null
          categories?: string[]
          created_at?: string
          created_by?: string | null
          editing_style?: string | null
          id?: string
          media_items?: Json
          media_url?: string | null
          notes?: string | null
          published?: boolean
          source?: string | null
          source_url?: string | null
          tag_synonyms?: string[]
          tags?: string[] | null
          thumbnail_url?: string | null
          title: string
          type: string
          updated_at?: string
          year?: number | null
        }
        Update: {
          agency?: string | null
          approved_at?: string | null
          approved_by?: string | null
          brand?: string | null
          categories?: string[]
          created_at?: string
          created_by?: string | null
          editing_style?: string | null
          id?: string
          media_items?: Json
          media_url?: string | null
          notes?: string | null
          published?: boolean
          source?: string | null
          source_url?: string | null
          tag_synonyms?: string[]
          tags?: string[] | null
          thumbnail_url?: string | null
          title?: string
          type?: string
          updated_at?: string
          year?: number | null
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
      get_admin_stats: { Args: never; Returns: Json }
      get_profile_by_username: { Args: { _username: string }; Returns: Json }
      get_reference_logs: {
        Args: never
        Returns: {
          approved_at: string
          approved_by: string
          approved_by_email: string
          brand: string
          created_at: string
          created_by: string
          created_by_email: string
          id: string
          thumbnail_url: string
          title: string
          type: string
          year: number
        }[]
      }
      get_user_id_by_email: { Args: { _email: string }; Returns: string }
      get_user_overview: {
        Args: never
        Returns: {
          bookmarks_count: number
          created_at: string
          email: string
          is_admin: boolean
          references_added: number
          references_approved: number
          user_id: string
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_folder_public: { Args: { _folder_id: string }; Returns: boolean }
      list_admins: {
        Args: never
        Returns: {
          created_at: string
          email: string
          user_id: string
        }[]
      }
      rename_category: { Args: { _new: string; _old: string }; Returns: number }
      username_available: { Args: { _username: string }; Returns: boolean }
    }
    Enums: {
      app_role: "admin" | "user"
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
    },
  },
} as const
