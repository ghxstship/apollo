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
  notification_prefs: Json; plan_id: string | null
  stripe_customer_id: string | null; bio: string | null; in_directory: boolean
  interests: string[]; calendar_token: string; phone: string | null; phone_verified: boolean
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
  fathoms_multiplier: number; held_passes: number
  sub_class: "voyage" | "expedition" | "odyssey" | "trek" | "excursion" | "overland" | null
  itinerary: Json
}
export type RsvpRow = {
  id: string; voyage_id: string; profile_id: string; status: RsvpStatus; guests: number
  created_at: string; checked_in_at: string | null; checked_in_by: string | null
  boarding_code: string | null; show_on_manifest: boolean; vessel_id: string | null
  comp: boolean; guest_names: string[]; promo_code: string | null; auto_claim: boolean
}
export type MembershipPlanRow = {
  id: string; plan_type: "access" | "regional" | "national" | "global" | "guest"
  tier: number; label: string; price_cents: number; events_per_month: number
  class_ceiling: "voyage" | "expedition" | "odyssey" | null; active: boolean; early_days: number
  stripe_price_id: string | null; stripe_price_id_annual: string | null; annual_price_cents: number | null
}
export type VesselRow = {
  id: string; name: string; capacity: number; home_harbor: string | null; active: boolean
  length_ft: number | null; year: number | null; cabins: number | null
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
  id: string; name: string; detail: string | null; cost_fm: number
  active: boolean; position: number; stock: number | null
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

export type SubscriptionStatus = "incomplete" | "trialing" | "active" | "past_due" | "paused" | "canceled"
export type SubscriptionRow = {
  id: string; profile_id: string; plan_id: string | null; stripe_subscription_id: string | null
  status: SubscriptionStatus; interval: "month" | "year"; current_period_end: string | null
  cancel_at_period_end: boolean; created_at: string; updated_at: string
}
export type InvoiceRow = {
  id: string; profile_id: string; stripe_invoice_id: string | null; number: string | null
  amount_cents: number; status: string; hosted_url: string | null; pdf_url: string | null
  period_start: string | null; period_end: string | null; created_at: string
}
export type PaymentMethodRow = {
  id: string; profile_id: string; stripe_payment_method_id: string | null; brand: string | null
  last4: string | null; exp_month: number | null; exp_year: number | null; is_default: boolean; created_at: string
}
export type InstallmentPlanRow = {
  id: string; profile_id: string; rsvp_id: string | null; total_cents: number
  down_payment_cents: number; installments: number; paid_count: number
  next_charge_at: string | null; status: "active" | "complete" | "defaulted" | "cancelled"; created_at: string
}
export type ThreadRow = {
  id: string; kind: "crew" | "direct" | "shoreside"; voyage_id: string | null
  title: string | null; closed_at: string | null; created_at: string
}
export type ThreadMemberRow = { thread_id: string; profile_id: string; last_read_at: string | null; joined_at: string }
export type MessageRow = {
  id: string; thread_id: string; author_id: string | null; body: string; created_at: string
}
export type VoyageMediaRow = {
  id: string; voyage_id: string; storage_path: string; caption: string | null
  uploaded_by: string | null; approved: boolean; created_at: string
}
export type CrewRequestRow = {
  id: string; voyage_id: string; profile_id: string; note: string | null; open: boolean; created_at: string
}
export type RsvpGuestRow = {
  id: string; rsvp_id: string; name: string; boarding_code: string | null
  checked_in_at: string | null; checked_in_by: string | null; created_at: string
  sign_token: string
}
export type PassTransferRow = {
  id: string; rsvp_id: string; from_profile: string; to_profile: string
  status: "offered" | "accepted" | "declined" | "cancelled"; created_at: string; responded_at: string | null
}
export type PromoCodeRow = {
  code: string; kind: "percent" | "amount" | "comp"; value: number; voyage_id: string | null
  max_uses: number; uses: number; expires_at: string | null; active: boolean
  note: string | null; created_by: string | null; created_at: string
}
export type PushSubscriptionRow = {
  id: string; profile_id: string; endpoint: string; p256dh: string; auth: string; created_at: string
}
export type SmsTemplateRow = {
  code: string; provider_template_id: string | null; channels: string[]
  parameter_map: Json; active: boolean; note: string | null; created_at: string
}
export type SmsOutboxRow = {
  id: string; to_phone: string; template: string; payload: Json
  status: "pending" | "sent" | "skipped" | "failed"; created_at: string; sent_at: string | null
}
export type PushOutboxRow = {
  id: string; profile_id: string; title: string; body: string | null; url: string | null
  status: "pending" | "sent" | "skipped" | "failed"; created_at: string; sent_at: string | null
}
export type SavedSegmentRow = {
  id: string; name: string; filters: Json; created_by: string | null; created_at: string
}
export type ApiKeyRow = {
  id: string; label: string; key_hash: string; prefix: string; scopes: string[]
  revoked: boolean; last_used_at: string | null; created_by: string | null; created_at: string
}
export type WebhookRow = {
  id: string; url: string; events: string[]; secret: string; active: boolean; created_at: string
}
export type WebhookDeliveryRow = {
  id: string; webhook_id: string; event: string; payload: Json; status: number | null
  error: string | null; created_at: string
}
export type AutomationRow = {
  id: string; name: string; trigger_event: string; conditions: Json; action: Json
  active: boolean; last_run_at: string | null; created_at: string
}


/* ===== The logbook: marks, the Knots sink, and contests ===================== */

export type MarkRow = {
  code: string; name: string; blurb: string
  kind: "first" | "collection" | "tally"; position: number; active: boolean
}
export type MemberMarkRow = { profile_id: string; mark_code: string; conferred_at: string }
export type ContestShape = "regatta" | "challenge"
export type ContestMetric = "nm" | "sailings" | "harbors" | "vessels" | "crew_met" | "frames"
export type ContestRow = {
  id: string; slug: string; shape: ContestShape; scope: "member" | "crew"
  title: string; blurb: string | null; metric: ContestMetric; target: number | null
  prize: string | null; knots_award: number
  starts_at: string; ends_at: string; status: "draft" | "open" | "settled"
  voyage_id: string | null; settled_at: string | null; created_at: string
}
export type ContestEntryRow = { contest_id: string; profile_id: string; joined_at: string }
export type ContestResultRow = {
  contest_id: string; profile_id: string; place: number | null; score: number; met: boolean
}


/* ===== Clause library, documents, signatures =============================== */

export type ClauseCategory =
  | "liability" | "conduct" | "media" | "privacy" | "payment" | "crew" | "general"
export type ClauseRow = {
  code: string; title: string; category: ClauseCategory
  position: number; active: boolean; created_at: string
}
export type ClauseVersionRow = {
  id: string; clause_code: string; version: number; body: string
  note: string | null; published_at: string; published_by: string | null
}
export type DocumentKind = "waiver" | "contract" | "policy"
export type DocumentAudience = "member" | "guest" | "crew" | "partner"
export type DocumentRow = {
  code: string; title: string; kind: DocumentKind; audience: DocumentAudience
  validity_months: number | null; active: boolean; created_at: string
}
export type DocumentVersionRow = {
  id: string; document_code: string; version: number
  status: "draft" | "published" | "retired"
  effective_from: string | null; published_at: string | null
  published_by: string | null; created_at: string
}
export type DocumentClauseRow = {
  document_version_id: string; clause_version_id: string; position: number; condition: Json
}
export type DocumentGate =
  | "join_club" | "board_sea" | "board_shore" | "guest_board" | "crew_engage"
export type DocumentRequirementRow = { document_code: string; gate: DocumentGate }
export type CounterSignatureRow = {
  signature_id: string; signed_by: string; signer_name: string
  signer_title: string | null; signed_at: string
  signed_ip: string | null; user_agent: string | null
}
export type SignatureRow = {
  id: string; document_version_id: string
  profile_id: string | null; guest_id: string | null
  signer_name: string | null; signer_email: string | null; guardian_name: string | null
  rendered_body: string | null; rendered_hash: string
  consent_esign: boolean; consent_text: string | null
  signature_kind: "typed" | "drawn"; signature_data: string | null
  signed_at: string; signed_ip: string | null; user_agent: string | null
  redacted_at: string | null; redacted_by: string | null
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
      subscriptions: Table<SubscriptionRow, Ins<SubscriptionRow, "profile_id">>
      invoices: Table<InvoiceRow, Ins<InvoiceRow, "profile_id">>
      payment_methods: Table<PaymentMethodRow, Ins<PaymentMethodRow, "profile_id">>
      installment_plans: Table<InstallmentPlanRow, Ins<InstallmentPlanRow, "profile_id" | "total_cents" | "installments">>
      threads: Table<ThreadRow, Ins<ThreadRow, "kind">>
      thread_members: Table<ThreadMemberRow, Ins<ThreadMemberRow, "thread_id" | "profile_id">>
      messages: Table<MessageRow, Ins<MessageRow, "thread_id" | "body">>
      voyage_media: Table<VoyageMediaRow, Ins<VoyageMediaRow, "voyage_id" | "storage_path">>
      crew_requests: Table<CrewRequestRow, Ins<CrewRequestRow, "voyage_id" | "profile_id">>
      rsvp_guests: Table<RsvpGuestRow, Ins<RsvpGuestRow, "rsvp_id" | "name">>
      pass_transfers: Table<PassTransferRow, Ins<PassTransferRow, "rsvp_id" | "from_profile" | "to_profile">>
      promo_codes: Table<PromoCodeRow, Ins<PromoCodeRow, "code" | "kind">>
      push_subscriptions: Table<PushSubscriptionRow, Ins<PushSubscriptionRow, "profile_id" | "endpoint" | "p256dh" | "auth">>
      sms_outbox: Table<SmsOutboxRow, Ins<SmsOutboxRow, "to_phone" | "template">>
      sms_templates: Table<SmsTemplateRow, Ins<SmsTemplateRow, "code">>
      push_outbox: Table<PushOutboxRow, Ins<PushOutboxRow, "profile_id" | "title">>
      saved_segments: Table<SavedSegmentRow, Ins<SavedSegmentRow, "name">>
      api_keys: Table<ApiKeyRow, Ins<ApiKeyRow, "label" | "key_hash" | "prefix">>
      webhooks: Table<WebhookRow, Ins<WebhookRow, "url" | "secret">>
      webhook_deliveries: Table<WebhookDeliveryRow, Ins<WebhookDeliveryRow, "webhook_id" | "event" | "payload">>
      automations: Table<AutomationRow, Ins<AutomationRow, "name" | "trigger_event">>
      crew_roles: Table<CrewRoleRow, Ins<CrewRoleRow, "title" | "port">>
      crew_candidates: Table<CrewCandidateRow, Ins<CrewCandidateRow, "role_id" | "full_name" | "email">>
      marks: Table<MarkRow, Ins<MarkRow, "code" | "name" | "blurb" | "kind">>
      member_marks: Table<MemberMarkRow, Ins<MemberMarkRow, "profile_id" | "mark_code">>
      contests: Table<ContestRow, Ins<ContestRow, "slug" | "shape" | "title" | "metric" | "starts_at" | "ends_at">>
      contest_entries: Table<ContestEntryRow, Ins<ContestEntryRow, "contest_id" | "profile_id">>
      contest_results: Table<ContestResultRow, Ins<ContestResultRow, "contest_id" | "profile_id" | "score">>
      clauses: Table<ClauseRow, Ins<ClauseRow, "code" | "title" | "category">>
      clause_versions: Table<ClauseVersionRow, Ins<ClauseVersionRow, "clause_code" | "version" | "body">>
      documents: Table<DocumentRow, Ins<DocumentRow, "code" | "title" | "kind" | "audience">>
      document_versions: Table<DocumentVersionRow, Ins<DocumentVersionRow, "document_code" | "version">>
      document_clauses: Table<DocumentClauseRow, Ins<DocumentClauseRow, "document_version_id" | "clause_version_id" | "position">>
      document_requirements: Table<DocumentRequirementRow, Ins<DocumentRequirementRow, "document_code" | "gate">>
      signatures: Table<SignatureRow, Ins<SignatureRow, "document_version_id" | "rendered_hash" | "consent_esign" | "signature_kind">>
      counter_signatures: Table<CounterSignatureRow, Ins<CounterSignatureRow, "signature_id" | "signed_by" | "signer_name">>
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
      member_affinity: {
        Row: { profile_id: string | null; other_id: string | null; shared: number | null }
        Relationships: []
      }
      waitlist_position: {
        Row: { rsvp_id: string | null; voyage_id: string | null; profile_id: string | null; position: number | null }
        Relationships: []
      }
      member_engagement: {
        Row: {
          profile_id: string | null; passes: number | null; attended: number | null
          posts: number | null; knots: number | null; last_booked_at: string | null
        }
        Relationships: []
      }
      agreement_standing: {
        Row: {
          signature_id: string | null; profile_id: string | null
          document_code: string | null; title: string | null; kind: DocumentKind | null
          signed_at: string | null; counter_signed_at: string | null
          counter_signed_by: string | null; in_force: boolean | null
        }
        Relationships: []
      }
      member_waiver_standing: {
        Row: {
          profile_id: string | null; signed_at: string | null
          expires_at: string | null; current: boolean | null
        }
        Relationships: []
      }
      member_pass_usage: {
        Row: { profile_id: string | null; month: string | null; passes_used: number | null }
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
      open_direct_thread: { Args: { p_other: string }; Returns: string }
      accept_pass_transfer: { Args: { p_id: string }; Returns: undefined }
      check_promo: { Args: { p_code: string; p_voyage: string }; Returns: Json }
      redeem_reward: { Args: { p_reward: string }; Returns: undefined }
      claim_stripe_customer: { Args: { p_customer_id: string }; Returns: undefined }
      passage_log: {
        Args: { p_profile_id: string }
        Returns: Array<{
          sailings: number; nm_logged: number; hours_at_sea: number
          harbors_made: number; vessels_sailed: number; crew_met: number
          first_sail_at: string | null; marks_held: number
        }>
      }
      contest_standing: {
        Args: { p_contest_id: string }
        Returns: Array<{
          profile_id: string; full_name: string | null; handle: string | null
          score: number; place: number | null; met: boolean
        }>
      }
      settle_contest: { Args: { p_contest_id: string }; Returns: number }
      season_card: {
        Args: { p_profile_id: string; p_from: string; p_to: string }
        Returns: Array<{
          sailings: number; nm_logged: number; harbors: number; crew_met: number
          knots_earned: number; marks_won: string[]; longest_nm: number | null
          longest_title: string | null
        }>
      }
      render_document: { Args: { p_document_version_id: string; p_context?: Json }; Returns: string | null }
      published_version: { Args: { p_document_code: string }; Returns: string | null }
      publish_document_version: { Args: { p_id: string }; Returns: undefined }
      redact_signature: { Args: { p_id: string; p_reason?: string }; Returns: undefined }
      purge_expired_signatures: { Args: { p_years?: number }; Returns: number }
      counter_sign: { Args: { p_signature_id: string; p_title?: string | null; p_user_agent?: string | null }; Returns: string }
      send_season_cards: { Args: { p_from: string; p_to: string; p_season?: string | null }; Returns: number }
      sign_document: {
        Args: {
          p_document_code: string; p_context?: Json; p_consent?: boolean
          p_consent_text?: string | null; p_signature_kind?: string
          p_signature_data?: string | null; p_signer_name?: string | null
          p_user_agent?: string | null
        }
        Returns: string
      }
      sign_document_as_guest: {
        Args: {
          p_token: string; p_document_code: string; p_consent?: boolean
          p_consent_text?: string | null; p_signature_kind?: string
          p_signature_data?: string | null; p_signer_name?: string | null
          p_guardian_name?: string | null; p_user_agent?: string | null
        }
        Returns: string
      }
      guest_document: {
        Args: { p_token: string; p_document_code: string }
        Returns: Array<{
          guest_name: string; voyage_title: string; voyage_starts: string
          document_title: string; body: string; already_signed: boolean
        }>
      }
      signature_standing: {
        Args: { p_profile_id: string }
        Returns: Array<{
          document_code: string; title: string; kind: DocumentKind
          gates: DocumentGate[]; state: "missing" | "lapsed" | "signed"
          signed_at: string | null; expires_at: string | null
        }>
      }
      calendar_feed: {
        Args: { p_token: string }
        Returns: Array<{
          rsvp_id: string; boarding_code: string | null; guests: number
          slug: string; title: string; class: EventClass; blurb: string | null
          starts_at: string; ends_at: string | null; coordinates: string | null; muster: string | null
        }>
      }
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
