# e2e modules

Each `*.mjs` here exports `async function run(p, ctx)` and is picked up by
`scripts/e2e-suite.mjs` after its own sections and before the knots footprint
check. Files run in name order.

`p` is the personas map: `p.regional`, `p.national`, `p.global`, `p.paused`,
`p.staff` — signed-in sessions. `ctx` carries the suite's plumbing:

- `ctx.rest(session)` → `{ get, post, patch, del, rpc }` against PostgREST as that
  persona; `ctx.rest(null)` is anon. Each returns `{ status, data }`.
- `ctx.note(persona, label, ok, detail)` — one assertion. Say what was expected
  and what came back in `detail`; the run prints failures verbatim.
- `ctx.uid(session)` — the persona's profile id.
- `ctx.RUN_TOKEN` — put it in EVERY fixture slug (`e2e-<module>-${Date.now().toString(36)}${ctx.RUN_TOKEN}`)
  so the end-of-run sweep removes what you made.
- `ctx.committeeAnswers()` — the required application questions answered, read once as anon; every `applications` insert must carry them (`guard_the_answers` refuses an unanswered required question before the unique index can 409).
- `ctx.BASE` (the app), `ctx.SUPA` (the Supabase URL), `ctx.homeWater(stf)`,
  `ctx.login(email)`, `ctx.STALE_BEFORE()`.

Rules. Never leave a persona's profile changed (status, plan_id, prefs, tier,
home_city) — restore in `finally`. Never write to a real member or a real
episode; make a fixture. Never call a drain or a cron by hand. Prove a refusal
by asserting on the message, not only the status. Every assertion must be
non-vacuous: seed the positive case before asserting the negative.
