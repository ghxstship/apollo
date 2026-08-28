# The logbook

Gamification for [UN] SOCIAL, built to the club's register rather than against it.

## The rule

**Reward the accumulation of history, not competition for status.** A logbook,
not a leaderboard.

The design system asks for restraint — hairlines over shadows, no urgency, one
accent per view. There is a comment on the home page chips that reads *"Nothing
that scores or hurries the reader."* Anything bolted on that ignores that turns a
members' club into a loyalty programme, which is precisely how Posh and Shotgun
read.

Sailing culture is already deeply gamified and has been for four centuries —
logged miles, crossing ceremonies, qualifications, regattas — and all of it is
about what you have done rather than who you beat. That is the vocabulary this
feature borrows.

`leaderboard` is in `BANNED_TERMS`. That is not decoration: a persistent public
ranking tells the bottom of the roll they are losing at belonging.

## What was built

### 1. The Passage Log

Every member's record, **computed on read** and never stored: nautical miles,
sailings, hours at sea, harbors made, hulls sailed, crew met, first sail.

Derived entirely from `rsvps × voyages.distance_nm × voyage_vessels`, which
already existed. `passage_log(p_profile_id)` is `SECURITY DEFINER` because a
member's sailings are their own rows under RLS; it returns aggregates only, and
only for a member who opted into the directory (or yourself, or staff).

Renders on the Passbook and on directory profiles. Your own log shows what is
still ahead; another member's does not — reading someone's page should not read
as a list of what they lack.

### 2. Marks

Permanent, one-time, conferred by trigger when a sailing completes. Nine of them:

| Code | Name | Earned by |
| --- | --- | --- |
| `first-watch` | First Watch | first completed sailing |
| `sea-legs` | Sea Legs | three sailings |
| `blue-water` | Blue Water | a single passage ≥ 25 NM |
| `long-passage` | The Long Passage | a sailing over eight hours |
| `night-reckoning` | Night Reckoning | a sailing carrying past midnight |
| `the-hundred` | The Hundred | 100 NM logged |
| `ships-company` | Ship's Company | sailed with 25 distinct members |
| `full-compass` | Full Compass | sailed from every open harbor |
| `whole-fleet` | The Whole Fleet | sailed aboard every active hull |

**Named Marks, not Orders**, because `/bridge/orders` already means Chandlery
purchase orders and a club this strict about lexicon cannot put two meanings on
one word. In navigation a mark is a fixed point you round on the way somewhere.

Rules live in a `CASE` inside `confer_marks()` rather than a stored expression
language — there are nine, they change rarely, and an evaluator that reads
executable text out of a table is a far larger attack surface.

Collections guard against triviality: `full-compass` and `whole-fleet` require at
least two harbors / two hulls to exist, so they cannot confer on the first sail
of a one-harbor club.

### 3. The Knots sink

Knots had inflated to roughly 5,020 earned against 250 ever spent.

The sink already existed — `rewards` + `redeem_reward`, wired into the Portal —
so the catalogue was enriched there rather than duplicated. Three defects were
fixed in the original RPC while it was open:

1. **No lock.** Two tabs could both pass the balance check and overdraw. Now
   takes `pg_advisory_xact_lock` on the member.
2. **No stock cap.** `rewards.stock` added; `null` means unlimited.
3. Its notification said "shore office", a banned term.

### 4. Contests — one engine, two shapes

`contests.shape` is `regatta` (ranked) or `challenge` (reach a target). Both run
inside a window, both are settled, and **both end**.

- `contest_standing(id)` computes live from completed sailings inside the window,
  or reads frozen results once settled. Definer, because scoring reads every
  entrant's sailings.
- `settle_contest(id)` is staff-only, refuses to run twice, freezes the standing
  into `contest_results`, pays `knots_award` (winner for a regatta; everyone who
  met the target for a challenge), notifies every entrant, and closes the book.

Metrics: `nm`, `sailings`, `harbors`, `vessels`, `crew_met`, `frames`. The
`frames` metric exists to pull photography in — the gallery is still empty.

Ties use `rank()`, so two members on equal miles both take the place and the next
one is skipped.

## Deliberately not built

- **Public all-time leaderboards.** See the rule. A settled regatta's standing is
  history, which is a different thing.
- **Points that expire.**
- **Weekly streaks.** They manufacture obligation and punish absence. Guilt is the
  wrong emotion for something people pay to belong to. Consecutive *seasons* is
  the acceptable form, and that is already what Leagues measure.
- **Badges for logging in or completing a profile.** Nothing makes a premium
  product feel cheaper faster.
- **Confetti, progress bars toward unreachable tiers, comparative nudges.**

## Where it lives

| | |
| --- | --- |
| Member | `/regattas`, `/regattas/[slug]`, Passbook, directory profiles |
| Staff | `/bridge/regattas` — call, open, settle |
| Schema | `marks`, `member_marks`, `contests`, `contest_entries`, `contest_results`, `rewards.stock` |
| Functions | `passage_log`, `confer_marks`, `contest_standing`, `settle_contest`, `season_card`, `redeem_reward` |
| Email | `season-card` template in `send-outbox` |
| Lexicon | `LOGBOOK`, `MARK_KIND`, `CONTEST_METRIC` in `src/lib/brand.ts` |

## Still open

- ~~The season's card is not scheduled.~~ `send_season_cards(from, to, label)`
  queues one card per member who actually sailed in the window, from the Bridge's
  register tab. Deliberately not a cron: a season ends when the club says it does.
  Members who did not sail get nothing — a card reading nought miles is a
  reproach, not a keepsake.
- ~~Crew-scoped contests are modelled but unused.~~ The entry policy now enforces
  the scope: a crew contest is enterable only by members aboard its voyage.
- **`ships-company` needs a bigger roll.** At 25 distinct members it is
  unreachable in demo data, correctly.
- **Hull assignment drives `whole-fleet`.** It counts `rsvps.vessel_id`, which the
  Bridge's manifest auto-assign populates. Sailings that never get assigned leave
  the mark unearnable.
