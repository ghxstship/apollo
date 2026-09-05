/* Booking and money, end to end — the workflows the September 4 sections and
   moneyRules leave unpinned. Everything here goes through PostgREST as the
   persona it names, with Promise.all wherever two people can reach for one
   thing at once, because a race that only ever runs one at a time proves the
   happy path and nothing else.

   What is deliberately NOT repeated (already pinned in scripts/e2e-suite.mjs):
   the release formula's two branches on a single pass (moneyRules), deposit
   taken / returned / forfeited and said (remediationRules), a declined offer,
   a hand-written acceptance, the standby ladder, the by-request door and its
   first offer, the guest ladder by count and by name (rulesOfSept4), the
   cabin premium and the daybed on a hand-off (programRules, charterRules).

   Every fixture slug carries ctx.RUN_TOKEN under the e2e-money- prefix the
   sweep already knows. Ledger rows cannot be swept (account_ledger has no
   DELETE policy, by design) and stay on the fixture personas; the only rows
   this module leaves that are not tied to a fixture episode are the refund
   guard's — one 100-cent payment and its 100-cent refund (net zero) and a
   one-cent manual refund on the staff persona, memo E2E, per run. The staff
   persona's plan allowance is granted for the run and cleared in finally. */

const PRICE = 8500;
const DEPOSIT = 2000;
const ALLOWANCE = 5000;

export async function run(p, ctx) {
  const { rest, note, uid, RUN_TOKEN } = ctx;
  const stf = rest(p.staff), reg = rest(p.regional), nat = rest(p.national), glo = rest(p.global), pau = rest(p.paused), anon = rest(null);
  const me = { regional: uid(p.regional), national: uid(p.national), global: uid(p.global), paused: uid(p.paused), staff: uid(p.staff) };
  const stamp = `${Date.now().toString(36)}${RUN_TOKEN}`;
  const said = (r) => String(r?.data?.message ?? r?.data?.hint ?? (typeof r?.data === "string" ? r.data : JSON.stringify(r?.data ?? ""))).toLowerCase();
  const ok = (r) => r.status < 400;
  const nowIso = () => new Date().toISOString();
  const cityId = (await stf.get("cities?slug=eq.miami&select=id&limit=1")).data?.[0]?.id;

  /* A fixture thirty days out sits outside the release window; one six hours
     out sits inside it. Both on the club's own Miami clock. */
  const raise = async (label, extra = {}) => {
    const hours = extra.hoursOut ?? 30 * 24;
    delete extra.hoursOut;
    const res = await stf.post("episodes", {
      slug: `e2e-money-wf-${label}-${stamp}`,
      title: `E2E money workflow ${label} ${stamp}.`,
      setting: "shore",
      starts_at: new Date(Date.now() + hours * 36e5).toISOString(),
      ends_at: new Date(Date.now() + (hours + 3) * 36e5).toISOString(),
      time_zone: "America/New_York",
      city_id: cityId,
      passes_total: 8,
      price_cents: PRICE,
      status: "scheduled",
      min_tier: "regional",
      ...extra,
    });
    const row = res.data?.[0] ?? null;
    note("staff", `raises the ${label} fixture`, !!row?.id, `got ${res.status} ${said(res).slice(0, 100)}`);
    return row;
  };
  const ledger = async (who, episodeId) =>
    (await stf.get(`account_ledger?profile_id=eq.${me[who]}&episode_id=eq.${episodeId}&select=id,delta_cents,kind,memo,tax_cents,rsvp_id,created_at&order=created_at.asc`)).data || [];
  const sum = (rows) => rows.reduce((n, r) => n + r.delta_cents, 0);
  const ofKind = (rows, kind) => rows.filter((r) => r.kind === kind);
  const shape = (rows) => JSON.stringify(rows.map((r) => [r.kind, r.delta_cents]));
  const book = (who, episodeId, extra = {}) =>
    rest(p[who]).post("passes", { episode_id: episodeId, profile_id: me[who], status: "aboard", ...extra });
  const passOf = async (who, episodeId) =>
    (await stf.get(`passes?episode_id=eq.${episodeId}&profile_id=eq.${me[who]}&select=id,status,standby,guests,guest_names,promo_code,promo_claimed_at,checked_in_at,segment`)).data?.[0] ?? null;
  const release = (who, episodeId) => rest(p[who]).del(`passes?episode_id=eq.${episodeId}&profile_id=eq.${me[who]}`);
  const allowance = async () =>
    (await stf.get(`pass_credits?profile_id=eq.${me.staff}&select=granted_cents,spent_cents&order=period.desc&limit=1`)).data?.[0] ?? null;

  /* Vetting files and preference sheets are hung on PERSONAS, not fixtures,
     and the composition fixture below needs them for two members. Made only
     where missing, and only what this run made is removed. */
  const madeVetting = new Set();
  const madeSheet = new Set();
  const vetted = async (who) => {
    const id = me[who];
    const vf = await stf.patch(`vetting_files?profile_id=eq.${id}`, { id_verified_at: nowIso(), age_ok: true, background_state: "cleared" });
    if (!(vf.data || []).length) {
      const made = await stf.post("vetting_files", { profile_id: id, id_verified_at: nowIso(), age_ok: true, background_state: "cleared" });
      if (ok(made)) madeVetting.add(id);
    }
    const sheet = await rest(p[who]).patch(`preference_sheets?profile_id=eq.${id}`, { completed_at: nowIso() });
    if (!(sheet.data || []).length) {
      const made = await rest(p[who]).post("preference_sheets", { profile_id: id, drinks: ["Zero proof"], flag_green: "E2E fixture", completed_at: nowIso() });
      if (ok(made)) madeSheet.add(id);
    }
  };

  const promoCode = `E2E${stamp.toUpperCase()}`;
  let staffAllowanceGranted = false;

  try {
    /* ══ A. the window boundary, with a deposit riding on the pass ═════════ */
    const far = await raise("far", { deposit_required: true, deposit_cents: DEPOSIT });
    const near = await raise("near", { deposit_required: true, deposit_cents: DEPOSIT, hoursOut: 6 });
    if (!far || !near) return;

    /* The same claim, twice at once. The unique index (episode_id, profile_id)
       decides; the trigger must charge once, not once per attempt. */
    const [c1, c2] = await Promise.all([book("regional", far.id), book("regional", far.id)]);
    const won = [c1, c2].filter(ok).length;
    note("regional", "the same claim submitted twice at once lands exactly once", won === 1, `statuses ${c1.status}/${c2.status}`);
    let rows = await ledger("regional", far.id);
    note("regional", "one pass charge and one deposit, not two of either",
      ofKind(rows, "pass").length === 1 && ofKind(rows, "deposit").length === 1 && sum(rows) === -(PRICE + DEPOSIT), shape(rows));
    const farPass = await passOf("regional", far.id);
    note("regional", "one pass row stands", !!farPass && farPass.status === "aboard", JSON.stringify(farPass));

    /* The same release, twice at once. The second finds nothing to release and
       must not post a second credit. */
    const [r1, r2] = await Promise.all([release("regional", far.id), release("regional", far.id)]);
    rows = await ledger("regional", far.id);
    note("regional", "an outside-window release credits the pass and the deposit once, and the balance is exactly zero",
      ofKind(rows, "credit").length === 1 && ofKind(rows, "credit")[0].delta_cents === PRICE + DEPOSIT && sum(rows) === 0,
      `del ${r1.status}/${r2.status}; ${shape(rows)}`);

    /* Booked again after a credited release: the money is owed again. */
    const again = await book("regional", far.id);
    rows = await ledger("regional", far.id);
    note("regional", "re-claiming after a credited release is charged again — pass and deposit", ok(again) && sum(rows) === -(PRICE + DEPOSIT) && ofKind(rows, "pass").length === 2, shape(rows));
    await release("regional", far.id);
    rows = await ledger("regional", far.id);
    note("regional", "and the second release squares it back to zero", sum(rows) === 0, shape(rows));

    /* Inside the window: released without credit — the forfeit the dialog names. */
    const nearBook = await book("regional", near.id);
    note("regional", "books six hours out", ok(nearBook), `got ${nearBook.status} ${said(nearBook).slice(0, 100)}`);
    const nearRel = await release("regional", near.id);
    rows = await ledger("regional", near.id);
    note("regional", "an inside-window release posts no credit — pass and deposit are forfeit and the balance says so",
      ok(nearRel) && ofKind(rows, "credit").length === 0 && sum(rows) === -(PRICE + DEPOSIT), shape(rows));
    /* Re-booking a pass whose money is still on the book is not billed again:
       the aboard trigger reads charges net of cash credits. */
    const nearAgain = await book("regional", near.id);
    rows = await ledger("regional", near.id);
    note("regional", "re-claiming inside the window after a forfeit is not charged a second time", ok(nearAgain) && sum(rows) === -(PRICE + DEPOSIT) && ofKind(rows, "pass").length === 1, shape(rows));

    /* The deposit promise on the near fixture: regional is stamped through the
       gangway (a live member waiver stands); national books and never arrives.
       The completion returns one deposit and keeps the other, and each ledger
       sums to the figure the pass said it would. */
    const natNear = await book("national", near.id);
    note("national", "books the near fixture too", ok(natNear), `got ${natNear.status} ${said(natNear).slice(0, 100)}`);
    const regNearPass = await passOf("regional", near.id);
    const stamped = await stf.patch(`passes?id=eq.${regNearPass?.id}`, { checked_in_at: nowIso(), checked_in_by: me.staff });
    note("staff", "the gangway stamps the regional arrival", ok(stamped) && (stamped.data || []).length === 1, `got ${stamped.status} ${said(stamped).slice(0, 100)}`);
    const completed = await stf.patch(`episodes?id=eq.${near.id}`, { status: "completed" });
    note("staff", "completes the near fixture", ok(completed), `got ${completed.status} ${said(completed).slice(0, 100)}`);
    /* Completion banks miles for the arrival; the suite's footprint check
       holds every persona to zero drift, so they are swept back at once. */
    for (const r of (await stf.get(`knots_ledger?episode_id=eq.${near.id}&reason=like.Miles%20banked*&select=profile_id,delta`)).data ?? []) {
      await stf.rpc("adjust_knots", { p_profile: r.profile_id, p_delta: -r.delta, p_reason: `E2E money — miles swept ${stamp}` });
    }
    rows = await ledger("regional", near.id);
    note("regional", "after completion the arrival's ledger reads the pass fare alone — the deposit came back",
      sum(rows) === -PRICE && ofKind(rows, "credit").some((r) => /Deposit returned/.test(r.memo)), shape(rows));
    const natRows = await ledger("national", near.id);
    note("national", "the no-show's ledger keeps the deposit — pass and deposit both stand", sum(natRows) === -(PRICE + DEPOSIT) && ofKind(natRows, "credit").length === 0, shape(natRows));

    /* ══ B. the last seat, and the one standby, under a race ═══════════════ */
    const seat = await raise("seat", { passes_total: 1, standby_passes: 1, price_cents: 0 });
    if (seat) {
      const [s1, s2] = await Promise.all([book("regional", seat.id), book("national", seat.id)]);
      const seated = [s1, s2].filter(ok);
      const bounced = [s1, s2].filter((r) => !ok(r));
      note("regional", "two members reaching for the last seat at once: one is seated, one is told the manifest is full",
        seated.length === 1 && bounced.length === 1 && /full/.test(said(bounced[0])), `statuses ${s1.status}/${s2.status}; ${said(bounced[0] ?? s1).slice(0, 100)}`);
      const loser = ok(s1) ? "national" : "regional";
      const [t1, t2] = await Promise.all([book(loser, seat.id, { standby: true }), book("global", seat.id, { standby: true })]);
      const standing = [t1, t2].filter(ok);
      const refused = [t1, t2].filter((r) => !ok(r));
      note("global", "two members reaching for the one standby pass at once: one stands by, one is refused by name",
        standing.length === 1 && refused.length === 1 && /standby is full/.test(said(refused[0])), `statuses ${t1.status}/${t2.status}; ${said(refused[0] ?? t1).slice(0, 100)}`);
      const aboard = await stf.get(`passes?episode_id=eq.${seat.id}&status=eq.aboard&select=profile_id,standby`);
      note("staff", "the seat fixture holds one seat and one standby, no more", (aboard.data || []).length === 2 && (aboard.data || []).filter((r) => r.standby).length === 1, JSON.stringify(aboard.data));
    }

    /* ══ C. add-ons and daybeds under a race; the paused member; zero after ═ */
    const extras = await raise("extras", { price_cents: 5000 });
    const addon = (await stf.get("addons?active=eq.true&select=id,price_cents&order=price_cents.asc&limit=1")).data?.[0];
    const daybedPrice = (await stf.get("club_products?slug=eq.vip_daybed&select=price_cents,per_sailing_cap")).data?.[0];
    if (extras && addon && daybedPrice) {
      for (const who of ["regional", "national", "global"]) await book(who, extras.id);
      const regPass = await passOf("regional", extras.id);
      const natPass = await passOf("national", extras.id);
      const gloPass = await passOf("global", extras.id);
      note("regional", "three members board the extras fixture", !!regPass && !!natPass && !!gloPass, JSON.stringify([regPass?.status, natPass?.status, gloPass?.status]));

      const [a1, a2] = await Promise.all([
        reg.rpc("attach_addons", { p_pass: regPass.id, p_addons: [addon.id], p_qty: 1 }),
        reg.rpc("attach_addons", { p_pass: regPass.id, p_addons: [addon.id], p_qty: 1 }),
      ]);
      const lines = await stf.get(`pass_addons?rsvp_id=eq.${regPass.id}&select=addon_id,qty`);
      let xr = await ledger("regional", extras.id);
      note("regional", "the same add-on attached twice at once is one line and one charge",
        (lines.data || []).length === 1 && ofKind(xr, "addon").length === 1 && ofKind(xr, "addon")[0].delta_cents === -addon.price_cents,
        `rpc ${a1.status}/${a2.status} ${said(ok(a1) ? a2 : a1).slice(0, 90)}; lines ${(lines.data || []).length}; ${shape(xr)}`);

      const paused = await pau.rpc("attach_addons", { p_pass: regPass.id, p_addons: [addon.id], p_qty: 1 });
      note("paused", "a paused member cannot attach an add-on, and is told the membership is paused", !ok(paused) && /paused/.test(said(paused)), `got ${paused.status} ${said(paused).slice(0, 90)}`);
      const notMine = await nat.rpc("attach_addons", { p_pass: regPass.id, p_addons: [addon.id], p_qty: 1 });
      note("national", "cannot attach an add-on to another member's pass", !ok(notMine) && /not yours/.test(said(notMine)), `got ${notMine.status} ${said(notMine).slice(0, 90)}`);

      const cap = daybedPrice.per_sailing_cap ?? 2;
      const claims = await Promise.all([
        reg.rpc("claim_a_daybed", { p_pass: regPass.id }),
        nat.rpc("claim_a_daybed", { p_pass: natPass.id }),
        glo.rpc("claim_a_daybed", { p_pass: gloPass.id }),
      ]);
      const beds = await stf.get(`episode_daybeds?episode_id=eq.${extras.id}&select=rsvp_id`);
      const lostBed = claims.find((r) => !ok(r));
      note("regional", `three daybed claims at once against a cap of ${cap}: exactly ${cap} land and the third is told they are spoken for`,
        claims.filter(ok).length === cap && (beds.data || []).length === cap && !!lostBed && /spoken for/.test(said(lostBed)),
        `statuses ${claims.map((r) => r.status).join("/")}; beds ${(beds.data || []).length}; ${said(lostBed ?? claims[0]).slice(0, 90)}`);
      const pauBed = await pau.rpc("claim_a_daybed", { p_pass: regPass.id });
      note("paused", "a paused member cannot claim a daybed", !ok(pauBed) && /paused/.test(said(pauBed)), `got ${pauBed.status} ${said(pauBed).slice(0, 90)}`);

      /* Everything on the pass goes with it, and the credit is the whole folio. */
      const before = sum(await ledger("regional", extras.id));
      const rel = await release("regional", extras.id);
      xr = await ledger("regional", extras.id);
      const bedsAfter = await stf.get(`episode_daybeds?rsvp_id=eq.${regPass.id}&select=id`);
      const linesAfter = await stf.get(`pass_addons?rsvp_id=eq.${regPass.id}&select=addon_id`);
      note("regional", "releasing outside the window credits pass, add-on and daybed together — balance exactly zero, lines gone",
        ok(rel) && sum(xr) === 0 && before < 0 && (bedsAfter.data || []).length === 0 && (linesAfter.data || []).length === 0, `before ${before}; ${shape(xr)}`);
    }

    /* ══ D. the plan credit through a hand-off, a cancellation and a strike ═ */
    const granted = await stf.rpc("grant_pass_credit_by_hand", { p_profile: me.staff, p_cents: ALLOWANCE });
    staffAllowanceGranted = ok(granted);
    note("staff", "holds a plan allowance for the run", staffAllowanceGranted, `got ${granted.status} ${said(granted).slice(0, 90)}`);
    const memberGrant = await reg.rpc("grant_pass_credit_by_hand", { p_profile: me.regional, p_cents: ALLOWANCE });
    note("regional", "a member cannot hand themselves an allowance, and is told it is staff only", !ok(memberGrant) && /staff only/.test(said(memberGrant)), `got ${memberGrant.status} ${said(memberGrant).slice(0, 90)}`);

    if (staffAllowanceGranted) {
      /* D.1 hand-off of a credit-paid pass */
      const hand = await raise("credit-hand");
      if (hand) {
        const booked = await book("staff", hand.id);
        let sr = await ledger("staff", hand.id);
        const charge = ofKind(sr, "pass")[0];
        const drawn = ofKind(sr, "plan_credit");
        note("staff", "books a credited pass: −C and the draw-down P", ok(booked) && charge?.delta_cents === -PRICE && drawn.length === 1 && drawn[0].delta_cents === ALLOWANCE, shape(sr));
        const spentBefore = (await allowance())?.spent_cents;
        const staffPass = await passOf("staff", hand.id);
        const offer = await stf.post("pass_transfers", { rsvp_id: staffPass.id, from_profile: me.staff, to_profile: me.global, status: "offered" });
        const taken = await glo.rpc("accept_pass_transfer", { p_id: offer.data?.[0]?.id });
        note("global", "takes over the credited pass", ok(offer) && ok(taken), `offer ${offer.status}; accept ${taken.status} ${said(taken).slice(0, 90)}`);
        sr = await ledger("staff", hand.id);
        const gr = await ledger("global", hand.id);
        const returned = ofKind(sr, "plan_credit").filter((r) => r.delta_cents < 0);
        note("staff", "the giver's plan credit goes back to the allowance (one −P row) and pass_credits.spent_cents is back where it was",
          returned.length === 1 && returned[0].delta_cents === -ALLOWANCE && (await allowance())?.spent_cents === spentBefore - ALLOWANCE, `${shape(sr)}; spent ${spentBefore} → ${(await allowance())?.spent_cents}`);
        note("staff", "the giver's cash credit is C, not C + P — no cash is minted from a plan credit, and the giver's rows on the episode sum to zero",
          ofKind(sr, "credit").length === 1 && ofKind(sr, "credit")[0].delta_cents === PRICE && sum(sr) === 0, shape(sr));
        note("global", "the taker is charged the pass in full", ofKind(gr, "pass").length === 1 && sum(gr) === -PRICE, shape(gr));
        note("staff", "tax on the charge row is untouched by the hand-off", (await stf.get(`account_ledger?id=eq.${charge.id}&select=tax_cents,delta_cents`)).data?.[0]?.tax_cents === charge.tax_cents, JSON.stringify(charge));
        await release("global", hand.id);
      }

      /* D.2 cancellation returns the credit */
      const cancel = await raise("credit-cancel");
      if (cancel) {
        await book("staff", cancel.id);
        const spentBefore = (await allowance())?.spent_cents;
        const called = await stf.patch(`episodes?id=eq.${cancel.id}`, { status: "cancelled" });
        const sr = await ledger("staff", cancel.id);
        const returned = ofKind(sr, "plan_credit").filter((r) => r.delta_cents < 0);
        note("staff", "a cancelled episode returns the plan credit to the allowance and squares the ledger to zero",
          ok(called) && returned.length === 1 && returned[0].delta_cents === -ALLOWANCE && sum(sr) === 0 && (await allowance())?.spent_cents === spentBefore - ALLOWANCE, `${shape(sr)}; spent ${spentBefore} → ${(await allowance())?.spent_cents}`);
        note("staff", "the cash credited on cancellation is C in total — the plan credit is restored, not paid out twice",
          ofKind(sr, "credit").reduce((n, r) => n + r.delta_cents, 0) === PRICE, shape(sr));
      }

      /* D.3 a strike returns the credit. The episode row goes, and the ledger
         rows lose their episode_id (SET NULL) — so they are read back by id
         and by the memo the strike writes, never by the episode. */
      const strike = await raise("credit-strike");
      if (strike) {
        await book("staff", strike.id);
        const beforeRows = await ledger("staff", strike.id);
        const spentBefore = (await allowance())?.spent_cents;
        const struck = await stf.del(`episodes?id=eq.${strike.id}`);
        const kept = (await stf.get(`account_ledger?id=in.(${beforeRows.map((r) => r.id).join(",")})&select=id,delta_cents,kind,memo,tax_cents`)).data || [];
        const written = (await stf.get(`account_ledger?profile_id=eq.${me.staff}&memo=like.*${encodeURIComponent(strike.title)}&created_at=gte.${encodeURIComponent(beforeRows[beforeRows.length - 1]?.created_at ?? nowIso())}&select=id,delta_cents,kind,memo`)).data || [];
        const all = [...kept, ...written.filter((w) => !kept.some((k) => k.id === w.id))];
        const returned = ofKind(written, "plan_credit").filter((r) => r.delta_cents < 0);
        note("staff", "a struck episode returns the plan credit and credits the cash — the folio sums to zero and spent_cents is restored",
          ok(struck) && returned.length === 1 && returned[0].delta_cents === -ALLOWANCE && sum(all) === 0 && (await allowance())?.spent_cents === spentBefore - ALLOWANCE,
          `del ${struck.status}; ${shape(all)}; spent ${spentBefore} → ${(await allowance())?.spent_cents}`);
        note("staff", "the strike credit is C, said as struck", ofKind(written, "credit").length === 1 && ofKind(written, "credit")[0].delta_cents === PRICE && /^Struck/.test(ofKind(written, "credit")[0].memo), shape(written));
        note("staff", "tax on the original charge is untouched by the strike", kept.every((k) => k.tax_cents === beforeRows.find((b) => b.id === k.id)?.tax_cents), JSON.stringify(kept.map((k) => k.tax_cents)));
      }
    }

    /* ══ E. guests: the third guard, the names, the stubs ══════════════════ */
    const guests = await raise("guests", { price_cents: 0 });
    if (guests) {
      await book("global", guests.id);
      const gp = await passOf("global", guests.id);
      const g1 = await glo.post("pass_guests", { rsvp_id: gp.id, name: "E2E Guest One", kind: "guest" });
      const g2 = await glo.post("pass_guests", { rsvp_id: gp.id, name: "E2E Guest Two", kind: "guest" });
      const g3 = await glo.post("pass_guests", { rsvp_id: gp.id, name: "E2E Guest Three", kind: "guest" });
      note("global", "seats two guests by row on a two-guest plan; the third row is refused by the row guard, naming the allowance",
        ok(g1) && ok(g2) && !ok(g3) && /2 guest/.test(said(g3)), `${g1.status}/${g2.status}/${g3.status} ${said(g3).slice(0, 90)}`);
      const codes = [g1.data?.[0]?.boarding_code, g2.data?.[0]?.boarding_code];
      note("global", "each guest stub carries its own code in the host's shape, and no two are the same",
        codes.every((c) => typeof c === "string" && /-G\d+$/.test(c)) && codes[0] !== codes[1] && codes.every((c) => c.startsWith(gp.id ? "UN-" : "")), JSON.stringify(codes));
      const forged = await glo.post("pass_guests", { rsvp_id: gp.id, name: "E2E Forged", kind: "guest", boarding_code: codes[0] });
      note("global", "a guest row cannot be handed a code the caller chose — the guard issues it, and the unique stub index stands behind it", !ok(forged) || forged.data?.[0]?.boarding_code !== codes[0], `got ${forged.status} ${JSON.stringify(forged.data?.[0]?.boarding_code ?? said(forged).slice(0, 60))}`);
      if (ok(forged)) await stf.del(`pass_guests?id=eq.${forged.data[0].id}`);
      const trimmed = await glo.patch(`passes?id=eq.${gp.id}`, { guests: 2, guest_names: ["E2E Named One"] });
      note("global", "a guest count above the names given is bound to the names — the manifest is the list, not the number", ok(trimmed) && trimmed.data?.[0]?.guests === 1, `got ${trimmed.status} guests ${trimmed.data?.[0]?.guests}`);
      await book("national", guests.id);
      const np = await passOf("national", guests.id);
      const natGuest = await nat.post("pass_guests", { rsvp_id: np.id, name: "E2E Uninvited", kind: "guest" });
      note("national", "on a plan with no allowance a guest row is refused, and told the tier", !ok(natGuest) && /paid membership/.test(said(natGuest)), `got ${natGuest.status} ${said(natGuest).slice(0, 90)}`);
    }

    /* ══ F. by request: the offer's clock, its lapse, the next in line ═════ */
    const request = await raise("request", { passes_total: 4, by_request: true, price_cents: 0 });
    if (request) {
      const caps = await stf.post("episode_segment_caps", [
        { episode_id: request.id, segment: "single_man", cap: 2 },
        { episode_id: request.id, segment: "single_woman", cap: 2 },
      ]);
      note("staff", "the by-request fixture seats by segment", ok(caps), `got ${caps.status}`);
      await vetted("regional");
      await vetted("national");
      const askReg = await reg.post("waitlist_entries", { episode_id: request.id, profile_id: me.regional, segment: "single_man" });
      const askNat = await nat.post("waitlist_entries", { episode_id: request.id, profile_id: me.national, segment: "single_man" });
      const regEntry = askReg.data?.[0]?.id, natEntry = askNat.data?.[0]?.id;
      note("regional", "two members ask for a place and are numbered in order", ok(askReg) && ok(askNat) && askReg.data?.[0]?.place === 1 && askNat.data?.[0]?.place === 2, `${askReg.status}/${askNat.status} places ${askReg.data?.[0]?.place}/${askNat.data?.[0]?.place}`);
      const pauAsk = await pau.post("waitlist_entries", { episode_id: request.id, profile_id: me.paused, segment: "single_woman" });
      note("paused", "a paused member cannot join the line", !ok(pauAsk), `got ${pauAsk.status}`);
      const memberOffer = await reg.rpc("offer_this_place", { p_entry: regEntry });
      note("regional", "a member cannot offer themselves the place, and is told it is staff only", !ok(memberOffer) && /staff only/.test(said(memberOffer)), `got ${memberOffer.status} ${said(memberOffer).slice(0, 90)}`);
      const memberNext = await reg.rpc("offer_the_next_place", { p_episode: request.id, p_segment: "single_man" });
      note("regional", "nor run the line", !ok(memberNext) && /staff only/.test(said(memberNext)), `got ${memberNext.status} ${said(memberNext).slice(0, 90)}`);

      const hours = (await stf.rpc("club_setting", { p_key: "waitlist_claim_hours" })).data ?? 6;
      const t0 = Date.now();
      const offered = await stf.rpc("offer_this_place", { p_entry: regEntry });
      const entry = (await stf.get(`waitlist_entries?id=eq.${regEntry}&select=offered_at,claim_expires_at,released_at,claimed_at`)).data?.[0];
      const expiresIn = entry?.claim_expires_at ? (Date.parse(entry.claim_expires_at) - t0) / 36e5 : null;
      note("staff", `the offer carries an expiry ${hours} hours from the offer, on the club's setting`,
        ok(offered) && expiresIn !== null && Math.abs(expiresIn - hours) < 0.1, `got ${offered.status}; expires in ${expiresIn?.toFixed(3)}h`);
      const twice = await stf.rpc("offer_this_place", { p_entry: regEntry });
      note("staff", "a place already offered is not offered again while its clock runs", !ok(twice) && /already offered/.test(said(twice)), `got ${twice.status} ${said(twice).slice(0, 90)}`);
      const stranger = await nat.rpc("claim_your_place", { p_entry: regEntry });
      note("national", "cannot claim another member's place in line", !ok(stranger) && /not yours/.test(said(stranger)), `got ${stranger.status} ${said(stranger).slice(0, 90)}`);

      /* Six hours cannot pass in a test. The clock is moved on THIS run's own
         fixture entry by the Bridge, whose UPDATE policy on the line exists
         for exactly this kind of hand — and only the expiry column is touched. */
      const aged = await stf.patch(`waitlist_entries?id=eq.${regEntry}`, { claim_expires_at: new Date(Date.now() - 60_000).toISOString() });
      const late = await reg.rpc("claim_your_place", { p_entry: regEntry });
      const afterLate = (await stf.get(`waitlist_entries?id=eq.${regEntry}&select=released_at,claimed_at`)).data?.[0];
      /* The refusal is a RAISE, and a raise rolls back the lapse the claim wrote
         a line earlier — so released_at is still null here. It is the next act
         of the Bridge (offer_the_next_place, below) that commits the lapse. The
         claim itself is what must not land. */
      note("regional", "a claim after claim_expires_at is refused and told the hours ran out; nothing is claimed",
        ok(aged) && !ok(late) && /ran out/.test(said(late)) && !afterLate?.claimed_at, `patch ${aged.status}; claim ${late.status} ${said(late).slice(0, 90)}; ${JSON.stringify(afterLate)}`);
      const noPass = await passOf("regional", request.id);
      note("regional", "and no pass was written for the lapsed claim", noPass === null, JSON.stringify(noPass));
      const next = await stf.rpc("offer_the_next_place", { p_episode: request.id, p_segment: "single_man" });
      note("staff", "the next place goes to the next in line once the first has lapsed", ok(next) && next.data === natEntry, `got ${next.status} ${JSON.stringify(next.data)} vs ${natEntry}`);
      const lapsed = (await stf.get(`waitlist_entries?id=eq.${regEntry}&select=released_at,claimed_at`)).data?.[0];
      note("regional", "and the lapsed place is now marked released, by the Bridge's act rather than the refused claim", !!lapsed?.released_at && !lapsed?.claimed_at, JSON.stringify(lapsed));
      const [k1, k2] = await Promise.all([nat.rpc("claim_your_place", { p_entry: natEntry }), nat.rpc("claim_your_place", { p_entry: natEntry })]);
      const natPasses = await stf.get(`passes?episode_id=eq.${request.id}&profile_id=eq.${me.national}&select=id,segment,status`);
      note("national", "the same claim twice at once seats one pass; the other is told the seat is already theirs",
        [k1, k2].filter(ok).length === 1 && (natPasses.data || []).length === 1 && /already yours/.test(said(ok(k1) ? k2 : k1)), `${k1.status}/${k2.status} ${said(ok(k1) ? k2 : k1).slice(0, 90)}`);

      /* A composition pass stays with its member. */
      const natReqPass = natPasses.data?.[0];
      if (natReqPass) {
        const offer = await nat.post("pass_transfers", { rsvp_id: natReqPass.id, from_profile: me.national, to_profile: me.global, status: "offered" });
        const taken = await glo.rpc("accept_pass_transfer", { p_id: offer.data?.[0]?.id });
        note("global", "a pass on a composition episode cannot be taken over, and the refusal says why", ok(offer) && !ok(taken) && /composition/.test(said(taken)), `offer ${offer.status}; accept ${taken.status} ${said(taken).slice(0, 100)}`);
        const holder = await passOf("national", request.id);
        note("national", "and the pass stays put", holder?.status === "aboard", JSON.stringify(holder));
      }
    }

    /* ══ G. promo codes: the cap under a race, the wrong episode, reuse ════ */
    const promo = await raise("promo");
    if (promo) {
      const memberCode = await reg.post("promo_codes", { code: `${promoCode}X`, kind: "amount", value: 1000, episode_id: promo.id, max_uses: 1 });
      note("regional", "a member cannot mint a code", !ok(memberCode), `got ${memberCode.status}`);
      const minted = await stf.post("promo_codes", { code: promoCode, kind: "amount", value: 1000, episode_id: promo.id, max_uses: 1, note: "E2E" });
      note("staff", "mints a one-use code for the promo fixture", ok(minted), `got ${minted.status} ${said(minted).slice(0, 90)}`);
      const wrong = await reg.rpc("check_promo", { p_code: promoCode, p_episode: far.id });
      note("regional", "a code on the wrong episode is refused by the checker, and told so", wrong.data?.ok === false && /another episode/i.test(wrong.data?.reason ?? ""), JSON.stringify(wrong.data));
      const wrongBook = await book("regional", far.id, { promo_code: promoCode });
      const wrongPass = await passOf("regional", far.id);
      const wrongRows = await ledger("regional", far.id);
      note("regional", "booked past the checker on the wrong episode, the code does not bite: full price, no code on the pass, the code unspent",
        ok(wrongBook) && wrongPass?.promo_code === null && wrongPass?.promo_claimed_at === null && ofKind(wrongRows, "pass").at(-1)?.delta_cents === -PRICE
          && (await stf.get(`promo_codes?code=eq.${promoCode}&select=uses`)).data?.[0]?.uses === 0, `${wrongBook.status}; ${JSON.stringify(wrongPass)}; ${shape(wrongRows)}`);
      await release("regional", far.id);

      const [b1, b2] = await Promise.all([book("regional", promo.id, { promo_code: promoCode }), book("national", promo.id, { promo_code: promoCode })]);
      const uses = (await stf.get(`promo_codes?code=eq.${promoCode}&select=uses,max_uses`)).data?.[0];
      const rp = await passOf("regional", promo.id), np = await passOf("national", promo.id);
      const winners = [rp, np].filter((x) => x?.promo_claimed_at);
      const losers = [rp, np].filter((x) => x && !x.promo_claimed_at);
      note("regional", "two members booking with a one-use code at once: the code is spent exactly once", ok(b1) && ok(b2) && uses?.uses === 1 && winners.length === 1 && losers.length === 1, `${b1.status}/${b2.status}; uses ${JSON.stringify(uses)}`);
      const winnerRows = await ledger(rp?.promo_claimed_at ? "regional" : "national", promo.id);
      const loserRows = await ledger(rp?.promo_claimed_at ? "national" : "regional", promo.id);
      note("regional", "the winner pays the discounted fare; the pass that lost the race carries no code and pays the catalogue price",
        ofKind(winnerRows, "pass")[0]?.delta_cents === -(PRICE - 1000) && ofKind(loserRows, "pass")[0]?.delta_cents === -PRICE && losers[0]?.promo_code === null,
        `winner ${shape(winnerRows)}; loser ${shape(loserRows)} code ${losers[0]?.promo_code}`);
      /* The lost race is the one case the review screen cannot see coming: the
         checker said yes a moment before the claim said no. passes/actions.ts
         confirmBerth now reads promo_claimed_at back and tells the member the
         code did not apply rather than returning a clean success at a price
         they were not shown. */
      const spent = await reg.rpc("check_promo", { p_code: promoCode, p_episode: promo.id });
      note("regional", "the checker now says the code is spent", spent.data?.ok === false && /spent/i.test(spent.data?.reason ?? ""), JSON.stringify(spent.data));
      const winner = rp?.promo_claimed_at ? "regional" : "national";
      await release(winner, promo.id);
      const usesAfter = (await stf.get(`promo_codes?code=eq.${promoCode}&select=uses`)).data?.[0]?.uses;
      const rebook = await book(winner, promo.id, { promo_code: promoCode });
      const rebooked = await passOf(winner, promo.id);
      note(winner, "a code stays spent through a release — booking again with it is the catalogue price, and the pass carries no code",
        usesAfter === 1 && ok(rebook) && rebooked?.promo_code === null && ofKind(await ledger(winner, promo.id), "pass").at(-1)?.delta_cents === -PRICE, `uses ${usesAfter}; ${rebook.status}; ${JSON.stringify(rebooked)}`);
    }

    /* ══ H. installments: one plan a pass, cancelled with the pass, no hand-off ═ */
    const draws = await raise("draws", { price_cents: 30000 });
    if (draws) {
      await book("regional", draws.id);
      const dp = await passOf("regional", draws.id);
      const nextMonth = new Date(Date.now() + 31 * 864e5).toISOString();
      const planRow = { profile_id: me.regional, rsvp_id: dp.id, total_cents: 30000, down_payment_cents: 10000, installments: 3, paid_count: 1, next_charge_at: nextMonth, status: "active" };
      const memberPlan = await reg.post("installment_plans", planRow);
      note("regional", "a member cannot write their own draw schedule", !ok(memberPlan), `got ${memberPlan.status}`);
      const tooMany = await stf.post("installment_plans", { ...planRow, installments: 7 });
      note("staff", "a schedule runs two to six draws — seven is refused", !ok(tooMany), `got ${tooMany.status}`);
      const split = await stf.post("account_ledger", { profile_id: me.regional, delta_cents: 20000, kind: "credit", memo: "Split into 3 draws — 2 × $100.00 to come", episode_id: draws.id, rsvp_id: dp.id });
      const plan = await stf.post("installment_plans", planRow);
      note("staff", "splits the pass into three draws: the remainder credited back, the plan standing", ok(split) && ok(plan), `${split.status}/${plan.status} ${said(plan).slice(0, 90)}`);
      const second = await stf.post("installment_plans", planRow);
      note("staff", "one active plan a pass — a second is refused by the index", !ok(second), `got ${second.status}`);
      const splitTwice = await stf.post("account_ledger", { profile_id: me.regional, delta_cents: 20000, kind: "credit", memo: "Split into 3 draws — again", episode_id: draws.id, rsvp_id: dp.id });
      note("staff", "one split credit a pass — a second is refused by the index", !ok(splitTwice), `got ${splitTwice.status}`);
      const mine = await reg.get(`installment_plans?rsvp_id=eq.${dp.id}&select=id,status,installments,down_payment_cents,total_cents`);
      const theirs = await nat.get(`installment_plans?rsvp_id=eq.${dp.id}&select=id`);
      note("regional", "reads their own schedule; another member reads nothing", (mine.data || []).length === 1 && (theirs.data || []).length === 0, `${JSON.stringify(mine.data)} / ${JSON.stringify(theirs.data)}`);
      /* The arithmetic the two writers share: the action posts down = total −
         perDraw·(n−1) with perDraw = ⌊total/n⌋, and draw_installments slices
         ⌈(total − down)/(n − 1)⌉. On this schedule both read 10000. */
      const perDraw = Math.floor(30000 / 3), down = 30000 - perDraw * 2, slice = Math.ceil((30000 - down) / 2);
      note("regional", "the schedule's arithmetic is one figure from either side: down 10000, each draw 10000", down === 10000 && slice === 10000 && slice === perDraw, `down ${down} slice ${slice}`);
      const offer = await reg.post("pass_transfers", { rsvp_id: dp.id, from_profile: me.regional, to_profile: me.global, status: "offered" });
      const taken = await glo.rpc("accept_pass_transfer", { p_id: offer.data?.[0]?.id });
      note("global", "a pass on installments cannot be handed on while the plan is active, and the refusal says so", ok(offer) && !ok(taken) && /installments/.test(said(taken)), `offer ${offer.status}; accept ${taken.status} ${said(taken).slice(0, 100)}`);
      const rel = await release("regional", draws.id);
      const planAfter = (await stf.get(`installment_plans?id=eq.${plan.data?.[0]?.id}&select=status,next_charge_at`)).data?.[0];
      const dr = await ledger("regional", draws.id);
      note("regional", "releasing the pass cancels the plan, stops the next draw, and the folio squares to zero",
        ok(rel) && planAfter?.status === "cancelled" && planAfter?.next_charge_at === null && sum(dr) === 0, `${JSON.stringify(planAfter)}; ${shape(dr)}`);
    }

    /* ══ I. hand-offs: to self, to a paused member, two takers at once ═════ */
    const hand = await raise("hand", { deposit_required: true, deposit_cents: DEPOSIT });
    if (hand) {
      await book("regional", hand.id);
      const hp = await passOf("regional", hand.id);
      const toSelf = await reg.post("pass_transfers", { rsvp_id: hp.id, from_profile: me.regional, to_profile: me.regional, status: "offered" });
      /* Left red on purpose when it lands: the action refuses this in TypeScript
         and nothing in the schema does. SQL in the gate report. */
      note("regional", "cannot offer a pass to themselves", !ok(toSelf), `got ${toSelf.status} — a self-offer row was written (pass_transfers has no from<>to check)`);
      if (ok(toSelf)) await stf.del(`pass_transfers?id=eq.${toSelf.data[0].id}`);
      const toPaused = await reg.post("pass_transfers", { rsvp_id: hp.id, from_profile: me.regional, to_profile: me.paused, status: "offered" });
      const pauTakes = await pau.rpc("accept_pass_transfer", { p_id: toPaused.data?.[0]?.id });
      note("paused", "a paused member cannot take over a pass, and is told the membership is paused", ok(toPaused) && !ok(pauTakes) && /paused/.test(said(pauTakes)), `offer ${toPaused.status}; accept ${pauTakes.status} ${said(pauTakes).slice(0, 90)}`);
      if (ok(toPaused)) await stf.del(`pass_transfers?id=eq.${toPaused.data[0].id}`);
      const notMine = await nat.rpc("accept_pass_transfer", { p_id: hp.id });
      note("national", "an offer that does not exist cannot be accepted", !ok(notMine) && /no offer/.test(said(notMine)), `got ${notMine.status} ${said(notMine).slice(0, 90)}`);

      const o1 = await reg.post("pass_transfers", { rsvp_id: hp.id, from_profile: me.regional, to_profile: me.national, status: "offered" });
      const o2 = await reg.post("pass_transfers", { rsvp_id: hp.id, from_profile: me.regional, to_profile: me.global, status: "offered" });
      const [x1, x2] = await Promise.all([nat.rpc("accept_pass_transfer", { p_id: o1.data?.[0]?.id }), glo.rpc("accept_pass_transfer", { p_id: o2.data?.[0]?.id })]);
      const holder = (await stf.get(`passes?id=eq.${hp.id}&select=profile_id,status`)).data?.[0];
      const lostRace = ok(x1) ? x2 : x1;
      note("national", "two takers accepting at once: one takes the pass, the other is told it has changed hands or the offer is spent",
        ok(o1) && ok(o2) && [x1, x2].filter(ok).length === 1 && /changed hands|no offer/.test(said(lostRace)), `${x1.status}/${x2.status} ${said(lostRace).slice(0, 90)}`);
      const takerName = holder?.profile_id === me.national ? "national" : holder?.profile_id === me.global ? "global" : null;
      const offers = await stf.get(`pass_transfers?rsvp_id=eq.${hp.id}&select=status,to_profile`);
      note("staff", "the winning offer is accepted and the other is void", (offers.data || []).filter((o) => o.status === "accepted").length === 1 && (offers.data || []).filter((o) => o.status === "void").length === 1, JSON.stringify(offers.data));
      const giver = await ledger("regional", hand.id);
      note("regional", "the giver's ledger on the episode sums to zero — one credit for pass and deposit together", sum(giver) === 0 && ofKind(giver, "credit").length === 1 && ofKind(giver, "credit")[0].delta_cents === PRICE + DEPOSIT, shape(giver));
      if (takerName) {
        const taker = await ledger(takerName, hand.id);
        note(takerName, "the taker is charged the pass and a deposit that is a deposit", ofKind(taker, "deposit")[0]?.delta_cents === -DEPOSIT && ofKind(taker, "pass")[0]?.delta_cents === -PRICE && sum(taker) === -(PRICE + DEPOSIT), shape(taker));
        await release(takerName, hand.id);
      }
    }

    /* ══ J. the refund guard, and the manual house refund ══════════════════ */
    const ref = `pi_e2e_${stamp}`;
    const paid = await stf.post("account_ledger", { profile_id: me.staff, delta_cents: 100, kind: "payment", memo: "E2E settlement — refund guard", stripe_ref: ref });
    note("staff", "records a settlement against a Stripe object", ok(paid), `got ${paid.status} ${said(paid).slice(0, 90)}`);
    const over = await stf.post("account_ledger", { profile_id: me.staff, delta_cents: -150, kind: "refund", memo: "E2E refund — too much", stripe_ref: ref });
    note("staff", "a refund larger than its payment is refused by the ledger, naming what was paid", !ok(over) && /cannot exceed its payment/.test(said(over)), `got ${over.status} ${said(over).slice(0, 100)}`);
    const whole = await stf.post("account_ledger", { profile_id: me.staff, delta_cents: -100, kind: "refund", memo: "E2E refund — in full", stripe_ref: ref });
    note("staff", "a refund of exactly the payment is posted", ok(whole), `got ${whole.status} ${said(whole).slice(0, 90)}`);
    const oneMore = await stf.post("account_ledger", { profile_id: me.staff, delta_cents: -1, kind: "refund", memo: "E2E refund — one cent over", stripe_ref: ref });
    note("staff", "one more cent after a full refund is refused, and says how much already went back", !ok(oneMore) && /100 already returned/.test(said(oneMore)), `got ${oneMore.status} ${said(oneMore).slice(0, 100)}`);
    const manual = await stf.post("account_ledger", { profile_id: me.staff, delta_cents: 1, kind: "refund", memo: "E2E manual house refund" });
    note("staff", "a manual house refund with no Stripe object is still allowed", ok(manual), `got ${manual.status} ${said(manual).slice(0, 90)}`);

    /* ══ K. the ledger is written by triggers and the Bridge, never a member; anon nowhere ═ */
    const forge = await reg.post("account_ledger", { profile_id: me.regional, delta_cents: 100000, kind: "credit", memo: "E2E forged" });
    note("regional", "cannot write a ledger row", !ok(forge), `got ${forge.status}`);
    const forgeRefund = await reg.post("account_ledger", { profile_id: me.regional, delta_cents: 100000, kind: "refund", memo: "E2E forged" });
    note("regional", "cannot post themselves a refund", !ok(forgeRefund), `got ${forgeRefund.status}`);
    const others = await reg.get(`account_ledger?profile_id=eq.${me.global}&select=id&limit=1`);
    note("regional", "reads no other member's ledger", (others.data || []).length === 0, JSON.stringify(others.data));
    const memberPromo = await reg.patch(`promo_codes?code=eq.${promoCode}`, { max_uses: 99 });
    note("regional", "cannot raise a code's cap", !ok(memberPromo) || (Array.isArray(memberPromo.data) && memberPromo.data.length === 0), `got ${memberPromo.status} ${Array.isArray(memberPromo.data) ? memberPromo.data.length : ""} rows`);
    const memberLine = await reg.patch(`waitlist_entries?profile_id=eq.${me.regional}`, { claim_expires_at: new Date(Date.now() + 864e5).toISOString() });
    note("regional", "cannot move their own claim clock", !ok(memberLine) || (Array.isArray(memberLine.data) && memberLine.data.length === 0), `got ${memberLine.status} ${Array.isArray(memberLine.data) ? memberLine.data.length : ""} rows`);
    const memberCredit = await reg.post("pass_credits", { profile_id: me.regional, period: "2026-09-01", granted_cents: 100000 });
    note("regional", "cannot write an allowance", !ok(memberCredit), `got ${memberCredit.status}`);

    for (const [label, call] of [
      ["book a pass", () => anon.post("passes", { episode_id: far.id, profile_id: me.regional, status: "aboard" })],
      ["read a ledger", () => anon.get("account_ledger?select=id&limit=1")],
      ["attach an add-on", () => anon.rpc("attach_addons", { p_pass: far.id, p_addons: [], p_qty: 1 })],
      ["claim a daybed", () => anon.rpc("claim_a_daybed", { p_pass: far.id })],
      ["accept a hand-off", () => anon.rpc("accept_pass_transfer", { p_id: far.id })],
      ["claim a place", () => anon.rpc("claim_your_place", { p_entry: far.id })],
      ["check a code", () => anon.rpc("check_promo", { p_code: promoCode, p_episode: far.id })],
      ["join a line", () => anon.post("waitlist_entries", { episode_id: far.id, profile_id: me.regional, segment: "single_man" })],
    ]) {
      const r = await call();
      const empty = Array.isArray(r.data) && r.data.length === 0;
      note("anon", `cannot ${label}`, !ok(r) || empty, `got ${r.status} ${said(r).slice(0, 60)}`);
    }
  } finally {
    /* Passes, daybeds, add-on lines, offers and the line go with their
       episodes; installment plans and ledger rows keep their history with the
       episode set to null. The code goes once no pass points at it. */
    await stf.del(`episodes?slug=like.e2e-money-wf-*${stamp}*`);
    await stf.del(`promo_codes?code=like.${promoCode}*`);
    if (staffAllowanceGranted) await stf.rpc("grant_pass_credit_by_hand", { p_profile: me.staff, p_cents: 0 });
    for (const id of madeVetting) await stf.del(`vetting_files?profile_id=eq.${id}`);
    for (const id of madeSheet) await stf.del(`preference_sheets?profile_id=eq.${id}`);
  }
}
