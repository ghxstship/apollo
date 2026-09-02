# The staging click-through

One person, one phone, one staging episode, about forty minutes. This is the
hand-on-the-controls check the automated gates cannot give: the e2e suite
exercises every action through the API, and the route audit reads every page,
but neither presses a button on a five-inch screen with a thumb.

Run it on a **staging** deploy (or a preview URL) against the fixture personas,
never on production data. Sign in as `e2e-regional@fixtures.invalid`,
`e2e-global@fixtures.invalid` and `e2e-staff@fixtures.invalid` in three browser
profiles. Reset the fixtures first (`npm run fixtures:reset`) so the ledgers and
inboxes read clean.

Routes here follow the 2026-09 alignment: every surface answers to the name on
its own heading. `/passes` was `/manifest`, `/itinerary` was `/charter`,
`/tonight` was `/tables`, `/series` was `/activity` then `/experiences`, and the
public listing is `/episodes`. The old addresses still 308, so a stale
bookmark is not a defect — a stale **link inside the product** is.

Tick each line. A line that fails is a defect — file it with the screen, the
persona, the width, and what the page said instead.

## 0 · Set up (staff, desktop)

- [ ] `/bridge/voyages` → **New episode** → afloat, one week out, 4 passes, $10,
      deposit $5, muster "Gangway B-12". Pick a **Series** and a **City**. It
      appears on the board as SCHEDULED.
- [ ] Leave the Series blank on a second episode. It files as a **Special** and
      says so on the board, rather than reading as a blank or a dash.
- [ ] `/bridge/composition` → pick it → **Save the ceiling** at 12 heads. The hull
      line updates and the passes-on-sale figure follows.
- [ ] `/bridge/tonight` → pick an episode ashore → **Lay a table** for six. It
      lists as OPEN.

## 1 · Reserve, guest, release (regional, phone width ≤ 390px)

- [ ] `/passes` → the new episode shows **Confirm your pass**. Tap it. The
      confirm sheet opens, states the price and the deposit, and has a cancel
      that closes it without a charge.
- [ ] Confirm. The row flips to ABOARD, `/home` shows the pass, `/inbox` has
      "You're aboard", `/account` shows the deposit line.
- [ ] `/passes` → **Going solo?** opens the explainer and closes on tap-out.
- [ ] `/passes` → **Release** the pass. The refusal or the credit is voiced in
      words; `/account` shows the credit; the row returns to Confirm your pass.
- [ ] The hamburger menu opens, lists every member route, and closes on Escape
      and on tap-out. Nothing scrolls horizontally on any page.

## 2 · Guests and cabins (global, phone width)

- [ ] `/passes` → Confirm with **two guests** by name. Both names show on the
      pass; `/account` charges one pass, not three.
- [ ] `/itinerary` → the run of show and cabin card fill in for the booked
      episode.
- [ ] Remove one guest. The companion count drops; the other guest stays.

## 3 · The gangway (staff, phone width, camera on)

- [ ] `/bridge/gangway` → pick the episode → **Scan with camera** opens the
      camera and reads the member's `/card` code off a second phone.
- [ ] **Check in** the regional pass. The count moves to 1 aboard; the member's
      `/live` page flips to underway; no waiver-missing badge if the waiver is on
      file, a badge if it is not.
- [ ] Print the gangway list. The print view strips the chrome and shows name,
      number, code, yacht, guests and waiver state.

## 4 · Comp, hold, complete (staff, desktop)

- [ ] `/bridge/sponsors` → **Sign a sponsor** → place it on the episode →
      **Comp a pass** to the national persona. Their `/passes` shows the pass
      as complimentary and `/account` shows no charge.
- [ ] `/bridge/voyages` → **Call weather hold**. The confirm names the aboard
      count; every aboard member's `/inbox` gets the hold; the public
      `/episodes/[slug]` reads WEATHER HOLD. **Lift hold** reverses it.
- [ ] **Mark completed**. Knots post to every aboard member's `/portal`; the
      deposit returns on `/account`; the episode leaves `/live`.

## 5 · Tonight and matches (regional + global, phone width)

- [ ] `/tonight` → **Take a seat** at the laid table on both phones. The seat
      holds for fifteen minutes and confirms at the door (staff
      `/bridge/tonight`).
- [ ] After the night, each says the other's name back. `/matches` shows the
      match on both phones and on neither before.

## 6 · Names line up (any persona, desktop)

The owner rule is that a route, its nav label, its `<title>` and its `<h1>` all
say the same word. This section is the only place that gets checked by eye.

- [ ] `/home` → Home Port · `/passes` → Passes · `/itinerary` → Itinerary
- [ ] `/tonight` → Tonight · `/series` → Series · `/portal` → Portal
- [ ] `/inbox` → Inbox · `/live` → Live · `/directory` → Directory
- [ ] `/card` → Member Card
- [ ] Nothing anywhere reads Harbor, Format, Charter or Manifest as a heading.
      A city is a **City**, a place is a **Venue**, a strand is a **Series**.

## 7 · Pause and resume (regional)

- [ ] `/you` → **Pause membership**. The confirm explains what keeps. `/passes`
      says paused on every row; `/membership/standing` reads "Paused at sea".
- [ ] **Resume**. Everything reads active again with the same member number.

## 8 · Strike the set (staff)

- [ ] **Cancel** the staging episode. Every aboard member's `/inbox` gets one
      cancellation, not two; `/account` squares any charge.
- [ ] `npm run fixtures:reset` leaves the five personas with empty inboxes and
      zero ledgers.
