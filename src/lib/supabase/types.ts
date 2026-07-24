export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      applications: {
        Row: {
          city: string | null
          created_at: string
          email: string
          full_name: string
          id: string
          note: string | null
          referral: string | null
          status: Database["public"]["Enums"]["application_status"]
        }
        Insert: {
          city?: string | null
          created_at?: string
          email: string
          full_name: string
          id?: string
          note?: string | null
          referral?: string | null
          status?: Database["public"]["Enums"]["application_status"]
        }
        Update: {
          city?: string | null
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          note?: string | null
          referral?: string | null
          status?: Database["public"]["Enums"]["application_status"]
        }
        Relationships: []
      }
      dispatch_posts: {
        Row: {
          body: string | null
          dek: string | null
          id: string
          published_at: string
          slug: string
          tag: string | null
          title: string
        }
        Insert: {
          body?: string | null
          dek?: string | null
          id?: string
          published_at?: string
          slug: string
          tag?: string | null
          title: string
        }
        Update: {
          body?: string | null
          dek?: string | null
          id?: string
          published_at?: string
          slug?: string
          tag?: string | null
          title?: string
        }
        Relationships: []
      }
      fathoms_ledger: {
        Row: {
          created_at: string
          delta: number
          id: string
          profile_id: string
          reason: string
          voyage_id: string | null
        }
        Insert: {
          created_at?: string
          delta: number
          id?: string
          profile_id: string
          reason: string
          voyage_id?: string | null
        }
        Update: {
          created_at?: string
          delta?: number
          id?: string
          profile_id?: string
          reason?: string
          voyage_id?: string | null
        }
        Relationships: []
      }
      harbors: {
        Row: {
          coordinates: string | null
          id: string
          launch_year: number | null
          name: string
          position: number
          slug: string
          status: string
        }
        Insert: {
          coordinates?: string | null
          id?: string
          launch_year?: number | null
          name: string
          position?: number
          slug: string
          status?: string
        }
        Update: {
          coordinates?: string | null
          id?: string
          launch_year?: number | null
          name?: string
          position?: number
          slug?: string
          status?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          id: string
          kind: string
          profile_id: string
          read: boolean
          title: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          kind?: string
          profile_id: string
          read?: boolean
          title: string
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          kind?: string
          profile_id?: string
          read?: boolean
          title?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_tone: string
          email: string | null
          full_name: string | null
          handle: string | null
          home_harbor: string | null
          id: string
          is_staff: boolean
          joined_at: string
          member_no: string | null
          tier: Database["public"]["Enums"]["membership_tier"]
        }
        Insert: {
          avatar_tone?: string
          email?: string | null
          full_name?: string | null
          handle?: string | null
          home_harbor?: string | null
          id: string
          is_staff?: boolean
          joined_at?: string
          member_no?: string | null
          tier?: Database["public"]["Enums"]["membership_tier"]
        }
        Update: {
          avatar_tone?: string
          email?: string | null
          full_name?: string | null
          handle?: string | null
          home_harbor?: string | null
          id?: string
          is_staff?: boolean
          joined_at?: string
          member_no?: string | null
          tier?: Database["public"]["Enums"]["membership_tier"]
        }
        Relationships: []
      }
      rsvps: {
        Row: {
          created_at: string
          guests: number
          id: string
          profile_id: string
          status: Database["public"]["Enums"]["rsvp_status"]
          voyage_id: string
        }
        Insert: {
          created_at?: string
          guests?: number
          id?: string
          profile_id: string
          status?: Database["public"]["Enums"]["rsvp_status"]
          voyage_id: string
        }
        Update: {
          created_at?: string
          guests?: number
          id?: string
          profile_id?: string
          status?: Database["public"]["Enums"]["rsvp_status"]
          voyage_id?: string
        }
        Relationships: []
      }
      voyages: {
        Row: {
          berths_total: number
          blurb: string | null
          class: Database["public"]["Enums"]["event_class"]
          coordinates: string | null
          created_at: string
          description: string | null
          distance_nm: number | null
          ends_at: string | null
          harbor_id: string | null
          id: string
          kind: string
          media: string
          min_tier: Database["public"]["Enums"]["membership_tier"]
          price_cents: number
          slug: string
          starts_at: string
          status: Database["public"]["Enums"]["voyage_status"]
          title: string
        }
        Insert: {
          berths_total?: number
          blurb?: string | null
          class: Database["public"]["Enums"]["event_class"]
          coordinates?: string | null
          created_at?: string
          description?: string | null
          distance_nm?: number | null
          ends_at?: string | null
          harbor_id?: string | null
          id?: string
          kind?: string
          media?: string
          min_tier?: Database["public"]["Enums"]["membership_tier"]
          price_cents?: number
          slug: string
          starts_at: string
          status?: Database["public"]["Enums"]["voyage_status"]
          title: string
        }
        Update: {
          berths_total?: number
          blurb?: string | null
          class?: Database["public"]["Enums"]["event_class"]
          coordinates?: string | null
          created_at?: string
          description?: string | null
          distance_nm?: number | null
          ends_at?: string | null
          harbor_id?: string | null
          id?: string
          kind?: string
          media?: string
          min_tier?: Database["public"]["Enums"]["membership_tier"]
          price_cents?: number
          slug?: string
          starts_at?: string
          status?: Database["public"]["Enums"]["voyage_status"]
          title?: string
        }
        Relationships: []
      }
      wardroom_comments: {
        Row: {
          author_id: string | null
          author_name: string | null
          body: string
          created_at: string
          id: string
          post_id: string
        }
        Insert: {
          author_id?: string | null
          author_name?: string | null
          body: string
          created_at?: string
          id?: string
          post_id: string
        }
        Update: {
          author_id?: string | null
          author_name?: string | null
          body?: string
          created_at?: string
          id?: string
          post_id?: string
        }
        Relationships: []
      }
      wardroom_hails: {
        Row: {
          created_at: string
          post_id: string
          profile_id: string
        }
        Insert: {
          created_at?: string
          post_id: string
          profile_id: string
        }
        Update: {
          created_at?: string
          post_id?: string
          profile_id?: string
        }
        Relationships: []
      }
      wardroom_posts: {
        Row: {
          author_id: string | null
          author_name: string | null
          body: string
          created_at: string
          id: string
          voyage_id: string | null
        }
        Insert: {
          author_id?: string | null
          author_name?: string | null
          body: string
          created_at?: string
          id?: string
          voyage_id?: string | null
        }
        Update: {
          author_id?: string | null
          author_name?: string | null
          body?: string
          created_at?: string
          id?: string
          voyage_id?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      fathoms_balance: {
        Row: {
          balance: number | null
          profile_id: string | null
        }
        Relationships: []
      }
      voyage_capacity: {
        Row: {
          aboard: number | null
          berths_left: number | null
          berths_total: number | null
          voyage_id: string | null
          waitlisted: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      application_status: "received" | "review" | "invited" | "aboard"
      event_class: "sea" | "shore" | "sky"
      membership_tier: "regional" | "national" | "global"
      rsvp_status: "aboard" | "waitlist" | "not_going"
      voyage_status:
        | "scheduled"
        | "live"
        | "weather_hold"
        | "completed"
        | "cancelled"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DefaultSchema = Database["public"]

export type Tables<T extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])> =
  (DefaultSchema["Tables"] & DefaultSchema["Views"])[T] extends { Row: infer R } ? R : never

export type TablesInsert<T extends keyof DefaultSchema["Tables"]> =
  DefaultSchema["Tables"][T] extends { Insert: infer I } ? I : never

export type TablesUpdate<T extends keyof DefaultSchema["Tables"]> =
  DefaultSchema["Tables"][T] extends { Update: infer U } ? U : never

export type Enums<T extends keyof DefaultSchema["Enums"]> = DefaultSchema["Enums"][T]

export const Constants = {
  public: {
    Enums: {
      application_status: ["received", "review", "invited", "aboard"],
      event_class: ["sea", "shore", "sky"],
      membership_tier: ["regional", "national", "global"],
      rsvp_status: ["aboard", "waitlist", "not_going"],
      voyage_status: ["scheduled", "live", "weather_hold", "completed", "cancelled"],
    },
  },
} as const
