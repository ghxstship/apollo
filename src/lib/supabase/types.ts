export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

/* Hand-maintained to mirror supabase/migrations — compact style.
   Row = full row; Insert/Update derived via Partial where safe. */

type Row<T> = T
type Ins<T, Req extends keyof T = never> = Partial<T> & Pick<T, Req>

export type MembershipTier = "regional" | "national" | "global"
export type EventClass = "sea" | "shore" | "sky"
export type VoyageStatus = "scheduled" | "live" | "weather_hold" | "completed" | "cancelled"
export type RsvpStatus = "aboard" | "waitlist" | "not_going"
export type ApplicationStatus = "received" | "review" | "invited" | "aboard" | "declined"

export type ProfileRow = {
  id: string; member_no: string | null; full_name: string | null; handle: string | null
  email: string | null; tier: MembershipTier; home_harbor: string | null; avatar_tone: string
  is_staff: boolean; joined_at: string; status: "active" | "paused" | "departed"
  notification_prefs: Json; waiver_signed_at: string | null; plan_id: string | null
}
export type HarborRow = {
  id: string; slug: string; name: string; status: string; coordinates: string | null
  launch_year: number | null; position: number
}
export type VoyageRow = {
  id: string; slug: string; title: string; class: EventClass; kind: string
  harbor_id: string | null; starts_at: string; ends_at: string | null; coordinates: string | null
  distance_nm: number | null; berths_total: number; price_cents: number; status: VoyageStatus
  blurb: string | null; description: string | null; media: string; min_tier: MembershipTier
  created_at: string; deposit_required: boolean; muster: string | null; conditions: Json | null
  fathoms_multiplier: number
  sub_class: "voyage" | "expedition" | "odyssey" | "trek" | "excursion" | "overland" | null
  itinerary: Json
}
export type RsvpRow = {
  id: string; voyage_id: string; profile_id: string; status: RsvpStatus; guests: number
  created_at: string; checked_in_at: string | null; checked_in_by: string | null
  boarding_code: string | null; show_on_manifest: boolean; vessel_id: string | null
}
export type MembershipPlanRow = {
  id: string; plan_type: "access" | "regional" | "national" | "global" | "guest"
  tier: number; label: string; price_cents: number; events_per_month: number
  class_ceiling: "voyage" | "expedition" | "odyssey" | null; active: boolean
}
export type VesselRow = {
  id: string; name: string; capacity: number; home_harbor: string | null; active: boolean
}
export type VoyageVesselRow = { voyage_id: string; vessel_id: string; position: number }
export type FathomsRow = {
  id: string; profile_id: string; delta: number; reason: string; voyage_id: string | null; created_at: string
}
export type WardroomPostRow = {
  id: string; author_id: string | null; author_name: string | null; body: string
  voyage_id: string | null; created_at: string
}
export type WardroomHailRow = { post_id: string; profile_id: string; created_at: string }
export type WardroomCommentRow = {
  id: string; post_id: string; author_id: string | null; author_name: string | null; body: string; created_at: string
}
export type WardroomFlagRow = {
  id: string; post_id: string; flagger_id: string; reason: string
  status: "open" | "removed" | "left_up"; resolved_by: string | null; created_at: string
}
export type DispatchRow = {
  id: string; slug: string; title: string; dek: string | null; body: string | null
  tag: string | null; published_at: string
}
export type ApplicationRow = {
  id: string; email: string; full_name: string; city: string | null; referral: string | null
  note: string | null; status: ApplicationStatus; created_at: string; interests: string[]
  tier_requested: MembershipTier; invite_code: string | null; waiver_swim: boolean
  waiver_conduct: boolean; reviewed_by: string | null; decided_at: string | null
}
export type NotificationRow = {
  id: string; profile_id: string; kind: string; title: string; body: string | null
  read: boolean; created_at: string
}
export type MemberRollRow = {
  email: string; tier: MembershipTier; home_harbor: string | null; source: string
  invite_code: string | null; approved_by: string | null; created_at: string
}
export type InviteRow = {
  code: string; inviter_id: string; max_uses: number; uses: number; created_at: string
}
export type AccountLedgerRow = {
  id: string; profile_id: string; delta_cents: number; kind: string; memo: string | null
  voyage_id: string | null; rsvp_id: string | null; created_by: string | null; created_at: string
}
export type AddonRow = { id: string; slug: string; name: string; price_cents: number; active: boolean }
export type RsvpAddonRow = { rsvp_id: string; addon_id: string; qty: number }
export type RewardRow = {
  id: string; name: string; detail: string | null; cost_fm: number; active: boolean; position: number
}
export type RewardRedemptionRow = { id: string; profile_id: string; reward_id: string; created_at: string }
export type EmailOutboxRow = {
  id: string; to_email: string; template: string; payload: Json
  status: "pending" | "sent" | "skipped" | "failed"; created_at: string; sent_at: string | null
}
export type GalleyItemRow = {
  id: string; category: "bar" | "galley" | "merch"; name: string; price_cents: number; active: boolean
}
export type GalleyOrderRow = {
  id: string; profile_id: string; voyage_id: string | null; source: "self" | "pos"
  status: "placed" | "ready" | "delivered" | "cancelled"; total_cents: number; created_at: string
}
export type GalleyOrderItemRow = { order_id: string; item_id: string; qty: number; price_cents: number }
export type ProductRow = {
  id: string; slug: string; name: string; category: "deck" | "galley" | "wardrobe"
  price_cents: number; sizes: string[]; badge: string | null; active: boolean
}
export type ShopOrderRow = {
  id: string; profile_id: string; total_cents: number; discount_cents: number
  status: "placed" | "fulfilled" | "refund_requested" | "refunded"; created_at: string
}
export type ShopOrderItemRow = {
  order_id: string; product_id: string; qty: number; size: string | null; price_cents: number
}
export type CrewRoleRow = {
  id: string; title: string; port: string; meta: string | null; blurb: string | null
  open: boolean; position: number
}
export type CrewCandidateRow = {
  id: string; role_id: string; full_name: string; email: string; note: string | null
  stage: "applied" | "interview" | "sea_trial" | "offer" | "passed"; created_at: string
}

type Table<R, I = Ins<R>> = { Row: Row<R>; Insert: I; Update: Partial<R>; Relationships: [] }

export type Database = {
  __InternalSupabase: { PostgrestVersion: "14.5" }
  public: {
    Tables: {
      profiles: Table<ProfileRow, Ins<ProfileRow, "id">>
      harbors: Table<HarborRow, Ins<HarborRow, "slug" | "name">>
      voyages: Table<VoyageRow, Ins<VoyageRow, "slug" | "title" | "class" | "starts_at">>
      rsvps: Table<RsvpRow, Ins<RsvpRow, "voyage_id" | "profile_id">>
      fathoms_ledger: Table<FathomsRow, Ins<FathomsRow, "profile_id" | "delta" | "reason">>
      wardroom_posts: Table<WardroomPostRow, Ins<WardroomPostRow, "body">>
      wardroom_hails: Table<WardroomHailRow, Ins<WardroomHailRow, "post_id" | "profile_id">>
      wardroom_comments: Table<WardroomCommentRow, Ins<WardroomCommentRow, "post_id" | "body">>
      wardroom_flags: Table<WardroomFlagRow, Ins<WardroomFlagRow, "post_id" | "flagger_id" | "reason">>
      dispatch_posts: Table<DispatchRow, Ins<DispatchRow, "slug" | "title">>
      applications: Table<ApplicationRow, Ins<ApplicationRow, "email" | "full_name">>
      notifications: Table<NotificationRow, Ins<NotificationRow, "profile_id" | "title">>
      member_roll: Table<MemberRollRow, Ins<MemberRollRow, "email">>
      invites: Table<InviteRow, Ins<InviteRow, "code" | "inviter_id">>
      account_ledger: Table<AccountLedgerRow, Ins<AccountLedgerRow, "profile_id" | "delta_cents" | "kind">>
      addons: Table<AddonRow, Ins<AddonRow, "slug" | "name" | "price_cents">>
      rsvp_addons: Table<RsvpAddonRow, Ins<RsvpAddonRow, "rsvp_id" | "addon_id">>
      rewards: Table<RewardRow, Ins<RewardRow, "name" | "cost_fm">>
      reward_redemptions: Table<RewardRedemptionRow, Ins<RewardRedemptionRow, "profile_id" | "reward_id">>
      email_outbox: Table<EmailOutboxRow, Ins<EmailOutboxRow, "to_email" | "template">>
      membership_plans: Table<MembershipPlanRow, Ins<MembershipPlanRow, "plan_type" | "tier" | "label" | "price_cents">>
      vessels: Table<VesselRow, Ins<VesselRow, "name">>
      voyage_vessels: Table<VoyageVesselRow, Ins<VoyageVesselRow, "voyage_id" | "vessel_id">>
      galley_items: Table<GalleyItemRow, Ins<GalleyItemRow, "category" | "name" | "price_cents">>
      galley_orders: Table<GalleyOrderRow, Ins<GalleyOrderRow, "profile_id">>
      galley_order_items: Table<GalleyOrderItemRow, Ins<GalleyOrderItemRow, "order_id" | "item_id" | "price_cents">>
      products: Table<ProductRow, Ins<ProductRow, "slug" | "name" | "category" | "price_cents">>
      shop_orders: Table<ShopOrderRow, Ins<ShopOrderRow, "profile_id">>
      shop_order_items: Table<ShopOrderItemRow, Ins<ShopOrderItemRow, "order_id" | "product_id" | "price_cents">>
      crew_roles: Table<CrewRoleRow, Ins<CrewRoleRow, "title" | "port">>
      crew_candidates: Table<CrewCandidateRow, Ins<CrewCandidateRow, "role_id" | "full_name" | "email">>
    }
    Views: {
      voyage_capacity: {
        Row: {
          voyage_id: string | null; berths_total: number | null; aboard: number | null
          waitlisted: number | null; berths_left: number | null
        }
        Relationships: []
      }
      fathoms_balance: {
        Row: { profile_id: string | null; balance: number | null }
        Relationships: []
      }
      account_balance: {
        Row: { profile_id: string | null; balance_cents: number | null }
        Relationships: []
      }
      member_league: {
        Row: { profile_id: string | null; league: number | null; league_name: string | null }
        Relationships: []
      }
    }
    Functions: {
      is_staff: { Args: Record<string, never>; Returns: boolean }
      email_may_board: { Args: { p_email: string }; Returns: boolean }
      validate_invite: { Args: { p_code: string }; Returns: string | null }
      application_status_for: { Args: { p_email: string }; Returns: ApplicationStatus | null }
      set_application_status: { Args: { p_id: string; p_status: ApplicationStatus }; Returns: undefined }
      accept_application: { Args: { p_id: string }; Returns: undefined }
      redeem_reward: { Args: { p_reward: string }; Returns: undefined }
    }
    Enums: {
      application_status: ApplicationStatus
      event_class: EventClass
      membership_tier: MembershipTier
      rsvp_status: RsvpStatus
      voyage_status: VoyageStatus
    }
    CompositeTypes: { [_ in never]: never }
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
      application_status: ["received", "review", "invited", "aboard", "declined"],
      event_class: ["sea", "shore", "sky"],
      membership_tier: ["regional", "national", "global"],
      rsvp_status: ["aboard", "waitlist", "not_going"],
      voyage_status: ["scheduled", "live", "weather_hold", "completed", "cancelled"],
    },
  },
} as const
