# Competitive parity audit — LYRE SOCIAL

> **Built 2026-08.** Every tier below is implemented except where noted.
> Shipped: recurring dues + installments + `/account`; member directory with
> shared-voyage affinity; crew threads and direct messages; web push; calendar
> feeds (.ics per member and per sailing); the applicant tracker; waitlist
> auto-claim with visible position; member-to-member pass transfer; per-guest
> credentials; day-of SMS; pass-level promo codes; voyage galleries; referral
> attribution; the members CRM with saved segments and CSV; automations,
> API keys and webhooks; the Shoreside inbox; event-card enrichment, browse
> filters and OG images.
> **Still gated on external credentials:** Stripe (dues and settlement hide
> until keys are set), Twilio (SMS queues and drains as `skipped`),
> photography (galleries fall back to placeholders), and Apple/Google wallet
> passes (printable credentials ship instead). **Deliberately not built:** the
> automation *dispatcher* (rules save; triggers wire next) and everything in
> the rejections table.

Produced 2026-08 against verified current feature sets of **TIXR**, **Circle.so**,
**Posh.vip**, **Shotgun**, **DICE**, **Dorsia**, **Luma**, plus Eventbrite/Patreon/
Mighty/Skool as baselines. Sources listed at the end.

**On "Bubble":** ambiguous in this comparison set. There is no significant
premium *community* platform by that name; the relevant product is **bubble.io**,
the no-code builder — i.e. the "assemble it yourself" alternative. Its parity
question is not features but *editability*: Bubble owners change data models and
workflows without an engineer. Our equivalent is the Bridge plus schema
migrations. Treated as a build-vs-buy datapoint, not a feature competitor.

## How this is ranked

Two axes, multiplied:

- **Member impact** — what a member or operator actually feels.
- **Fit** — does it suit a *vetted, small-manifest, membership* club? Much of
  what mass ticketing does (resale, surge pricing, discovery feeds) is
  actively wrong for us. Parity is not the goal; *deliberate* divergence is.

Effort breaks ties for sequencing only.

---

## Tier 0 — Revenue-critical. The business does not run without these.

**1. Recurring dues billing.**
We render $199–$1,499/mo across fifteen plan cells and charge **nobody**. Stripe
settlement covers one-off house-account balances only; there is no subscription,
no renewal, no dunning. Circle bills memberships and ships workflows for
"removing members who lapse on payment"; Dorsia charges $200–$25,000/yr; even
Luma's free tier does recurring monthly/yearly membership payments. This is the
single largest gap in the product and it is invisible until it is fatal.
*Impact: business-critical · Fit: perfect · Effort: medium.*

**2. Payment plans / installments.**
TIXR's is the reference implementation: flat activation fee, down payment, then
automated zero-interest installments, no credit check. Our own design system
promised "dues split monthly — no interest, cancel anytime" and it was never
built. This is what makes the $549–$1,499 tiers reachable.
*Impact: high · Fit: perfect · Effort: medium.*

**3. Member billing self-service.**
Receipts, invoice history, card on file, failed-payment states. Universal across
the set. We have a ledger; we have no receipts and no card management.
*Impact: high · Fit: perfect · Effort: low.*

## Tier 1 — Highest member-felt impact.

**4. Member directory + real profiles.**
Circle's is a headline feature ("searchable member directory"); for Dorsia and
the house clubs, the roster *is* the product. LYRE has **no directory at all** —
you cannot see who is in the club you joined. For a club whose entire thesis is
"the people worth crossing water for," this is the most conspicuous hole in the
member experience. Consent-gated, filterable by harbor/league, with "sailed
together" affinity.
*Impact: very high · Fit: perfect · Effort: medium.*

**5. Messaging — per-voyage crew threads, then DMs.**
Circle ships DMs and chat; Posh builds distribution on interconnected social
groups. Our own product map specified crew threads that open at RSVP and close
after the debrief — never built. Today a connection made aboard dies at the
dock: there is no way to reach anyone except a public comment. This is the
retention loop.
*Impact: very high · Fit: perfect · Effort: medium-high.*

**6. Push notifications.**
Circle ships branded push; Shotgun, DICE and Posh are push-native. Weather holds
called at 18:00 and waitlist releases are time-critical, and email loses that
race. We already ship a service worker — the plumbing is half-built.
*Impact: high · Fit: perfect · Effort: low-medium.*

**7. Calendar: add-to-calendar + subscribable feed.**
Luma's core primitive is the *Calendar* people subscribe to, notified on every
new event. We have neither an .ics on a confirmed pass nor a season feed. It is
the cheapest attendance lift available and every platform in the set has it.
*Impact: high · Fit: perfect · Effort: low.*

**8. Applicant status tracker.**
Dorsia-style funnels live on visible progress. Our design system promised "no
black box, no ghosting" with a four-stage tracker (Applied → Port Day invite →
Signatures → Aboard). The `application_status_for` RPC exists; no UI consumes
it. Applicants currently get email and then silence.
*Impact: high (on the funnel) · Fit: perfect · Effort: low.*

## Tier 2 — Strong fit, real impact.

**9. Waitlist with auto-pay and visible position.**
Shotgun: join with auto-pay and the card is charged the moment a ticket frees.
DICE: each person in line gets a reserved purchase window. TIXR: waitlists with
payment pre-authorization. We promote in order — correctly — but show no
position and pre-authorize nothing, so releases can go stale.
*Impact: medium-high · Fit: strong · Effort: medium.*

**10. Pass transfer to another member.**
DICE transfers to contacts; TIXR does "verified fan-to-fan transfers." This is
*not* resale (see rejections) — it is "I can't sail Saturday, take my pass,"
resolved inside the member roll. Cuts no-shows.
*Impact: medium-high · Fit: strong · Effort: medium.*

**11. Per-guest credentials.**
Guests are names on a member's pass; they cannot arrive separately because they
have no code of their own. Standard everywhere.
*Impact: medium-high · Fit: perfect · Effort: low.*

**12. SMS for day-of operations.**
Luma sends mass SMS; TIXR and Shotgun both do. The weather-hold call and muster
changes are exactly the messages that must not sit unread in an inbox.
*Impact: medium-high · Fit: strong · Effort: low-medium.*

**13. Access / promo codes at the pass level.**
TIXR locks ticket types behind access codes; Posh does promo codes. We have
*membership* invite codes but nothing for founding-member drops, partner comps,
or press.
*Impact: medium · Fit: strong · Effort: low.*

**14. Post-event galleries.**
The strongest retention artifact in experiential clubs is photographs of the
member. Our gallery is twelve placeholder tiles.
*Impact: medium-high · Fit: strong (gated on photography) · Effort: medium.*

**15. Referral attribution dashboard.**
Posh's Promoter Network turns members into tracked sellers with unique links and
Kickbacks; Shotgun gives every promoter a portal with per-event links and sales
tracking. We award 250 KN per signature but show no attribution anywhere.
*Impact: medium · Fit: strong (as sponsorship, not commission) · Effort: medium.*

**16. Operator CRM — segmentation, saved views, exports.**
Circle ships member CRM; TIXR a full fan-data platform; Luma exports and
segments. We have live reports but cannot pull "all Global members in MIA who
sailed twice this season."
*Impact: medium (operator) · Fit: perfect · Effort: medium.*

## Tier 3 — Worth having, lower urgency.

17. Wallet passes (blocked on Apple/Google signing certs) · 18. Harbor and month
filters on /voyages (matters at four harbors) · 19. Per-event OG images ·
20. Group/crew booking — the Yacht Week "book together" pattern ·
21. A workflow builder (Circle Workflows; ours are hardcoded triggers) ·
22. Human concierge channel alongside Aurora (Dorsia's signature) ·
23. Public API + webhooks · 24. Engagement analytics (Circle's Activity Scores).

---

## Deliberate rejections — parity we should NOT pursue

| Feature | Who has it | Why not us |
| --- | --- | --- |
| Resale / secondary market | Shotgun, DICE | The code of conduct bans it; the moderation queue already flags "resale — passes aren't transferable for cash." Transfer, yes; market, never. |
| Dynamic / surge pricing | TIXR | Off-voice. Honest scarcity is the brand; the price is the price. |
| Public leaderboards | Circle (points, ranks, leaderboard) | "Miles, not likes." Leagues are tenure-based by design — ranking members against each other inverts the ethos. |
| Algorithmic discovery feed | Shotgun, DICE | A vetted club with a curated calendar. Discovery is the marketing site's job. |
| Courses / LMS / live streaming | Circle, Mighty, Skool | Offline-first by constitution — "no replays, no streams." |
| Reserved seating charts | TIXR, Eventbrite | Meaningless for flotillas; the Bridge assigns berths on yachts. |
| Fee-on-top checkout | Eventbrite, most | The house account is the model — members settle a balance, not a cart. |
| Open self-serve signup | Circle, Luma, Bubble | Antithetical. Sign-in is DB-enforced invited-only. |

## Where LYRE already leads the comparison set

- **House-account / folio billing.** Charges, comps, credits, refunds, staff
  postings and Stripe settlement against a running member balance. Dorsia has
  wallet credits; the ticketing platforms are per-transaction. Nobody in the set
  runs a true folio.
- **A confirm-first AI agent with database tool-use.** Circle AI builds spaces
  and posts *for admins*. Aurora reads a member's manifest and balances and
  proposes bookings that a human confirms. No competitor ships this member-side.
- **Fleet operations.** Vessels, per-yacht manifests, assign-evenly, and a
  "flotilla forms at 30 — profitable at 3" viability meter. No ticketing
  platform models boats, crew manning, or unit economics.
- **Vetting enforced in the database.** Invited-only account creation at the
  trigger level, not an app-layer approval toggle.
- **Offline-first gangway.** Camera scan + hardware wedge + typed code, all
  through one path, with a queue that survives a dead dock signal and a
  printable list for a dead battery. DICE and TIXR have native scan apps; ours
  degrades further down.
- **Brand-lexicon enforcement in CI.** 194 route checks including banned-term
  scanning on rendered HTML. Nobody does this.
- **Two coherent currencies.** Knots earned by distance; Leagues earned by
  tenure. Cleaner than generic points-and-levels.

## Recommended sequence

1. **Money** (Tier 0, items 1–3) — subscriptions, installments, receipts.
2. **The people** (items 4–5) — directory, then crew threads.
3. **The nudges** (6–8) — push, calendar, applicant tracker. All small, all felt.
4. **Ticketing polish** (9–13) — auto-pay waitlist, transfer, guest codes, SMS, codes.
5. **The long tail** (14–24) as capacity allows.

Items 1–8 are roughly one focused build cycle each and would close every gap
that a member or an operator can actually feel.
