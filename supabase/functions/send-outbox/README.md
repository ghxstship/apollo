# send-outbox

Drains `public.email_outbox`: fetches up to 25 `pending` rows, renders the template to subject + HTML, and delivers via Resend. Without a Resend key it marks fetched rows `skipped` so the queue still drains in dev.

Row lifecycle: `pending` → `sent` (with `sent_at`) | `failed` | `skipped`. Updates are guarded on `status=eq.pending`, so re-runs and concurrent invocations never double-mark a row.

## Environment

- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` — injected automatically by the platform.
- `RESEND_API_KEY` — optional. When absent, rows are skipped (logged once per run).
- `OUTBOX_FROM` — optional sender, defaults to `LYRE SOCIAL — Shoreside <shore@lyre.social>`.

Set secrets with the CLI:

```sh
supabase secrets set RESEND_API_KEY=re_xxxxxxxx --project-ref mpyvwpunwrioakmtmcdo
supabase secrets set OUTBOX_FROM="LYRE SOCIAL — Shoreside <shore@lyre.social>" --project-ref mpyvwpunwrioakmtmcdo
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
| `salon-invite` | Come ashore once, as our guest. |
| `welcome-aboard` | Welcome aboard. |
| `boarding-pass` | Your berth is held. (renders `code`, `muster`, `starts_at` from payload) |
| `weather-hold` | Weather hold: {voyage} |
| `waitlist-release` | A berth released to you. |
| `farewell` | Fair winds. |
| `refund-posted` | Refund posted. |
| `lore-digest` | LORE, Sundays. (renders `items[]` of `{title, dek}`; the legacy `dispatch-digest` key renders the same template so queued rows still send) |

Every template carries the "Strike a chord." tagline in the footer. Unknown templates fall back to a neutral "A word from Shoreside." note. All payload fields are HTML-escaped before interpolation.
