# Wallet passes

The member card as an Apple Wallet pass and a Google Wallet pass, kept current
when a member's standing changes. Nothing is issued until the owner has enrolled
with both platforms and put the resulting credentials into the environment;
until then every wallet route answers 501 with one sentence and the card page
shows no button at all.

## What a pass is, here

The digital card at `/card` carries a credential that rotates every sixty
seconds (`issue_member_qr` / `verify_member_qr`). A wallet pass cannot rotate —
it is a file on a phone — so a pass does not carry that credential. It carries a
**wallet token**: a durable uuid behind a URL, `https://unhingedsocial.us/w/<token>`,
issued once per member and revocable. The gangway pulls the token off the path
and asks `verify_wallet_token()`, which answers the same three states the
rotating credential does — `aboard`, `hold`, `void` — and nothing else.

The pass face shows the member's name, plan, number, city, and a hold where one
stands. The serial number of the Apple pass is the member's profile id, so a
member has one pass for life and updates replace it in place; the Google object
id is `<issuerId>.<profile id>` for the same reason.

## Routes

| Method | Path | Who calls it | Answers |
| --- | --- | --- | --- |
| GET | `/api/wallet/status` | the card page | `{ apple, google }` — which platforms this deployment can issue to |
| GET | `/api/wallet/apple` | a signed-in member | a `.pkpass` (`application/vnd.apple.pkpass`) |
| GET | `/api/wallet/google` | a signed-in member | 302 to `https://pay.google.com/gp/v/save/<jwt>` |
| POST | `/api/wallet/apple/v1/devices/{device}/registrations/{passType}/{serial}` | the phone | register for updates (body `{ pushToken }`) — 201 / 200 |
| DELETE | `/api/wallet/apple/v1/devices/{device}/registrations/{passType}/{serial}` | the phone | unregister — 200 |
| GET | `/api/wallet/apple/v1/devices/{device}/registrations/{passType}?passesUpdatedSince=` | the phone | `{ lastUpdated, serialNumbers }` or 204 |
| GET | `/api/wallet/apple/v1/passes/{passType}/{serial}` | the phone | the current pass; honours `If-Modified-Since` → 304 |
| POST | `/api/wallet/apple/v1/log` | the phone | 200; lines go to the server log as `[un] wallet device log:` |

The `v1/*` routes authenticate with `Authorization: ApplePass <token>`, where
the token is derived per serial from the pass signing key (no column, no row
needed). Rotating the pass certificate rotates every device's token, which is
what a certificate rotation should do; devices re-fetch the pass on the next
push and register again.

Without `SUPABASE_SERVICE_ROLE_KEY` the `v1/*` routes answer 503 — a phone
carries no session, so they read and write with the service-role client, as the
Stripe webhook does.

## Environment

Set these on the deployment (Vercel project settings, or `.env.local`). PEMs may
be pasted as one line with `\n` where the line breaks were; both forms are read.

| Variable | What it is |
| --- | --- |
| `APPLE_PASS_TYPE_ID` | the Pass Type ID, e.g. `pass.us.unhingedsocial.member` |
| `APPLE_TEAM_ID` | the ten-character Apple Developer Team ID |
| `APPLE_PASS_CERT_PEM` | the Pass Type ID certificate, PEM |
| `APPLE_PASS_KEY_PEM` | its private key, PEM (encrypted or not) |
| `APPLE_PASS_KEY_PASSPHRASE` | only if the key PEM is encrypted |
| `APPLE_WWDR_PEM` | Apple Worldwide Developer Relations intermediate (G4), PEM |
| `APPLE_APNS_KEY_PEM` | the APNs auth key (`.p8`), PEM — pushes on update; optional |
| `APPLE_APNS_KEY_ID` | the ten-character key id of that `.p8`; optional |
| `APPLE_APNS_TEAM_ID` | optional; falls back to `APPLE_TEAM_ID` |
| `GOOGLE_WALLET_ISSUER_ID` | the numeric issuer id from the Google Pay & Wallet Console |
| `GOOGLE_WALLET_SA_EMAIL` | the service account's `client_email` |
| `GOOGLE_WALLET_SA_KEY_PEM` | the service account's `private_key` (RSA, PEM) |
| `NEXT_PUBLIC_SITE_URL` | already set; the barcode URL, web service URL and Google `origins` are built from it |
| `SUPABASE_SERVICE_ROLE_KEY` | already set for Stripe; the PassKit web service and `notifyWalletUpdate()` need it |

Apple is "configured" when the first five Apple rows are set. Google is
configured when its three are set. Pushes happen when the APNs rows are set as
well; without them a pass still updates whenever the phone asks on its own
schedule (Wallet refreshes passes with a `webServiceURL` periodically).

## Apple — one-time setup

1. **Enrol** in the Apple Developer Program (organisation enrolment; the D-U-N-S
   number takes a few days). Note the Team ID under Membership details.
2. **Pass Type ID.** Certificates, Identifiers & Profiles → Identifiers → `+` →
   Pass Type IDs. Reverse-DNS, e.g. `pass.us.unhingedsocial.member`. This is
   `APPLE_PASS_TYPE_ID`.
3. **Certificate.** On a Mac, Keychain Access → Certificate Assistant → Request a
   Certificate From a Certificate Authority (saved to disk, key pair 2048 RSA).
   Back in the portal, open the Pass Type ID → Create Certificate → upload the
   CSR → download `pass.cer`. Double-click to add it to the login keychain, then
   export the certificate **with its private key** as `pass.p12` (set a
   passphrase when asked). Convert:

   ```sh
   openssl pkcs12 -in pass.p12 -clcerts -nokeys -out pass-cert.pem -legacy
   openssl pkcs12 -in pass.p12 -nocerts -out pass-key.pem -legacy          # keeps the passphrase
   # or, to drop it:  openssl pkcs12 -in pass.p12 -nocerts -nodes -out pass-key.pem -legacy
   ```

   `pass-cert.pem` → `APPLE_PASS_CERT_PEM`; `pass-key.pem` → `APPLE_PASS_KEY_PEM`
   (and the passphrase → `APPLE_PASS_KEY_PASSPHRASE` if kept).
4. **WWDR intermediate.** Download the *Worldwide Developer Relations - G4*
   certificate from <https://www.apple.com/certificateauthority/> and convert:

   ```sh
   openssl x509 -inform der -in AppleWWDRCAG4.cer -out wwdr.pem
   ```

   → `APPLE_WWDR_PEM`. Check the pass certificate was issued under G4 (the
   portal has issued under G4 since 2021); if `openssl verify -CAfile wwdr.pem
   pass-cert.pem` complains, download the intermediate it names instead.
5. **APNs key (for pushes).** Keys → `+` → tick Apple Push Notifications service
   → download the `.p8` once (Apple does not keep it). Its contents →
   `APPLE_APNS_KEY_PEM`; the Key ID shown beside it → `APPLE_APNS_KEY_ID`.
   Wallet pushes always go to the production APNs host, topic = the Pass Type ID.
6. Set the variables and redeploy. `GET /api/wallet/status` should now answer
   `{ "apple": true, … }`, and the card page offers **Add to Apple Wallet**.

The pass icon is `public/icons/icon-192.png`, inlined as bytes in
`src/lib/wallet/apple-icon.ts` (see the note there to regenerate). Wallet scales
it; the one file serves icon and logo at every density. Apple's own
"Add to Apple Wallet" badge artwork is downloadable from the Apple Developer
site under its licence and may replace the text link if the owner wants it.

## Google — one-time setup

1. **Issuer account.** <https://pay.google.com/business/console> → Google Wallet
   API → sign up as an issuer. The console shows the numeric **Issuer ID** →
   `GOOGLE_WALLET_ISSUER_ID`. New issuers start in demo mode (passes can only be
   saved by test users listed in the console); request publishing access from
   the same console when ready for members.
2. **Service account.** In Google Cloud (any project) enable the *Google Wallet
   API*, create a service account, and create a JSON key. From the JSON:
   `client_email` → `GOOGLE_WALLET_SA_EMAIL`, `private_key` →
   `GOOGLE_WALLET_SA_KEY_PEM`.
3. **Grant access.** Back in the Pay & Wallet Console → Users → add the service
   account email with the Developer role.
4. The **class** `<issuerId>.un-member` is created on first use through the
   Wallet REST API and remembered per process. To create it by hand instead,
   POST the object returned by `buildGenericClass()` in `src/lib/wallet/google.ts`
   to `https://walletobjects.googleapis.com/walletobjects/v1/genericClass`
   with a bearer token for the service account (scope
   `https://www.googleapis.com/auth/wallet_object.issuer`).
5. Set the variables and redeploy. The card page offers **Save to Google Wallet**.

Google's own "Add to Google Wallet" button assets are available under their
brand guidelines and may replace the text link.

## Database — apply this SQL

The app reads two tables and three functions that do not exist yet. It fails
closed until they do: `/api/wallet/apple` and `/api/wallet/google` answer 503
("The club's records don't hold wallet passes yet"), the `v1/*` routes answer
503 with `Retry-After`. Apply as one migration.

```sql
/* A wallet pass cannot rotate, so it carries a durable token behind a URL. One
   live token per member; revoking is the way back from a pass that got out.
   touched_at is the instant the pass last changed — the PassKit web service's
   Last-Modified and passesUpdatedSince read it. */
create table public.wallet_tokens (
  token uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  issued_at timestamptz not null default now(),
  revoked_at timestamptz,
  touched_at timestamptz not null default now(),
  constraint a_wallet_token_is_revoked_after_it_is_issued
    check (revoked_at is null or revoked_at >= issued_at)
);

create unique index wallet_tokens_one_live_per_member
  on public.wallet_tokens (profile_id) where revoked_at is null;
create index wallet_tokens_by_member on public.wallet_tokens (profile_id, issued_at desc);

alter table public.wallet_tokens enable row level security;

/* Your own token and nobody else's. The crew's route in is verify_wallet_token(),
   which takes a token someone physically presented. */
create policy "your own wallet token" on public.wallet_tokens
  for select to authenticated using (profile_id = auth.uid());

revoke insert, update, delete on public.wallet_tokens from anon, authenticated;

/* The live token, or a fresh one. Every column reference is aliased — the
   output names shadow the table's, and 42702 is how issue_member_qr() first
   shipped. */
create or replace function public.issue_wallet_token()
returns table (token uuid, profile_id uuid, issued_at timestamptz, revoked_at timestamptz, touched_at timestamptz)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'sign in first'; end if;

  return query
    select t.token, t.profile_id, t.issued_at, t.revoked_at, t.touched_at
      from public.wallet_tokens t
     where t.profile_id = v_uid and t.revoked_at is null;
  if found then return; end if;

  return query
    insert into public.wallet_tokens as w (profile_id)
    values (v_uid)
    returning w.token, w.profile_id, w.issued_at, w.revoked_at, w.touched_at;
end;
$$;

/* Revoking is the member's own way back: the pass on every phone goes void at
   the gangway, and the next Add-to-wallet mints a new token. */
create or replace function public.revoke_wallet_token()
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'sign in first'; end if;
  update public.wallet_tokens t set revoked_at = now()
   where t.profile_id = v_uid and t.revoked_at is null;
end;
$$;

/* The gangway's three states, and only three — the same contract as
   verify_member_qr(). Unknown and revoked are one answer on purpose. */
create or replace function public.verify_wallet_token(p_token uuid)
returns table (state text, profile_id uuid, full_name text, member_no text, standing text)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_row record;
begin
  if not public.is_staff() then raise exception 'staff only'; end if;

  select t.profile_id, t.revoked_at, p.full_name, p.member_no, p.status
    into v_row
  from public.wallet_tokens t
  join public.profiles p on p.id = t.profile_id
  where t.token = p_token;

  if v_row.profile_id is null or v_row.revoked_at is not null then
    return query select 'void'::text, null::uuid, null::text, null::text, null::text;
    return;
  end if;

  return query select
    case when v_row.status = 'active' then 'aboard' else 'hold' end,
    v_row.profile_id, v_row.full_name, v_row.member_no, v_row.status;
end;
$$;

revoke all on function public.issue_wallet_token() from public, anon;
revoke all on function public.revoke_wallet_token() from public, anon;
revoke all on function public.verify_wallet_token(uuid) from public, anon;
grant execute on function public.issue_wallet_token() to authenticated;
grant execute on function public.revoke_wallet_token() to authenticated;
grant execute on function public.verify_wallet_token(uuid) to authenticated;

/* A standing change touches the pass, so a phone asking "anything new since"
   is told yes even when nothing called notifyWalletUpdate(). */
create or replace function public.a_standing_change_touches_the_wallet_pass()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if new.status is distinct from old.status
     or new.tier is distinct from old.tier
     or new.plan_id is distinct from old.plan_id
     or new.full_name is distinct from old.full_name
     or new.member_no is distinct from old.member_no
     or new.home_city is distinct from old.home_city then
    update public.wallet_tokens t set touched_at = now()
     where t.profile_id = new.id and t.revoked_at is null;
  end if;
  return new;
end;
$$;

create trigger a_standing_change_touches_the_wallet_pass
  after update on public.profiles
  for each row execute function public.a_standing_change_touches_the_wallet_pass();

/* Which phones hold which pass. Written only by the PassKit web service with the
   service role, after the pass's own authentication token has been checked; no
   member or crew policy at all. */
create table public.wallet_registrations (
  device_id text not null,
  pass_type text not null,
  serial uuid not null references public.profiles(id) on delete cascade,
  push_token text not null,
  created_at timestamptz not null default now(),
  primary key (device_id, pass_type, serial)
);

create index wallet_registrations_by_pass on public.wallet_registrations (pass_type, serial);

alter table public.wallet_registrations enable row level security;
revoke all on public.wallet_registrations from anon, authenticated;

notify pgrst, 'reload schema';
```

Types to add to `src/lib/supabase/types.ts` when the shared file is next
touched (until then they live in `src/lib/wallet/facts.ts` as
`WalletTokenRow` and `WalletRegistrationRow`):

```ts
wallet_tokens: Table<WalletTokenRow, Ins<WalletTokenRow, "profile_id">>
wallet_registrations: Table<WalletRegistrationRow, Ins<WalletRegistrationRow, "device_id" | "pass_type" | "serial" | "push_token">>
// Functions
issue_wallet_token: { Args: Record<string, never>; Returns: WalletTokenRow[] }
revoke_wallet_token: { Args: Record<string, never>; Returns: undefined }
verify_wallet_token: { Args: { p_token: string }; Returns: Array<{ state: "aboard" | "hold" | "void"; profile_id: string | null; full_name: string | null; member_no: string | null; standing: string | null }> }
```

## Keeping a pass current

`notifyWalletUpdate(profileId)` in `src/lib/wallet/apns.ts` does three things
and never throws: bumps `wallet_tokens.touched_at`, pushes every registered
Apple device (empty push, topic = pass type; a 410 drops the registration), and
PATCHes the Google object in place. Call it after any write that changes what
the pass says — a plan change, a hold placed or lifted, a name or number
reissued, a home city set. It needs `SUPABASE_SERVICE_ROLE_KEY`; with the APNs
or Google variables absent the corresponding half is skipped and says so in its
result.

The trigger above covers the `touched_at` half on its own, so a phone that asks
on its own schedule gets the new pass even where the call was forgotten; the
call is what makes it arrive within seconds instead of hours.

## The gangway

A scanned wallet pass reads `https://<site>/w/<uuid>`. The gangway's scanner
should recognise that shape, take the last path segment, and call
`verify_wallet_token(p_token)`; the answer has the same columns as
`verify_member_qr`, so the ABOARD / HOLD / VOID handling is shared. A member
scanning their own pass with a phone camera lands on `/w/<uuid>`, which should
exist as a small page that sends a signed-in member to `/card` and says nothing
useful to anyone else; add `/w/:token*` to the no-referrer, no-store header
group in `next.config.ts` beside `sign|stub|kiosk`, as it carries a credential
in its path.

## Trying it

- Without certificates: `curl -i /api/wallet/status` → both false;
  `curl -i /api/wallet/apple` → 501 `{"error":"Wallet passes are not issued on this deployment yet."}`.
- With certificates and the SQL applied: sign in, `GET /api/wallet/apple`, and
  open the `.pkpass` on a Mac or iPhone. `unzip -l` lists seven files; `openssl
  cms -verify -inform DER -in signature -content manifest.json -binary -noverify`
  checks the signature against its embedded chain.
- Register a device and change the member's plan on the Bridge; the phone
  should refresh the pass within seconds when APNs is configured.
