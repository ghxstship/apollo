# send-outbox

Drains `public.email_outbox`: fetches up to 25 `pending` rows whose backoff has passed, renders each letter to subject + HTML + plain text, and delivers via Resend. Without a Resend key it leaves the queue standing (503) — a queue that waits is a queue that sends when the key is back.

Row lifecycle: `pending` → `sending` (claimed, with `claimed_at`) → `sent` (with `sent_at`) | `failed` | `skipped`, or back to `pending` with `next_attempt_at` set when the provider said "later". Claims are guarded on `status=eq.pending`, so two overlapping runs never double-send; `requeue_stalled_sends` (cron, every 15 min) rescues a row stuck in `sending`.

## What the sender guarantees

- **Retries with backoff and a cap.** 429/408/5xx and timeouts requeue at 5 → 15 → 45 → 135 → 360 minutes; the fifth attempt marks `failed` with `last_error` saying so. Other 4xx fail at once — repeating the club's own mistake does not fix it.
- **Nothing content-free goes out.** An unknown code, or a letter missing a key it `REQUIRES` (a boarding pass with no code), is marked `failed` with the reason rather than sent as a blank "A word from Shoreside."
- **One bad row never drops the batch.** Each row is settled inside its own try; a bookkeeping failure leaves that row for the stall rescue and the loop goes on.
- **Bounces and complaints are honoured.** `resend-events` records them in `public.email_suppressions`; this drain reads that table before each batch and skips a listed address with the reason on the row. Until the table exists (SQL in the communications report) it logs once and sends as before.
- **Plain text on every letter**, derived from the HTML so the two cannot disagree.
- **Dates in the club's clock** (`CLUB_ZONE`, default `America/New_York`), or the episode's own `time_zone` when the payload carries it.
- **Transactional vs marketing.** `LETTER_KIND` classifies every code. Marketing letters (the Sunday Log, the season's card, the win-back) carry `List-Unsubscribe` and a footer that says how to stop them; transactional letters carry neither — a mail client's one-click control is never offered on a receipt it cannot honour.
- **Logs carry no address and no body.** Provider error excerpts are scrubbed of anything address-shaped and truncated; the top-level catch logs the message only.

The gate that proves the registry, the sender and the callers agree is `node scripts/audit-letters.mjs` (also part of `scripts/audit-routes.mjs`).

## Environment

- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` — injected automatically by the platform.
- `CRON_SECRET` — the scheduler's key, presented as `x-cron-key`. Fails closed when absent.
- `RESEND_API_KEY` — env, else Supabase Vault via `get_app_secret`. When absent, rows are left pending (503).
- `OUTBOX_FROM` — sender. Read from Supabase Vault. Sending sits on
  `atlvs.pro` because Resend verifies one domain per plan and
  `unhingedsocial.us` is not registered yet. When it is, update the single Vault
  row — no redeploy, no code change.
- `APP_URL` — member-app origin for deep links (default `https://unhingedsocial.us`).
- `CLUB_ZONE` — IANA zone for rendered dates (default `America/New_York`).

Secrets come from the environment first and the Vault second, and never from the request.

Set secrets with the CLI:

```sh
supabase secrets set RESEND_API_KEY=re_xxxxxxxx --project-ref mpyvwpunwrioakmtmcdo
supabase secrets set OUTBOX_FROM='"[un] — Shoreside" <shore@atlvs.pro>' --project-ref mpyvwpunwrioakmtmcdo
```

Or in the Dashboard: Project Settings → Edge Functions → Secrets.

## Scheduling

The cron jobs `send-outbox-drain`, `send-sms-drain` and `send-push-drain` (every five minutes) already exist by migration and present the `x-cron-key` from Vault. Nothing here needs scheduling by hand.

## Templates

| code | kind | subject |
| --- | --- | --- |
| `application-received` | transactional | Received. A person reads it next. |
| `crew-application-received` | transactional | Received — {role}. |
| `port-invite` | transactional | Come ashore once, as our guest. (legacy `salon-invite` renders the same) |
| `welcome-aboard` | transactional | Welcome aboard. |
| `boarding-pass` | transactional | Your pass is held. (requires `voyage`, `code`; renders `muster`, `starts_at`) |
| `gangway-details` | transactional | Gangway details — 48 hours out. (requires `voyage`, `code`) |
| `weather-hold` | transactional | Weather hold: {voyage} |
| `waitlist-release` | transactional | A pass released to you. |
| `voyage-cancelled` | transactional | Cancelled: {voyage} |
| `farewell` | transactional | Fair winds. |
| `dues-failed` | transactional | Your card didn't go through. (rungs one and two of `dunning_steps`; renders `holds_on` when given) |
| `card-expiring` | transactional | The card on file expires soon. (queued by `run_dunning`, 30 days out) |
| `final-notice` | transactional | Last word before your standing pauses. (rung three of `dunning_steps`; renders `holds_on`) |
| `refund-posted` | transactional | Refund posted. (requires `amount`) |
| `win-back` | marketing | Your place is still here. |
| `bridge-word` | marketing | {title} (a Bridge broadcast; requires `title`, `body`) |
| `season-card` | marketing | Your season — {season} |
| `lore-digest` | marketing | The Log, Sundays. (legacy `dispatch-digest`, `episode-digest` render the same) |

Every template carries the `[un] anything goes here` strap in the footer. All payload fields are HTML-escaped before interpolation.
