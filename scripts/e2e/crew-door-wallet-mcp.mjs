/* CREW, THE DOOR, THE KIOSK, WALLET and MCP — every workflow, every role.

   What rulesOfSept4 §2 and opsRules already pin is not repeated here: a
   member cannot hand themselves the door, a door reads its own grant, staff
   mint and members cannot mint an API key, the crew pipeline is invisible to
   members. This module goes on from there — the ATS as a stage machine, the
   rota's arithmetic, the manifest the door reads by definer rather than by
   profiles, the wallet token's three words, the wallet routes over HTTP with
   nothing configured, and the MCP server as an outside model sees it.

   Personas as cast: regional is the member who holds a pass (signed);
   national is the OTHER member, unsigned — hired as the door for one night;
   global is a third member whose grant has already run out; paused is the
   member on hold whose wallet pass must say so; staff is the Bridge.

   Everything created here carries ctx.RUN_TOKEN in its slug or an E2E label,
   so the suite's sweep removes it; the module also strikes its own fixtures
   in `finally`, and restores the one persona field it touches
   (regional.in_directory). */

import { createHash, randomBytes } from "node:crypto";

export async function run(p, ctx) {
  const { rest, note, uid, RUN_TOKEN, BASE } = ctx;
  const stf = rest(p.staff), reg = rest(p.regional), nat = rest(p.national), glo = rest(p.global),
        pau = rest(p.paused), anon = rest(null);
  const stamp = `${Date.now().toString(36)}${RUN_TOKEN}`;
  const said = (r) => String(r.data?.message ?? r.data?.hint ?? JSON.stringify(r.data ?? "")).toLowerCase();
  const nowIso = () => new Date().toISOString();
  const plusH = (h) => new Date(Date.now() + h * 3600_000).toISOString();
  const soon = plusH(48);
  const soonDay = soon.slice(0, 10);
  const REG = uid(p.regional), NAT = uid(p.national), GLO = uid(p.global), STF = uid(p.staff);

  const raise = async (label, extra = {}) => {
    const v = await stf.post("episodes", {
      slug: `e2e-cdwm-${label}-${stamp}`, title: `E2E ${label} fixture.`, setting: "sea", kind: "sea_day", sub_class: "passage",
      starts_at: soon, time_zone: "America/New_York", passes_total: 8, price_cents: 0, status: "live", min_tier: "regional",
      ...extra,
    });
    return { id: v.data?.[0]?.id ?? null, res: v };
  };

  /* Struck at the end, in this order: grants, crew rows (cascade assignments
     and blackouts), roles (cascade candidates), episodes (cascade passes). */
  const made = { episodes: [], crew: [], roles: [], keys: [], grants: [] };
  const regDirectoryWas = (await stf.get(`profiles?id=eq.${REG}&select=in_directory`)).data?.[0]?.in_directory;

  try {
    /* ══════════════════════════════════════════════════════════════════════
       A. CREW ATS — the funnel is public, the pipeline is a ladder
       ══════════════════════════════════════════════════════════════════════ */
    const openRole = await stf.post("crew_roles", {
      slug: `e2e-open-${stamp}`, title: `E2E Open Posting ${stamp}`, city: "Miami", open: true, position: 99,
    });
    const closedRole = await stf.post("crew_roles", {
      slug: `e2e-closed-${stamp}`, title: `E2E Closed Posting ${stamp}`, city: "Miami", open: false, position: 99,
    });
    const openRoleId = openRole.data?.[0]?.id, closedRoleId = closedRole.data?.[0]?.id;
    if (openRoleId) made.roles.push(openRoleId);
    if (closedRoleId) made.roles.push(closedRoleId);
    note("staff", "raises an open and a closed posting", !!openRoleId && !!closedRoleId, `got ${openRole.status} ${closedRole.status} ${said(openRole).slice(0, 80)}`);

    const applicant = `e2e-anon-crew-${stamp}@example.com`;
    const noteBody = "E2E — twenty characters at least, so a person reads it.";
    if (openRoleId) {
      const openPage = await fetch(`${BASE}/crew/wanted/e2e-open-${stamp}`, { headers: { "user-agent": "un-e2e" } });
      const openHtml = await openPage.text();
      note("anon", "an open posting renders its form", openPage.status === 200 && /role_id/.test(openHtml), `got ${openPage.status}`);
      const closedPage = await fetch(`${BASE}/crew/wanted/e2e-closed-${stamp}`, { headers: { "user-agent": "un-e2e" } });
      const closedHtml = await closedPage.text();
      note("anon", "a closed posting says so and offers no form",
        closedPage.status === 200 && /not taking applications/i.test(closedHtml) && !/name="role_id"/.test(closedHtml), `got ${closedPage.status}`);

      const apply = await anon.postMinimal("crew_candidates", { role_id: openRoleId, full_name: "E2E Anon Crew", email: applicant, note: noteBody });
      note("anon", "applies to an open posting", apply.status === 201, `got ${apply.status} ${said(apply).slice(0, 80)}`);
      const twice = await anon.postMinimal("crew_candidates", { role_id: openRoleId, full_name: "E2E Anon Crew", email: ` ${applicant.toUpperCase()} `, note: noteBody });
      note("anon", "one application per address per posting, whatever the case", twice.status === 409, `got ${twice.status} ${said(twice).slice(0, 80)}`);
      const longName = await anon.postMinimal("crew_candidates", { role_id: openRoleId, full_name: "E".repeat(121), email: `e2e-anon-long-${stamp}@example.com`, note: noteBody });
      note("anon", "a name is bounded at 120", longName.status >= 400, `got ${longName.status}`);
      const longNote = await anon.postMinimal("crew_candidates", { role_id: openRoleId, full_name: "E2E Anon Crew", email: `e2e-anon-note-${stamp}@example.com`, note: "x".repeat(2001) });
      note("anon", "a note is bounded at 2000", longNote.status >= 400, `got ${longNote.status}`);
      const noAt = await anon.postMinimal("crew_candidates", { role_id: openRoleId, full_name: "E2E Anon Crew", email: "e2e-anon-noat", note: noteBody });
      note("anon", "an address needs an @", noAt.status >= 400, `got ${noAt.status}`);
      const skipStage = await anon.postMinimal("crew_candidates", { role_id: openRoleId, full_name: "E2E Anon Crew", email: `e2e-anon-offer-${stamp}@example.com`, note: noteBody, stage: "offer" });
      note("anon", "an applicant arrives as applied, never at offer", skipStage.status >= 400, `got ${skipStage.status}`);
      const decided = await anon.postMinimal("crew_candidates", { role_id: openRoleId, full_name: "E2E Anon Crew", email: `e2e-anon-decided-${stamp}@example.com`, note: noteBody, decided_at: nowIso(), reviewed_by: STF });
      note("anon", "an applicant does not decide their own application", decided.status >= 400, `got ${decided.status}`);
    }
    if (closedRoleId) {
      /* The page hides the form and the server action refuses a forged
         role_id; the table itself has no such rule, so a direct insert lands.
         Real defect — the SQL is in the module's report. */
      const closedApply = await anon.postMinimal("crew_candidates", { role_id: closedRoleId, full_name: "E2E Anon Crew", email: `e2e-anon-closed-${stamp}@example.com`, note: noteBody });
      note("anon", "a closed posting takes no application (policy reads crew_roles.open)", closedApply.status >= 400, `got ${closedApply.status} — the with-check does not read crew_roles.open`);
    }

    /* Read side: staff and nobody else. */
    const mine = await stf.get(`crew_candidates?email=eq.${applicant}&select=id,stage,role_id`);
    const candId = mine.data?.[0]?.id;
    note("staff", "reads the application at applied", candId && mine.data[0].stage === "applied", `got ${mine.status} ${said(mine).slice(0, 80)}`);
    const anonRead = await anon.get(`crew_candidates?select=id&email=eq.${applicant}`);
    note("anon", "a candidate cannot read the pipeline", (anonRead.data?.length ?? 0) === 0, `got ${anonRead.status}`);
    const memberRead = await reg.get(`crew_candidates?select=id&email=eq.${applicant}`);
    note("regional", "nor can a member", (memberRead.data?.length ?? 0) === 0, `got ${memberRead.status}`);
    const pausedRead = await pau.get(`crew_candidates?select=id&email=eq.${applicant}`);
    note("paused", "nor a paused member", (pausedRead.data?.length ?? 0) === 0, `got ${pausedRead.status}`);
    const anonMove = await anon.patch(`crew_candidates?email=eq.${applicant}`, { stage: "interview" });
    note("anon", "a candidate cannot advance themselves", anonMove.status >= 400 || (anonMove.data?.length ?? 0) === 0, `got ${anonMove.status}`);

    if (candId) {
      const opened = await stf.get(`crew_candidate_events?candidate_id=eq.${candId}&select=kind,to_stage&order=at`);
      note("staff", "the history opens with the application", (opened.data ?? []).some((e) => e.kind === "applied" && e.to_stage === "applied"), said(opened).slice(0, 80));

      /* The ladder. */
      const skip = await stf.patch(`crew_candidates?id=eq.${candId}`, { stage: "offer" });
      note("staff", "applied cannot jump to offer", skip.status >= 400 && /does not follow/.test(said(skip)), `got ${skip.status} ${said(skip).slice(0, 90)}`);
      const rung1 = await stf.patch(`crew_candidates?id=eq.${candId}`, { stage: "interview" });
      note("staff", "applied climbs to interview", rung1.status === 200 && rung1.data?.[0]?.stage === "interview", `got ${rung1.status}`);
      const back = await stf.patch(`crew_candidates?id=eq.${candId}`, { stage: "applied" });
      note("staff", "nothing moves backward", back.status >= 400 && /does not follow/.test(said(back)), `got ${back.status}`);
      const rung2 = await stf.patch(`crew_candidates?id=eq.${candId}`, { stage: "sea_trial" });
      const rung3 = await stf.patch(`crew_candidates?id=eq.${candId}`, { stage: "offer" });
      note("staff", "interview, sea trial, offer — one rung at a time", rung2.status === 200 && rung3.status === 200 && rung3.data?.[0]?.stage === "offer", `got ${rung2.status} ${rung3.status}`);
      const offRung = await stf.patch(`crew_candidates?id=eq.${candId}`, { stage: "hired" });
      note("staff", "a stage off the ladder is refused", offRung.status >= 400, `got ${offRung.status}`);
      const passed = await stf.patch(`crew_candidates?id=eq.${candId}`, { stage: "passed", rejected_reason: "E2E passed over", decided_at: nowIso(), reviewed_by: STF });
      note("staff", "passed is reachable from anywhere", passed.status === 200 && passed.data?.[0]?.stage === "passed", `got ${passed.status} ${said(passed).slice(0, 80)}`);
      const revive = await stf.patch(`crew_candidates?id=eq.${candId}`, { stage: "interview" });
      note("staff", "and passed is final", revive.status >= 400, `got ${revive.status}`);
      const history = await stf.get(`crew_candidate_events?candidate_id=eq.${candId}&select=kind,from_stage,to_stage,body,actor&order=at`);
      const moves = (history.data ?? []).filter((e) => e.kind === "stage" || e.kind === "decision");
      note("staff", "every move is on the record, with a name and the reason",
        moves.length === 4 && moves.every((e) => e.actor === STF) && moves.at(-1)?.kind === "decision" && moves.at(-1)?.body === "E2E passed over",
        JSON.stringify(moves).slice(0, 160));

      /* Notes are events, staff-only, append-only. */
      const staffNote = await stf.post("crew_candidate_events", { candidate_id: candId, actor: STF, kind: "note", body: "E2E note" });
      note("staff", "files a note on a candidate", staffNote.status === 201, `got ${staffNote.status}`);
      const memberNote = await reg.post("crew_candidate_events", { candidate_id: candId, actor: REG, kind: "note", body: "E2E intruder" });
      note("regional", "a member cannot file a note", memberNote.status >= 400, `got ${memberNote.status}`);
      const anonNote = await anon.post("crew_candidate_events", { candidate_id: candId, kind: "note", body: "E2E intruder" });
      note("anon", "nor can an applicant", anonNote.status >= 400, `got ${anonNote.status}`);
      const memberHistory = await reg.get(`crew_candidate_events?candidate_id=eq.${candId}&select=id`);
      note("regional", "the history is staff reading", (memberHistory.data?.length ?? 0) === 0, `got ${memberHistory.status}`);
      const editNote = staffNote.data?.[0]?.id ? await stf.patch(`crew_candidate_events?id=eq.${staffNote.data[0].id}`, { body: "E2E edited" }) : { status: 0, data: [] };
      note("staff", "a note, once filed, is not rewritten", editNote.status >= 400 || (editNote.data?.length ?? 0) === 0, `got ${editNote.status}`);
    }

    /* Forty souls. The hull ceiling is one setting and the composition trigger
       counts heads against it — asserted on one two-row insert, never by
       raising forty passes. */
    const hull = await anon.rpc("club_setting", { p_key: "hull_ceiling_heads" });
    note("anon", "the ceiling is forty souls, said once", hull.data === 40, `got ${JSON.stringify(hull.data)}`);
    const capEp = await raise("caps", { passes_total: 40 });
    if (capEp.id) {
      made.episodes.push(capEp.id);
      const over = await stf.post("episode_segment_caps", [
        { episode_id: capEp.id, segment: "single_woman", cap: 20 },
        { episode_id: capEp.id, segment: "couple", cap: 11 },
      ]);
      note("staff", "a composition past forty heads is refused, a couple counting two", over.status >= 400 && /forty|40/.test(said(over)), `got ${over.status} ${said(over).slice(0, 90)}`);
    }

    /* ══════════════════════════════════════════════════════════════════════
       B. THE ROTA — who is working the night, and what it still needs
       ══════════════════════════════════════════════════════════════════════ */
    const epA = await raise("door", { passes_total: 8 });
    const epB = await raise("other", { passes_total: 8 });
    const epC = await raise("standby", { passes_total: 1, standby_passes: 1 });
    for (const e of [epA, epB, epC]) if (e.id) made.episodes.push(e.id);
    note("staff", "raises the door, the other night and the standby fixture", !!epA.id && !!epB.id && !!epC.id, `got ${epA.res.status} ${epB.res.status} ${epC.res.status} ${said(epA.res).slice(0, 80)}`);
    if (!epA.id || !epB.id || !epC.id) return;
    const A = epA.id, B = epB.id, C = epC.id;

    const crewA = await stf.post("crew", { slug: `e2e-skipper-${stamp}`, display_name: `E2E Skipper ${stamp}`, role_title: "Skipper", public: true, active: true });
    const crewB = await stf.post("crew", { slug: `e2e-deckhand-${stamp}`, display_name: `E2E Deckhand ${stamp}`, role_title: "Deckhand", public: false, active: true });
    const crewAId = crewA.data?.[0]?.id, crewBId = crewB.data?.[0]?.id;
    for (const c of [crewAId, crewBId]) if (c) made.crew.push(c);
    note("staff", "names two crew, one billed publicly and one not", !!crewAId && !!crewBId, `got ${crewA.status} ${crewB.status} ${said(crewA).slice(0, 80)}`);

    const routeStrike = await stf.post("crew", { slug: "wanted", display_name: "E2E Collision", role_title: "Nobody" });
    note("staff", "a crew slug cannot shadow /crew/wanted", routeStrike.status >= 400, `got ${routeStrike.status}`);
    if (routeStrike.status === 201) await stf.del(`crew?id=eq.${routeStrike.data[0].id}`);

    /* A member cannot write any of it. */
    for (const [t, body] of [
      ["crew", { slug: `e2e-x-${stamp}`, display_name: "E2E", role_title: "x" }],
      ["crew_assignments", { episode_id: A, crew_id: crewAId, position_slug: "skipper" }],
      ["crew_blackouts", { crew_id: crewAId, from_date: soonDay, to_date: soonDay }],
      ["crew_needs", { setting: "sea", position_slug: "skipper", headcount: 9 }],
      ["episode_crew_needs", { episode_id: A, position_slug: "skipper", headcount: 9 }],
    ]) {
      const w = await reg.post(t, body);
      note("regional", `cannot write ${t}`, w.status >= 400, `got ${w.status}`);
    }
    const memberGaps = await reg.get("episode_crew_gaps?select=episode_id&limit=1");
    note("regional", "the gaps view is the Bridge's reading", (memberGaps.data?.length ?? 0) === 0, `got ${memberGaps.status}`);
    const memberBlackouts = await reg.get("crew_blackouts?select=id&limit=1");
    note("regional", "blackouts are nobody's business but the scheduler's", (memberBlackouts.data?.length ?? 0) === 0, `got ${memberBlackouts.status}`);
    const hiddenCrew = await anon.get(`crew?slug=eq.e2e-deckhand-${stamp}&select=id`);
    note("anon", "a crew member who did not opt in is not on the site", (hiddenCrew.data?.length ?? 0) === 0, `got ${hiddenCrew.status}`);
    const shownCrew = await anon.get(`crew?slug=eq.e2e-skipper-${stamp}&select=id`);
    note("anon", "one who did is", shownCrew.data?.[0]?.id === crewAId, `got ${shownCrew.status}`);

    if (crewAId && crewBId) {
      /* Gaps before anyone is assigned: the setting's defaults. */
      const gaps0 = await stf.get(`episode_crew_gaps?episode_id=eq.${A}&select=position_slug,needed,confirmed,offered,short`);
      const g0 = Object.fromEntries((gaps0.data ?? []).map((g) => [g.position_slug, g]));
      note("staff", "an afloat night wants a skipper, two deckhands, a gangway and a camera",
        g0.skipper?.needed === 1 && g0.deckhand?.needed === 2 && g0.gangway?.needed === 1 && g0.camera?.needed === 1 && !g0.host && !g0.shore_lead,
        JSON.stringify(gaps0.data).slice(0, 160));
      note("staff", "and is short all of them", Object.values(g0).every((g) => g.short === g.needed && g.confirmed === 0), JSON.stringify(gaps0.data).slice(0, 120));

      /* An offer is not cover. */
      const offerA = await stf.post("crew_assignments", { episode_id: A, crew_id: crewAId, position_slug: "skipper", status: "offered", assigned_by: STF });
      const asgA = offerA.data?.[0]?.id;
      note("staff", "offers the skipper the night", offerA.status === 201 && offerA.data?.[0]?.status === "offered", `got ${offerA.status} ${said(offerA).slice(0, 80)}`);
      const twiceA = await stf.post("crew_assignments", { episode_id: A, crew_id: crewAId, position_slug: "deckhand", status: "offered" });
      note("staff", "one person works one job a night", twiceA.status === 409, `got ${twiceA.status}`);
      const badPos = await stf.post("crew_assignments", { episode_id: A, crew_id: crewBId, position_slug: "purser", status: "offered" });
      note("staff", "a position off the crew list is refused", badPos.status >= 400, `got ${badPos.status}`);
      const badStatus = await stf.post("crew_assignments", { episode_id: A, crew_id: crewBId, position_slug: "deckhand", status: "maybe" });
      note("staff", "an answer an offer cannot take is refused", badStatus.status >= 400, `got ${badStatus.status}`);
      const gaps1 = await stf.get(`episode_crew_gaps?episode_id=eq.${A}&position_slug=eq.skipper&select=needed,confirmed,offered,short`);
      note("staff", "an offer shows as offered and still counts short", gaps1.data?.[0]?.offered === 1 && gaps1.data?.[0]?.confirmed === 0 && gaps1.data?.[0]?.short === 1, JSON.stringify(gaps1.data));
      const anonOffer = await anon.get(`crew_assignments?episode_id=eq.${A}&select=id,status`);
      note("anon", "an offer nobody answered never reaches the site", (anonOffer.data?.length ?? 0) === 0, `got ${anonOffer.status} ${said(anonOffer).slice(0, 60)}`);

      const confirmA = asgA ? await stf.patch(`crew_assignments?id=eq.${asgA}`, { status: "confirmed" }) : { status: 0, data: [] };
      note("staff", "the skipper confirms", confirmA.status === 200 && confirmA.data?.[0]?.status === "confirmed", `got ${confirmA.status}`);
      const gaps2 = await stf.get(`episode_crew_gaps?episode_id=eq.${A}&position_slug=eq.skipper&select=needed,confirmed,offered,short`);
      note("staff", "a confirmation is cover", gaps2.data?.[0]?.confirmed === 1 && gaps2.data?.[0]?.short === 0, JSON.stringify(gaps2.data));

      /* Public billing: confirmed AND public, on the table and on the page. */
      const anonBilling = await anon.get(`crew_assignments?episode_id=eq.${A}&select=crew_id,status`);
      note("anon", "a confirmed billing for a public crew member is on the site", anonBilling.data?.length === 1 && anonBilling.data[0].crew_id === crewAId, JSON.stringify(anonBilling.data).slice(0, 100));
      const offerB = await stf.post("crew_assignments", { episode_id: A, crew_id: crewBId, position_slug: "deckhand", status: "confirmed", assigned_by: STF });
      const asgB = offerB.data?.[0]?.id;
      const anonBilling2 = await anon.get(`crew_assignments?episode_id=eq.${A}&select=crew_id`);
      note("anon", "a confirmed billing for someone who did not opt in is not", offerB.status === 201 && anonBilling2.data?.length === 1 && anonBilling2.data[0].crew_id === crewAId, JSON.stringify(anonBilling2.data).slice(0, 100));
      const pageA = await fetch(`${BASE}/crew/e2e-skipper-${stamp}`, { headers: { "user-agent": "un-e2e" } });
      const htmlA = await pageA.text();
      note("anon", "the public crew page bills the night", pageA.status === 200 && htmlA.includes(`e2e-cdwm-door-${stamp}`), `got ${pageA.status}`);
      const pageB = await fetch(`${BASE}/crew/e2e-deckhand-${stamp}`, { headers: { "user-agent": "un-e2e" } });
      note("anon", "a crew member who did not opt in has no page", pageB.status === 404, `got ${pageB.status}`);

      /* Overrides: zero means zero; N means N. */
      const zero = await stf.post("episode_crew_needs", { episode_id: A, position_slug: "camera", headcount: 0 });
      const three = await stf.post("episode_crew_needs", { episode_id: A, position_slug: "gangway", headcount: 3 });
      const gaps3 = await stf.get(`episode_crew_gaps?episode_id=eq.${A}&select=position_slug,needed,confirmed,short`);
      const g3 = Object.fromEntries((gaps3.data ?? []).map((g) => [g.position_slug, g]));
      note("staff", "an override of zero takes the position off the night", zero.status === 201 && !g3.camera, JSON.stringify(gaps3.data).slice(0, 160));
      note("staff", "an override of three wants three and is short three", three.status === 201 && g3.gangway?.needed === 3 && g3.gangway?.short === 3, JSON.stringify(g3.gangway));
      note("staff", "the deckhand line reads two wanted, one confirmed, one short", g3.deckhand?.needed === 2 && g3.deckhand?.confirmed === 1 && g3.deckhand?.short === 1, JSON.stringify(g3.deckhand));
      const negative = await stf.post("episode_crew_needs", { episode_id: A, position_slug: "host", headcount: -1 });
      note("staff", "a headcount is never negative", negative.status >= 400, `got ${negative.status}`);

      /* Blackouts. The rota's picker hides a blacked-out name and assignCrew
         refuses one by name; the table itself accepts the row. Real defect —
         the trigger is in the module's report. */
      const blackout = await stf.post("crew_blackouts", { crew_id: crewBId, from_date: soonDay, to_date: soonDay, note: "E2E" });
      note("staff", "marks a deckhand unavailable that day", blackout.status === 201, `got ${blackout.status} ${said(blackout).slice(0, 80)}`);
      const badWindow = await stf.post("crew_blackouts", { crew_id: crewBId, from_date: soonDay, to_date: "2020-01-01" });
      note("staff", "a blackout ends after it starts", badWindow.status >= 400, `got ${badWindow.status}`);
      const onBlackout = await stf.post("crew_assignments", { episode_id: B, crew_id: crewBId, position_slug: "deckhand", status: "offered" });
      note("staff", "a blacked-out crew member is not assigned that night (trigger)", onBlackout.status >= 400, `got ${onBlackout.status} — no trigger reads crew_blackouts`);
      if (onBlackout.status === 201) await stf.del(`crew_assignments?id=eq.${onBlackout.data[0].id}`);

      /* One member, one crew row. linkCrewProfile refuses a handle already on
         the list; the table has no unique on profile_id, so a direct write
         lands twice. Real defect — index in the report. */
      const linkA = await stf.patch(`crew?id=eq.${crewAId}`, { profile_id: GLO });
      note("staff", "links a crew row to a member by profile", linkA.status === 200 && linkA.data?.[0]?.profile_id === GLO, `got ${linkA.status}`);
      const linkB = await stf.patch(`crew?id=eq.${crewBId}`, { profile_id: GLO });
      note("staff", "the same member cannot stand on the list twice (unique index)", linkB.status >= 400 || (linkB.data?.length ?? 0) === 0, `got ${linkB.status} — no unique index on crew.profile_id`);
      if (linkB.status === 200) await stf.patch(`crew?id=eq.${crewBId}`, { profile_id: null });
      const linkGhost = await stf.patch(`crew?id=eq.${crewBId}`, { profile_id: "00000000-0000-0000-0000-000000000000" });
      note("staff", "a profile that does not exist cannot be linked", linkGhost.status >= 400, `got ${linkGhost.status}`);

      /* The member's notice: the skipper confirmed, then released, on a night
         regional holds within fourteen days. */
      const regA = await reg.post("passes", { episode_id: A, profile_id: REG, status: "aboard" });
      const regAId = regA.data?.[0]?.id;
      note("regional", "boards the door fixture", regA.status === 201 && !!regAId, `got ${regA.status} ${said(regA).slice(0, 90)}`);
      const noticeTitle = `E2E Skipper ${stamp} is off E2E door fixture..`;
      if (asgB) {
        const releaseB = await stf.patch(`crew_assignments?id=eq.${asgB}`, { status: "released" });
        const quiet = await reg.get(`notifications?episode_id=eq.${A}&kind=eq.manifest&select=title`);
        note("regional", "a change in crew nobody was shown is not announced", releaseB.status === 200 && (quiet.data?.length ?? 0) === 0, JSON.stringify(quiet.data).slice(0, 100));
      }
      const releaseA = asgA ? await stf.patch(`crew_assignments?id=eq.${asgA}`, { status: "released" }) : { status: 0 };
      const told = await reg.get(`notifications?episode_id=eq.${A}&kind=eq.manifest&select=title,body,href,episode_id`);
      const notice = (told.data ?? []).find((n) => n.title.startsWith(`E2E Skipper ${stamp} is off`));
      note("regional", "hears that a billed crew member is off their night", releaseA.status === 200 && !!notice, `${JSON.stringify(told.data).slice(0, 140)} (expected title ${noticeTitle})`);
      note("regional", "and the notice has somewhere to go", typeof notice?.href === "string" && notice.href.startsWith("/"), JSON.stringify(notice?.href));
      const otherTold = await nat.get(`notifications?episode_id=eq.${A}&kind=eq.manifest&select=title`);
      note("national", "a member who does not hold the night hears nothing", (otherTold.data?.length ?? 0) === 0, `${otherTold.data?.length ?? 0} notices`);
      const gaps4 = await stf.get(`episode_crew_gaps?episode_id=eq.${A}&position_slug=eq.skipper&select=confirmed,short`);
      note("staff", "a release opens the gap again", gaps4.data?.[0]?.confirmed === 0 && gaps4.data?.[0]?.short === 1, JSON.stringify(gaps4.data));
      const history = await reg.get(`member_crew_history?select=crew_id&limit=5`);
      note("regional", "sailed-with reads only nights that happened", history.status === 200 && !(history.data ?? []).some((h) => h.crew_id === crewAId), `got ${history.status} ${said(history).slice(0, 60)}`);

      /* ════════════════════════════════════════════════════════════════════
         C. THE DOOR — a role a member holds for one night
         ════════════════════════════════════════════════════════════════════ */
      /* National, unsigned, is the door on A and C. Global's grant on B has
         already run out. */
      const grantA = await stf.post("door_grants", { profile_id: NAT, episode_id: A, granted_by: STF, expires_at: plusH(1) });
      const grantC = await stf.post("door_grants", { profile_id: NAT, episode_id: C, granted_by: STF, expires_at: plusH(1) });
      const stale = await stf.post("door_grants", { profile_id: GLO, episode_id: B, granted_by: STF, expires_at: new Date(Date.now() - 60_000).toISOString() });
      for (const g of [grantA, grantC, stale]) if (g.data?.[0]?.id) made.grants.push(g.data[0].id);
      note("staff", "hands national the door on two nights and global a grant already run out", grantA.status === 201 && grantC.status === 201 && stale.status === 201, `got ${grantA.status} ${grantC.status} ${stale.status} ${said(stale).slice(0, 80)}`);

      const isDoorA = await nat.rpc("is_door", { p_episode: A });
      const isDoorB = await nat.rpc("is_door", { p_episode: B });
      note("national", "is the door of A and not of B", isDoorA.data === true && isDoorB.data === false, `${isDoorA.data} / ${isDoorB.data}`);
      const staleDoor = await glo.rpc("is_door", { p_episode: B });
      note("global", "an expired grant is not a grant", staleDoor.data === false, `${JSON.stringify(staleDoor.data)}`);
      const staleManifest = await glo.get(`passes?episode_id=eq.${B}&profile_id=neq.${GLO}&select=id`);
      note("global", "and reads no manifest", (staleManifest.data?.length ?? 0) === 0, `${staleManifest.data?.length ?? 0} rows`);
      const anonDoor = await anon.rpc("is_door", { p_episode: A });
      note("anon", "is_door is not anon's to ask", anonDoor.status >= 400, `got ${anonDoor.status}`);
      const pausedDoor = await pau.rpc("is_door", { p_episode: A });
      note("paused", "a paused member with no grant is no door", pausedDoor.data === false, `${JSON.stringify(pausedDoor.data)}`);

      /* The manifest, by definer: names even for members out of the directory,
         with the waiver state; and never through profiles. */
      const optOut = await stf.patch(`profiles?id=eq.${REG}`, { in_directory: false });
      note("staff", "takes regional out of the directory for the check", optOut.status === 200, `got ${optOut.status}`);
      const manifest = await nat.rpc("door_manifest", { p_episode: A });
      const regRow = (manifest.data ?? []).find((r) => r.profile_id === REG);
      note("national", "the door reads its manifest by name, directory or not, with the waiver state",
        regRow?.pass_id === regAId && regRow?.full_name === "E2e Regional" && regRow?.member_no === "UN-0029" && regRow?.waiver_current === true,
        JSON.stringify(manifest.data).slice(0, 160));
      const throughProfiles = await nat.get(`profiles?id=eq.${REG}&select=full_name`);
      note("national", "and not through profiles", (throughProfiles.data?.length ?? 0) === 0, `got ${throughProfiles.status} ${said(throughProfiles).slice(0, 60)}`);
      const throughDirectory = await nat.get(`member_directory?id=eq.${REG}&select=full_name`);
      note("national", "the directory keeps the opt-out the door does not need", (throughDirectory.data?.length ?? 0) === 0 || throughDirectory.data[0].full_name !== "E2e Regional", said(throughDirectory).slice(0, 80));
      const manifestB = await nat.rpc("door_manifest", { p_episode: B });
      note("national", "another night's manifest is empty", manifestB.status < 400 && (manifestB.data?.length ?? 0) === 0, `got ${manifestB.status} ${manifestB.data?.length ?? 0} rows`);
      const memberManifest = await reg.rpc("door_manifest", { p_episode: A });
      note("regional", "a member reads no manifest, not even their own night's", (memberManifest.data?.length ?? 0) === 0, `got ${memberManifest.status}`);
      const anonManifest = await anon.rpc("door_manifest", { p_episode: A });
      note("anon", "nor does anon", anonManifest.status >= 400, `got ${anonManifest.status}`);

      /* Other-night passes are invisible; the pass on B is global's. */
      const gloB = await glo.post("passes", { episode_id: B, profile_id: GLO, status: "aboard" });
      const gloBId = gloB.data?.[0]?.id;
      const blindB = gloBId ? await nat.get(`passes?id=eq.${gloBId}&select=id`) : { data: [] };
      note("national", "the other night's passes are invisible", gloB.status === 201 && (blindB.data?.length ?? 0) === 0, `got ${gloB.status}; ${blindB.data?.length ?? 0} rows`);
      const stampB = gloBId ? await nat.patch(`passes?id=eq.${gloBId}`, { checked_in_at: nowIso() }) : { status: 0, data: [] };
      note("national", "and cannot be stamped", stampB.status >= 400 || (stampB.data?.length ?? 0) === 0, `got ${stampB.status}`);

      /* The Bridge stays shut. */
      for (const t of ["member_roll", "broadcasts", "applications", "crew_candidates", "wallet_registrations", "api_keys"]) {
        const r = await nat.get(`${t}?select=*&limit=1`);
        note("national", `the door does not read ${t}`, (r.data?.length ?? 0) === 0, `got ${r.status}`);
      }
      const othersLedger = await nat.get(`account_ledger?profile_id=neq.${NAT}&select=id&limit=1`);
      note("national", "the door reads nobody's folio but their own", (othersLedger.data?.length ?? 0) === 0, `got ${othersLedger.status}`);

      /* The columns guard. */
      const forge = regAId ? await nat.patch(`passes?id=eq.${regAId}`, { boarding_code: "UN-FORGED" }) : { status: 0 };
      note("national", "the door cannot issue a boarding code", forge.status >= 400 && /issued by the club|stamps arrivals and nothing else/.test(said(forge)), `got ${forge.status} ${said(forge).slice(0, 80)}`);
      const rehull = regAId ? await nat.patch(`passes?id=eq.${regAId}`, { vessel_id: "00000000-0000-0000-0000-000000000000" }) : { status: 0 };
      note("national", "nor assign a hull", rehull.status >= 400, `got ${rehull.status} ${said(rehull).slice(0, 80)}`);
      /* The guard fires on the gangway columns only; RLS "the door stamps
         arrivals" admits the whole row. A door that can release a member's
         pass or add a guest is more than a door. Real defect — SQL in the
         report. */
      const release = regAId ? await nat.patch(`passes?id=eq.${regAId}`, { status: "not_going" }) : { status: 0, data: [] };
      note("national", "the door cannot release a pass (guard reads every column)", release.status >= 400 || (release.data?.length ?? 0) === 0, `got ${release.status} — the trigger fires only on the gangway columns`);
      if (release.status === 200 && release.data?.length) await stf.patch(`passes?id=eq.${regAId}`, { status: "aboard" });
      const moreGuests = regAId ? await nat.patch(`passes?id=eq.${regAId}`, { guests: 3 }) : { status: 0, data: [] };
      note("national", "nor add guests to it (guard reads every column)", moreGuests.status >= 400 || (moreGuests.data?.length ?? 0) === 0, `got ${moreGuests.status}`);
      if (moreGuests.status === 200 && moreGuests.data?.length) await stf.patch(`passes?id=eq.${regAId}`, { guests: 0 });

      /* The signature gates, at the door's hand. National is unsigned. */
      const natA = await nat.post("passes", { episode_id: A, profile_id: NAT, status: "aboard" });
      const natAId = natA.data?.[0]?.id;
      note("national", "holds a pass on A themselves", natA.status === 201 && !!natAId, `got ${natA.status} ${said(natA).slice(0, 80)}`);
      /* Stamped by the Bridge: a member's own hand on checked_in_at is refused
         first ("the gangway checks you in"), so the signature rule is reached
         only from a hand that may stamp. */
      const ownStamp = natAId ? await nat.patch(`passes?id=eq.${natAId}`, { checked_in_at: nowIso() }) : { status: 0 };
      note("national", "cannot stamp their own arrival, door grant or not", ownStamp.status >= 400 && /gangway checks you in/.test(said(ownStamp)), `got ${ownStamp.status} ${said(ownStamp).slice(0, 80)}`);
      const unsigned = natAId ? await stf.patch(`passes?id=eq.${natAId}`, { checked_in_at: nowIso() }) : { status: 0 };
      note("staff", "an unsigned member is refused at the stamp, by document", unsigned.status >= 400 && /boards unsigned/.test(said(unsigned)) && /outstanding/.test(said(unsigned)), `got ${unsigned.status} ${said(unsigned).slice(0, 100)}`);
      const guest = regAId ? await stf.post("pass_guests", { rsvp_id: regAId, name: `E2E Unsigned Guest ${stamp}` }) : { data: [] };
      const guestId = guest.data?.[0]?.id;
      const doorSeesGuest = guestId ? await nat.get(`pass_guests?id=eq.${guestId}&select=id,name,boarding_code`) : { data: [] };
      note("national", "the door reads its night's guests", !!guestId && doorSeesGuest.data?.[0]?.id === guestId && doorSeesGuest.data[0].name === `E2E Unsigned Guest ${stamp}`, JSON.stringify(doorSeesGuest.data).slice(0, 100));
      const otherGuest = guestId ? await glo.get(`pass_guests?id=eq.${guestId}&select=id`) : { data: [] };
      note("global", "another member does not read them", (otherGuest.data?.length ?? 0) === 0, `got ${otherGuest.status}`);
      const unsignedGuest = guestId ? await nat.patch(`pass_guests?id=eq.${guestId}`, { checked_in_at: nowIso() }) : { status: 0 };
      note("national", "an unsigned guest is refused at the stamp", unsignedGuest.status >= 400 && /guest boards unsigned/.test(said(unsignedGuest)), `got ${unsignedGuest.status} ${said(unsignedGuest).slice(0, 100)}`);
      const memberStampsGuest = guestId ? await reg.patch(`pass_guests?id=eq.${guestId}`, { checked_in_at: nowIso() }) : { status: 0, data: [] };
      note("regional", "the host cannot stamp their own guest", memberStampsGuest.status >= 400 || (memberStampsGuest.data?.length ?? 0) === 0, `got ${memberStampsGuest.status}`);

      /* A signed member is stamped, once. */
      const stampA = regAId ? await nat.patch(`passes?id=eq.${regAId}`, { checked_in_at: nowIso(), checked_in_by: NAT }) : { status: 0 };
      note("national", "stamps a signed arrival", stampA.status === 200 && !!stampA.data?.[0]?.checked_in_at && stampA.data[0].checked_in_by === NAT, `got ${stampA.status} ${said(stampA).slice(0, 80)}`);
      const selfStamp = natAId ? await reg.patch(`passes?id=eq.${regAId}`, { checked_in_at: null }) : { status: 0, data: [] };
      note("regional", "a member does not unstamp themselves", selfStamp.status >= 400 || (selfStamp.data?.length ?? 0) === 0, `got ${selfStamp.status} ${said(selfStamp).slice(0, 80)}`);

      /* Standby boards only into a seat that has come free, and flips. */
      const seatC = await reg.post("passes", { episode_id: C, profile_id: REG, status: "aboard" });
      const seatCId = seatC.data?.[0]?.id;
      const standbyC = await glo.post("passes", { episode_id: C, profile_id: GLO, status: "aboard", standby: true });
      const standbyCId = standbyC.data?.[0]?.id;
      note("global", "holds the standby pass on a full one-seat hull", seatC.status === 201 && standbyC.status === 201 && standbyC.data?.[0]?.standby === true, `got ${seatC.status} ${standbyC.status} ${said(standbyC).slice(0, 80)}`);
      const tooEarly = standbyCId ? await nat.patch(`passes?id=eq.${standbyCId}`, { checked_in_at: nowIso() }) : { status: 0 };
      note("national", "a standby pass cannot board while the seat is taken", tooEarly.status >= 400 && /no seat has come free/.test(said(tooEarly)), `got ${tooEarly.status} ${said(tooEarly).slice(0, 90)}`);
      const freed = seatCId ? await reg.del(`passes?id=eq.${seatCId}`) : { status: 0 };
      const boards = standbyCId ? await nat.patch(`passes?id=eq.${standbyCId}`, { checked_in_at: nowIso() }) : { status: 0, data: [] };
      note("national", "once a seat frees the standby boards and the pass flips", freed.status < 300 && boards.status === 200 && boards.data?.[0]?.standby === false && !!boards.data[0].checked_in_at, `got ${freed.status} ${boards.status} ${said(boards).slice(0, 90)}`);

      /* ════════════════════════════════════════════════════════════════════
         D. WALLET — one live token, three words, door or staff only
         ════════════════════════════════════════════════════════════════════ */
      const issued = await reg.rpc("issue_wallet_token", {});
      const tok = issued.data?.[0]?.token;
      note("regional", "issues a wallet token", issued.status < 300 && /^[0-9a-f-]{36}$/.test(tok ?? ""), `got ${issued.status} ${said(issued).slice(0, 80)}`);
      const again = await reg.rpc("issue_wallet_token", {});
      note("regional", "a second issue returns the same live token", again.data?.[0]?.token === tok && (again.data?.length ?? 0) === 1, said(again).slice(0, 80));
      const ownTok = await reg.get("wallet_tokens?select=token,revoked_at");
      note("regional", "reads their own token and nobody else's", (ownTok.data ?? []).length >= 1 && ownTok.data.every((t) => t.token === tok || t.revoked_at), said(ownTok).slice(0, 80));
      const natTok = await nat.get(`wallet_tokens?token=eq.${tok}&select=token`);
      note("national", "another member's token is not readable", (natTok.data?.length ?? 0) === 0, `got ${natTok.status}`);
      const forgeTok = await reg.post("wallet_tokens", { profile_id: REG });
      note("regional", "a token is issued by the club, never inserted", forgeTok.status >= 400, `got ${forgeTok.status}`);
      const anonIssue = await anon.rpc("issue_wallet_token", {});
      note("anon", "cannot issue a wallet token", anonIssue.status >= 400, `got ${anonIssue.status}`);

      const verdict = tok ? await nat.rpc("verify_wallet_token", { p_token: tok }) : { status: 0, data: [] };
      const v = verdict.data?.[0];
      note("national", "the door verifies a live token: aboard, named, numbered",
        v?.state === "aboard" && v?.profile_id === REG && v?.full_name === "E2e Regional" && v?.member_no === "UN-0029", `got ${verdict.status} ${said(verdict).slice(0, 120)}`);
      const memberVerify = tok ? await reg.rpc("verify_wallet_token", { p_token: tok }) : { status: 0 };
      note("regional", "a member cannot verify a token, not even their own", memberVerify.status >= 400 && /staff only/.test(said(memberVerify)), `got ${memberVerify.status} ${said(memberVerify).slice(0, 60)}`);
      const staleVerify = tok ? await glo.rpc("verify_wallet_token", { p_token: tok }) : { status: 0 };
      note("global", "an expired door cannot verify one", staleVerify.status >= 400, `got ${staleVerify.status}`);
      const anonVerify = tok ? await anon.rpc("verify_wallet_token", { p_token: tok }) : { status: 0 };
      note("anon", "nor can anon", anonVerify.status >= 400, `got ${anonVerify.status}`);
      const unknown = await nat.rpc("verify_wallet_token", { p_token: "00000000-0000-0000-0000-000000000000" });
      note("national", "an unknown token is void — no hint that it was close", unknown.data?.[0]?.state === "void" && unknown.data[0].profile_id == null, said(unknown).slice(0, 80));

      const pausedTok = await pau.rpc("issue_wallet_token", {});
      const ptok = pausedTok.data?.[0]?.token;
      const holdVerdict = ptok ? await stf.rpc("verify_wallet_token", { p_token: ptok }) : { data: [] };
      note("staff", "a paused member's token reads hold", holdVerdict.data?.[0]?.state === "hold" && holdVerdict.data[0].standing === "paused", said(holdVerdict).slice(0, 100));
      /* The paused member holds no pass on the door's night: the door learns
         nothing — not the name, not the standing. */
      const elsewhere = ptok ? await nat.rpc("verify_wallet_token", { p_token: ptok }) : { data: [] };
      note("national", "a door reads 'elsewhere' for a member with no pass on its night", elsewhere.data?.[0]?.state === "elsewhere" && elsewhere.data[0].profile_id == null && elsewhere.data[0].full_name == null, said(elsewhere).slice(0, 100));

      const revoked = await reg.rpc("revoke_wallet_token", {});
      const voidVerdict = tok ? await nat.rpc("verify_wallet_token", { p_token: tok }) : { data: [] };
      note("national", "a revoked token reads void", revoked.status < 300 && voidVerdict.data?.[0]?.state === "void", `got ${revoked.status} ${said(voidVerdict).slice(0, 80)}`);
      const reissued = await reg.rpc("issue_wallet_token", {});
      note("regional", "a fresh token after revoking is a different one", reissued.data?.[0]?.token && reissued.data[0].token !== tok, said(reissued).slice(0, 80));

      /* Wallet routes over HTTP, anon, on a deployment with no certificates. */
      const status = await fetch(`${BASE}/api/wallet/status`, { headers: { "user-agent": "un-e2e" } });
      const statusBody = await status.json().catch(() => null);
      note("anon", "/api/wallet/status says which wallets this deployment issues to",
        status.status === 200 && typeof statusBody?.apple === "boolean" && typeof statusBody?.google === "boolean" && /no-store/.test(status.headers.get("cache-control") ?? ""),
        `got ${status.status} ${JSON.stringify(statusBody)}`);
      const configured = statusBody?.apple === true || statusBody?.google === true;
      for (const path of ["/api/wallet/apple", "/api/wallet/google"]) {
        const r = await fetch(`${BASE}${path}`, { headers: { "user-agent": "un-e2e" }, redirect: "manual" });
        const body = await r.json().catch(() => null);
        const want = (path.endsWith("apple") ? statusBody?.apple : statusBody?.google) ? 401 : 501;
        note("anon", `${path} fails closed — ${want === 501 ? "501 before any session is asked for" : "401, sign in first"}`,
          r.status === want && typeof body?.error === "string" && /no-store/.test(r.headers.get("cache-control") ?? ""),
          `got ${r.status} ${JSON.stringify(body)}`);
      }
      const passkit = await fetch(`${BASE}/api/wallet/apple/v1/passes/pass.example/00000000-0000-0000-0000-000000000000`, { headers: { "user-agent": "un-e2e" } });
      const passkitBody = await passkit.json().catch(() => null);
      note("anon", "the PassKit web service refuses in the club's voice — 501 unconfigured, else 401/404 for a pass not ours",
        (configured ? [401, 404, 503] : [501]).includes(passkit.status) && typeof passkitBody?.error === "string", `got ${passkit.status} ${JSON.stringify(passkitBody)}`);
      const log = await fetch(`${BASE}/api/wallet/apple/v1/log`, { method: "POST", headers: { "user-agent": "un-e2e", "content-type": "application/json" }, body: JSON.stringify({ logs: ["E2E"] }) });
      note("anon", "the device log endpoint is closed when passes are not issued", configured ? log.status === 200 : log.status === 501, `got ${log.status}`);
      const w = await fetch(`${BASE}/w/${tok ?? "00000000-0000-0000-0000-000000000000"}`, { headers: { "user-agent": "un-e2e" }, redirect: "manual" });
      note("anon", "/w/<token> is a 307 to the card, no-store, noindex",
        w.status === 307 && /\/card$/.test(w.headers.get("location") ?? "") && /no-store/.test(w.headers.get("cache-control") ?? "") && /noindex/.test(w.headers.get("x-robots-tag") ?? ""),
        `got ${w.status} ${w.headers.get("location")} ${w.headers.get("cache-control")} ${w.headers.get("x-robots-tag")}`);
      const wReg = await reg.get(`wallet_registrations?select=device_id&limit=1`);
      note("regional", "which phones hold a pass is the Bridge's reading", (wReg.data?.length ?? 0) === 0, `got ${wReg.status}`);
      const wRegWrite = await stf.post("wallet_registrations", { device_id: "e2e", pass_type: "pass.e2e", serial: REG, push_token: "x" });
      note("staff", "and only the PassKit service writes it", wRegWrite.status >= 400, `got ${wRegWrite.status}`);

      /* The door, revoked. */
      const gone = await stf.del(`door_grants?profile_id=eq.${NAT}`);
      made.grants = made.grants.filter((g) => ![grantA.data?.[0]?.id, grantC.data?.[0]?.id].includes(g));
      const afterManifest = await nat.rpc("door_manifest", { p_episode: A });
      const afterPasses = await nat.get(`passes?episode_id=eq.${A}&profile_id=neq.${NAT}&select=id`);
      const afterVerify = await nat.rpc("verify_wallet_token", { p_token: "00000000-0000-0000-0000-000000000000" });
      note("national", "a revoked door reads nothing and verifies nothing",
        gone.status < 300 && (afterManifest.data?.length ?? 0) === 0 && (afterPasses.data?.length ?? 0) === 0 && afterVerify.status >= 400,
        `got ${gone.status}; ${afterManifest.data?.length ?? 0} manifest rows, ${afterPasses.data?.length ?? 0} passes, verify ${afterVerify.status}`);
      const afterKiosk = await nat.rpc("is_door");
      note("national", "and the kiosk turns them away", afterKiosk.data === false, `${JSON.stringify(afterKiosk.data)}`);

      /* Restore the directory flag before anything else can throw. */
      await stf.patch(`profiles?id=eq.${REG}`, { in_directory: regDirectoryWas ?? true });
    }

    /* ══════════════════════════════════════════════════════════════════════
       E. MCP — the club read from outside, by key
       ══════════════════════════════════════════════════════════════════════ */
    const mcp = (body, key, extra = {}) =>
      fetch(`${BASE}/api/mcp`, {
        method: "POST",
        headers: { "content-type": "application/json", "user-agent": "un-e2e", ...(key ? { authorization: `Bearer ${key}` } : {}) },
        body: typeof body === "string" ? body : JSON.stringify(body),
        ...extra,
      }).then(async (r) => ({ status: r.status, headers: r.headers, data: await r.json().catch(() => null) }));
    const rpc = (id, method, params) => ({ jsonrpc: "2.0", id, method, params });

    const get = await fetch(`${BASE}/api/mcp`, { headers: { "user-agent": "un-e2e" } });
    note("anon", "GET /api/mcp is 405 — no stream, no session", get.status === 405 && /POST/.test(get.headers.get("allow") ?? ""), `got ${get.status}`);
    const noKey = await mcp(rpc(1, "ping"), null);
    note("anon", "POST without a key is 401 with a challenge", noKey.status === 401 && /Bearer/.test(noKey.headers.get("www-authenticate") ?? "") && noKey.data?.error?.code === -32600, `got ${noKey.status} ${JSON.stringify(noKey.data).slice(0, 100)}`);
    const noise = await mcp(rpc(1, "ping"), "not-a-key");
    note("anon", "noise is refused before it is hashed", noise.status === 401, `got ${noise.status}`);

    /* Minted exactly as the keys console mints: un_ + 24 random bytes,
       SHA-256 kept, plaintext shown once. */
    const mint = async (label, scopes) => {
      const key = `un_${randomBytes(24).toString("base64url")}`;
      const row = await stf.post("api_keys", { label: `E2E ${label} ${stamp}`, key_hash: createHash("sha256").update(key).digest("hex"), prefix: key.slice(0, 8), scopes, revoked: false, created_by: STF });
      const id = row.data?.[0]?.id;
      if (id) made.keys.push(id);
      return { key, id, res: row };
    };
    const narrow = await mint("narrow", ["read:episodes", "read:members"]);
    const wide = await mint("wide", ["read:episodes", "read:members", "read:passes"]);
    const writeOnly = await mint("write", ["write:passes"]);
    note("staff", "mints three keys through the api_keys table", !!narrow.id && !!wide.id && !!writeOnly.id, `got ${narrow.res.status} ${wide.res.status} ${writeOnly.res.status} ${said(narrow.res).slice(0, 80)}`);

    /* A deployment with no service role cannot read a key and cannot run a
       tool: the honest answer is 503 in words, not a 500. Where that is the
       answer, the tool-level checks below cannot run over HTTP and are held
       by src/lib/mcp/__tests__ instead; the module says so once rather than
       asserting on nothing. */
    const probe = narrow.id ? await mcp(rpc(0, "ping"), narrow.key) : { status: 0, data: null, headers: new Headers() };
    /* Any 5xx means the tools cannot be reached; only the 503 in words is the
       right one, so the note is red on a bare 500 and green on the 503. */
    const serviceOpen = probe.status < 500;
    if (!serviceOpen) {
      note("mcp", "with no service key on the deployment a real key is told so — 503, in words, with Retry-After",
        probe.status === 503 && /service key/.test(probe.data?.error?.message ?? "") && !!probe.headers.get("retry-after") && probe.data?.error?.code === -32600,
        `got ${probe.status} ${JSON.stringify(probe.data).slice(0, 120)}`);
      console.log("  · MCP tools not exercised over HTTP: this deployment has no SUPABASE_SERVICE_ROLE_KEY (see src/lib/mcp/__tests__)");
    }
    /* A well-shaped key nobody minted: 401 where keys are read, the same 503
       where they cannot be — never a hint, never a 500. */
    const bogus = await mcp(rpc(1, "ping"), `un_${"A".repeat(32)}`);
    note("anon", serviceOpen ? "a key that was never minted is 401" : "a key that was never minted gets the same 503 as any other where keys are not read",
      serviceOpen ? bogus.status === 401 && /does not open/.test(bogus.data?.error?.message ?? "") : bogus.status === 503,
      `got ${bogus.status} ${JSON.stringify(bogus.data).slice(0, 100)}`);

    if (narrow.id && wide.id && writeOnly.id && serviceOpen) {
      const init = await mcp(rpc(1, "initialize", { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "e2e", version: "0" } }), narrow.key);
      note("mcp", "initialize echoes a known protocol and names the server",
        init.status === 200 && init.data?.result?.protocolVersion === "2025-03-26" && init.data.result.serverInfo?.name && init.data.result.capabilities?.tools, JSON.stringify(init.data).slice(0, 120));
      const initFuture = await mcp(rpc(1, "initialize", { protocolVersion: "2099-01-01" }), narrow.key);
      note("mcp", "an unknown protocol version is answered with the newest offered", initFuture.data?.result?.protocolVersion === "2025-06-18", JSON.stringify(initFuture.data?.result?.protocolVersion));
      const notify = await mcp({ jsonrpc: "2.0", method: "notifications/initialized" }, narrow.key);
      note("mcp", "a notification is acknowledged by silence — 202, no body", notify.status === 202 && notify.data === null, `got ${notify.status}`);
      const ping = await mcp(rpc("p", "ping"), narrow.key);
      note("mcp", "ping answers an empty result with the id echoed", ping.data?.result && Object.keys(ping.data.result).length === 0 && ping.data.id === "p", JSON.stringify(ping.data));

      const listNarrow = await mcp(rpc(2, "tools/list"), narrow.key);
      const namesNarrow = (listNarrow.data?.result?.tools ?? []).map((t) => t.name).sort();
      note("mcp", "tools/list shows only what the key's scopes admit",
        JSON.stringify(namesNarrow) === JSON.stringify(["get_episode", "get_member", "list_episodes", "list_members", "search"]), JSON.stringify(namesNarrow));
      const listWide = await mcp(rpc(2, "tools/list"), wide.key);
      const namesWide = (listWide.data?.result?.tools ?? []).map((t) => t.name).sort();
      note("mcp", "three read scopes open all seven", namesWide.length === 7 && namesWide.includes("passes_for_episode") && namesWide.includes("reports_summary"), JSON.stringify(namesWide));
      const listWrite = await mcp(rpc(2, "tools/list"), writeOnly.key);
      note("mcp", "write:passes opens nothing here", Array.isArray(listWrite.data?.result?.tools) && listWrite.data.result.tools.length === 0, JSON.stringify(listWrite.data).slice(0, 100));
      const schemas = (listWide.data?.result?.tools ?? []).every((t) => t.inputSchema?.type === "object" && t.inputSchema.additionalProperties === false && typeof t.description === "string");
      note("mcp", "every tool carries a closed input schema and a description", schemas, "");

      const forbidden = await mcp(rpc(3, "tools/call", { name: "passes_for_episode", arguments: { slug: `e2e-cdwm-door-${stamp}` } }), narrow.key);
      note("mcp", "a tool the key does not hold is -32001 and names the scope", forbidden.status === 200 && forbidden.data?.error?.code === -32001 && /read:passes/.test(forbidden.data.error.message), JSON.stringify(forbidden.data).slice(0, 140));
      const unknownTool = await mcp(rpc(3, "tools/call", { name: "drop_table", arguments: {} }), wide.key);
      note("mcp", "a tool that does not exist is -32602", unknownTool.data?.error?.code === -32602, JSON.stringify(unknownTool.data).slice(0, 100));
      const noName = await mcp(rpc(3, "tools/call", {}), wide.key);
      note("mcp", "tools/call without a name is -32602", noName.data?.error?.code === -32602, JSON.stringify(noName.data).slice(0, 100));
      const badArgs = await mcp(rpc(3, "tools/call", { name: "list_episodes", arguments: { from: "not a date" } }), wide.key);
      note("mcp", "a bad argument is -32602 in words", badArgs.data?.error?.code === -32602 && /date/.test(badArgs.data.error.message), JSON.stringify(badArgs.data).slice(0, 120));
      const invalid = await mcp({ foo: 1 }, wide.key);
      note("mcp", "a message that is not JSON-RPC is -32600", invalid.data?.error?.code === -32600, JSON.stringify(invalid.data).slice(0, 100));
      const notJson = await mcp("{not json", wide.key);
      note("mcp", "not JSON at all is -32700", notJson.status === 400 && notJson.data?.error?.code === -32700, `got ${notJson.status} ${JSON.stringify(notJson.data).slice(0, 80)}`);
      const unknownMethod = await mcp(rpc(4, "resources/list"), wide.key);
      note("mcp", "a method this server does not declare is -32601", unknownMethod.data?.error?.code === -32601, JSON.stringify(unknownMethod.data).slice(0, 100));
      const emptyBatch = await mcp([], wide.key);
      note("mcp", "an empty batch is -32600", emptyBatch.status === 400 && emptyBatch.data?.error?.code === -32600, `got ${emptyBatch.status}`);
      const batch = await mcp([rpc(5, "ping"), rpc(6, "tools/list")], wide.key);
      note("mcp", "a batch is answered as a batch, in order", Array.isArray(batch.data) && batch.data.length === 2 && batch.data[0].id === 5 && batch.data[1].id === 6, JSON.stringify(batch.data).slice(0, 80));
      const big = await mcp(JSON.stringify(rpc(7, "ping", { pad: "x".repeat(70 * 1024) })), wide.key);
      note("mcp", "a body past 64KB is 413", big.status === 413, `got ${big.status}`);

      /* Every tool, and what it withholds. The wide key reads the fixture night
         regional boarded, so the answer is non-vacuous: a pass, a member, a
         guest name — and no code, no address, no phone, no Stripe id. */
      const LEAK = /"(email|phone|stripe_customer_id|stripe_[a-z_]*|boarding_code|sign_token|key_hash|push_token|calendar_token|access_token)"|UN-[A-Z]{4}-\d{4}-\d{3}|cus_[A-Za-z0-9]{6,}|fixtures\.invalid/;
      const call = async (name, args) => {
        const r = await mcp(rpc(name, "tools/call", { name, arguments: args }), wide.key);
        const text = r.data?.result?.content?.[0]?.text ?? "";
        let parsed = null;
        try { parsed = JSON.parse(text); } catch { /* left null */ }
        return { r, text, parsed, isError: r.data?.result?.isError === true };
      };
      const le = await call("list_episodes", { from: soon.slice(0, 10), to: soon.slice(0, 10), limit: 200 });
      note("mcp", "list_episodes finds the fixture nights and leaks nothing",
        !le.isError && Array.isArray(le.parsed?.episodes) && le.parsed.episodes.some((e) => e.slug === `e2e-cdwm-door-${stamp}` && e.setting === "afloat") && !LEAK.test(le.text), le.text.slice(0, 160));
      const ge = await call("get_episode", { slug: `e2e-cdwm-door-${stamp}` });
      note("mcp", "get_episode counts the manifest — aboard, checked in — and leaks nothing",
        !ge.isError && ge.parsed?.episode?.capacity?.aboard >= 2 && ge.parsed.episode.capacity.checked_in >= 1 && ge.parsed.episode.capacity.passes_total === 8 && !LEAK.test(ge.text), ge.text.slice(0, 200));
      const geNone = await call("get_episode", { slug: `e2e-nowhere-${stamp}` });
      note("mcp", "an unknown slug is a null with a note, not an error", !geNone.isError && geNone.parsed?.episode === null && /No episode/.test(geNone.parsed?.note ?? ""), geNone.text.slice(0, 100));
      const lm = await call("list_members", { q: "E2e Regional", limit: 5 });
      const regM = lm.parsed?.members?.find((m) => m.member_no === "UN-0029");
      note("mcp", "list_members names, numbers and tiers — no address, no phone, no billing",
        !lm.isError && !!regM && regM.full_name === "E2e Regional" && regM.handle === "ee29" && !("email" in regM) && !LEAK.test(lm.text), lm.text.slice(0, 200));
      const gm = await call("get_member", { handle: "@ee29" });
      note("mcp", "get_member reads by handle with value and engagement, and leaks nothing",
        !gm.isError && gm.parsed?.member?.member_no === "UN-0029" && "value" in gm.parsed.member && "engagement" in gm.parsed.member && !LEAK.test(gm.text), gm.text.slice(0, 200));
      const pf = await call("passes_for_episode", { slug: `e2e-cdwm-door-${stamp}` });
      const regPass = pf.parsed?.passes?.find((x) => x.member_no === "UN-0029");
      note("mcp", "passes_for_episode names the holders, their standing and check-in, never a boarding code",
        !pf.isError && !!regPass && regPass.standing === "aboard" && typeof regPass.checked_in_at === "string" && !("boarding_code" in regPass) && !LEAK.test(pf.text), pf.text.slice(0, 200));
      const rs = await call("reports_summary", {});
      note("mcp", "reports_summary is figures, cents and cohorts — nothing personal",
        !rs.isError && typeof rs.parsed?.mrr_cents === "number" && typeof rs.parsed?.active_members === "number" && rs.parsed?.fill && Array.isArray(rs.parsed?.cohorts) && !LEAK.test(rs.text), rs.text.slice(0, 160));
      const se = await call("search", { q: `cdwm-door-${stamp}` });
      note("mcp", "search finds the fixture by title and leaks nothing", !se.isError && Array.isArray(se.parsed?.episodes) && Array.isArray(se.parsed?.cities) && !LEAK.test(se.text), se.text.slice(0, 120));
      const seInject = await call("search", { q: "x,or(slug.eq.a)%_" });
      note("mcp", "filter grammar in a needle is text, not syntax", !seInject.isError && seInject.parsed && !seInject.r.data?.error, seInject.text.slice(0, 100));
      const seShort = await call("search", { q: "a" });
      note("mcp", "one character is told to try two", /Two characters/.test(seShort.parsed?.note ?? ""), seShort.text.slice(0, 80));

      /* last_used_at moves; a revoked key stops. */
      const usedBefore = (await stf.get(`api_keys?id=eq.${narrow.id}&select=last_used_at`)).data?.[0]?.last_used_at;
      await new Promise((r) => setTimeout(r, 1100));
      await mcp(rpc(8, "ping"), narrow.key);
      const usedAfter = (await stf.get(`api_keys?id=eq.${narrow.id}&select=last_used_at`)).data?.[0]?.last_used_at;
      note("staff", "last_used_at moves with every call", typeof usedAfter === "string" && usedAfter !== usedBefore && new Date(usedAfter) > new Date(usedBefore ?? 0), `${usedBefore} → ${usedAfter}`);
      const revokeKey = await stf.patch(`api_keys?id=eq.${narrow.id}`, { revoked: true });
      const afterRevoke = await mcp(rpc(9, "ping"), narrow.key);
      note("mcp", "a revoked key is 401 and says so", revokeKey.status === 200 && afterRevoke.status === 401 && /revoked/.test(afterRevoke.data?.error?.message ?? ""), `got ${afterRevoke.status} ${JSON.stringify(afterRevoke.data).slice(0, 100)}`);
      const memberReadsKeys = await reg.get(`api_keys?id=eq.${wide.id}&select=id`);
      note("regional", "the keys are the Bridge's", (memberReadsKeys.data?.length ?? 0) === 0, `got ${memberReadsKeys.status}`);

      /* The brake: 120 a minute per key, in one instance's memory. Cheap
         enough to spend on pings — the 121st is 429 with Retry-After. */
      let tripped = null;
      for (let i = 0; i < 125 && !tripped; i++) {
        const r = await mcp(rpc(i, "ping"), writeOnly.key);
        if (r.status === 429) tripped = { at: i + 1, retry: r.headers.get("retry-after"), body: r.data };
      }
      note("mcp", "the 121st call in a minute is 429 with Retry-After", !!tripped && tripped.at <= 122 && tripped.at >= 100 && !!tripped.retry && tripped.body?.error?.code === -32600, JSON.stringify(tripped).slice(0, 140));
    }
  } finally {
    /* Strike what was made, in dependency order; restore the one persona
       field touched. Passes go with their episodes; assignments and blackouts
       with their crew; candidates and their history with their roles. */
    await stf.patch(`profiles?id=eq.${REG}`, { in_directory: regDirectoryWas ?? true });
    for (const id of made.grants) await stf.del(`door_grants?id=eq.${id}`);
    await stf.del(`door_grants?profile_id=eq.${NAT}`);
    await stf.del(`door_grants?profile_id=eq.${GLO}`);
    for (const id of made.keys) await stf.del(`api_keys?id=eq.${id}`);
    await stf.del(`api_keys?label=like.E2E*${stamp}`);
    for (const id of made.crew) await stf.del(`crew?id=eq.${id}`);
    for (const id of made.roles) await stf.del(`crew_roles?id=eq.${id}`);
    await stf.del(`crew_candidates?email=like.e2e-anon-*${stamp}*`);
    for (const id of made.episodes) await stf.del(`episodes?id=eq.${id}`);
    await stf.del(`notifications?title=like.E2E*${stamp}*`);
    /* Wallet tokens cannot be deleted by anyone but the service role, so the
       module's footprint is declared instead: regional's live token is
       revoked once and reissued (one revoked row per run, the way a signature
       stays), and paused keeps one live token that every run finds again. */
  }
}
