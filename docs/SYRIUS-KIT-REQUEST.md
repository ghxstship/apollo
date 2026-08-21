# Design-kit request — components missing from the Syrius kit

Two working product areas exist in the codebase that the Syrius Social Design
System does not cover. Both are carried over and interim-rebranded (noir/gold,
producer voice); this document is the request to Claude Design / Claude Code for
proper kit coverage in the next update. Component APIs should mirror
`src/components/ds/` like the rest of the kit.

## 1. The logbook (gamification)

The mechanic set: **accumulated history, never competition for status** — a
logbook, not a leaderboard (persistent public rankings are banned in code). For
a filmed product this reads naturally as *your season on camera*.

| Component | What it is today | States / notes for the kit |
| --- | --- | --- |
| **Passage Log** | 6-figure stat grid (nautical miles, sailings, hours at sea, harbors, hulls, crew met) + "since" date | Mono figures on hairline cells; container-responsive (auto-fit); empty state "Nothing logged yet" |
| **Marks list** | 9 permanent achievements in three kinds (a first / a tally / a collection), conferred by trigger, rendered as typographic rows — deliberately no badges or color | Held vs "still ahead" (own profile only shows the latter); conferral date in mono |
| **Contest card** | Regatta (ranked) or Challenge (reach a target); window, metric chip, Knots award chip, "entered" state, days-left mono line | Running vs settled variants |
| **Standings table** | Live or frozen results; roman-numeral places, tie handling, "YOU" marker row highlight; challenge shape swaps rank column for a Reached column | Also the settled/"result" variant published once |
| **Knots ledger** | Currency balance stat + ledger rows (reason · delta · date) + rewards list with costs and redeem action | Redemption confirm dialog |
| **Season card (email)** | End-of-season figures + marks won + longest sailing, queued per member who sailed | Needs the ivory email-system treatment |
| **Bridge: contest composer** | Call a contest dialog (name, shape, metric, target, window, prize, award), open/settle lifecycle with settle-confirm | Operator-side |

Voice direction for the kit: episode framing ("Your season, on the record"),
scarcity flat, no exclamation marks.

## 2. The Booth (social feed — was Open Deck)

Confession-booth framing: the member-only feed where the cast talks.

| Component | What it is today | States / notes for the kit |
| --- | --- | --- |
| **Post card** | Author (first name + avatar tone), body, optional sailing tag, timestamp in mono | With/without media slot (IMAGERY TK) |
| **Hail** | The single reaction (no like-counts arms race) | Count + hailed state |
| **Comment thread** | Flat comments under a post, first-name authors | Empty state |
| **Composer** | Plain textarea + post action; optional sailing attach | Producer-voice placeholder ("Say it to the booth.") |
| **Flag → moderation** | Member flags a post; Bridge queue with remove / leave-up resolution | Operator-side queue table + resolution dialog |

## Interim treatment (already in hand)

Until kit coverage lands, both areas ship re-skinned with the Syrius tokens and
re-voiced (Regattas keep their name — charter-native; Open Deck becomes **the
Booth**), using existing DS primitives only. No new visual language is invented
in the interim — that is what this request is for.
