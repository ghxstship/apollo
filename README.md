# [un]

A membership club for experiential connection afloat and ashore — the boat, the sandbar, the room, and the people worth crossing water for. Full-stack build of the [un] design system: marketing website, member web app, and installable mobile PWA in one Next.js codebase, backed by Supabase.

## Stack

- **Next.js 16** (App Router, TypeScript, `src/` dir) — note: middleware lives in `src/proxy.ts` per the Next 16 convention
- **Supabase** — Postgres, magic-link auth, RLS everywhere; migrations in `supabase/migrations/`
- **Design system** — Neon Brutalist v4 tokens in `src/styles/`, 25 React primitives in `src/components/ds/`; Marcellus / Archivo / Space Mono via Google Fonts, Lucide icons via `lucide-react`

## Surfaces

| Surface | Routes |
| --- | --- |
| Marketing site | `/` · `/episodes` (the Manifest) · `/episodes/[slug]` · `/membership` · `/log` (the written record) · `/log/[slug]` · `/gallery` · `/crew` · `/brand` · `/legal` · `/support` · `/apply-status` |
| Gangway (auth) | `/gangway` · `/auth/confirm` · `/auth/signout` — passwordless magic links, invited-only (enforced by a DB trigger on `auth.users`) |
| Member app | `/home` · `/live` · `/manifest` (passes) · `/open-deck` (feed) · `/directory` · `/regattas` (contests) · `/agreements` (waivers) · `/threads` · `/portal` (knots + leagues) · `/account` (dues) · `/card` (+ the Passage Log and Marks) · `/inbox` · `/you` |
| Mobile | Same member routes; under 960px the shell becomes a 6-tab bottom bar. Installable PWA (`/manifest.webmanifest`, standalone, starts at `/home-port`) with a service worker, offline shell, and web push |
| Signing | `/sign/[token]` — a guest signs their waiver by bearer link, no account. `noindex`, and marked credential-bearing so the audit never enumerates real tokens |
| Commerce | `/shop` (shop) · `/stub/[code]` (pass and guest stubs + QR) · house-account ledger; Stripe settles balances and runs recurring dues |
| Staff | `/bridge` (requires `profiles.is_staff`): applications, gangway check-in, manifests + flotilla, voyage ops, orders & refunds, members CRM, codes, media, moderation, regattas, documents, reports, galley POS, crew ATS, automations, keys, Shoreside |

## Setup

1. Create a Supabase project and apply the migrations in order:
   `supabase/migrations/*.sql` (via `supabase db push` or the SQL editor). They create the schema, triggers (welcome knots, pass rewards, waitlist promotion, fan-out), RLS policies, and demo seed content.
2. Copy `.env.example` to `.env.local` and fill in the project URL and publishable key.
3. `npm install && npm run dev`

Magic-link emails use Supabase's built-in SMTP (rate-limited); set a custom SMTP provider for production. The `voyage_capacity` view is intentionally `SECURITY DEFINER` — it exposes only aggregate pass counts to anonymous visitors.

### The domain

The canonical origin is **`https://unhingedsocial.us`** (decided 2026-09-02; `SITE_DOMAIN` in `src/lib/brand.ts`, the sitemap, robots, every og:image and every mailbox already say so — `syrius.social` is a banned term, not a fallback). Production currently answers only on the Vercel aliases (`apollo-topaz.vercel.app` is the open one), so until the domain is attached, canonical links point at a host that does not resolve. Attaching it is three steps outside this repo, in this order:

1. Vercel → project `apollo` → Settings → Domains → add `unhingedsocial.us` and `www.unhingedsocial.us` (redirect www → apex).
2. At the registrar, the records Vercel prints (an `A` on the apex, a `CNAME` on `www`), then wait for the certificate.
3. Set `NEXT_PUBLIC_SITE_URL=https://unhingedsocial.us` on the production environment, and `APP_URL` on the `send-outbox` function (one Vault update) so mail links land on the branded host.

### Card settlement (Stripe)

Members with a negative house-account balance can settle by card through Stripe Checkout. Set `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, and `SUPABASE_SERVICE_ROLE_KEY` (see `.env.example`); for local webhooks run `stripe listen --forward-to localhost:3000/api/stripe/webhook`. The webhook posts a `payment` row to `account_ledger` (idempotent per Checkout session) and drops a Word. With any key unset the feature disappears cleanly — the portal shows the shore-office note and the API returns 503.

**Go-live runbook (decided 2026-09-02: test mode first, one full cycle, then live).** The seam, the replay guard on `stripe_events` and the draw logic are built and gated; what remains is configuration, so the order matters more than the code:

1. Test mode: set the three keys on a **preview** environment from a Stripe test account; create the price ids on the test account and write them to `membership_plans.stripe_price_id` / `stripe_price_id_annual`; register the webhook endpoint at `<preview-origin>/api/stripe/webhook` for `checkout.session.*`, `customer.subscription.*`, `invoice.paid`, `invoice.payment_failed`, `payment_method.attached`.
2. Run one full cycle on the preview as the fixture personas: a dues subscription (monthly and annual), a settled house-account balance, a pass over $200 split into draws, a failed payment (Stripe's `4000 0000 0000 0341` card) and its recovery. Each step must land as the matching `account_ledger` rows and Words; `/bridge/reports` must show no failed webhook.
3. Live: repeat the keys, prices and endpoint from the live Stripe account on the **production** environment. Do not copy test price ids across — they are account-scoped and the plan rows would silently point at nothing.

### Dues & installments

Recurring dues run on the same three keys. `POST /api/stripe/subscribe` opens a subscription-mode Checkout Session against the plan's `stripe_price_id` (or `stripe_price_id_annual` — ten months' dues, two on the house); `POST /api/stripe/portal` hands the member to Stripe's Billing Portal for the card, cancellation, and invoices. The webhook mirrors `customer.subscription.*`, `invoice.paid`/`payment_failed`, and `payment_method.attached` into `subscriptions`, `invoices`, and `payment_methods`, and posts each paid period to `account_ledger` as a matched `dues` charge and `payment` credit (net zero, idempotent on the memo); the DB trigger on `subscriptions` handles member status and the past-due Word. Members read all of it at `/account`, and the plan grid on `/membership` becomes actionable once they're signed in. Passes over $200 can be split into 2–4 draws at Review & confirm — the down payment posts to the house account, the remainder rides on an `installment_plans` row; that write needs `SUPABASE_SERVICE_ROLE_KEY`, and the option hides without it.

### Aurora AI

The member assistant has an optional LLM brain (`/api/aurora`, Claude via `@anthropic-ai/sdk`). Set `ANTHROPIC_API_KEY` to enable it; all reads run through the member's own Supabase server client (RLS-scoped), and any write is confirm-first — the model only proposes an action card, and the member's confirmation executes through the existing server actions. With the key unset (or on any API error) the panel falls back silently to deterministic intent matching; a dead-reckoning notice appears in dev only.

### Word, push, and SMS

Every `notifications` row fans out by trigger: into `push_outbox` always, and into `sms_outbox` for weather holds when the member has a verified phone. Three edge functions drain the queues on a five-minute `pg_cron` schedule — `send-outbox` (Resend), `send-push` (VAPID/web-push), `send-sms` (sent.dm). Each leaves the queue standing (503) when its keys are absent — a queue that waits is a queue that sends when the key is back — and answers 207 when any row gave up, so the scheduler's response log shows a run that was not clean. Failed and skipped rows can be requeued from `/bridge/reports`. sent.dm is template-based rather than free-text: `sms_templates` maps the club's template codes to sent.dm template ids, and a code with no registered id is skipped rather than failed. Secrets live in Supabase Vault, read through the service-role-only `get_app_secret` RPC — never in the repo or CI.

### Wallet passes

Apple/Google wallet passes require platform signing credentials the project doesn't hold. Until then, `/card` and `/stub/[code]` ship a working "Print or save" flow — `window.print()` with print CSS that strips the chrome and keeps the card's exact colors, which also covers save-as-PDF. **Deferred on purpose** (2026-09-02): the printed card boards a member and the kiosk scans the on-screen code, so the wallet is a convenience, not a gate. Revisit after the first season says members want it.

## Site map & route audit

- `src/lib/route-manifest.json` is generated from the `src/app` filesystem by `scripts/generate-route-manifest.mjs`, which runs automatically before `dev` and `build` — it cannot drift. It also parses the auth proxy's protected-prefix list so route classification and access control share one source of truth.
- `src/app/sitemap.ts` and `src/app/robots.ts` derive from that manifest plus live Supabase slugs: new pages, episodes, and log entries appear in `/sitemap.xml` without manual edits; member surfaces never do.
- `scripts/audit-routes.mjs` (`npm run routes:audit` against a running server) fetches every route and asserts: 200s on public pages, signed-out redirects on member pages, 404 (not 500) on unknown slugs, fail-safe auth handlers, HTML violations (missing title/lang/alt, error-boundary text), internal link integrity, sitemap/robots/PWA-icon resolution.
- `.github/workflows/route-audit.yml` runs the audit on every push and PR **and on a daily schedule**, fails if the committed manifest is stale, and uploads `route-audit-report.json` as an artifact.

## Gates — what "done" means

Every change ships only when all of these are green, on the commit (not the working tree):

| Gate | Command | Proves |
| --- | --- | --- |
| Types | `npx tsc --noEmit` | the hand-maintained `src/lib/supabase/types.ts` still matches the code that reads it |
| Lint | `npx eslint src --max-warnings=0` | no warnings, no disabled rules |
| Design system | `npm run check:ds` | tokens, lockups, casing and the named vocabulary hold; colour holds too — the status/identity hue reservation, the 30° hue floor, WCAG contrast against the ground each token actually renders on, and no raw hex outside `tokens.css`/`palette.css` |
| Unit | `npm run test` | the pure helpers in `src/lib` (vitest) |
| Routes | `E2E_PASSWORD=… BASE_URL=… npm run routes:audit` | every route renders for its role, no leaked undefined/null text |
| Personas | `E2E_PASSWORD=… BASE_URL=… npm run e2e` — **twice** | business rules through the live API with real RLS and triggers; the suite sweeps its own fixtures and pins its knots footprint |
| Corpus | `npm run migrations:replay` | the migration corpus rebuilds the database from empty (the only proof of that — `migrations:mirror --adopt` records applied migrations; it does not prove them) |
| Advisories | `npm audit --audit-level=high` | no high or critical dependency advisories |

Migrations are applied to the live project first (never hand-written), then adopted into `supabase/migrations` with `npm run migrations:mirror -- --adopt`, then proven with `migrations:replay`.

The five e2e personas live on the production project and every run leaves residue the suite cannot sweep (ledgers, inbox and outboxes have no DELETE policy for staff). `E2E_PASSWORD=… npm run fixtures:reset` calls `reset_the_fixtures()` — a definer function gated on the staff badge and scoped to the exact `e2e-*@fixtures.invalid` shape — which strikes the fixture sailings, the personas' passes, threads, words, orders and ledgers in an order the triggers allow, and leaves their profiles, signatures and agreements standing. Run it before a demo and before the staging click-through (`docs/STAGING-CLICK-THROUGH.md`); demo members are never matched. Business constants live in `club_settings`, `segments`, `sponsor_tiers`, `leagues` and `club_products` — read them; never restate them in code or copy.

## Decisions the schema now states

Each of these was an open question the audits kept returning to. They are decided in code, with the reasoning in the migration that carries them, and every one is reversible by a migration that says otherwise.

- **Lapsed dues hold the membership.** `past_due` keeps its grace; `canceled`/`unpaid` places a club hold with `profiles.hold_reason = 'dues'` that a clearing payment lifts on its own (`handle_subscription_status`). A member cannot lift a dues hold themselves.
- **A pause keeps the passes; a departure squares them.** Paused members keep future passes (paid, releasable). `set_own_standing('departed')` releases every future pass with full credit whatever the window (`handle_profile_status`).
- **The quarterly membership is a plan the cap can count.** `membership_plans` row "Club Lifestyle Membership" (`plan_type = 'access'`, `product_slug = 'quarterly_membership'`) — an access plan, not a tier — so `guard_the_membership_cap` enforces the 20 active seats.
- **A couple names its second head.** `rsvp_guests.kind = 'partner'`: one per couple pass, any tier, own code and waiver and consent, never a companion, never pruned.
- **A flotilla names its own ceiling.** `voyages.hull_ceiling_heads` overrides `club_settings.hull_ceiling_heads` for a multi-hull sailing; the ratio gate is unchanged.
- **The taxonomy agrees by construction.** A format decides the setting and the experience class, the setting the default kind, the stated length the sub-class (`a_sailing_keeps_its_taxonomy`).
- **One waitlist per sailing.** Composition sailings use the numbered line (`waitlist_entries`); everything else uses `rsvps.status = 'waitlist'`; the guard refuses the other on each kind, so the two never coexist on one sailing.
- **Sponsors give comps and deliver assets.** `comp_a_pass_for_sponsor` writes a comp pass carrying `rsvps.sponsor_id`; `voyage_sponsors.assets_delivered` records the tier's inventory as it is fulfilled.
- **Errors and the scheduler are on the Bridge.** `app_errors` (written by `instrumentation.ts`) and `scheduler_health()` (pg_net's last responses) render on `/bridge/reports`. An external tracker, when chosen, is fed from `app_errors`.
- **A Regional pass sails from home.** A Regional member boards only sailings out of their `profiles.home_harbor`, and a Regional member with no harbor set is told to set one before the door opens (`rsvp_guard`). No reciprocity at Regional: the tier ladder is the upsell, and National already answers the away case. National and Global sail every harbor.
- **A hull above the club's figure names its certificate.** `voyages.hull_ceiling_heads` above `club_settings.hull_ceiling_heads` requires `voyages.hull_certificate` — the vessel, the authority and the certified number (`a_tentpole_names_its_certificate`). A tentpole is allowed; an unnamed one is not.
- **Only the quarterly membership counts against the cap.** `guard_the_membership_cap` counts subscriptions whose plan names a `club_products` row carrying `active_cap` — today only `quarterly_membership` (20). Monthly plans are governed by passes per month and are not double-capped.
- **The keys console waits for a partner.** `club_settings.keys_console_enabled = 0` hides `/bridge/keys` from the nav and answers 404 on the route. Nothing reads a key and nothing posts a hook; a register that promises nothing is honest, a console that suggests otherwise is not. Set it to 1 when a partner needs one.
- **Where it happens and what kind it is are two facts, so they are two columns.** `activity_formats.category` and `voyages.class` say only where — `sea` (Afloat) or `port` (Ashore) — and `experience_class` says what kind. One column could not hold both: `sea | port | premium` mixed a place with a level, which is why nothing could file a pool social and why a private charter, very much afloat, was filed as neither sea nor port. `a_sailing_keeps_its_taxonomy` copies both from the format so the axes cannot drift apart.
- **Four experience classes, and the guest at the door decides which.** `experience_class in ('open','club','premium','exotic')` on `activity_formats` and `voyages`: **open** when a member's guest who has not been vetted may come — the only such door; **club** for the members' standard; **premium** when the boat or the room is yours; **exotic** when the club leaves home water. A format is now free to be afloat *and* premium, or ashore *and* premium, which the old column could not express.
- **The duration ladder stops printing its names.** `voyages.sub_class` keeps `voyage` / `expedition` / `odyssey` because they price the plans and set the class ceiling in `rsvp_guard`, but `SUB_CLASSES` in `src/lib/brand.ts` now labels them "Up to 4 hours" / "Up to 8 hours" / "Any length". The key is plumbing; a card names its format and its hours, and a three-hour pool social is not an Odyssey.
- **The Captain's Pass is retired, not repriced.** `club_products.captains_pass` is `active = false, published = false`. It carried two conflicting definitions — a standing invitational place and an issued digital ticket — and the second leaned on a banned word. Membership is reached by invitation or by application, both of which are real rows in real tables; what admits a member to one sailing is a **boarding pass** (`single_pass` → "Single boarding pass", `couple_pass` → "Couple boarding pass").
- **A sailing is filed on one of three rungs, and no others.** `voyages_sub_class_check` now allows only `voyage | expedition | odyssey`; `trek`, `excursion` and `overland` are gone. They were admitted by the old CHECK and known to nothing else — `rsvp_guard` applies the class ceiling only when `sub_class in ('voyage','expedition','odyssey')`, so a sailing filed as a trek skipped the ceiling entirely and any tier could board it. Duration is duration whether or not there is water under it.
- **Every event is an episode.** One noun for the thing the club runs, afloat or ashore, an hour or three days — the show's own word, and the reality-TV framing the brand is built on. Charter, voyage and event are retired as display nouns; they survive only as catalogue labels on two formats (Private charter, Theme voyage) and as database identifiers, which are plumbing. The list of them is the **Manifest** at `/episodes`. The written record gave up that name to make room and is the **Log** at `/log` — which its own standfirst always called it. `next.config.ts` redirects the four editorial slugs by name, ahead of the wildcards, because `/episodes/:slug` is now an episode address and a blanket rule would shadow every one of them.
- **Not offered, on purpose:** digital or hybrid events. The phones-in-totes ethos is the product, and every rule in the schema assumes a hull, a gangway and a clock (decided again 2026-09-02).

## Data model

Members: `profiles` (1:1 with `auth.users`, auto-created by trigger) · `member_roll` · `invites` · `membership_plans` · `subscriptions` / `invoices` / `payment_methods` / `installment_plans` · views `member_league`, `member_engagement`, `member_affinity`, `member_pass_usage`.

Sailings: `harbors` · `voyages` (+`itinerary`, `sub_class`) · `vessels` / `voyage_vessels` · `rsvps` (+`rsvp_guests`, `rsvp_addons`, `pass_transfers`) · `promo_codes` · `crew_requests` · views `voyage_capacity`, `waitlist_position`.

Money: `account_ledger` (+`account_balance`) · `addons` · `galley_*` · `products` / `shop_orders`.

Club life: `wardroom_posts`/`hails`/`comments`/`flags` (the Open Deck) · `threads` / `thread_members` / `messages` · `voyage_media` · `fathoms_ledger` (knots; +`fathoms_balance`) · `rewards` / `reward_redemptions` · `dispatch_posts` (LORE) · `notifications`.

Ops: `applications` · `crew_roles` / `crew_candidates` · `saved_segments` · `automations` · `api_keys` / `webhooks` / `webhook_deliveries` · `email_outbox` / `push_outbox` / `sms_outbox`.

Legacy names persist in the schema where a rename would have cost more than it earned — `fathoms_ledger` carries knots, `wardroom_*` carries the Open Deck, `dispatch_posts` carries LORE, and `berths_total` counts passes. Display names come from `src/lib/brand.ts`.

## Brand

Dark by default; paper light theme via `data-theme="light"`. Sea / Shore / Sky event themes retint the lava gradients per setting (`voyages.class`, as `data-theme` on the event page wrapper). One neon accent per view. No emoji, no exclamation marks, no pirate kitsch. The full kit — tokens, logo SVGs, voice — is published at `/brand`.
