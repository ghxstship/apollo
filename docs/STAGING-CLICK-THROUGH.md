# The staging click-through

One person, one phone, one staging sailing, about forty minutes. This is the
hand-on-the-controls check the automated gates cannot give: the e2e suite
exercises every action through the API, and the route audit reads every page,
but neither presses a button on a five-inch screen with a thumb.

Run it on a **staging** deploy (or a preview URL) against the fixture personas,
never on production data. Sign in as `e2e-regional@fixtures.invalid`,
`e2e-global@fixtures.invalid` and `e2e-staff@fixtures.invalid` in three browser
profiles. Reset the fixtures first (`npm run fixtures:reset`) so the ledgers and
inboxes read clean.

Tick each line. A line that fails is a defect — file it with the screen, the
persona, the width, and what the page said instead.

## 0 · Set up (staff, desktop)

- [ ] `/bridge/voyages` → **New voyage** → a Sea Day one week out, 4 passes, $10,
      deposit $5, muster "Gangway B-12". It appears on the board as SCHEDULED.
- [ ] `/bridge/composition` → pick it → **Save the ceiling** at 12 heads. The hull
      line updates and the passes-on-sale figure follows.
- [ ] `/bridge/tables` → pick a Port Day → **Lay a table** for six. It lists as OPEN.

## 1 · Reserve, guest, release (regional, phone width ≤ 390px)

- [ ] `/manifest` → the new sailing shows **Confirm your pass**. Tap it. The
      confirm sheet opens, states the price and the deposit, and has a cancel
      that closes it without a charge.
- [ ] Confirm. The row flips to ABOARD, `/home` shows the pass, `/inbox` has
      "You're aboard", `/account` shows the deposit line.
- [ ] `/manifest` → **Sailing solo?** opens the explainer and closes on tap-out.
- [ ] `/manifest` → **Release** the pass. The refusal or the credit is voiced in
      words; `/account` shows the credit; the row returns to Confirm your pass.
- [ ] The hamburger menu opens, lists every member route, and closes on Escape
      and on tap-out. Nothing scrolls horizontally on any page.

## 2 · Guests and cabins (global, phone width)

- [ ] `/manifest` → Confirm with **two guests** by name. Both names show on the
      pass; `/account` charges one pass, not three.
- [ ] `/charter` → the itinerary and cabin card fill in for the booked sailing.
- [ ] Remove one guest. The companion count drops; the other guest stays.

## 3 · The gangway (staff, phone width, camera on)

- [ ] `/bridge/gangway` → pick the sailing → **Scan with camera** opens the
      camera and reads the member's `/card` code off a second phone.
- [ ] **Check in** the regional pass. The count moves to 1 aboard; the member's
      `/live` page flips to underway; no waiver-missing badge if the waiver is on
      file, a badge if it is not.
- [ ] Print the gangway list. The print view strips the chrome and shows name,
      number, code, yacht, guests and waiver state.

## 4 · Comp, hold, complete (staff, desktop)

- [ ] `/bridge/sponsors` → **Sign a sponsor** → place it on the sailing →
      **Comp a pass** to the national persona. Their `/manifest` shows the pass
      as complimentary and `/account` shows no charge.
- [ ] `/bridge/voyages` → **Call weather hold**. The confirm names the aboard
      count; every aboard member's `/inbox` gets the hold; the public
      `/charters/[slug]` reads WEATHER HOLD. **Lift hold** reverses it.
- [ ] **Mark completed**. Knots post to every aboard member's `/portal`; the
      deposit returns on `/account`; the sailing leaves `/live`.

## 5 · Tables and matches (regional + global, phone width)

- [ ] `/tables` → **Take a seat** at the laid table on both phones. The seat
      holds for fifteen minutes and confirms at the door (staff `/bridge/tables`).
- [ ] After the night, each says the other's name back. `/matches` shows the
      match on both phones and on neither before.

## 6 · Pause and resume (regional)

- [ ] `/you` → **Pause membership**. The confirm explains what keeps. `/manifest`
      says paused on every row; `/membership/standing` reads "Paused at sea".
- [ ] **Resume**. Everything reads active again with the same member number.

## 7 · Strike the set (staff)

- [ ] **Cancel** the staging sailing. Every aboard member's `/inbox` gets one
      cancellation, not two; `/account` squares any charge.
- [ ] `npm run fixtures:reset` leaves the five personas with empty inboxes and
      zero ledgers.
