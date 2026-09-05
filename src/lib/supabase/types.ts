export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

/* Hand-maintained to mirror supabase/migrations — compact style.
   Row = full row; Insert/Update derived via Partial where safe. */

type Row<T> = T
type Ins<T, Req extends keyof T = never> = Partial<T> & Pick<T, Req>

export type MembershipTier = "regional" | "national" | "global"
export type EpisodeSetting = "sea" | "shore" | "sky"
export type EpisodeStatus = "scheduled" | "live" | "weather_hold" | "completed" | "cancelled"
export type PassStatus = "aboard" | "waitlist" | "not_going"
export type ApplicationStatus = "received" | "review" | "invited" | "aboard" | "declined"

export type ProfileRow = {
  id: string; member_no: string | null; full_name: string | null; handle: string | null
  email: string | null; tier: MembershipTier; home_city: string | null; avatar_tone: string
  is_staff: boolean; joined_at: string; status: "active" | "paused" | "departed"
  notification_prefs: Json; plan_id: string | null
  on_camera: boolean; on_manifest: boolean; camera_withdrawn_at: string | null
  /* The clock this member reads their own account on. */
  time_zone: string | null
  /* Who placed the current hold. A member may lift their own and not the
     club's, so the interface has to know which it is looking at. */
  status_set_by: string | null
  /* Why the club holds it: 'dues' lifts with a payment, the others with a word. */
  hold_reason: "dues" | "conduct" | "club" | null
  stripe_customer_id: string | null; bio: string | null; in_directory: boolean
  interests: string[]; calendar_token: string; phone: string | null; phone_verified: boolean
  /* The query string this member's /episodes view opens with — the same format
     the manifest's pills write, so a filter set has one shape in this system
     and not two. Null means show everything. */
  manifest_filters: string | null
  /* Dues waived by the Bridge until this date; the plan stands. */
  comped_until: string | null
  /* One line the member sets during Live, shown to those aboard, expiring with the night. */
  deck_status: string | null; deck_status_until: string | null
}
export type CityRow = {
  id: string; slug: string; name: string; status: string; coordinates: string | null
  launch_year: number | null; position: number
  /* IANA zone the city keeps — departures read on this clock. */
  time_zone: string
}
export type EpisodeRow = {
  id: string; slug: string; title: string; setting: EpisodeSetting; kind: string
  city_id: string | null; starts_at: string; ends_at: string | null; coordinates: string | null
  distance_nm: number | null; passes_total: number; price_cents: number; status: EpisodeStatus
  /* Places are requested and the Bridge offers them; the door never says a number. */
  by_request: boolean
  /* Passes beyond the ceiling that board only into a seat a no-show frees. */
  standby_passes: number
  age_line: string | null
  /* The second taxonomy axis. `setting` says WHERE (afloat or ashore); this says
     WHAT KIND — open | club | premium | exotic, NOT NULL. A series DEFAULTS it:
     an_episode_keeps_its_taxonomy fills this from the series only when the
     episode left it null, so one strand may run at more than one class and the
     unfiled episode still leaves with one. Widened to string rather than the
     union in brand.ts, the way `kind` is — the enum lives there, and the row
     type mirrors the column. */
  experience_class: string
  blurb: string | null; description: string | null; media: string; min_tier: MembershipTier
  created_at: string; deposit_required: boolean; muster: string | null; conditions: Json | null
  knots_multiplier: number; held_passes: number
  /* The duration ladder. episodes_sub_class_check admits these three only —
     trek, excursion and overland went with the two-axis taxonomy, and voyage
     became passage when the last retired noun left the schema. */
  sub_class: "passage" | "expedition" | "odyssey" | null
  itinerary: Json
  /* The city's IANA clock, carried on the episode. */
  time_zone: string
  series: string | null
  deposit_cents: number
  sale_opens_at: string | null
  presale_hours: number
  season_id: string | null
  venue_id: string | null
  /* The edition (series in one city) this episode is an occurrence of. */
  edition_id: string | null
  /* A flotilla's certified heads; null reads the club setting. */
  hull_ceiling_heads: number | null
  /* Vessel, authority and certified number — required above the club figure. */
  hull_certificate: string | null
}
export type SeasonRow = {
  id: string; slug: string; title: string; starts_on: string; ends_on: string
  blurb: string | null; active: boolean; created_at: string
  /* A season belongs to a city, not to the club — Miami can be in its
     second while Chicago is in its first. Null is a club-wide season. */
  city_id: string | null
}
export type VenueRow = {
  id: string; slug: string; name: string; city_id: string | null
  kind: "marina" | "club" | "restaurant" | "beach" | "pool" | "partner"
  address: string | null; notes: string | null; active: boolean; created_at: string
  /* Step-free, lift, quiet room — what an access need wants to know before booking. */
  access_note: string | null
}
/* An edition: one series running in one city, with its own cadence. Sandbar
   Social Miami and Sandbar Social LA are two rows here and one series.
   template_episode_id is nullable because an edition must be nameable before
   its first episode exists. */
export type EditionRow = {
  id: string; slug: string; title: string; cadence_days: number
  template_episode_id: string | null; active: boolean; created_at: string
  city_id: string | null; series: string | null
}
export type MemberEventProposalRow = {
  id: string; proposer_id: string; title: string; series: string | null
  note: string | null; proposed_for: string | null
  status: "submitted" | "considering" | "approved" | "declined"
  decided_by: string | null; decided_at: string | null; decision_note: string | null
  created_at: string
  episode_id: string | null
}
export type SponsorRow = {
  id: string; name: string
  tier: "presenting_partner" | "sandbar_hub" | "confessional_pod" | "shore_leave_partner"
  monthly_cents: number; contact_email: string | null
  starts_on: string | null; ends_on: string | null; notes: string | null
  active: boolean; created_at: string; created_by: string | null
}
export type EpisodeSponsorRow = {
  episode_id: string; sponsor_id: string; placement: string | null; created_at: string
  assets_delivered: string[]
}
export type ClubSettingRow = { key: string; value_int: number; note: string | null }
export type SegmentRow = { slug: string; label: string; heads: number }
export type SponsorTierRow = { slug: string; label: string; position: number; rate_cents: number; assets: string[] }
export type LeagueRow = { league: number; name: string; months: number }
export type StripeEventRow = {
  id: string; type: string; created: string; received_at: string
  /* The id the ledger records for this event, and the money it moved — what
     the reconciliation joins on. Null on rows received before they were kept. */
  object_id: string | null; amount_cents: number | null
  /* Seen is not done. Null on a row whose handler never finished. */
  processed_at: string | null
}
export type AuditLogRow = {
  id: number; table_name: string; row_id: string | null; action: "INSERT" | "UPDATE" | "DELETE"
  actor_id: string | null; before: Json | null; after: Json | null; at: string
}
export type CharterRequestRow = {
  id: string; profile_id: string; series: string | null; party_size: number | null
  preferred_dates: string | null; note: string | null
  status: "submitted" | "answered" | "declined"
  decided_by: string | null; decided_at: string | null; decision_note: string | null; created_at: string
}
export type AppErrorRow = {
  id: number; at: string; deployment: string | null; name: string | null; message: string
  digest: string | null; method: string | null; path: string | null; route: string | null; kind: string | null
}
export type EpisodeDaybedRow = {
  id: string; episode_id: string; rsvp_id: string; profile_id: string; created_at: string
}
export type TableRow = {
  id: string; episode_id: string; number: number; seats: number
}
export type TableSeatRow = {
  table_id: string; profile_id: string; state: "held" | "confirmed"
  held_until: string; created_at: string
}
export type TablePickRow = { table_id: string; picker: string; picked: string; created_at: string; again: boolean }
export type MatchRow = {
  id: string; table_id: string; profile_a: string; profile_b: string; created_at: string
}
export type CabinRow = {
  id: string; vessel_id: string; name: string; sleeps: number
  premium_cents: number; position: number; active: boolean
}
export type EpisodeCutRow = {
  id: string; episode_id: string | null; number: number; slug: string
  title: string; dek: string | null; state: "draft" | "published"; aired_at: string | null
}
export type PassRow = {
  id: string; episode_id: string; profile_id: string; status: PassStatus; guests: number
  created_at: string; checked_in_at: string | null; checked_in_by: string | null
  boarding_code: string | null; show_on_manifest: boolean; vessel_id: string | null
  comp: boolean; guest_names: string[]; promo_code: string | null; auto_claim: boolean
  cabin_id: string | null
  /* Stands outside the count; becomes a seat at the gangway if one is free. */
  standby: boolean
  /* When the code on the pass actually bit; null when it was spent before the claim. */
  promo_claimed_at: string | null
  /* A comp given on a sponsor's account. */
  sponsor_id: string | null
}
export type MembershipPlanRow = {
  id: string; plan_type: "access" | "regional" | "national" | "global" | "guest"
  tier: number; label: string; price_cents: number; events_per_month: number
  class_ceiling: "passage" | "expedition" | "odyssey" | null; active: boolean; early_days: number
  stripe_price_id: string | null; stripe_price_id_annual: string | null; annual_price_cents: number | null
  /* The club_products row this plan sells as; the membership cap counts by it. */
  product_slug: string | null; published: boolean
  /* Model C, 2026-09-02: the value of a paid tier is a monthly credit against
     passes, not an allowance of them. events_per_month is 0 on every live plan
     and this is what a member is buying — the column existed for eight days
     before anything read it. */
  monthly_credit_cents: number
  /* Named guests a pass on this plan may carry; the guard and the FAQ read it. */
  guest_allowance: number
}
export type VesselRow = {
  id: string; name: string; capacity: number; home_city: string | null; active: boolean
  length_ft: number | null; year: number | null; cabins: number | null
  /* Charter cost per day, for the P&L. Null until the contract says. */
  day_rate_cents: number | null
}
export type EpisodeVesselRow = { episode_id: string; vessel_id: string; position: number }
export type KnotsRow = {
  id: string; profile_id: string; delta: number; reason: string; episode_id: string | null; created_at: string
}
export type OpenDeckPostRow = {
  id: string; author_id: string | null; author_name: string | null; body: string
  episode_id: string | null; created_at: string
}
export type OpenDeckHailRow = { post_id: string; profile_id: string; created_at: string }
export type OpenDeckCommentRow = {
  id: string; post_id: string; author_id: string | null; author_name: string | null; body: string; created_at: string
}
export type OpenDeckFlagRow = {
  id: string; post_id: string; flagger_id: string; reason: string
  status: "open" | "removed" | "left_up"; resolved_by: string | null; created_at: string
}
export type LogPostRow = {
  id: string; slug: string; title: string; dek: string | null; body: string | null
  tag: string | null; published_at: string
}
export type ApplicationRow = {
  id: string; email: string; full_name: string; city: string | null; referral: string | null
  note: string | null; status: ApplicationStatus; created_at: string; interests: string[]
  tier_requested: MembershipTier; invite_code: string | null; waiver_swim: boolean
  waiver_conduct: boolean; reviewed_by: string | null; decided_at: string | null
  /* Answers keyed by application_questions.key; the proposer in the applicant's words. */
  answers: Json; proposer: string | null
}
export type NotificationRow = {
  id: string; profile_id: string; kind: string; title: string; body: string | null
  read: boolean; created_at: string
  /* The episode a Word is about, when it is about one — the idempotency key
     for the day-of Words since series occurrences share a title. */
  episode_id: string | null
  /* Where the notice goes when tapped. Derived from kind when the writer set none. */
  href: string | null
}
export type MemberRollRow = {
  email: string; tier: MembershipTier; home_city: string | null; source: string
  invite_code: string | null; approved_by: string | null; created_at: string
}
export type InviteRow = {
  code: string; inviter_id: string; max_uses: number; uses: number; created_at: string
}
export type AccountLedgerRow = {
  id: string; profile_id: string; delta_cents: number; kind: string; memo: string | null
  episode_id: string | null; rsvp_id: string | null; created_by: string | null; created_at: string
  /* Names the external event this row settles. Unique when present, so a
     repeated webhook delivery cannot post the same money twice. */
  idem_key: string | null
  /* WHICH Stripe object this row is — payment intent, invoice or charge. A
     refund is issued against the intent, so before this existed the only trace
     of a settlement was a session id inside a memo, and a memo is not a key.
     It is also what reconciliation matches on. */
  stripe_ref: string | null
  /* WHEN the club delivers what this row charges for — the episode night, or
     the dues period. created_at is when it was billed; the gap between the two
     is deferred revenue. Null means delivered on the spot, so earned when
     billed: a bar tab, a shop order. */
  service_date: string | null
  /* Tax included in delta_cents, if any. Zero means untaxed, NOT tax-free —
     city_tax says whether a treatment has been determined at all. */
  tax_cents: number
}
export type AddonRow = { id: string; slug: string; name: string; price_cents: number; active: boolean }
export type PassAddonRow = { rsvp_id: string; addon_id: string; qty: number }
export type RewardRow = {
  id: string; name: string; detail: string | null; cost_fm: number
  active: boolean; position: number; stock: number | null
}
export type RewardRedemptionRow = { id: string; profile_id: string; reward_id: string; created_at: string }
export type EmailOutboxRow = {
  id: string; to_email: string; template: string; payload: Json
  /* "sending" was missing from all three of these while claim() has written it
     since the drains were written — a row in flight was a state the type system
     said could not exist, so no screen could be built to show one. */
  status: "pending" | "sending" | "sent" | "skipped" | "failed"; created_at: string; sent_at: string | null
  claimed_at: string | null
  attempts: number | null; next_attempt_at: string | null; last_error: string | null
}
export type GalleyItemRow = {
  id: string; category: "bar" | "galley" | "merch"; name: string; price_cents: number; active: boolean
}
export type GalleyOrderRow = {
  id: string; profile_id: string; episode_id: string | null; source: "self" | "pos"
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
export type CrewStage = "applied" | "interview" | "sea_trial" | "offer" | "passed"
export type CrewRoleRow = {
  id: string; title: string; city: string; meta: string | null; blurb: string | null
  open: boolean; position: number
  /* A posting rather than a listing line: the public page reads this table now
     rather than carrying its own copy of it, so a role that opens or closes
     does not need a deploy. */
  slug: string; dept: string | null; employment: string | null; remote: boolean
  body: string | null
  responsibilities: string[]; requirements: string[]; nice_to_have: string[]
  /* Prose, never a number range — see the column comment. */
  comp: string | null
  process: string[]; posted_at: string
}
export type CrewCandidateRow = {
  id: string; role_id: string; full_name: string; email: string; note: string | null
  stage: CrewStage; created_at: string
  phone: string | null; links: string | null; source: string | null
  /* A link, not a file. See the column comment: an anonymous upload endpoint is
     a different risk from an anonymous row insert. */
  cv_url: string | null
  reviewed_by: string | null; decided_at: string | null; rejected_reason: string | null
}
/* One of the club's own people. profile_id is NULLABLE on purpose: a contracted
   deckhand may never hold a membership, and a rota that can only schedule
   account-holders is a rota kept in a spreadsheet instead.

   `public` is opt-in and defaults false — being scheduled is a job, being shown
   to members with your name and face is a separate thing to agree to. */
export type CrewRow = {
  id: string; profile_id: string | null; slug: string; display_name: string
  role_title: string; city: string | null; bio: string | null; avatar_tone: string
  public: boolean; active: boolean; since: string | null; position: number; created_at: string
}
/* What a city's tax treatment IS, once somebody qualified has determined it.
   A NULL rate means undetermined; zero means determined to be untaxed. Nothing
   here is defaulted and nothing should be guessed — Florida taxes admissions,
   California generally does not, so the cities differ in kind and not degree. */
export type BroadcastRow = {
  id: string; sent_by: string | null; audience: Json; title: string; body: string
  channels: string[]; recipients: number; created_at: string
  send_at: string | null; status: "queued" | "sent"
}
export type CityTaxRow = {
  city_id: string; admissions_rate_bp: number | null; goods_rate_bp: number | null
  registered: boolean; note: string | null
  determined_by: string | null; determined_on: string | null; updated_at: string
}
export type ExpenseKindRow = { slug: string; label: string; position: number }
/* An estimate and a settled invoice are different facts, and a P&L that mixes
   them silently is why nobody trusts one. */
export type EpisodeExpenseRow = {
  id: string; episode_id: string; kind: string; amount_cents: number
  note: string | null; settled: boolean; created_by: string | null; created_at: string
}
export type CrewPositionRow = {
  slug: string; label: string; setting: "sea" | "shore" | null; position: number
}
/* Offered, not assigned: a name in a box nobody acknowledged is not cover, and
   only `confirmed` counts against a need or renders to a member. */
export type CrewAssignmentRow = {
  id: string; episode_id: string; crew_id: string; position_slug: string
  call_time: string | null
  status: "offered" | "confirmed" | "declined" | "released"
  assigned_by: string | null; note: string | null; created_at: string
}
/* When somebody cannot work, never when they can — availability calendars are
   what rota systems drown in. */
export type CrewBlackoutRow = {
  id: string; crew_id: string; from_date: string; to_date: string
  note: string | null; created_at: string
}
export type CrewNeedRow = { setting: "sea" | "shore"; position_slug: string; headcount: number }
export type EpisodeCrewNeedRow = { episode_id: string; position_slug: string; headcount: number }
/* The only thing a rota is for: which nights are short, and how soon. */
export type EpisodeCrewGapRow = {
  episode_id: string; slug: string; title: string; starts_at: string; setting: string
  position_slug: string; position_label: string; position_order: number
  needed: number; confirmed: number; offered: number; short: number
}

/* Append-only. No update grant, no update policy: a rejection reason that can
   be rewritten after the fact is not a record. */
export type CrewCandidateEventRow = {
  id: string; candidate_id: string; at: string; actor: string | null
  kind: "applied" | "stage" | "note" | "email" | "decision"
  from_stage: string | null; to_stage: string | null; body: string | null
}

export type SubscriptionStatus = "incomplete" | "trialing" | "active" | "past_due" | "paused" | "canceled"
export type SubscriptionRow = {
  id: string; profile_id: string; plan_id: string | null; stripe_subscription_id: string | null
  status: SubscriptionStatus; interval: "month" | "year"; current_period_end: string | null
  cancel_at_period_end: boolean; created_at: string; updated_at: string
  /* When the current lapse began; null unless past_due. The dunning ladder keys on it. */
  past_due_since: string | null
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
  id: string; kind: "crew" | "direct" | "shoreside"; episode_id: string | null
  title: string | null; closed_at: string | null; created_at: string
}
export type ThreadMemberRow = { thread_id: string; profile_id: string; last_read_at: string | null; joined_at: string }
export type MessageRow = {
  id: string; thread_id: string; author_id: string | null; body: string; created_at: string
}
export type EpisodeMediaRow = {
  id: string; episode_id: string; storage_path: string; caption: string | null
  uploaded_by: string | null; approved: boolean; created_at: string
}
export type CrewRequestRow = {
  id: string; episode_id: string; profile_id: string; note: string | null; open: boolean; created_at: string
}
export type PassGuestRow = {
  id: string; rsvp_id: string; name: string; boarding_code: string | null
  checked_in_at: string | null; checked_in_by: string | null; created_at: string
  sign_token: string; on_camera: boolean
  /* 'partner' is a couple pass's own second head; 'guest' a companion. */
  kind: "guest" | "partner"
}
export type PassTransferRow = {
  id: string; rsvp_id: string; from_profile: string; to_profile: string
  status: "offered" | "accepted" | "declined" | "cancelled" | "void"; created_at: string; responded_at: string | null
}
export type PromoCodeRow = {
  code: string; kind: "percent" | "amount" | "comp"; value: number; episode_id: string | null
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
  /* "sending" was missing from all three of these while claim() has written it
     since the drains were written — a row in flight was a state the type system
     said could not exist, so no screen could be built to show one. */
  status: "pending" | "sending" | "sent" | "skipped" | "failed"; created_at: string; sent_at: string | null
  claimed_at: string | null
  attempts: number | null; next_attempt_at: string | null; last_error: string | null
}
export type PushOutboxRow = {
  id: string; profile_id: string; title: string; body: string | null; url: string | null
  /* "sending" was missing from all three of these while claim() has written it
     since the drains were written — a row in flight was a state the type system
     said could not exist, so no screen could be built to show one. */
  status: "pending" | "sending" | "sent" | "skipped" | "failed"; created_at: string; sent_at: string | null
  /* The retry ledger the drains write: how many tries, when the next one is
     due, when the row was claimed, and why it last gave up. */
  attempts: number | null; next_attempt_at: string | null; claimed_at: string | null; last_error: string | null
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
  /* Minutes the rule waits before acting; 0 fires on the event. */
  delay_minutes: number
}
export type AutomationQueueRow = {
  id: string; automation_id: string; profile_id: string | null; episode_id: string | null
  payload: Json; run_at: string; done_at: string | null; created_at: string
}
export type DoorGrantRow = {
  id: string; profile_id: string; episode_id: string; granted_by: string | null; expires_at: string; created_at: string
}
export type ApplicationQuestionRow = {
  key: string; prompt: string; kind: "text" | "long" | "choice"; options: Json | null
  required: boolean; active: boolean; position: number
}
export type DebriefRow = {
  id: string; episode_id: string; profile_id: string; note: string | null; again: boolean | null; created_at: string
}
export type PollRow = {
  id: string; question: string; options: Json; closes_at: string; settled: number | null
  created_by: string | null; created_at: string
}
export type PollVoteRow = { poll_id: string; profile_id: string; option: number; created_at: string }
export type WalletTokenRow = { token: string; profile_id: string; issued_at: string; revoked_at: string | null; touched_at: string }
export type WalletRegistrationRow = { device_id: string; pass_type: string; serial: string; push_token: string; created_at: string }


/* ===== The logbook: marks, the Knots sink, and contests ===================== */

export type MarkRow = {
  code: string; name: string; blurb: string
  kind: "first" | "collection" | "tally"; position: number; active: boolean
}
export type MemberMarkRow = { profile_id: string; mark_code: string; conferred_at: string }
export type ContestShape = "regatta" | "challenge"
export type ContestMetric = "nm" | "episodes" | "cities" | "vessels" | "crew_met" | "frames"
export type ContestRow = {
  id: string; slug: string; shape: ContestShape; scope: "member" | "crew"
  title: string; blurb: string | null; metric: ContestMetric; target: number | null
  prize: string | null; knots_award: number
  starts_at: string; ends_at: string; status: "draft" | "open" | "settled"
  episode_id: string | null; settled_at: string | null; created_at: string
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
      cities: Table<CityRow, Ins<CityRow, "slug" | "name">>
      episodes: Table<EpisodeRow, Ins<EpisodeRow, "slug" | "title" | "setting" | "starts_at">>
      seasons: Table<SeasonRow, Ins<SeasonRow, "slug" | "title" | "starts_on" | "ends_on">>
      venues: Table<VenueRow, Ins<VenueRow, "slug" | "name">>
      /* template_episode_id left the required set when it dropped NOT NULL: an
         edition has to be nameable before its first episode is scheduled. */
      editions: Table<EditionRow, Ins<EditionRow, "slug" | "title">>
      member_event_proposals: Table<MemberEventProposalRow, Ins<MemberEventProposalRow, "proposer_id" | "title">>
      sponsors: Table<SponsorRow, Ins<SponsorRow, "name" | "tier" | "monthly_cents">>
      episode_sponsors: Table<EpisodeSponsorRow, Ins<EpisodeSponsorRow, "episode_id" | "sponsor_id">>
      episode_daybeds: Table<EpisodeDaybedRow, Ins<EpisodeDaybedRow, "episode_id" | "rsvp_id" | "profile_id">>
      club_settings: Table<ClubSettingRow, Ins<ClubSettingRow, "key" | "value_int">>
      segments: Table<SegmentRow, Ins<SegmentRow, "slug" | "label" | "heads">>
      sponsor_tiers: Table<SponsorTierRow, Ins<SponsorTierRow, "slug" | "label" | "position" | "rate_cents">>
      leagues: Table<LeagueRow, Ins<LeagueRow, "league" | "name" | "months">>
      stripe_events: Table<StripeEventRow, Ins<StripeEventRow, "id" | "type" | "created">>
      audit_log: Table<AuditLogRow, Ins<AuditLogRow, "table_name" | "action">>
      charter_requests: Table<CharterRequestRow, Ins<CharterRequestRow, "profile_id">>
      app_errors: Table<AppErrorRow, Ins<AppErrorRow, "message">>
      passes: Table<PassRow, Ins<PassRow, "episode_id" | "profile_id">>
      cabins: Table<CabinRow, Ins<CabinRow, "vessel_id" | "name">>
      episode_cuts: Table<EpisodeCutRow, Ins<EpisodeCutRow, "number" | "slug" | "title">>
      tables: Table<TableRow, Ins<TableRow, "episode_id" | "number">>
      table_seats: Table<TableSeatRow, Ins<TableSeatRow, "table_id" | "profile_id">>
      table_picks: Table<TablePickRow, Ins<TablePickRow, "table_id" | "picker" | "picked">>
      matches: Table<MatchRow, Ins<MatchRow, "table_id" | "profile_a" | "profile_b">>
      knots_ledger: Table<KnotsRow, Ins<KnotsRow, "profile_id" | "delta" | "reason">>
      open_deck_posts: Table<OpenDeckPostRow, Ins<OpenDeckPostRow, "body">>
      open_deck_hails: Table<OpenDeckHailRow, Ins<OpenDeckHailRow, "post_id" | "profile_id">>
      open_deck_comments: Table<OpenDeckCommentRow, Ins<OpenDeckCommentRow, "post_id" | "body">>
      open_deck_flags: Table<OpenDeckFlagRow, Ins<OpenDeckFlagRow, "post_id" | "flagger_id" | "reason">>
      log_posts: Table<LogPostRow, Ins<LogPostRow, "slug" | "title">>
      applications: Table<ApplicationRow, Ins<ApplicationRow, "email" | "full_name">>
      notifications: Table<NotificationRow, Ins<NotificationRow, "profile_id" | "title">>
      member_roll: Table<MemberRollRow, Ins<MemberRollRow, "email">>
      invites: Table<InviteRow, Ins<InviteRow, "code" | "inviter_id">>
      account_ledger: Table<AccountLedgerRow, Ins<AccountLedgerRow, "profile_id" | "delta_cents" | "kind">>
      addons: Table<AddonRow, Ins<AddonRow, "slug" | "name" | "price_cents">>
      pass_addons: Table<PassAddonRow, Ins<PassAddonRow, "rsvp_id" | "addon_id">>
      rewards: Table<RewardRow, Ins<RewardRow, "name" | "cost_fm">>
      reward_redemptions: Table<RewardRedemptionRow, Ins<RewardRedemptionRow, "profile_id" | "reward_id">>
      email_outbox: Table<EmailOutboxRow, Ins<EmailOutboxRow, "to_email" | "template">>
      membership_plans: Table<MembershipPlanRow, Ins<MembershipPlanRow, "plan_type" | "tier" | "label" | "price_cents">>
      vessels: Table<VesselRow, Ins<VesselRow, "name">>
      episode_vessels: Table<EpisodeVesselRow, Ins<EpisodeVesselRow, "episode_id" | "vessel_id">>
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
      episode_media: Table<EpisodeMediaRow, Ins<EpisodeMediaRow, "episode_id" | "storage_path">>
      crew_requests: Table<CrewRequestRow, Ins<CrewRequestRow, "episode_id" | "profile_id">>
      pass_guests: Table<PassGuestRow, Ins<PassGuestRow, "rsvp_id" | "name">>
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
      crew_roles: Table<CrewRoleRow, Ins<CrewRoleRow, "title" | "city">>
      crew_candidates: Table<CrewCandidateRow, Ins<CrewCandidateRow, "role_id" | "full_name" | "email">>
      crew_candidate_events: Table<CrewCandidateEventRow, Ins<CrewCandidateEventRow, "candidate_id" | "kind">>
      crew: Table<CrewRow, Ins<CrewRow, "slug" | "display_name" | "role_title">>
      crew_positions: Table<CrewPositionRow, Ins<CrewPositionRow, "slug" | "label">>
      broadcasts: Table<BroadcastRow, Ins<BroadcastRow, "audience" | "title" | "body" | "channels">>
      automation_queue: Table<AutomationQueueRow, Ins<AutomationQueueRow, "automation_id" | "run_at">>
      door_grants: Table<DoorGrantRow, Ins<DoorGrantRow, "profile_id" | "episode_id" | "expires_at">>
      application_questions: Table<ApplicationQuestionRow, Ins<ApplicationQuestionRow, "key" | "prompt">>
      debriefs: Table<DebriefRow, Ins<DebriefRow, "episode_id" | "profile_id">>
      polls: Table<PollRow, Ins<PollRow, "question" | "options" | "closes_at">>
      poll_votes: Table<PollVoteRow, Ins<PollVoteRow, "poll_id" | "profile_id" | "option">>
      wallet_tokens: Table<WalletTokenRow, Ins<WalletTokenRow, "profile_id">>
      wallet_registrations: Table<WalletRegistrationRow, Ins<WalletRegistrationRow, "device_id" | "pass_type" | "serial" | "push_token">>
      city_tax: Table<CityTaxRow, Ins<CityTaxRow, "city_id">>
      expense_kinds: Table<ExpenseKindRow, Ins<ExpenseKindRow, "slug" | "label">>
      episode_expenses: Table<EpisodeExpenseRow, Ins<EpisodeExpenseRow, "episode_id" | "kind" | "amount_cents">>
      crew_assignments: Table<CrewAssignmentRow, Ins<CrewAssignmentRow, "episode_id" | "crew_id" | "position_slug">>
      crew_blackouts: Table<CrewBlackoutRow, Ins<CrewBlackoutRow, "crew_id" | "from_date" | "to_date">>
      crew_needs: Table<CrewNeedRow, Ins<CrewNeedRow, "setting" | "position_slug" | "headcount">>
      episode_crew_needs: Table<EpisodeCrewNeedRow, Ins<EpisodeCrewNeedRow, "episode_id" | "position_slug" | "headcount">>
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
      membership_cohorts: {
        Row: { cohort: string | null; joined: number | null; active_now: number | null; lapsed: number | null; paused: number | null; departed: number | null }
        Relationships: []
      }
      application_funnel: { Row: { stage: string | null; applicants: number | null; this_year: number | null }; Relationships: [] }
      member_value: {
        Row: { profile_id: string | null; dues_cents: number | null; spend_cents: number | null; first_charge: string | null; last_charge: string | null }
        Relationships: []
      }
      poll_tallies: { Row: { poll_id: string | null; option: number | null; votes: number | null }; Relationships: [] }
      /* What one member may see of another. Deliberately narrower than the
         profiles row: no email, phone, calendar_token, stripe id or plan. */
      member_directory: {
        Row: {
          /* id is NOT NULL on the table beneath, so it is not null here. */
          id: string; member_no: string | null; full_name: string | null
          handle: string | null; tier: "regional" | "national" | "global" | null
          home_city: string | null; avatar_tone: string | null; is_staff: boolean | null
          joined_at: string | null; status: string | null; bio: string | null
          in_directory: boolean | null; interests: string[] | null; on_camera: boolean | null
        }
        Relationships: []
      }
      episode_capacity: {
        Row: {
          episode_id: string | null; passes_total: number | null; aboard: number | null
          waitlisted: number | null; passes_left: number | null
        }
        Relationships: []
      }
      knots_balance: {
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
        Row: { rsvp_id: string | null; episode_id: string | null; profile_id: string | null; position: number | null }
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
      /* Revenue and cost per episode. `costed` says whether anybody has
         recorded a cost at all — an uncosted night has zero cost and therefore
         a hundred per cent margin, the most misleading number this schema can
         produce. Never render a margin where costed is false. */
      episode_pnl: {
        Row: {
          episode_id: string | null; slug: string | null; title: string | null
          starts_at: string | null; setting: string | null; series: string | null
          revenue_cents: number | null; cost_cents: number | null
          unsettled_cents: number | null; margin_cents: number | null
          costed: boolean | null
        }
        Relationships: []
      }
      /* Memberships held because dues stopped clearing — involuntary, and so
         recoverable. Distinct from a member's own pause, which carries no
         hold_reason, and from a departure, which was a decision. */
      lapsed_members: {
        Row: {
          profile_id: string | null; full_name: string | null; email: string | null
          tier: string | null; held_since: string | null; days_held: number | null
          plan_label: string | null; was_paying_cents: number | null
          knots: number | null; written_to: boolean | null
        }
        Relationships: []
      }
      /* Exceptions only, both directions. A reconciliation that lists
         everything reconciles nothing — the eye slides off it. */
      stripe_reconciliation: {
        Row: {
          issue: string | null; stripe_id: string | null; detail: string | null
          at: string | null; profile_id: string | null; delta_cents: number | null
        }
        Relationships: []
      }
      /* security_invoker, so row-level security still applies to whoever reads
         it — crew_needs has no anon policy, which makes the view empty for a
         signed-out reader by construction rather than by a filter. */
      episode_crew_gaps: {
        Row: EpisodeCrewGapRow
        Relationships: []
      }
      /* A member's own history with the crew. security_invoker plus the passes
         policy means it shows each member theirs and nobody else's, with no
         filter in the query that reads it. */
      member_crew_history: {
        Row: {
          profile_id: string | null; crew_id: string | null
          together: number | null; last_together: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      is_staff: { Args: Record<string, never>; Returns: boolean }
      /* Whether the caller's own membership is in good standing. voiceWith()
         asks this on an RLS refusal rather than assuming a hold. */
      is_active: { Args: Record<string, never>; Returns: boolean }
      take_a_producer_turn: { Args: Record<string, never>; Returns: number }
      email_may_board: { Args: { p_email: string; p_fingerprint?: string | null }; Returns: boolean }
      set_manifest_visibility: { Args: { p_on: boolean }; Returns: undefined }
      settle_galley_ticket: {
        Args: {
          p_profile: string
          p_lines: Array<{ itemId: string; qty: number }>
          p_tender: "account" | "till"
          p_idem_key?: string
        }
        Returns: string
      }
      validate_invite: { Args: { p_code: string }; Returns: boolean }
      extend_the_series: { Args: { p_series: string; p_count: number }; Returns: number }
      decide_a_proposal: {
        Args: { p_id: string; p_status: "considering" | "approved" | "declined"; p_note?: string | null }
        Returns: undefined
      }
      claim_a_daybed: { Args: { p_pass: string }; Returns: undefined }
      export_my_data: { Args: Record<string, never>; Returns: Json }
      requeue_outbox_row: { Args: { p_table: "email_outbox" | "sms_outbox" | "push_outbox"; p_id: string }; Returns: undefined }
      assign_vessels_evenly: { Args: { p_episode: string }; Returns: number }
      club_setting: { Args: { p_key: string }; Returns: number }
      /* Days this member has held their OWN membership paused in a rolling
         year. Refuses a profile that is not yours unless you are staff, so it
         cannot be asked on anyone else's behalf. */
      membership_pause_days_used: { Args: { p_profile: string }; Returns: number }
      /* This month's unspent plan credit, in cents. Granted to authenticated
         since 2026-09-02 and unreachable from here until it was typed. */
      pass_credit_left: { Args: { p_profile_id?: string | null }; Returns: number }
      /* How many an audience reaches, and a few names (staff). */
      broadcast_audience_preview: { Args: { p_audience: Json }; Returns: Json }
      /* One word to a chosen audience; returns how many it reached. */
      send_broadcast: {
        Args: { p_audience: Json; p_title: string; p_body: string; p_channels: string[]; p_send_at?: string | null }
        Returns: number
      }
      is_door: { Args: { p_episode?: string | null }; Returns: boolean }
      door_manifest: {
        Args: { p_episode: string }
        Returns: Array<{ pass_id: string; profile_id: string; full_name: string | null; member_no: string | null; waiver_current: boolean }>
      }
      aboard_now: {
        Args: { p_episode: string }
        Returns: Array<{ profile_id: string; name: string | null; avatar_tone: string | null; status: string | null; checked_in_at: string }>
      }
      cast_vote: { Args: { p_poll: string; p_option: number }; Returns: undefined }
      poll_results: { Args: { p_poll: string }; Returns: Array<{ option: number; votes: number }> }
      passes_left: { Args: { p_episode: string; p_except_pass?: string | null }; Returns: number }
      scheduler_health: {
        Args: { p_limit?: number }
        Returns: Array<{ id: number; status_code: number | null; timed_out: boolean | null; error_msg: string | null; created: string; body: string | null }>
      }
      comp_a_pass_for_sponsor: { Args: { p_episode: string; p_sponsor: string; p_profile: string }; Returns: string }
      sponsor_credits: { Args: { p_episode: string }; Returns: Array<{ name: string; tier: string }> }
      attach_addons: {
        Args: { p_pass: string; p_addons: string[]; p_qty: number }
        Returns: number
      }
      /* Hand-added after 20260901151953 — regenerate types to fold in. */
      verify_member_phone: {
        Args: { p_profile: string }
        Returns: undefined
      }
      open_shoreside_thread: {
        Args: Record<string, never>
        Returns: string
      }
      apply_with_invite: {
        Args: { p_full_name: string; p_email: string; p_city: string; p_note: string; p_code: string; p_answers?: Json; p_proposer?: string | null }
        Returns: string
      }
      shares_ground_with: { Args: { p_other: string }; Returns: boolean }
      offer_this_place: { Args: { p_entry: string }; Returns: string }
      issue_wallet_token: { Args: Record<string, never>; Returns: WalletTokenRow[] }
      revoke_wallet_token: { Args: Record<string, never>; Returns: undefined }
      /* 2026-09-05: the Bridge's by-hand path into the dispatcher, one search
         across the console, and a letter sent to the operator's own address. */
      run_automation_now: {
        Args: { p_only: string; p_profile_id?: string | null; p_episode_id?: string | null }
        Returns: number
      }
      bridge_search: {
        Args: { p_q: string }
        Returns: Array<{ kind: string; id: string; title: string; subtitle: string; href: string }>
      }
      send_letter_to_me: {
        Args: { p_code: string }
        Returns: string
      }
      verify_wallet_token: {
        Args: { p_token: string }
        Returns: Array<{ state: string; profile_id: string | null; full_name: string | null; member_no: string | null; standing: string | null }>
      }
      application_status_for: {
        Args: { p_email: string; p_fingerprint?: string | null }
        Returns: ApplicationStatus | null
      }
      set_application_status: { Args: { p_id: string; p_status: ApplicationStatus }; Returns: undefined }
      accept_application: { Args: { p_id: string }; Returns: undefined }
      open_direct_thread: { Args: { p_other: string }; Returns: string }
      accept_pass_transfer: { Args: { p_id: string }; Returns: undefined }
      check_promo: { Args: { p_code: string; p_episode: string }; Returns: Json }
      redeem_reward: { Args: { p_reward: string }; Returns: undefined }
      claim_stripe_customer: { Args: { p_customer_id: string }; Returns: undefined }
      claim_table_seat: { Args: { p_table: string }; Returns: string }
      confirm_table_seat: { Args: { p_table: string }; Returns: undefined }
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
      place_shop_order: {
        Args: {
          p_lines: Json
          /* Minted once per crate by the client and re-sent unchanged on every
             retry, so a crate that was charged and answered into a dead
             connection is recognised rather than charged again. */
          p_idem_key?: string
        }
        Returns: string
      }
      set_own_standing: { Args: { p_status: string }; Returns: null }
      /* Issues the caller a new season-feed token and kills the old address —
         the only path past the calendar_token guard. Returns the new token; the
         page re-reads the profile anyway. */
      rotate_calendar_token: { Args: Record<string, never>; Returns: string }
      shared_episodes: { Args: { p_other: string }; Returns: Array<{ episode_id: string }> }
      adjust_knots: {
        Args: { p_profile: string; p_delta: number; p_reason: string }
        Returns: null
      }
      notify_member: {
        Args: { p_profile: string; p_kind: string; p_title: string; p_body: string }
        Returns: string
      }
      queue_email: {
        Args: { p_to: string; p_template: string; p_payload?: Json }
        Returns: string
      }
      season_card: {
        Args: { p_profile_id: string; p_from: string; p_to: string }
        Returns: Array<{
          sailings: number; nm_logged: number; cities: number; crew_met: number
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
          p_guardian_name?: string | null; p_user_agent?: string | null; p_on_camera: boolean }
        Returns: string
      }
      guest_document: {
        Args: { p_token: string; p_document_code: string }
        Returns: Array<{
          guest_name: string; voyage_title: string; voyage_starts: string
          voyage_time_zone: string
          document_title: string; body: string; already_signed: boolean
          voyage_state: string
          /* The night card (2026-09-05): the guest's own code once signed, the
             muster, who booked them, the venue's name, and what to wear. */
          guest_code: string | null; muster: string; host_first: string | null
          venue_name: string | null; dress_line: string
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
          slug: string; title: string; setting: EpisodeSetting; blurb: string | null
          starts_at: string; ends_at: string | null; coordinates: string | null; muster: string | null
          status: string
        }>
      }
      /* Both count in the database and refuse a non-staff caller — the Bridge
         used to count fetched rows, which PostgREST caps at 1000. */
      delivery_health: {
        Args: Record<string, never>
        Returns: Array<{ channel: string; status: string; n: number }>
      }
      notice_count: {
        Args: { p_kind: string }
        Returns: number
      }
      place_galley_order: {
        Args: {
          p_episode: string
          p_lines: Array<{ itemId: string; qty: number }>
          /* Minted once per order by the client and re-sent unchanged on every
             offline retry, so a replay is recognised rather than charged. */
          p_idem_key?: string
        }
        Returns: string
      }
      signature_tally: {
        Args: Record<string, never>
        Returns: Array<{ document_version_id: string; n: number }>
      }
      /* Three reads a member is owed but RLS cannot answer: an offer names the
         offerer's episode, a roster names consenting shipmates, a cabin plan
         names claims that are not yours. */
      incoming_transfers: {
        Args: Record<string, never>
        Returns: Array<{
          transfer_id: string; from_name: string; episode_id: string
          title: string; starts_at: string; time_zone: string
        }>
      }
      episode_manifest: {
        Args: { p_episode: string }
        Returns: Array<{ full_name: string; avatar_tone: string; guests: number }>
      }
      claimed_cabins: {
        Args: { p_cabins: string[] }
        Returns: Array<{ cabin_id: string; episode_id: string }>
      }
    }
    Enums: {
      application_status: ApplicationStatus
      setting: EpisodeSetting
      membership_tier: MembershipTier
      pass_status: PassStatus
      episode_status: EpisodeStatus
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
      setting: ["sea", "shore", "sky"],
      membership_tier: ["regional", "national", "global"],
      pass_status: ["aboard", "waitlist", "not_going"],
      episode_status: ["scheduled", "live", "weather_hold", "completed", "cancelled"],
    },
  },
} as const
