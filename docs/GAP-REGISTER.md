# Gap register — end-to-end member journey & operator processes

Produced 2026-07-24 from (a) a line-by-line read of every file in `src/` and
`supabase/migrations/`, diffed against (b) the design system's intended
product map (`research/product-map.md`, ticketing/membership patterns, and
the admin/tickets/auth/pos/shop/ats/emails kit specs).

Legend: ✅ works end-to-end today · 🟡 partially built / demo-only · ❌ missing entirely.

---

## 1 · The member journey, stage by stage

### 1.1 Discover (public site) — 🟡 mostly built
Built: home, voyages manifest + detail (event themes, capacity, weather-hold
states), membership, dispatch, gallery, crew, brand, legal, support; sitemap +
robots + daily route audit.
Missing vs. spec:
- **Member RSVP from the voyage detail page** — "Reserve a berth" loops
  members back through `/gangway` to the same public page forever
  (`(site)/voyages/[slug]/page.tsx:206`). Needs an auth-aware CTA (signed-in →
  RSVP inline or deep-link `/manifest`).
- **"Who's aboard" preview is fabricated** — four hardcoded names shown under
  a "with consent" caption (`voyages/[slug]/page.tsx:62`). Needs real RSVP
  join + a per-voyage visibility flag on `rsvps`.
- Day-by-day "The plan" timeline, crew-forming strip ("Sailing solo?"),
  Salon-Thursdays countdown, testimonial strip (experience-patterns spec).
- Gallery is 12 placeholder tiles; no media model/upload.
- Dispatch has no authoring path (no author column; mailto only).

### 1.2 Apply / be invited — 🟡 form only, funnel disconnected
Built: application form → `applications` insert with validation.
Missing:
- **The application is a dead-end write.** No one can read it (insert-only
  RLS, no staff policy), `application_status` never transitions, no
  `application-received` email, no status tracker for the applicant
  (auth kit specs a 4-stage tracker: Applied → Salon invite → Signatures →
  Aboard).
- **Invite codes don't exist as data.** Portal shows a generated code, support
  copy promises redemption for a salon guest spot, application captures
  `referral` — but there is no `invites` table, no redemption flow, no
  matching, no 250 FM referral award.
- **The spec's 4-step application** (You → The Water interests →
  Seaworthiness waiver on file → Tier selection with monthly dues) is a
  single flat form today; no interests, no waiver capture, no tier choice.
- **Gate-crash hole:** magic-link sign-in auto-creates a full member account
  for any email (`signInWithOtp` default `shouldCreateUser: true`) — the
  vetting funnel is entirely bypassable. Sign-in must be restricted to
  accepted members (invite/acceptance-driven user creation).

### 1.3 Onboard — 🟡
Trigger creates profile + member number + 100 FM + welcome Word. Missing:
`welcome-aboard` email, tier assignment from acceptance, seaworthiness
waiver on file, home-harbor capture at acceptance.

### 1.4 Reserve & pay — ❌ the biggest functional hole
Built: free RSVP with guests stepper, waitlist self-serve, release berth.
Missing (tickets kit + TIXR/Dorsia patterns):
- **Payments entirely absent.** Prices render everywhere; nothing is ever
  charged — no processor, no checkout, no member account/ledger of charges.
  Legal/support copy already promises a processor, deposits, credits, and
  refunds.
- Berth deposits ($50 high-demand, credited to galley, forfeited on no-show),
  add-ons (priced × guests), post-purchase upsell window until 18:00 night
  before, payment plans (monthly splits), guest-berth pricing ($85, Global
  two-per-event).
- **Server-side enforcement:** `setRsvpStatus` doesn't check capacity or
  `min_tier` — full or tier-locked voyages can be overbooked by calling the
  action directly; guest limits (0–4 for everyone) ignore the two-per-Global
  rule in copy.
- **Tier-gated RSVP windows** (early access by tier, staged to Sunday-open).
- **Boarding stub** (code `LS-{sail}-{date}`, muster gate, manifest count,
  conditions line) — no artifact is issued on confirmation; nothing scannable
  exists (`/card` renders the member number as text, no QR).
- **Waitlist promotion** — "releases go out in order" is promised in three
  places; nothing ever promotes waitlist → aboard when a berth frees (needs
  trigger/job + claim notification + `waitlist-release` email).

### 1.5 Pre-departure comms — ❌
Only two notification kinds are ever emitted (welcome `word`, RSVP
`manifest`). Missing: weather-hold fan-out (Word + email) when status
changes, T-48h "gangway details" message (promised in the RSVP
notification copy), Sunday manifest digest (promised in welcome copy),
`boarding-pass` email. The 8 transactional email templates from the design
system are not implemented at all (no email infrastructure beyond
Supabase's built-in magic-link sender).

### 1.6 Gangway check-in — ❌
No check-in data model (no attendance/checked_in_at), no QR/barcode
credential, no staff scan surface (POS/register app), no muster-close flow.

### 1.7 Underway (Now tab) — 🟡 demo shell
Timeline offsets, conditions (wind/swell/heading/speed), and wayfinding are
hardcoded demo values; progress states aren't derived from clock time.
Nothing can ever set a voyage `live` (or `completed`/`cancelled`) — those
enum values have no write path, so in production Now is permanently empty.
Galley self-order charging the member account with offline queueing
(product-map §3/§6) is unbuilt; there is no service worker, so the PWA has
no offline behavior at all.

### 1.8 Post-event — ❌
No completion flow: no mileage fathoms award (10 FM/NM is the advertised
core earn), no salon 40 FM award, no regatta double, no voyage gallery, no
per-voyage crew threads (open at RSVP, close after debrief), no season
stats accrual.

### 1.9 Loyalty (Portal) — 🟡 display only
Balance + ledger read correctly. Missing: every earn source except
welcome/+25 RSVP; **reward redemption** (no redeem action, no negative
ledger writes despite debit styling); tier progress on season fathoms.

### 1.10 Referrals — ❌
Code is generated client-side and stored nowhere; no tracking, no signature
credit, no first-mate booking credit.

### 1.11 Tier upgrade / renewal / billing — ❌
`profiles.tier` has no write path anywhere, making the two National-tier
seeded voyages permanently unreachable for real members. "Manage
membership" dead-ends at `/portal`. Dues are hardcoded and contradictory:
marketing says $1,800/$3,600/$7,200 per year; the You tab says
$95/$240/$520 per month. No billing of any kind.

### 1.12 Pause / depart — 🟡 demo only
Dialogs + toast only; no persisted paused/departed state, no dues effect,
no `farewell` email, no account deletion — while legal promises "delete
from the member app, no calls required" and 30-day erasure. Notification
preference switches on the You tab are decorative (uncontrolled inputs, no
storage, no emitter respects them). `profiles.handle` is editable but never
displayed anywhere.

---

## 2 · Operator / admin processes — ❌ the entire plane is missing

`profiles.is_staff` exists and is referenced by zero policies and zero UI.
There is no staff RLS anywhere, so even a flagged operator cannot read
applications or moderate content through the API. Everything below is
specified in the admin/pos/ats kits and unimplemented:

1. **Harbormaster console** (`/harbormaster`): manifests + gangway check-in
   (roster, waiver-missing flags, check-in stamping), per-sailing capacity
   control, waitlist release ordering, orders & refunds (confirm-first
   dialog, logged financial actions), Wardroom moderation queue
   (remove+notify with reason / leave up, code-of-conduct flags), season
   reports (fill %, NM, fathoms paid, holds called, referral share).
2. **Voyage lifecycle operations**: create/edit voyages, call weather holds
   by 18:00 (with member fan-out), set live/completed/cancelled, close
   manifests at muster.
3. **Application review**: read queue, advance status, issue salon
   invites/signatures, accept → provision member (tier, harbor, waiver).
4. **Galley POS**: catalog/ticket/member-attach by LS number (tier discount +
   fathoms), tender (member account/card/cash), boarding-stub scan at the
   register.
5. **Crew ATS**: pipeline (Applied → Interview → Sea Trial → Offer) behind
   the careers page (currently mailto-only).
6. **The Purser agent** (member + operator, confirm-first action cards,
   never on POS/brand/emails) — not started.
7. **Chandlery shop** (member discount, cart, checkout) — not started
   (marketing site doesn't reference it yet).

---

## 3 · Cross-cutting platform gaps

- **Email infrastructure**: none. Eight table-based templates specced
  (magic-link is the only mail that sends today, via Supabase default SMTP).
- **Realtime**: no subscriptions or refresh — feed/inbox/capacity are stale
  until navigation; no unread badge on the Word tab.
- **App scaffolding**: no `error.tsx` / `global-error.tsx` / `not-found.tsx`
  / `loading.tsx` anywhere; Supabase read errors are swallowed into empty
  states, indistinguishable from "no data."
- **PWA**: installable but no service worker/offline; `start_url=/harbor`
  redirects installed-but-signed-out users to the gangway (acceptable but
  worth an offline shell).
- **Security enforcement debt**: capacity/tier/guest limits client-side only
  (see 1.4); vetting bypass via open sign-up (see 1.2); no staff role
  policies (see 2).
- **Copy/system contradictions to resolve**: yearly vs. monthly dues;
  RSVP-window tier names in the research docs (Odyssey/Passage) vs. the
  product tiers (Regional/National/Global); guest allowance (0–4 schema vs.
  two-per-Global copy); "48 seats left" on a live salon that should have a
  closed list at 18:00 day-of.

---

## 4 · Suggested build order

1. **Close the trust gaps that copy already promises** (fastest credibility
   wins): staff role + RLS, application review → acceptance → invited-only
   sign-in, waitlist promotion, weather-hold fan-out, real offboarding, wire
   or remove decorative toggles/dead links.
2. **Money**: Stripe (checkout + member account ledger), deposits, guest
   pricing, refunds (operator confirm-first), then payment-plan dues and
   tier management.
3. **Operations**: Harbormaster console (manifests/check-in/capacity/
   moderation/reports) + voyage lifecycle + boarding stub QR + POS scan.
4. **Engagement depth**: post-voyage fathoms engine (per-NM/salon/referral),
   redemption, referrals as data, crew threads, realtime feed/inbox, emails
   2–8, Now-tab live data + galley ordering + offline queue.
5. **Later surfaces**: Chandlery, Crew ATS, the Purser agent.
