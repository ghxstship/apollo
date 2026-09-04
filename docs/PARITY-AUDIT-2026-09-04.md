# Parity audit — 2026-09-04

[un] set against the leaders in community, paid membership, private clubs, events and IRL discovery. Read-only audit of the repository against primary-source research on 24 products. Supersedes `COMPETITIVE-PARITY.md` (2026-08) and `GAP-REGISTER.md` (2026-07), both of which described gaps that no longer exist; the rejections table and the "where [un] leads" list from the former are carried forward below, updated.

## Where it stands

[un] is past parity on money (folio, installments, dunning ladder, tax by city, reconciliation joined on the Stripe object, per-episode P&L), on vetting (database-enforced, vetting files, composition caps), on the night itself (Radar, Tables, envelopes, gangway with offline queue, galley on the tab, run of show) and on governance (documents with versions and signatures, audit log, export and erasure, a lexicon and route gate in CI). Nobody in the set has that stack.

It lacked the last inch of the member's phone — a wallet pass, a notice that opens the right page, a preference that controls the channel — and three inconsistencies Model C left behind: members called Regional / National / Global while they bought Deck / Cabin / Owner / Founding; a public membership page describing the retired ladder; and a guest guard that admitted only the top tier while the copy promised two guests.

## The leaders

| Category | Leaders |
| --- | --- |
| Community | Circle, Mighty Networks, Skool, Discord (Geneva as reference; shut down 2025) |
| Paid membership | Patreon, Substack, Kajabi |
| Private clubs | Soho House, The Ned, Zero Bond, Casa Cipriani; Peoplevine as the platform behind most of them |
| Events | Luma, Eventbrite, Posh, DICE, Resident Advisor, Partiful |
| IRL discovery | Timeleft, 222, Thursday |
| Studio scheduling | Mariana Tek, Mindbody, ClassPass |
| Loyalty and fandom | Yotpo, Smile.io, the Love Island USA app |

"Bubble" is bubble.io, a no-code builder — a build-vs-buy datapoint, not a competitor.

## What was done on 2026-09-04

Everything below the line "table stakes" and "worth stealing" was implemented the same day, as migrations plus surfaces, except where marked owner-blocked.

**Table stakes**: guest allowance per plan (`membership_plans.guest_allowance`, read by both guards and the copy); wallet passes (mechanism built, fails closed until the Apple and Google credentials exist — see `WALLET.md`); screening questions and a proposer on the application (`application_questions`, `applications.answers`); notices carry an `href`; preferences as category × channel; broadcast on push and SMS with scheduling; a door role (`door_grants`, `is_door()`); an accessibility statement on `/legal`; cohorts, funnel and member value in Reports; promo codes and comps on dues (`profiles.comped_until`); bulk actions on Members; calendar quick-add links.

**Worth stealing**: progressive venue reveal on the episode page; opt-in "on deck" presence during Live (`aboard_now`, `deck_status`); a private one-question debrief (`debriefs`) with no scores; "sit near again" hints for the Bridge (`table_picks.again`); DMs gated on having sailed together; invitation by demand (`episodes.by_request`); standby passes (`episodes.standby_passes`, `passes.standby`); the season recap page; member votes on bounded questions (`polls`, never on people); phone-bound stubs that render from T-2h; automation delays and a webhook action (`automation_queue`); an MCP endpoint for the Bridge; the frames nudge after a night (`frames-wanted`); a 9:16 share card per episode.

## Deliberate rejections — parity we should NOT pursue

| Practice | Who | Why not here |
| --- | --- | --- |
| Free trials, freemium | Circle, Patreon, Skool, Kajabi | Vetting is the gate; the invitation ashore is the trial and it is a person. Access at $0 covers the funnel. |
| Public leaderboards, posting unlocked by level | Circle, Mighty, Skool | "Miles, not likes." Regatta standings are bounded and become history. |
| Points expiry with reminders | Yotpo, Smile.io | Knots are a record, not a coupon. Inflation is managed in the redemption catalogue. |
| Ratings, reviews, compatibility %, urgency chips | Luma, 222, DICE, Eventbrite | No scoring of people or of the club. The debrief goes privately to Shoreside. |
| Late-cancel and no-show fees as revenue | Mariana Tek, ClassPass, Timeleft | The deposit forfeits to the galley and returns on check-in; repeat no-shows cost standing. |
| Resale, dynamic pricing, BNPL at checkout | DICE, RA, Posh, TIXR | Passes are never resold for cash; the waitlist is the market. Installments exist without interest. |
| Friends-going, contacts sync, public Discover | Posh, DICE, Eventbrite, Partiful | A vetted roster with consented manifests. Social proof is "who's aboard", with a yes. |
| Algorithmic seating, personality tests, GPS check-in | Timeleft, 222 | Tables are laid by people; the door is a crew scan. The human in the loop is the show. |
| Gift a month, group subscriptions | Patreon, Substack | Memberships are non-transferable and vetted. Sponsors and comps cover the legitimate cases. |
| Courses, streams, replays, audio rooms | Circle, Mighty, Skool, Fanbase | No replays, no streams. The show is the room. |
| Reserved seating charts | TIXR, Eventbrite | Meaningless for flotillas; the Bridge assigns hulls. |
| Fee-on-top checkout | Eventbrite, most | The house account settles a balance, not a cart. |
| Open self-serve signup | Circle, Luma | Sign-in is DB-enforced invited-only. |
| Native-app-only ticketing with screenshot blocking | DICE | PWA plus a wallet pass reaches the same place for a five-city club. Revisit if wallet adoption stalls. |

## Where [un] leads the comparison set

- The folio: charges, comps, plan credit, refunds, disputes, tax and Stripe settlement against a running member balance, with installments and a dunning ladder that names its date.
- Reconciliation joined on the Stripe object, and a per-episode P&L that shows no margin until costs are recorded.
- Vetting enforced in the database, with composition caps per segment and a segmented waitlist with timed offers.
- Radar and Tables: sealed matching that opens at 19:00 and expires, with a printed envelope.
- The gangway: camera, wedge and typed code through one path, an offline queue, a printable evacuation list, and now a door role that expires.
- Documents with versioned clauses and signatures; export and scheduled erasure; an audit log on fourteen tables.
- A confirm-first member-side agent, and now a read-only MCP endpoint for operators.
- A lexicon, route and design-system gate in CI (1,685 route checks, 1,702 e2e checks, 17 design-system checks).

## Owner-blocked

Apple Developer enrollment and a Pass Type ID (wallet), the Google Wallet issuer and service account, Stripe price ids on the five plans, real cost lines in the P&L, the FL/CA tax determinations, and the top-line revenue definition on Reports.
