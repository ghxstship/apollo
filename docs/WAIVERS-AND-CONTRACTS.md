# Waivers and contracts

Modular clause management, benchmarked against the waiver, e-signature and CLM
industries, built to 3NF with the accessibility, privacy and security lines held
explicitly rather than assumed.

## The rule everything follows

Modularity and enforceability pull against each other. The moment an admin can
edit clause language, "what did this person actually agree to?" stops being
answerable — and that question is the entire value of a waiver.

**A clause version is immutable once published. A document version is a
composition of clause versions. A signature binds to a SHA-256 of the text that
was actually rendered.** Editing never mutates; it publishes *n+1*.

Two guests signing the same document version can hold different hashes, because
a Sea Day assembles clauses a Port Day does not. That is not a flaw in the
hashing — it is the reason the hash is of the rendered text rather than of the
version id.

## Benchmarks

| Source | What was taken |
| --- | --- |
| Smartwaiver, WaiverForever | Expiry on a period; adult / minor / guardian signing; a searchable register; token-reachable signing without an account |
| Ironclad, Juro, Icertis | The clause library itself — approved language, versioned, composed into documents rather than copied into them |
| PandaDoc | Conditional assembly. `document_clauses.condition` is Smart Content: `{"class":"sea"}` includes a clause only where the render context contains it |
| ESIGN / UETA | Intent, consent to transact electronically, attribution, and a reproducible record — signature, IP, server timestamp, user agent, consent text, and a hash of what was shown |

Deliberately not taken: redlining and negotiation (a club issues terms, it does
not negotiate them), third-party e-sign integration (it would route member PII
through a processor for no gain), and driver's-licence scanning.

## Schema

```
clauses               code PK, title, category, position, active
clause_versions       clause_code FK, version, body           ← immutable, unique(code, version)
documents             code PK, title, kind, audience, validity_months
document_versions     document_code FK, version, status, effective_from
                      ← unique(code, version); partial unique index: one published per document
document_clauses      (document_version_id, clause_version_id) PK, position, condition jsonb
document_requirements (document_code, gate) PK
signatures            document_version_id FK, profile_id?, guest_id?, rendered_body,
                      rendered_hash, consent_esign, consent_text, signature_kind,
                      signature_data, signed_at, signed_ip, user_agent, redacted_at
```

### Normal form

Every table is 3NF. Two decisions look like exceptions and are not:

- **`signatures.rendered_body` / `rendered_hash` are not derived data.** Assembly
  depends on a runtime context, so the rendered text is not a function of
  `document_version_id` alone — it is a fact about the signing event. ESIGN
  requires the record be reproducible, and a hash of something you cannot
  reproduce proves nothing.
- **`signatures` carries no `voyage_id`.** For a guest the sailing is reachable
  as guest → rsvp → voyage, and storing it beside `guest_id` would be exactly the
  transitive dependency 3NF forbids. Members sign standing documents.

### Single source of truth

`profiles.waiver_signed_at` is **dropped**. It was a second answer to a question
`signatures` already answers, and it could not answer the parts that matter —
which document, which wording, when it lapses. The gangway and the manifests now
read `member_waiver_standing`, a `security_invoker` view that derives standing
from the record.

## Immutability

Enforced in the database, not by convention:

| Table | Rule |
| --- | --- |
| `clause_versions` | No UPDATE, no DELETE. Ever. |
| `document_versions` | draft → published → retired only. A published version cannot return to draft or be deleted. |
| `document_clauses` | Writable only while the parent version is a draft. |
| `signatures` | No DELETE except through the retention purge. UPDATE may not touch `document_version_id`, `rendered_hash`, `signed_at` or `consent_esign`. |

RLS grants no UPDATE or DELETE policy on the record tables at all, so a client is
refused before a trigger is reached. The triggers are the second layer, for the
day someone adds a policy.

## Privacy

- **Erasure vs. retention.** GDPR Art 17(3)(e) does not reach records needed to
  establish or defend a legal claim, which is what a waiver is. `redact_signature()`
  removes the person — name, email, guardian, IP, user agent, the signature image
  and the rendered body — and keeps the proof: the hash, the timestamp, the
  version and the consent flag. Permanent, staff-only, refused twice.
- **Retention.** `purge_expired_signatures(years = 6)` redacts anything past the
  window and then removes what has been redacted and outlived it. Six years is
  the period the `data-notice` clause states out loud, so the words members read
  and the code that enforces them agree.
- **Minimisation.** Only what ESIGN attribution needs is captured. No
  device fingerprinting, no geolocation, no document scanning.
- **The notice is a clause.** `data-notice` is in the library, versioned with
  everything else, so the privacy statement cannot drift from the practice.

## Security

- Signing is RPC-only. `signatures` has **no INSERT policy** — a client that
  could write its own row could claim to have signed anything. The hash, the
  timestamp and the IP are computed server-side.
- Guest signing is token-scoped and anon-callable by design; asking a guest to
  create an account before signing a liability waiver is how waivers go unsigned.
  The token resolves the sailing, so it cannot be aimed at another voyage's
  document, and a guest token is refused for any non-guest document.
- `/sign/[token]` is `noindex, nofollow` and marked credential-bearing in the
  route manifest, so the audit checks that a made-up token 404s rather than
  enumerating real ones.
- `render_document()` is definer — it must read `clause_versions`, which members
  cannot — and therefore refuses to render an unpublished draft to a non-staff
  caller.
- All 548 `security_report()` invariants hold across the enlarged schema.

## Accessibility (WCAG 2.2 AA / EN 301 549)

The decision that matters is the signature itself. **A drawn signature can never
be the only way to sign** — a canvas is unusable by keyboard and by screen
reader, and fails 2.1.1 outright. Typing your name is the default and is offered
first; drawing is the alternative, and the drawing panel carries a visible link
back to typing.

Also held: `fieldset`/`legend` on the signing-method choice (1.3.1); an explicit
label on every control, verified in the rendered HTML; consent as an unticked
checkbox, never pre-ticked; errors announced through `role="alert"` +
`aria-live="assertive"` and tied to their field by `aria-describedby` (3.3.1,
3.3.3); the scrollable document given `tabindex="0"` and an accessible name so it
is reachable and announced (2.1.1, 4.1.2); focus rings preserved (2.4.7); and
every target at 44px, comfortably past the 24px floor (2.5.8).

## Workflows

**Member** — `/agreements` lists what is signed, lapsed or outstanding, derived
per request. `/agreements/[code]` renders the document and takes the signature.

**Guest** — the member sees each guest's waiver standing beside their stub on
`/manifest` and can copy a per-guest signing link. The guest opens `/sign/[token]`,
reads a document assembled for that sailing, and signs. No account.

**Staff** — `/bridge/documents` carries three tabs: the clause library (write,
reword into a new version, see version counts), the documents (draft the next
version from the standing one, compose by ticking clauses and setting when each
applies, publish), and the register (every signature with its hash, redactable).

## Enforcement

The gate sits at **check-in, not booking** — which is where the waiver industry
puts it and where it belongs. A pass is a reservation and nothing about reserving
one is dangerous; boarding is where the risk attaches. It also means a member can
claim a pass in January and sign in June, and that somebody arriving unsigned is
handed a link rather than turned away.

`require_signature_at_check_in()` refuses an unsigned member; its sibling refuses
an unsigned guest. Both name the outstanding document, and the gangway passes
that through as guidance rather than a generic failure.

## Counter-signature

A waiver is one-way. A contract binds the club too, and a contract only the other
side has signed is an offer. `counter_sign()` is staff-only, refuses a waiver,
refuses twice, and notifies the other party. `agreement_standing` reports
`in_force` — always true for a waiver, true for a contract only once the club has
signed.

Counter-signatures live in their own table rather than as nullable columns on
`signatures`: a counter-signature is a distinct act by a distinct person at a
distinct time, and 90% of rows are waivers that would carry the columns empty.

## Two rules that contradicted each other

Worth recording, because both were found by running the suite rather than by
reading the schema.

`signatures.guest_id` was `ON DELETE SET NULL`. Deleting a guest therefore
stranded their signature — and since the uniqueness key is
`(version, profile, guest)` with `NULLS NOT DISTINCT`, a second stranded
signature collided with the first, so deleting one guest could make deleting the
next impossible. It is now `RESTRICT`: a guest who has signed is retained as long
as the signature is.

That change then broke `sync_guest_rows()`, which sweeps guests dropped from
`guest_names` — with RESTRICT the sweep failed, and because it runs in a trigger
the member's whole edit failed with it. It now sweeps only guests who never
signed. Taking a name off a pass does not unmake the waiver that person signed.

## Open

- **The clause wording is placeholder.** The platform proves what was shown and
  agreed; it cannot make the language sound. Enforceability also turns on
  state-specific public-policy and gross-negligence limits. The words want a
  lawyer — which is exactly why replacing them costs nothing here.
