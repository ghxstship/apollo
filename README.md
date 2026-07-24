# LYRE SOCIAL

A membership club for experiential connection at sea and ashore — voyages, salons, and the people worth crossing water for. Full-stack build of the Lyre Social design system: marketing website, member web app, and installable mobile PWA in one Next.js codebase, backed by Supabase.

## Stack

- **Next.js 16** (App Router, TypeScript, `src/` dir) — note: middleware lives in `src/proxy.ts` per the Next 16 convention
- **Supabase** — Postgres, magic-link auth, RLS everywhere; migrations in `supabase/migrations/`
- **Design system** — Neon Brutalist v4 tokens in `src/styles/`, 25 React primitives in `src/components/ds/`; Marcellus / Archivo / Space Mono via Google Fonts, Lucide icons via `lucide-react`

## Surfaces

| Surface | Routes |
| --- | --- |
| Marketing site | `/` · `/voyages` · `/voyages/[slug]` · `/membership` · `/dispatch` · `/dispatch/[slug]` · `/gallery` · `/crew` · `/brand` · `/legal` · `/support` |
| Gangway (auth) | `/gangway` · `/auth/confirm` · `/auth/signout` — passwordless magic links |
| Member app | `/harbor` · `/now` · `/manifest` (RSVPs) · `/wardroom` (feed) · `/portal` (fathoms) · `/card` · `/word` (inbox) · `/you` |
| Mobile | Same member routes; under 960px the shell becomes a 6-tab bottom bar. Installable PWA (`/manifest.webmanifest`, standalone, starts at `/harbor`) with a service worker + offline page |
| Commerce | `/chandlery` (shop) · `/stub/[code]` (boarding stub + QR) · house-account ledger (charges/credits/refunds settle to the member account; no card processor by design) |
| Staff | `/harbormaster` (requires `profiles.is_staff`): applications review, manifests + gangway check-in, voyage lifecycle ops (holds/completion → notification + email fan-out, fathoms engine), orders & refunds, Wardroom moderation, season reports, galley POS, crew ATS |

## Setup

1. Create a Supabase project and apply the migrations in order:
   `supabase/migrations/*.sql` (via `supabase db push` or the SQL editor). They create the schema, triggers (welcome fathoms, RSVP rewards), RLS policies, and demo seed content.
2. Copy `.env.example` to `.env.local` and fill in the project URL and publishable key.
3. `npm install && npm run dev`

Magic-link emails use Supabase's built-in SMTP (rate-limited); set a custom SMTP provider for production. The `voyage_capacity` view is intentionally `SECURITY DEFINER` — it exposes only aggregate berth counts to anonymous visitors.

### Card settlement (Stripe)

Members with a negative house-account balance can settle by card through Stripe Checkout. Set `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, and `SUPABASE_SERVICE_ROLE_KEY` (see `.env.example`); for local webhooks run `stripe listen --forward-to localhost:3000/api/stripe/webhook`. The webhook posts a `payment` row to `account_ledger` (idempotent per Checkout session) and drops a Word. With any key unset the feature disappears cleanly — the portal shows the shore-office note and the API returns 503.

### The Purser

The member assistant has an optional LLM brain (`/api/purser`, Claude via `@anthropic-ai/sdk`). Set `ANTHROPIC_API_KEY` to enable it; all reads run through the member's own Supabase server client (RLS-scoped), and any write is confirm-first — the model only proposes an action card, and the member's confirmation executes through the existing server actions. With the key unset (or on any API error) the panel falls back silently to the deterministic v1 intent matching; a dead-reckoning notice appears in dev only.

### Wallet passes

Apple/Google wallet passes require platform signing credentials the project doesn't hold. Until then, `/card` and `/stub/[code]` ship a working "Print or save" flow — `window.print()` with print CSS that strips the chrome and keeps the card's exact colors, which also covers save-as-PDF.

## Site map & route audit

- `src/lib/route-manifest.json` is generated from the `src/app` filesystem by `scripts/generate-route-manifest.mjs`, which runs automatically before `dev` and `build` — it cannot drift. It also parses the auth proxy's protected-prefix list so route classification and access control share one source of truth.
- `src/app/sitemap.ts` and `src/app/robots.ts` derive from that manifest plus live Supabase slugs: new pages, voyages, and Dispatch posts appear in `/sitemap.xml` without manual edits; member surfaces never do.
- `scripts/audit-routes.mjs` (`npm run routes:audit` against a running server) fetches every route and asserts: 200s on public pages, signed-out redirects on member pages, 404 (not 500) on unknown slugs, fail-safe auth handlers, HTML violations (missing title/lang/alt, error-boundary text), internal link integrity, sitemap/robots/PWA-icon resolution.
- `.github/workflows/route-audit.yml` runs the audit on every push and PR **and on a daily schedule**, fails if the committed manifest is stale, and uploads `route-audit-report.json` as an artifact.

## Data model

`profiles` (1:1 with `auth.users`, auto-created by trigger) · `harbors` · `voyages` · `rsvps` · `fathoms_ledger` (+`fathoms_balance` view) · `wardroom_posts`/`wardroom_hails`/`wardroom_comments` · `dispatch_posts` · `applications` · `notifications`.

## Brand

Dark by default; paper light theme via `data-theme="light"`. Sea / Shore / Sky event themes retint the lava gradients per event class (`data-theme` on the event page wrapper). One neon accent per view. No emoji, no exclamation marks, no pirate kitsch. The full kit — tokens, logo SVGs, voice — is published at `/brand`.
