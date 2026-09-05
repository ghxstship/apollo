/* The membership lifecycle, state by state, role by role.

   application → invitation ashore → vetting file → join → dues → pause →
   holds → dunning → lapsed → win-back → depart → erasure → number release.

   What the suite already pins is NOT repeated here: set_own_standing's shape
   (standingRules), the pause window and the ninety-day number hold
   (membershipRules), one open application per address and the farewell credit
   (decisionRules), the counter-signature (enforcementRules), the invite path's
   bounds (roundThreeRules). This module walks the transitions between those
   pins — who may cause each one, what each one writes, and what it refuses.

   Casting. `regional` is the member every transition is driven on and is put
   back exactly as found (status, plan_id, hold_reason, status_set_by,
   comped_until, vetting file, plan credit). `national` is another member.
   `paused` is only ever READ and asked for things it must be refused — the
   suite's invariant is that it stays paused. `staff` is the Bridge. Anon is
   the applicant.

   Cron-driven steps — run_dunning, write_to_the_long_held,
   erase_departed_profiles — have no caller the personas can reach, so this
   module asserts the data they read (past_due_since stamped by the trigger,
   the ladder's last rung before the grace date, a club hold that does not
   spend the member's own budget) and that the functions are not reachable
   from the API at all. */

const enc = encodeURIComponent;
const said = (r) => String(r?.data?.message ?? r?.data?.hint ?? JSON.stringify(r?.data ?? "")).toLowerCase();
const code = (r) => String(r?.data?.code ?? "");
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

export async function run(p, ctx) {
  const { rest, note, uid, RUN_TOKEN, BASE, SUPA } = ctx;
  const stf = rest(p.staff), reg = rest(p.regional), nat = rest(p.national), pau = rest(p.paused), anon = rest(null);
  const me = uid(p.regional);
  const stamp = `${Date.now().toString(36)}${RUN_TOKEN}`;
  const startedAt = new Date(Date.now() - 5_000).toISOString();

  /* The suite's page() is not on ctx; the cookie the app reads is rebuilt the
     same way it builds it, so a page can be fetched AS the persona. */
  const REF = new URL(SUPA).hostname.split(".")[0];
  const cookieFor = (session) => `sb-${REF}-auth-token=base64-${Buffer.from(JSON.stringify(session)).toString("base64url")}`;
  const pageAs = async (session, path) => {
    const res = await fetch(BASE + path, { redirect: "manual", headers: { cookie: cookieFor(session), "user-agent": "un-e2e" } });
    /* React separates adjacent text nodes with <!-- -->, so "{n} days" arrives
       as "<!-- -->30<!-- --> days"; the separators are dropped before reading. */
    return { status: res.status, html: (await res.text()).replace(/<!--\s*-->/g, "") };
  };

  /* A notice written since this module started, read by the member it was
     addressed to — the only reader notifications has. */
  const noticeFor = async (who, title) => {
    const r = await rest(p[who]).get(
      `notifications?profile_id=eq.${uid(p[who])}&title=eq.${enc(title)}&created_at=gt.${enc(startedAt)}&select=title,href,kind&order=created_at.desc&limit=1`
    );
    return r.data?.[0] ?? null;
  };

  /* Everything this module changes on the regional persona, as found. */
  const before = (await stf.get(`profiles?id=eq.${me}&select=status,plan_id,hold_reason,status_set_by,comped_until,member_no,tier`)).data?.[0];
  note("staff", "reads the regional persona's standing before touching it", !!before && before.status === "active",
    JSON.stringify(before ?? ""));
  if (!before || before.status !== "active") return;
  const fileBefore = (await stf.get(`vetting_files?profile_id=eq.${me}&select=profile_id,id_verified_at,age_ok,background_state,interview_at,cleared_at`)).data?.[0] ?? null;
  const nyMonth = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit" }).format(new Date());
  const period = `${nyMonth}-01`;
  const creditBefore = (await stf.get(`pass_credits?profile_id=eq.${me}&period=eq.${period}&select=granted_cents,spent_cents`)).data?.[0] ?? null;
  const allowanceBefore = (await stf.get("club_settings?key=eq.pause_days_a_year&select=value_int")).data?.[0]?.value_int ?? null;

  const fixtures = { episodes: [], subscriptionIds: [] };
  const restoreStanding = async () => {
    /* Two writes on purpose: stamp_who_changed_standing fills status_set_by
       from the caller on a status change, so the hand is put back afterwards. */
    await stf.patch(`profiles?id=eq.${me}`, { status: before.status, hold_reason: before.hold_reason, plan_id: before.plan_id, comped_until: before.comped_until });
    await stf.patch(`profiles?id=eq.${me}`, { status_set_by: before.status_set_by });
  };

  try {
    /* ═══════════════ 1. APPLICATION — the applicant at the door ═══════════════ */
    const addrA = `e2e-anon-lc-a-${stamp}@fixtures.invalid`;
    const addrB = `e2e-anon-lc-b-${stamp}@fixtures.invalid`;
    const addrC = `e2e-anon-lc-c-${stamp}@fixtures.invalid`;

    const questions = await anon.get("application_questions?select=key,required,active&active=eq.true&order=position");
    const requiredKey = (questions.data || []).find((q) => q.required)?.key ?? null;
    const anyKey = (questions.data || [])[0]?.key ?? null;
    note("anon", "the door reads the committee's live questions, and one is required",
      questions.status === 200 && (questions.data || []).length > 0 && !!requiredKey, JSON.stringify(questions.data ?? "").slice(0, 120));

    const plain = await anon.postMinimal("applications", { full_name: "E2E Lifecycle A", email: addrA, city: "Miami", answers: requiredKey ? { [requiredKey]: "A line." } : {} });
    note("applicant", "applies without a code", plain.status === 201, `got ${plain.status} ${said(plain).slice(0, 90)}`);

    const twice = await anon.postMinimal("applications", { full_name: "E2E Lifecycle A", email: addrA.toUpperCase(), city: "Miami", answers: requiredKey ? { [requiredKey]: "A line." } : {} });
    note("applicant", "a second open application to the same address is refused, and the code is 23505 so the form can say so",
      twice.status === 409 && code(twice) === "23505", `got ${twice.status} ${code(twice)} ${said(twice).slice(0, 80)}`);

    /* The tracker: an applicant reads their own standing. An address nobody
       applied under reads as nothing — the page says "No application under
       that address" — which is a different answer from a pending one. That
       is by design (the applicant must be able to see they were received),
       and the per-address limit below is what stops it becoming a directory. */
    const pending = await anon.rpc("application_status_for", { p_email: addrA, p_fingerprint: `e2e-${stamp}` });
    note("applicant", "the tracker reads a pending application as received", pending.status === 200 && pending.data === "received", `got ${pending.status} ${JSON.stringify(pending.data)}`);
    const nobody = await anon.rpc("application_status_for", { p_email: `e2e-anon-lc-nobody-${stamp}@fixtures.invalid`, p_fingerprint: `e2e-${stamp}` });
    note("anon", "an address nobody applied under reads as no application, not an error", nobody.status === 200 && nobody.data === null, `got ${nobody.status} ${JSON.stringify(nobody.data)}`);

    /* Eight looks at one address in ten minutes, then the door closes on it. */
    const probeAddr = `e2e-anon-lc-probe-${stamp}@fixtures.invalid`;
    let refusedAt = null, lastLook = null;
    for (let i = 1; i <= 9 && !refusedAt; i++) {
      lastLook = await anon.rpc("application_status_for", { p_email: probeAddr, p_fingerprint: `e2e-look-${stamp}-${i}` });
      if (lastLook.status >= 400) refusedAt = i;
    }
    note("anon", "the tracker closes on one address after eight looks and says so",
      refusedAt === 9 && /checked a few times/.test(said(lastLook)), `refused at look ${refusedAt ?? "never"}: ${said(lastLook).slice(0, 90)}`);

    /* The gangway's own door check: ten tries at one address in ten minutes. */
    const boardAddr = `e2e-anon-lc-board-${stamp}@fixtures.invalid`;
    const known = await anon.rpc("email_may_board", { p_email: "e2e-regional@fixtures.invalid", p_fingerprint: `e2e-board-${stamp}` });
    note("anon", "the door check answers a member's address yes", known.status === 200 && known.data === true, `got ${known.status} ${JSON.stringify(known.data)}`);
    let boardRefusedAt = null, lastBoard = null;
    for (let i = 1; i <= 11 && !boardRefusedAt; i++) {
      lastBoard = await anon.rpc("email_may_board", { p_email: boardAddr, p_fingerprint: `e2e-board-${stamp}-${i}` });
      if (lastBoard.status >= 400) boardRefusedAt = i;
      else if (lastBoard.data !== false) { boardRefusedAt = -i; break; }
    }
    note("anon", "a stranger's address is refused ten times and then the door closes on it, with the error class the form reads",
      boardRefusedAt === 11 && /tried a few times/.test(said(lastBoard)) && code(lastBoard) === "53400",
      `closed at try ${boardRefusedAt ?? "never"}: ${code(lastBoard)} ${said(lastBoard).slice(0, 90)}`);
    /* The global ceiling (600 tries in ten minutes) is deliberately NOT
       driven: reaching it would close the real door on real applicants for
       ten minutes. Its message is read off the function definition instead
       (gate report). */

    /* Bounds on the plain path. The proposer is a check constraint; an
       answer's length and the required question are only the form's — pinned
       here as they stand at the database, red where the database lets it by. */
    const longProposer = await anon.postMinimal("applications", { full_name: "E2E Lifecycle B", email: addrB, city: "Miami", proposer: "P".repeat(121) });
    note("applicant", "a proposer over 120 characters is refused at the table", longProposer.status >= 400 && ["23514", "P0001"].includes(code(longProposer)), `got ${longProposer.status} ${code(longProposer)}`);
    const longAnswer = await anon.postMinimal("applications", { full_name: "E2E Lifecycle B", email: addrB, city: "Miami", answers: anyKey ? { [anyKey]: "x".repeat(1001) } : {} });
    note("applicant", "an answer over 1000 characters is refused at the table, not only by the form",
      longAnswer.status >= 400, `got ${longAnswer.status}`);
    if (longAnswer.status < 400) await stf.del(`applications?email=eq.${enc(addrB)}`);
    if (requiredKey) {
      const unanswered = await anon.postMinimal("applications", { full_name: "E2E Lifecycle B", email: addrB, city: "Miami", answers: {} });
      note("applicant", "the required question cannot be skipped at the table, not only by the form",
        unanswered.status >= 400, `got ${unanswered.status}`);
      if (unanswered.status < 400) await stf.del(`applications?email=eq.${enc(addrB)}`);
    }

    /* The coded path carries the answers and the proposer, and bounds them. */
    const liveCodes = await stf.get("invites?select=code,uses,max_uses&order=created_at.asc&limit=50");
    const liveCode = (liveCodes.data || []).find((c) => c.uses < c.max_uses && !c.code.startsWith("UN-E2EE"))?.code ?? null;
    for (const [label, args, want] of [
      ["an answer to a question nobody asked", { p_answers: { [`nope_${stamp}`]: "x" } }, /not one of the questions/],
      ["an answer over a thousand characters", { p_answers: anyKey ? { [anyKey]: "x".repeat(1001) } : {} }, /thousand characters/],
      ["a proposer over 120 characters", { p_proposer: "P".repeat(121) }, /proposer is a name/],
    ]) {
      const r = await anon.rpc("apply_with_invite", { p_full_name: "E2E Lifecycle C", p_email: addrC, p_city: "Miami", p_note: "", p_code: liveCode ?? "UN-DEAD-0000", ...args });
      note("applicant", `the coded path refuses ${label} in the club's voice`, r.status >= 400 && want.test(said(r)), `got ${r.status} ${said(r).slice(0, 90)}`);
    }
    if (liveCode) {
      const coded = await anon.rpc("apply_with_invite", {
        p_full_name: "E2E Lifecycle C", p_email: addrC, p_city: "Miami", p_note: "E2E", p_code: liveCode.toLowerCase(),
        p_answers: requiredKey ? { [requiredKey]: "A coded answer." } : {}, p_proposer: "E2E Proposer",
      });
      const filed = await stf.get(`applications?email=eq.${enc(addrC)}&select=status,invite_code,answers,proposer`);
      note("applicant", "applies with a live code, and the file keeps the code, the answers and the proposer",
        coded.status === 200 && filed.data?.[0]?.status === "received" && filed.data[0].invite_code === liveCode.toUpperCase()
          && (!anyKey || filed.data[0].answers?.[anyKey] === "A coded answer.") && filed.data[0].proposer === "E2E Proposer",
        `got ${coded.status} ${JSON.stringify(filed.data ?? "").slice(0, 160)}`);
      const stillLive = await stf.get(`invites?code=eq.${liveCode}&select=uses`);
      note("staff", "applying does not spend the code — coming aboard does", stillLive.data?.[0]?.uses === (liveCodes.data || []).find((c) => c.code === liveCode)?.uses, JSON.stringify(stillLive.data));
    } else {
      note("staff", "a live invite code exists to apply with", false, "no invite with uses < max_uses");
    }

    /* A spent code: minted by the Bridge persona with a single use and spent
       by welcoming a fixture applicant aboard. The suite's sweep strikes it
       at the start of the next run, so it is minted fresh each time. */
    const SPENT = "UN-E2EE-0001";
    let spent = (await stf.get(`invites?code=eq.${SPENT}&select=code,uses,max_uses`)).data?.[0] ?? null;
    if (!spent) {
      const tooMany = await stf.post("invites", { code: "UN-E2EE-0009", inviter_id: uid(p.staff), max_uses: 4 });
      note("staff", "an invite carries at most three uses", tooMany.status >= 400, `got ${tooMany.status}`);
      const forAnother = await reg.post("invites", { code: "UN-E2EE-0008", inviter_id: uid(p.staff), max_uses: 1 });
      note("regional", "a member cannot mint a code in another member's name", forAnother.status >= 400, `got ${forAnother.status}`);
      const minted = await stf.post("invites", { code: SPENT, inviter_id: uid(p.staff), max_uses: 1 });
      note("staff", "mints the single-use fixture code", minted.status === 201, `got ${minted.status} ${said(minted).slice(0, 90)}`);
      spent = minted.data?.[0] ?? null;
    }
    if (spent && spent.uses < spent.max_uses) {
      const addrS = `e2e-anon-lc-spend-${stamp}@fixtures.invalid`;
      /* The sweep strikes UN-E2E* codes at the start of every run since
         2026-09-05 (they read on the Referrals screen), so this path runs every
         run rather than once — and an application carries the committee's
         required answer or the table refuses it. */
      const applied = await anon.rpc("apply_with_invite", { p_full_name: "E2E Spender", p_email: addrS, p_city: "Miami", p_note: "", p_code: SPENT, p_answers: requiredKey ? { [requiredKey]: "A spent code." } : {} });
      const appId = typeof applied.data === "string" ? applied.data : null;
      const welcomed = appId ? await stf.rpc("accept_application", { p_id: appId }) : { status: 0 };
      const after = await stf.get(`invites?code=eq.${SPENT}&select=uses,max_uses`);
      note("staff", "welcoming a coded applicant aboard spends one use of the code",
        applied.status === 200 && welcomed.status < 300 && after.data?.[0]?.uses === 1, `got ${applied.status}/${welcomed.status} ${JSON.stringify(after.data)}`);
      const rolled = await stf.get(`member_roll?email=eq.${enc(addrS)}&select=email,invite_code,source`);
      note("staff", "the welcome writes the roll with the code that vouched", rolled.data?.[0]?.invite_code === SPENT && rolled.data[0].source === "application", JSON.stringify(rolled.data));
      await stf.del(`member_roll?email=eq.${enc(addrS)}`);
      await stf.del(`applications?email=eq.${enc(addrS)}`);
      spent = after.data?.[0] ?? spent;
    }
    if (spent) {
      const dead = await anon.rpc("validate_invite", { p_code: SPENT });
      note("anon", "a spent code validates false", dead.status === 200 && dead.data === false, `got ${dead.status} ${JSON.stringify(dead.data)}`);
      const onSpent = await anon.rpc("apply_with_invite", { p_full_name: "E2E Lifecycle S", p_email: `e2e-anon-lc-s2-${stamp}@fixtures.invalid`, p_city: "Miami", p_note: "", p_code: SPENT });
      note("applicant", "a spent code is refused at the door in the club's voice", onSpent.status >= 400 && /doesn't answer|does not answer/.test(said(onSpent)), `got ${onSpent.status} ${said(onSpent).slice(0, 90)}`);
    }

    /* The Bridge moves the file; the applicant reads the move; the invitation
       ashore is a letter in the outbox. */
    const appA = (await stf.get(`applications?email=eq.${enc(addrA)}&select=id,status`)).data?.[0];
    const byMember = appA ? await reg.rpc("set_application_status", { p_id: appA.id, p_status: "review" }) : { status: 0 };
    note("regional", "a member cannot move an application", byMember.status >= 400 && /staff only/.test(said(byMember)), `got ${byMember.status} ${said(byMember).slice(0, 60)}`);
    const toReview = appA ? await stf.rpc("set_application_status", { p_id: appA.id, p_status: "review" }) : { status: 0 };
    const toInvited = appA ? await stf.rpc("set_application_status", { p_id: appA.id, p_status: "invited" }) : { status: 0 };
    const letter = await stf.get(`email_outbox?to_email=eq.${enc(addrA)}&template=eq.port-invite&select=status,payload`);
    note("staff", "review then invitation ashore, and the invitation is a letter (skipped to a fixture address)",
      toReview.status < 300 && toInvited.status < 300 && letter.data?.[0]?.payload?.name === "E2E Lifecycle A" && letter.data[0].status === "skipped",
      `got ${toReview.status}/${toInvited.status} ${JSON.stringify(letter.data ?? "").slice(0, 120)}`);
    const readsInvited = await anon.rpc("application_status_for", { p_email: addrA, p_fingerprint: `e2e-${stamp}-2` });
    note("applicant", "reads the invitation on the tracker", readsInvited.data === "invited", JSON.stringify(readsInvited.data));

    const declined = appA ? await stf.rpc("set_application_status", { p_id: appA.id, p_status: "declined" }) : { status: 0 };
    const decidedRow = await stf.get(`applications?id=eq.${appA?.id}&select=status,decided_at,reviewed_by`);
    note("staff", "a decline is stamped with the hand and the hour",
      declined.status < 300 && decidedRow.data?.[0]?.status === "declined" && !!decidedRow.data[0].decided_at && decidedRow.data[0].reviewed_by === uid(p.staff),
      JSON.stringify(decidedRow.data ?? ""));
    const again = await anon.postMinimal("applications", { full_name: "E2E Lifecycle A", email: addrA, city: "Miami", answers: requiredKey ? { [requiredKey]: "A line." } : {} });
    const againRow = await stf.get(`applications?email=eq.${enc(addrA)}&select=status&order=created_at.desc&limit=1`);
    note("applicant", "a declined address that applies again is received and declined in the same breath",
      again.status === 201 && againRow.data?.[0]?.status === "declined", `got ${again.status} ${JSON.stringify(againRow.data)}`);
    const readsDeclined = await anon.rpc("application_status_for", { p_email: addrA, p_fingerprint: `e2e-${stamp}-3` });
    note("applicant", "the tracker reads a declined application as declined, even after a fresh one", readsDeclined.data === "declined", JSON.stringify(readsDeclined.data));
    /* Three from one address in an hour is a person; the fourth is paced. */
    const third = await anon.postMinimal("applications", { full_name: "E2E Lifecycle A", email: addrA, city: "Miami", answers: requiredKey ? { [requiredKey]: "A line." } : {} });
    const fourth = await anon.postMinimal("applications", { full_name: "E2E Lifecycle A", email: addrA, city: "Miami", answers: requiredKey ? { [requiredKey]: "A line." } : {} });
    note("applicant", "a fourth application from one address in an hour is paced, with the error class the form reads",
      third.status === 201 && fourth.status >= 400 && code(fourth) === "53400" && /already with shoreside/.test(said(fourth)),
      `got ${third.status}/${fourth.status} ${code(fourth)} ${said(fourth).slice(0, 80)}`);
    const memberReads = await reg.get(`applications?email=eq.${enc(addrA)}&select=id`);
    note("regional", "a member reads no application", (memberReads.data || []).length === 0, JSON.stringify(memberReads.data ?? "").slice(0, 60));

    /* ═══════════════ 2. VETTING — the file is the club's ═══════════════ */
    if (fileBefore) await stf.del(`vetting_files?profile_id=eq.${me}`);
    const memberOpens = await reg.post("vetting_files", { profile_id: me, background_state: "cleared", age_ok: true, id_verified_at: new Date().toISOString() });
    note("regional", "a member cannot open their own vetting file", memberOpens.status >= 400, `got ${memberOpens.status}`);
    const peek = await nat.get(`vetting_files?profile_id=eq.${me}&select=id`);
    note("national", "another member reads no vetting file", (peek.data || []).length === 0, JSON.stringify(peek.data ?? ""));

    /* The sheet is the member's; the door asks for it before the clearance. */
    const sheet = await reg.patch(`preference_sheets?profile_id=eq.${me}`, { completed_at: new Date().toISOString() });
    if (!(sheet.data || []).length) {
      await reg.post("preference_sheets", { profile_id: me, drinks: ["Zero proof"], flag_green: "E2E fixture", completed_at: new Date().toISOString() });
    }

    const soon = new Date(Date.now() + 2 * 86400_000).toISOString();
    const raise = async (label, extra) => {
      const v = await stf.post("episodes", {
        slug: `e2e-lifecycle-${label}-${stamp}`, title: `E2E lifecycle ${label} fixture.`, setting: "shore", kind: "port_day",
        starts_at: soon, time_zone: "America/New_York", passes_total: 8, price_cents: 0, status: "live", ...extra,
      });
      const id = v.data?.[0]?.id ?? null;
      if (id) fixtures.episodes.push(id);
      return { id, res: v };
    };
    const vetted = await raise("vetted", { series: "sandbar" });
    const open = await raise("open", { series: "beach_day" });
    note("staff", "raises a vetted and an open ashore fixture", !!vetted.id && !!open.id, `${vetted.res.status}/${open.res.status} ${said(vetted.res).slice(0, 60)} ${said(open.res).slice(0, 60)}`);

    if (vetted.id && open.id) {
      const noFile = await reg.post("passes", { episode_id: vetted.id, profile_id: me, status: "aboard" });
      note("regional", "unvetted, a pass on a vetted series is refused and sent to the Vetting page",
        noFile.status >= 400 && /vetting file is not open/.test(said(noFile)), `got ${noFile.status} ${said(noFile).slice(0, 90)}`);
      if (noFile.status === 201) await reg.del(`passes?id=eq.${noFile.data[0].id}`);

      const openPass = await reg.post("passes", { episode_id: open.id, profile_id: me, status: "aboard" });
      note("regional", "unvetted, an Open ashore episode admits", openPass.status === 201, `got ${openPass.status} ${said(openPass).slice(0, 90)}`);
      if (openPass.status === 201) {
        const released = await reg.del(`passes?id=eq.${openPass.data[0].id}`);
        note("regional", "hands the open pass back", released.status < 300, `got ${released.status}`);
      }

      const pausedClaim = await pau.post("passes", { episode_id: open.id, profile_id: uid(p.paused), status: "aboard" });
      note("paused", "a paused member's claim is refused as paused, even on an Open episode",
        pausedClaim.status >= 400 && /paused/.test(said(pausedClaim)), `got ${pausedClaim.status} ${said(pausedClaim).slice(0, 80)}`);
      if (pausedClaim.status === 201) await stf.del(`passes?id=eq.${pausedClaim.data[0].id}`);

      /* Twelve months from clearance. A file cleared thirteen months ago is
         lapsed, and the refusal names the day. */
      const thirteenAgo = new Date(Date.now() - 396 * 86400_000);
      const opened = await stf.post("vetting_files", { profile_id: me, id_verified_at: new Date().toISOString(), age_ok: true, background_state: "cleared", cleared_at: thirteenAgo.toISOString() });
      const until = opened.data?.[0]?.cleared_until ? new Date(opened.data[0].cleared_until) : null;
      const twelve = new Date(thirteenAgo); twelve.setUTCMonth(twelve.getUTCMonth() + 12);
      note("staff", "clearance runs twelve months from the clearing, to the day",
        opened.status === 201 && !!until && Math.abs(until - twelve) < 3_600_000, `got ${opened.status} until ${until?.toISOString()} want ${twelve.toISOString()}`);
      const fastTrack = opened.data?.[0]?.fast_track;
      note("staff", "fast-track is read off the subscription, not written by hand", fastTrack === false, JSON.stringify(fastTrack));

      const lapsed = await reg.post("passes", { episode_id: vetted.id, profile_id: me, status: "aboard" });
      note("regional", "a lapsed clearance is refused and the refusal names the day it lapsed",
        lapsed.status >= 400 && /clearance lapsed on [a-z]{3} \d{2}/.test(said(lapsed)), `got ${lapsed.status} ${said(lapsed).slice(0, 90)}`);
      if (lapsed.status === 201) await reg.del(`passes?id=eq.${lapsed.data[0].id}`);

      const ownState = await reg.get("own_vetting_state?select=background_state,cleared_until,fast_track");
      note("regional", "reads their own clearance and its lapse date", ownState.data?.[0]?.background_state === "cleared" && !!ownState.data[0].cleared_until, JSON.stringify(ownState.data ?? ""));

      const recleared = await stf.patch(`vetting_files?profile_id=eq.${me}`, { cleared_at: null, background_state: "cleared" });
      const freshUntil = recleared.data?.[0]?.cleared_until ? Date.parse(recleared.data[0].cleared_until) : 0;
      note("staff", "re-clearing today runs the clearance a year ahead", freshUntil > Date.now() + 360 * 86400_000, `until ${recleared.data?.[0]?.cleared_until}`);
      const seated = await reg.post("passes", { episode_id: vetted.id, profile_id: me, status: "aboard" });
      note("regional", "cleared, a pass on a vetted series is admitted", seated.status === 201, `got ${seated.status} ${said(seated).slice(0, 90)}`);
      if (seated.status === 201) await reg.del(`passes?id=eq.${seated.data[0].id}`);

      const declinedFile = await stf.patch(`vetting_files?profile_id=eq.${me}`, { background_state: "declined" });
      const reopened = await stf.patch(`vetting_files?profile_id=eq.${me}`, { background_state: "cleared" });
      note("staff", "a declined file is not cleared from the Bridge screen",
        declinedFile.status < 300 && !!declinedFile.data?.[0]?.declined_at && reopened.status >= 400 && /declined/.test(said(reopened)),
        `got ${declinedFile.status}/${reopened.status} ${said(reopened).slice(0, 80)}`);
      const declinedSeat = await reg.post("passes", { episode_id: vetted.id, profile_id: me, status: "aboard" });
      note("regional", "a declined file is refused with the same sentence a pending one gets",
        declinedSeat.status >= 400 && /clearance is not in/.test(said(declinedSeat)) && !/declin/.test(said(declinedSeat)), said(declinedSeat).slice(0, 90));
      if (declinedSeat.status === 201) await reg.del(`passes?id=eq.${declinedSeat.data[0].id}`);
    }
    await stf.del(`vetting_files?profile_id=eq.${me}`);

    /* ═══════════════ 3. STANDING — pause, resume, the budget ═══════════════ */
    const otherPauses = await nat.patch(`profiles?id=eq.${me}`, { status: "paused" });
    const stillActive = await stf.get(`profiles?id=eq.${me}&select=status`);
    note("national", "another member cannot pause a member", (otherPauses.data || []).length === 0 && stillActive.data?.[0]?.status === "active", `got ${otherPauses.status} ${JSON.stringify(otherPauses.data ?? "").slice(0, 60)}`);

    const usedBefore = (await reg.rpc("membership_pause_days_used", { p_profile: me })).data;
    const paused = await reg.rpc("set_own_standing", { p_status: "paused" });
    await wait(300);
    const pauseNote = await noticeFor("regional", "Your membership is paused.");
    note("regional", "pauses, and the notice has somewhere to go", paused.status < 300 && !!pauseNote?.href, `got ${paused.status} ${JSON.stringify(pauseNote)}`);
    const pausedClaimOwn = open.id ? await reg.post("passes", { episode_id: open.id, profile_id: me, status: "aboard" }) : { status: 0 };
    note("regional", "paused, their own claim is refused as paused", pausedClaimOwn.status >= 400 && /paused/.test(said(pausedClaimOwn)), `got ${pausedClaimOwn.status} ${said(pausedClaimOwn).slice(0, 60)}`);
    if (pausedClaimOwn.status === 201) await stf.del(`passes?id=eq.${pausedClaimOwn.data[0].id}`);
    const resumed = await reg.rpc("set_own_standing", { p_status: "active" });
    await wait(300);
    const resumeNote = await noticeFor("regional", "Your membership is running again.");
    note("regional", "resumes their own pause, and the notice has somewhere to go", resumed.status < 300 && !!resumeNote?.href, `got ${resumed.status} ${JSON.stringify(resumeNote)}`);
    const usedAfter = (await reg.rpc("membership_pause_days_used", { p_profile: me })).data;
    note("regional", "a pause of a second spends no whole day", typeof usedAfter === "number" && usedAfter === usedBefore, `${usedBefore} → ${usedAfter}`);

    /* The budget, exceeded: the dial is turned to zero for one call so a
       member with any history at all is over it, then put back. */
    if (allowanceBefore !== null) {
      const dialed = await stf.patch("club_settings?key=eq.pause_days_a_year", { value_int: 0 });
      let overBudget = { status: 0 };
      try {
        overBudget = await reg.rpc("set_own_standing", { p_status: "paused" });
      } finally {
        await stf.patch("club_settings?key=eq.pause_days_a_year", { value_int: allowanceBefore });
      }
      const standingNow = await stf.get(`profiles?id=eq.${me}&select=status`);
      note("regional", "a pause past the year's allowance is refused with the days spent named",
        dialed.status < 300 && overBudget.status >= 400 && /days are spent/.test(said(overBudget)) && new RegExp(`and ${usedAfter} days`).test(said(overBudget)) && standingNow.data?.[0]?.status === "active",
        `got ${overBudget.status} ${said(overBudget).slice(0, 120)} standing ${standingNow.data?.[0]?.status}`);
      const dial = await anon.rpc("club_setting", { p_key: "pause_days_a_year" });
      note("anon", "the pause allowance dial is back where it was", dial.data === allowanceBefore, `${dial.data} want ${allowanceBefore}`);
    } else {
      note("staff", "the pause allowance is a dial (pause_days_a_year)", false, "club_settings has no pause_days_a_year row");
    }
    const youPage = await pageAs(p.regional, "/you");
    note("regional", "the You page states the pause allowance from the dial",
      youPage.status === 200 && new RegExp(`of ${allowanceBefore} pause days`).test(youPage.html),
      youPage.status !== 200 ? `got ${youPage.status}` : /pause days used this year/.test(youPage.html) ? "shown" : "the allowance line is missing — the page read a dial that no longer exists (pause_days_per_year); fixed in src, the served build predates it");

    /* ═══════════════ 4. HOLDS — the club's hand, and the member's ═══════════════ */
    const held = await stf.patch(`profiles?id=eq.${me}`, { status: "paused", hold_reason: "club" });
    const heldRow = await stf.get(`profiles?id=eq.${me}&select=status,hold_reason,status_set_by`);
    note("staff", "places a club hold, stamped with the Bridge's hand",
      held.status < 300 && heldRow.data?.[0]?.status === "paused" && heldRow.data[0].hold_reason === "club" && heldRow.data[0].status_set_by === uid(p.staff),
      JSON.stringify(heldRow.data ?? ""));
    await wait(300);
    const holdNote = await noticeFor("regional", "Your membership is paused.");
    note("regional", "a club hold is told, with somewhere to go", !!holdNote?.href, JSON.stringify(holdNote));
    const clubWindow = await reg.get(`membership_pauses?profile_id=eq.${me}&ended_at=is.null&select=by_the_member`);
    note("regional", "a club hold opens a window that is not the member's choice, so it spends none of their budget",
      clubWindow.data?.[0]?.by_the_member === false, JSON.stringify(clubWindow.data ?? ""));
    const selfLift = await reg.rpc("set_own_standing", { p_status: "active" });
    note("regional", "cannot lift a club hold, and is told whose it is", selfLift.status >= 400 && /club paused this membership/.test(said(selfLift)), `got ${selfLift.status} ${said(selfLift).slice(0, 90)}`);
    const reasonLift = await reg.patch(`profiles?id=eq.${me}`, { hold_reason: null });
    note("regional", "cannot erase the reason for a hold", reasonLift.status >= 400 && /bridge/.test(said(reasonLift)), `got ${reasonLift.status} ${said(reasonLift).slice(0, 60)}`);
    const handLift = await reg.patch(`profiles?id=eq.${me}`, { status_set_by: me });
    note("regional", "cannot take the hold into their own hand", handLift.status >= 400, `got ${handLift.status} ${said(handLift).slice(0, 60)}`);
    const leaveUnderHold = await reg.rpc("set_own_standing", { p_status: "becalmed" });
    note("regional", "under a hold, only the three standings are standings", leaveUnderHold.status >= 400, `got ${leaveUnderHold.status}`);
    const lifted = await stf.patch(`profiles?id=eq.${me}`, { status: "active", hold_reason: null });
    await stf.patch(`profiles?id=eq.${me}`, { status_set_by: me });
    const liftedRow = await stf.get(`profiles?id=eq.${me}&select=status,hold_reason,status_set_by`);
    note("staff", "lifts the hold and hands the standing back to the member",
      lifted.status < 300 && liftedRow.data?.[0]?.status === "active" && liftedRow.data[0].hold_reason === null && liftedRow.data[0].status_set_by === me, JSON.stringify(liftedRow.data ?? ""));
    const clubWindowClosed = await reg.get(`membership_pauses?profile_id=eq.${me}&ended_at=is.null&select=id`);
    note("regional", "lifting the hold closes its window", (clubWindowClosed.data || []).length === 0, JSON.stringify(clubWindowClosed.data ?? ""));

    /* ═══════════════ 5. DUES — the webhook's mirror, the hold that lifts on payment ═══════════════ */
    const duesHeld = await stf.patch(`profiles?id=eq.${me}`, { status: "paused", hold_reason: "dues" });
    note("staff", "places a dues hold", duesHeld.status < 300 && duesHeld.data?.[0]?.hold_reason === "dues", `got ${duesHeld.status}`);
    const memberSub = await reg.post("subscriptions", { profile_id: me, plan_id: before.plan_id, status: "active" });
    note("regional", "a member cannot write their own dues", memberSub.status >= 400, `got ${memberSub.status}`);
    const sub = await stf.post("subscriptions", { profile_id: me, plan_id: before.plan_id, status: "active" });
    const subId = sub.data?.[0]?.id ?? null;
    if (subId) fixtures.subscriptionIds.push(subId);
    const afterPay = await stf.get(`profiles?id=eq.${me}&select=status,hold_reason,plan_id`);
    note("staff", "dues going active lift a dues hold and copy the plan onto the member",
      sub.status === 201 && afterPay.data?.[0]?.status === "active" && afterPay.data[0].hold_reason === null && afterPay.data[0].plan_id === before.plan_id,
      `got ${sub.status} ${said(sub).slice(0, 60)} ${JSON.stringify(afterPay.data ?? "")}`);
    note("staff", "the dues row carries a member_ref snapshot of the number", sub.data?.[0]?.member_ref === before.member_no, `${sub.data?.[0]?.member_ref} want ${before.member_no}`);
    const otherSub = await nat.get(`subscriptions?id=eq.${subId}&select=id`);
    note("national", "another member reads no dues but their own", (otherSub.data || []).length === 0, JSON.stringify(otherSub.data ?? ""));

    if (subId) {
      /* A club hold is NOT lifted by a payment — only a dues hold is. */
      await stf.patch(`profiles?id=eq.${me}`, { status: "paused", hold_reason: "conduct" });
      const renew = await stf.patch(`subscriptions?id=eq.${subId}`, { status: "trialing" });
      const stillHeld = await stf.get(`profiles?id=eq.${me}&select=status,hold_reason`);
      note("staff", "a payment does not lift a conduct hold",
        renew.status < 300 && stillHeld.data?.[0]?.status === "paused" && stillHeld.data[0].hold_reason === "conduct", JSON.stringify(stillHeld.data ?? ""));
      await stf.patch(`profiles?id=eq.${me}`, { status: "active", hold_reason: null });
      await stf.patch(`profiles?id=eq.${me}`, { status_set_by: me });
      await stf.patch(`subscriptions?id=eq.${subId}`, { status: "active" });

      /* The dunning ladder reads past_due_since, which the trigger stamps. A
         past_due transition also fires any dues_failed automation an operator
         has written, so it is only driven when none is live. */
      const rules = await stf.get("automations?trigger_event=eq.dues_failed&active=eq.true&select=id");
      if ((rules.data || []).length === 0) {
        const lapsed = await stf.patch(`subscriptions?id=eq.${subId}`, { status: "past_due" });
        const since = lapsed.data?.[0]?.past_due_since ? Date.parse(lapsed.data[0].past_due_since) : null;
        note("staff", "dues moving to past_due stamp the lapse's start for the ladder", lapsed.status < 300 && since !== null && Math.abs(Date.now() - since) < 60_000, `since ${lapsed.data?.[0]?.past_due_since}`);
        await wait(300);
        const declinedNote = await noticeFor("regional", "Dues did not clear.");
        note("regional", "a declined card is told, with somewhere to go", !!declinedNote?.href, JSON.stringify(declinedNote));
        const stillActiveOnLapse = await stf.get(`profiles?id=eq.${me}&select=status`);
        note("staff", "past_due alone does not hold the membership — the ladder does, at the grace date", stillActiveOnLapse.data?.[0]?.status === "active", JSON.stringify(stillActiveOnLapse.data));
        const memberSeesDues = await reg.get(`subscriptions?id=eq.${subId}&select=status,past_due_since`);
        note("regional", "reads their own dues and the lapse date", memberSeesDues.data?.[0]?.status === "past_due" && !!memberSeesDues.data[0].past_due_since, JSON.stringify(memberSeesDues.data ?? ""));

        const settled = await stf.patch(`subscriptions?id=eq.${subId}`, { status: "active" });
        note("staff", "dues settling clear the lapse's start", settled.status < 300 && settled.data?.[0]?.past_due_since === null, JSON.stringify(settled.data?.[0]?.past_due_since));

        /* Lapsed: a cancelled subscription holds the membership for dues, by
           no hand. handle_subscription_status compares new.status against
           ('canceled','unpaid') and subscription_status has no 'unpaid' label,
           so the comparison itself raises 22P02 and the row never moves —
           which is why this one check carries the defect and the four that
           follow only run once a cancellation lands (SQL in the report). */
        const cancelled = await stf.patch(`subscriptions?id=eq.${subId}`, { status: "canceled" });
        note("staff", "a subscription can be cancelled at all",
          cancelled.status < 300, `got ${cancelled.status} ${code(cancelled)} ${said(cancelled).slice(0, 120)}`);
        if (cancelled.status < 300) {
          const lapsedRow = await stf.get(`profiles?id=eq.${me}&select=status,hold_reason,status_set_by`);
          note("staff", "lapsed dues hold the membership for dues, and the hold is nobody's hand",
            lapsedRow.data?.[0]?.status === "paused" && lapsedRow.data[0].hold_reason === "dues" && lapsedRow.data[0].status_set_by === null,
            JSON.stringify(lapsedRow.data ?? ""));
          await wait(300);
          const lapsedNote = await noticeFor("regional", "Membership held — dues lapsed.");
          note("regional", "a dues hold is told, with somewhere to go", !!lapsedNote?.href, JSON.stringify(lapsedNote));
          const duesWindow = await reg.get(`membership_pauses?profile_id=eq.${me}&ended_at=is.null&select=by_the_member`);
          note("regional", "a dues hold opens a window the win-back letter reads, and it is not the member's choice", duesWindow.data?.[0]?.by_the_member === false, JSON.stringify(duesWindow.data ?? ""));
          const selfLiftDues = await reg.rpc("set_own_standing", { p_status: "active" });
          note("regional", "cannot lift a dues hold by a word — the payment lifts it", selfLiftDues.status >= 400, `got ${selfLiftDues.status} ${said(selfLiftDues).slice(0, 60)}`);
          const paidAgain = await stf.patch(`subscriptions?id=eq.${subId}`, { status: "active" });
          const lifted2 = await stf.get(`profiles?id=eq.${me}&select=status,hold_reason`);
          note("staff", "settling the dues lifts the dues hold on its own", paidAgain.status < 300 && lifted2.data?.[0]?.status === "active" && lifted2.data[0].hold_reason === null, JSON.stringify(lifted2.data ?? ""));
          await stf.patch(`profiles?id=eq.${me}`, { status_set_by: me });
        }
      } else {
        note("staff", "SKIPPED the past_due walk — a live dues_failed automation would write a real letter", true, `${rules.data.length} live`);
      }
    }
    const steps = await stf.get("dunning_steps?select=step,day_offset,template&order=step");
    const grace = (await anon.rpc("club_setting", { p_key: "dues_grace_days" })).data;
    const last = (steps.data || []).at(-1);
    note("staff", "the ladder's last rung comes before the grace date the final notice names",
      (steps.data || []).length >= 2 && typeof grace === "number" && last && last.day_offset < grace && last.template === "final-notice",
      `${JSON.stringify(steps.data ?? "")} grace ${grace}`);
    const memberLadder = await reg.get("dunning_steps?select=step");
    const memberLog = await reg.get("dunning_log?select=step");
    note("regional", "the ladder and its log are the Bridge's reading", (memberLadder.data || []).length === 0 && (memberLog.data || []).length === 0, `${memberLadder.status}/${memberLog.status}`);
    for (const fn of ["run_dunning", "write_to_the_long_held", "erase_departed_profiles"]) {
      const r = await stf.rpc(fn, {});
      note("staff", `${fn} is cron's alone — not even the Bridge runs it by hand`, r.status >= 400, `got ${r.status}`);
    }

    /* ═══════════════ 6. COMP — the Bridge's gift, read on the member's page ═══════════════ */
    const selfComp = await reg.patch(`profiles?id=eq.${me}`, { comped_until: "2099-01-01" });
    const selfCompRow = await stf.get(`profiles?id=eq.${me}&select=comped_until`);
    note("regional", "cannot comp their own dues",
      selfComp.status >= 400 && selfCompRow.data?.[0]?.comped_until === before.comped_until,
      `got ${selfComp.status} comped_until now ${selfCompRow.data?.[0]?.comped_until}`);
    if (selfCompRow.data?.[0]?.comped_until !== before.comped_until) await stf.patch(`profiles?id=eq.${me}`, { comped_until: before.comped_until });
    const compDate = new Date(Date.now() + 40 * 86400_000).toISOString().slice(0, 10);
    const comped = await stf.patch(`profiles?id=eq.${me}`, { comped_until: compDate });
    const youComped = await pageAs(p.regional, "/you");
    note("regional", "a comp set by the Bridge reads on the You page as complimentary until the date",
      comped.status < 300 && youComped.status === 200 && /COMPLIMENTARY UNTIL/.test(youComped.html), `got ${comped.status}/${youComped.status} ${/COMPLIMENTARY/.test(youComped.html)}`);
    await stf.patch(`profiles?id=eq.${me}`, { comped_until: before.comped_until });
    const memberPlanEdit = await reg.patch("membership_plans?label=eq.Deck", { guest_allowance: 2 });
    note("regional", "a member cannot edit a plan's allowance, price or publication", (memberPlanEdit.data || []).length === 0 || memberPlanEdit.status >= 400, `got ${memberPlanEdit.status} ${JSON.stringify(memberPlanEdit.data ?? "").slice(0, 60)}`);
    const deck = (await anon.get("membership_plans?label=eq.Deck&select=id,guest_allowance,published,price_cents,monthly_credit_cents&limit=1")).data?.[0];
    const staffPlanEdit = deck ? await stf.patch(`membership_plans?id=eq.${deck.id}`, { guest_allowance: deck.guest_allowance, published: deck.published }) : { status: 0 };
    note("staff", "the Bridge writes a plan's allowance and publication (a no-op write, so nothing moves)", staffPlanEdit.status < 300 && staffPlanEdit.data?.[0]?.guest_allowance === deck?.guest_allowance, `got ${staffPlanEdit.status}`);

    /* ═══════════════ 7. PLAN CHANGE — the month's credit follows, once, never down ═══════════════ */
    const cabin = (await anon.get("membership_plans?label=eq.Cabin&select=id,monthly_credit_cents&limit=1")).data?.[0];
    const selfPlan = await reg.patch(`profiles?id=eq.${me}`, { plan_id: deck?.id });
    note("regional", "cannot change their own plan by hand", selfPlan.status >= 400 && /billing/.test(said(selfPlan)), `got ${selfPlan.status} ${said(selfPlan).slice(0, 60)}`);
    if (deck && cabin && deck.monthly_credit_cents > 0 && cabin.monthly_credit_cents > deck.monthly_credit_cents) {
      const credit = async () => (await stf.get(`pass_credits?profile_id=eq.${me}&period=eq.${period}&select=granted_cents,spent_cents,plan_id`)).data?.[0] ?? null;
      const floor = Math.max(creditBefore?.granted_cents ?? 0, 0);
      const toDeck = await stf.patch(`profiles?id=eq.${me}`, { plan_id: deck.id });
      const c1 = await credit();
      note("staff", "moving a member onto a plan grants this month's credit at once",
        toDeck.status < 300 && c1 && c1.granted_cents >= Math.max(deck.monthly_credit_cents, floor) && toDeck.data?.[0]?.tier === before.tier,
        `granted ${JSON.stringify(c1)} want ≥ ${Math.max(deck.monthly_credit_cents, floor)}`);
      const memberCredit = await reg.get(`pass_credits?profile_id=eq.${me}&period=eq.${period}&select=granted_cents`);
      note("regional", "reads their own month's credit", memberCredit.data?.[0]?.granted_cents === c1?.granted_cents, JSON.stringify(memberCredit.data ?? ""));
      await stf.patch(`profiles?id=eq.${me}`, { plan_id: cabin.id });
      const c2 = await credit();
      note("staff", "a deeper plan raises the month's credit to its figure", c2?.granted_cents === Math.max(cabin.monthly_credit_cents, floor) && c2.plan_id === cabin.id, JSON.stringify(c2));
      await stf.patch(`profiles?id=eq.${me}`, { plan_id: deck.id });
      const c3 = await credit();
      note("staff", "moving back down never lowers a credit already granted", c3?.granted_cents === c2?.granted_cents, `${c2?.granted_cents} → ${c3?.granted_cents}`);
      await stf.patch(`profiles?id=eq.${me}`, { plan_id: before.plan_id });
      const c4 = await credit();
      note("staff", "the plan is restored and the granted figure stands", c4?.granted_cents === c3?.granted_cents, JSON.stringify(c4));
    } else {
      note("staff", "Deck and Cabin carry a rising monthly credit to test on", false, JSON.stringify({ deck, cabin }));
    }

    /* ═══════════════ 8. THE NUMBER — issued once, released by the Bridge ═══════════════ */
    const selfNumber = await reg.patch(`profiles?id=eq.${me}`, { member_no: "UN-9999" });
    note("regional", "cannot write their own member number", selfNumber.status >= 400 && /issued once/.test(said(selfNumber)), `got ${selfNumber.status} ${said(selfNumber).slice(0, 60)}`);
    const selfRelease = await reg.rpc("release_member_number", { p_profile: me });
    const selfReissue = await reg.rpc("reissue_member_number", { p_profile: me, p_number: "UN-0001" });
    note("regional", "cannot release or reissue a number", selfRelease.status >= 400 && /staff only/.test(said(selfRelease)) && selfReissue.status >= 400 && /staff only/.test(said(selfReissue)), `got ${selfRelease.status}/${selfReissue.status}`);
    const neverGiven = await stf.rpc("reissue_member_number", { p_profile: me, p_number: `UN-E2E${stamp.slice(-1)}` });
    note("staff", "a number never given up cannot be reissued", neverGiven.status >= 400 && /never given up/.test(said(neverGiven)), said(neverGiven).slice(0, 80));
    const anonPool = await anon.get("member_number_releases?select=member_no&limit=1");
    note("anon", "the number pool is sealed", anonPool.status === 200 && (anonPool.data || []).length === 0, `got ${anonPool.status}`);

    /* ═══════════════ 9. DEPARTURE AND ERASURE — the rules the page reads ═══════════════ */
    const erasureDays = await anon.rpc("club_setting", { p_key: "departed_erasure_days" });
    note("anon", "erasure after departure is a dial, and it is set", erasureDays.status === 200 && typeof erasureDays.data === "number" && erasureDays.data > 0, JSON.stringify(erasureDays.data));
    const account = await pageAs(p.regional, "/account");
    note("regional", "the account page states the erasure horizon from the dial",
      account.status === 200 && new RegExp(`Erasure runs ${erasureDays.data} days`).test(account.html), `got ${account.status} ${/Erasure runs/.test(account.html)}`);
    const pausedLeaves = await pau.rpc("set_own_standing", { p_status: "paused" });
    note("paused", "the paused persona asking for its own standing is a no-op, and stays paused", pausedLeaves.status < 300 && (await stf.get(`profiles?id=eq.${uid(p.paused)}&select=status`)).data?.[0]?.status === "paused", `got ${pausedLeaves.status}`);
    const anonLeaves = await anon.rpc("set_own_standing", { p_status: "departed" });
    note("anon", "the open water cannot depart anyone", anonLeaves.status >= 400, `got ${anonLeaves.status}`);
  } finally {
    await restoreStanding();
    for (const id of fixtures.subscriptionIds) await stf.del(`subscriptions?id=eq.${id}`);
    /* handle_subscription_status ran on every status write above; the plan
       and standing are put back after the rows go, in case a delete-side
       trigger ever learns to write the profile. */
    await restoreStanding();
    for (const id of fixtures.episodes) {
      await stf.del(`passes?episode_id=eq.${id}`);
      await stf.del(`episodes?id=eq.${id}`);
    }
    await stf.del(`vetting_files?profile_id=eq.${me}`);
    if (fileBefore) await stf.post("vetting_files", fileBefore);
    await stf.del(`membership_pauses?profile_id=eq.${me}`);
    /* The month's credit: put back to the granted figure found, or to zero
       if there was none (the row itself cannot be struck — SELECT-only table). */
    await stf.rpc("grant_pass_credit_by_hand", { p_profile: me, p_cents: creditBefore?.granted_cents ?? 0 });
    if (allowanceBefore !== null) await stf.patch("club_settings?key=eq.pause_days_a_year", { value_int: allowanceBefore });
    await stf.del("applications?email=like.e2e-anon-lc-*");
    await stf.del("member_roll?email=like.e2e-anon-lc-*");
    for (const t of ["Your membership is paused.", "Your membership is running again.", "Dues did not clear.", "Membership held — dues lapsed."]) {
      await stf.del(`notifications?profile_id=eq.${me}&title=eq.${enc(t)}&created_at=gt.${enc(startedAt)}`);
    }

    const after = (await stf.get(`profiles?id=eq.${me}&select=status,plan_id,hold_reason,status_set_by,comped_until,member_no,tier`)).data?.[0];
    note("staff", "the regional persona is exactly as it was found", JSON.stringify(after) === JSON.stringify(before), `${JSON.stringify(before)} → ${JSON.stringify(after)}`);
    const pausedStill = (await stf.get(`profiles?id=eq.${uid(p.paused)}&select=status,status_set_by`)).data?.[0];
    note("staff", "the paused persona still holds its own pause", pausedStill?.status === "paused" && pausedStill.status_set_by === uid(p.paused), JSON.stringify(pausedStill));
  }
}
