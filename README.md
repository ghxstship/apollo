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
| Mobile | Same member routes; under 960px the shell becomes a 6-tab bottom bar. Installable PWA (`/manifest.webmanifest`, standalone, starts at `/harbor`) |

## Setup

1. Create a Supabase project and apply the migrations in order:
   `supabase/migrations/*.sql` (via `supabase db push` or the SQL editor). They create the schema, triggers (welcome fathoms, RSVP rewards), RLS policies, and demo seed content.
2. Copy `.env.example` to `.env.local` and fill in the project URL and publishable key.
3. `npm install && npm run dev`

Magic-link emails use Supabase's built-in SMTP (rate-limited); set a custom SMTP provider for production. The `voyage_capacity` view is intentionally `SECURITY DEFINER` — it exposes only aggregate berth counts to anonymous visitors.

## Data model

`profiles` (1:1 with `auth.users`, auto-created by trigger) · `harbors` · `voyages` · `rsvps` · `fathoms_ledger` (+`fathoms_balance` view) · `wardroom_posts`/`wardroom_hails`/`wardroom_comments` · `dispatch_posts` · `applications` · `notifications`.

## Brand

Dark by default; paper light theme via `data-theme="light"`. Sea / Shore / Sky event themes retint the lava gradients per event class (`data-theme` on the event page wrapper). One neon accent per view. No emoji, no exclamation marks, no pirate kitsch. The full kit — tokens, logo SVGs, voice — is published at `/brand`.
