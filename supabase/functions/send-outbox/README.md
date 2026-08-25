# send-outbox

Drains `public.email_outbox`: fetches up to 25 `pending` rows, renders the template to subject + HTML, and delivers via Resend. Without a Resend key it marks fetched rows `skipped` so the queue still drains in dev.

Row lifecycle: `pending` → `sent` (with `sent_at`) | `failed` | `skipped`. Updates are guarded on `status=eq.pending`, so re-runs and concurrent invocations never double-mark a row.

## Environment

- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` — injected automatically by the platform.
- `RESEND_API_KEY` — optional. When absent, rows are skipped (logged once per run).
- `OUTBOX_FROM` — sender. Read from Supabase Vault. Sending sits on
  `atlvs.pro` because Resend verifies one domain per plan and
  `unhingedsocial.us` is not registered yet. When it is, update the single Vault
  row — no redeploy, no code change.

  **The live Vault row still carries the previous brand's display name.** The
  rebrand branch changed the code fallback in `index.ts` but deliberately did
  NOT touch Vault: that is live delivery configuration on a shared production
  project, and a bad `From` header bounces real mail. Set it by hand with the
  command below before this brand ships.

Set secrets with the CLI:

```sh
supabase secrets set RESEND_API_KEY=re_xxxxxxxx --project-ref mpyvwpunwrioakmtmcdo
supabase secrets set OUTBOX_FROM='"[UN] — Shoreside" <shore@atlvs.pro>' --project-ref mpyvwpunwrioakmtmcdo
```

Or in the Dashboard: Project Settings → Edge Functions → Secrets.

## Scheduling

Option A — Dashboard: Integrations → Cron → Create job → type "Supabase Edge Function", pick `send-outbox`, schedule e.g. `* * * * *` (every minute) or `*/5 * * * *`.

Option B — SQL (`pg_cron` + `pg_net`), run once as a migration or in the SQL editor:

```sql
select cron.schedule(
  'send-outbox-every-minute',
  '* * * * *',
  $$
  select net.http_post(
    url := 'https://mpyvwpunwrioakmtmcdo.supabase.co/functions/v1/send-outbox',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
    ),
    body := '{}'::jsonb
  );
  $$
);
```

(Store the service role key in Vault first: Dashboard → Project Settings → Vault, secret name `service_role_key`. The function is deployed with JWT verification on, so the Authorization header is required.)

Manual invoke for testing:

```sh
curl -X POST "https://mpyvwpunwrioakmtmcdo.supabase.co/functions/v1/send-outbox" \
  -H "Authorization: Bearer $SERVICE_ROLE_KEY"
```

## Templates

| template | subject |
| --- | --- |
| `application-received` | Received. A person reads it next. |
| `port-invite` | Come ashore once, as our guest. (the legacy `salon-invite` key renders the same template so queued rows still send) |
| `welcome-aboard` | Welcome aboard. |
| `boarding-pass` | Your pass is held. (renders `code`, `muster`, `starts_at` from payload) |
| `weather-hold` | Weather hold: {voyage} |
| `waitlist-release` | A pass released to you. |
| `voyage-cancelled` | Cancelled: {voyage} ("The club called it. Your account is credited in full.") |
| `farewell` | Fair winds. |
| `refund-posted` | Refund posted. |
| `lore-digest` | LORE, Sundays. (renders `items[]` of `{title, dek}`; the legacy `dispatch-digest` key renders the same template so queued rows still send) |

Every template carries the "Strike a chord." tagline in the footer. Unknown templates fall back to a neutral "A word from Shoreside." note. All payload fields are HTML-escaped before interpolation.
