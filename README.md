# LYRE SOCIAL

A membership club for experiential connection at sea and ashore — Sea Days aboard, Port Days ashore, and the people worth crossing water for. Full-stack build of the Lyre Social design system: marketing website, member web app, and installable mobile PWA in one Next.js codebase, backed by Supabase.

## Stack

- **Next.js 16** (App Router, TypeScript, `src/` dir) — note: middleware lives in `src/proxy.ts` per the Next 16 convention
- **Supabase** — Postgres, magic-link auth, RLS everywhere; migrations in `supabase/migrations/`
- **Design system** — Neon Brutalist v4 tokens in `src/styles/`, 25 React primitives in `src/components/ds/`; Marcellus / Archivo / Space Mono via Google Fonts, Lucide icons via `lucide-react`

## Surfaces

| Surface | Routes |
| --- | --- |
| Marketing site | `/` · `/voyages` · `/voyages/[slug]` · `/membership` · `/lore` · `/lore/[slug]` · `/gallery` · `/crew` · `/brand` · `/legal` · `/support` · `/apply-status` |
| Gangway (auth) | `/gangway` · `/auth/confirm` · `/auth/signout` — passwordless magic links, invited-only (enforced by a DB trigger on `auth.users`) |
| Member app | `/home-port` · `/gateway` (live) · `/manifest` (passes) · `/open-deck` (feed) · `/directory` · `/regattas` (contests) · `/threads` · `/portal` (knots + leagues) · `/account` (dues) · `/passbook` (+ the Passage Log and Marks) · `/word` · `/you` |
| Mobile | Same member routes; under 960px the shell becomes a 6-tab bottom bar. Installable PWA (`/manifest.webmanifest`, standalone, starts at `/home-port`) with a service worker, offline shell, and web push |
| Commerce | `/chandlery` (shop) · `/stub/[code]` (pass and guest stubs + QR) · house-account ledger; Stripe settles balances and runs recurring dues |
| Staff | `/bridge` (requires `profiles.is_staff`): applications, gangway check-in, manifests + flotilla, voyage ops, orders & refunds, members CRM, codes, media, moderation, regattas, reports, galley POS, crew ATS, automations, keys, Shoreside |

## Setup

1. Create a Supabase project and apply the migrations in order:
   `supabase/migrations/*.sql` (via `supabase db push` or the SQL editor). They create the schema, triggers (welcome knots, pass rewards, waitlist promotion, fan-out), RLS policies, and demo seed content.
2. Copy `.env.example` to `.env.local` and fill in the project URL and publishable key.
3. `npm install && npm run dev`

Magic-link emails use Supabase's built-in SMTP (rate-limited); set a custom SMTP provider for production. The `voyage_capacity` view is intentionally `SECURITY DEFINER` — it exposes only aggregate pass counts to anonymous visitors.

### Card settlement (Stripe)

Members with a negative house-account balance can settle by card through Stripe Checkout. Set `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, and `SUPABASE_SERVICE_ROLE_KEY` (see `.env.example`); for local webhooks run `stripe listen --forward-to localhost:3000/api/stripe/webhook`. The webhook posts a `payment` row to `account_ledger` (idempotent per Checkout session) and drops a Word. With any key unset the feature disappears cleanly — the portal shows the shore-office note and the API returns 503.

### Dues & installments

Recurring dues run on the same three keys. `POST /api/stripe/subscribe` opens a subscription-mode Checkout Session against the plan's `stripe_price_id` (or `stripe_price_id_annual` — ten months' dues, two on the house); `POST /api/stripe/portal` hands the member to Stripe's Billing Portal for the card, cancellation, and invoices. The webhook mirrors `customer.subscription.*`, `invoice.paid`/`payment_failed`, and `payment_method.attached` into `subscriptions`, `invoices`, and `payment_methods`, and posts each paid period to `account_ledger` as a matched `dues` charge and `payment` credit (net zero, idempotent on the memo); the DB trigger on `subscriptions` handles member status and the past-due Word. Members read all of it at `/account`, and the plan grid on `/membership` becomes actionable once they're signed in. Passes over $200 can be split into 2–4 draws at Review & confirm — the down payment posts to the house account, the remainder rides on an `installment_plans` row; that write needs `SUPABASE_SERVICE_ROLE_KEY`, and the option hides without it.

### Aurora AI

The member assistant has an optional LLM brain (`/api/aurora`, Claude via `@anthropic-ai/sdk`). Set `ANTHROPIC_API_KEY` to enable it; all reads run through the member's own Supabase server client (RLS-scoped), and any write is confirm-first — the model only proposes an action card, and the member's confirmation executes through the existing server actions. With the key unset (or on any API error) the panel falls back silently to deterministic intent matching; a dead-reckoning notice appears in dev only.

### Word, push, and SMS

Every `notifications` row fans out by trigger: into `push_outbox` always, and into `sms_outbox` for weather holds when the member has a verified phone. Three edge functions drain the queues on a five-minute `pg_cron` schedule — `send-outbox` (Resend), `send-push` (VAPID/web-push), `send-sms` (Twilio). Each degrades to marking rows `skipped` when its keys are absent, so nothing backs up. Secrets live in Supabase Vault, read through the service-role-only `get_app_secret` RPC — never in the repo or CI.

### Wallet passes

Apple/Google wallet passes require platform signing credentials the project doesn't hold. Until then, `/card` and `/stub/[code]` ship a working "Print or save" flow — `window.print()` with print CSS that strips the chrome and keeps the card's exact colors, which also covers save-as-PDF.

## Site map & route audit

- `src/lib/route-manifest.json` is generated from the `src/app` filesystem by `scripts/generate-route-manifest.mjs`, which runs automatically before `dev` and `build` — it cannot drift. It also parses the auth proxy's protected-prefix list so route classification and access control share one source of truth.
- `src/app/sitemap.ts` and `src/app/robots.ts` derive from that manifest plus live Supabase slugs: new pages, voyages, and Dispatch posts appear in `/sitemap.xml` without manual edits; member surfaces never do.
- `scripts/audit-routes.mjs` (`npm run routes:audit` against a running server) fetches every route and asserts: 200s on public pages, signed-out redirects on member pages, 404 (not 500) on unknown slugs, fail-safe auth handlers, HTML violations (missing title/lang/alt, error-boundary text), internal link integrity, sitemap/robots/PWA-icon resolution.
- `.github/workflows/route-audit.yml` runs the audit on every push and PR **and on a daily schedule**, fails if the committed manifest is stale, and uploads `route-audit-report.json` as an artifact.

## Data model

Members: `profiles` (1:1 with `auth.users`, auto-created by trigger) · `member_roll` · `invites` · `membership_plans` · `subscriptions` / `invoices` / `payment_methods` / `installment_plans` · views `member_league`, `member_engagement`, `member_affinity`, `member_pass_usage`.

Sailings: `harbors` · `voyages` (+`itinerary`, `sub_class`) · `vessels` / `voyage_vessels` · `rsvps` (+`rsvp_guests`, `rsvp_addons`, `pass_transfers`) · `promo_codes` · `crew_requests` · views `voyage_capacity`, `waitlist_position`.

Money: `account_ledger` (+`account_balance`) · `addons` · `galley_*` · `products` / `shop_orders`.

Club life: `wardroom_posts`/`hails`/`comments`/`flags` (the Open Deck) · `threads` / `thread_members` / `messages` · `voyage_media` · `fathoms_ledger` (knots; +`fathoms_balance`) · `rewards` / `reward_redemptions` · `dispatch_posts` (LORE) · `notifications`.

Ops: `applications` · `crew_roles` / `crew_candidates` · `saved_segments` · `automations` · `api_keys` / `webhooks` / `webhook_deliveries` · `email_outbox` / `push_outbox` / `sms_outbox`.

Legacy names persist in the schema where a rename would have cost more than it earned — `fathoms_ledger` carries knots, `wardroom_*` carries the Open Deck, `dispatch_posts` carries LORE, and `berths_total` counts passes. Display names come from `src/lib/brand.ts`.

## Brand

Dark by default; paper light theme via `data-theme="light"`. Sea / Shore / Sky event themes retint the lava gradients per event class (`data-theme` on the event page wrapper). One neon accent per view. No emoji, no exclamation marks, no pirate kitsch. The full kit — tokens, logo SVGs, voice — is published at `/brand`.
