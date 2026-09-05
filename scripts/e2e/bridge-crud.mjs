/* ---------- bridge-crud: every console's CRUD path, at the data layer ----------

   The Bridge's server actions cannot be called from here, so this module
   exercises what they WRITE — PostgREST as the signed-in staff member (RLS
   `is_staff()`) and the definer RPCs — and pins three things per console:

     1. staff create → read → update → delete on a fixture, with the edges an
        operator can actually type: unicode and emoji in names, ten thousand
        characters in a body, uuid-shaped garbage, two identical creates in the
        same instant on a unique key;
     2. a MEMBER attempting the same write. Two refusals exist and both are
        right in their place: an INSERT the policy will not admit is a loud
        42501; an UPDATE or DELETE on rows the member cannot see is a silent
        `[]` — PostgREST filtered the rows out before the write, so there was
        nothing to refuse. Each check says which it expects;
     3. a DOOR HOLDER (a member handed one night's door) touching anything but
        the gangway. The door is a one-night role, not a console.

   Out-of-range values are asserted against the CHECK that refuses them (code
   23514, and the constraint's name in the message) so a loosened constraint is
   a red line here, not a quiet acceptance. Where a bound the operator is told
   about has NO constraint behind it, the check is written anyway and fails —
   that is the defect, and the SQL to close it is in the run report.

   Reference-table changes are asserted onto audit_log (zz_record_the_change)
   where the trigger stands, and asserted-and-failing where a reference table
   lacks it, for the same reason.

   Knots: a pass booked here is 25 knots 'Pass confirmed'; striking the episode
   returns them (return_knots_before_the_episode_goes). No episode with a pass
   aboard is ever COMPLETED here — that would bank miles the sweep cannot
   return. Money: every fixture episode is priced at nothing.

   Everything this module raises carries RUN_TOKEN in its slug or an E2E mark
   in its name, and is struck in `finally`; the suite's sweep takes what a run
   that died halfway leaves behind. */

export async function run(p, ctx) {
  const { rest, note, uid, RUN_TOKEN } = ctx;
  const stf = rest(p.staff), reg = rest(p.regional), nat = rest(p.national),
        glo = rest(p.global), anon = rest(null);
  const stamp = `${Date.now().toString(36)}${RUN_TOKEN}`;
  const STAMP = stamp.toUpperCase();
  const plus = (days) => new Date(Date.now() + days * 24 * 3600e3).toISOString();
  const said = (r) => String(JSON.stringify(r.data ?? "")).toLowerCase();
  const rows = (r) => (Array.isArray(r.data) ? r.data : []);
  const first = (r) => rows(r)[0];

  /* The shapes a refusal takes, named once. */
  const loud = (r) => r.status >= 400;
  const silent = (r) => r.status < 300 && rows(r).length === 0;
  const checkFired = (r, name) =>
    r.status >= 400 && (r.data?.code === "23514" || /check_violation/i.test(said(r))) &&
    (!name || said(r).includes(name.toLowerCase()));
  const uniqueFired = (r) => r.status >= 400 && r.data?.code === "23505";
  const fkFired = (r) => r.status >= 400 && r.data?.code === "23503";
  const badUuid = (r) => r.status >= 400 && r.data?.code === "22P02";
  const raised = (r, re) => r.status >= 400 && re.test(said(r));
  const rlsRefused = (r) => r.status >= 400 && (r.data?.code === "42501" || /row-level security/.test(said(r)));

  /* Two identical creates in the same instant: exactly one lands. */
  const race = async (session, path, body) => {
    const [a, b] = await Promise.all([session.post(path, body), session.post(path, body)]);
    const made = [a, b].filter((r) => r.status === 201).length;
    const refused = [a, b].filter(uniqueFired).length;
    return { made, refused, ids: [a, b].map((r) => first(r)?.id).filter(Boolean) };
  };

  const auditRows = async (table, rowId, action) => {
    const q = await stf.get(`audit_log?table_name=eq.${table}&row_id=eq.${encodeURIComponent(rowId)}${action ? `&action=eq.${action}` : ""}&select=id,action,actor_id&order=at.desc`);
    return rows(q);
  };

  const EMOJI = "E2E Crüe — Nüit Ünhinged 🌊⚓️ ñ";
  const LONG = "E2E ".repeat(2500); // 10,000 characters
  const GARBAGE = "not-a-uuid";
  const NOBODY = "00000000-0000-0000-0000-000000000000";

  /* A section that throws must not take the rest of the console tour with it,
     and must never skip the cleanup. */
  const cleanup = [];
  const section = async (name, fn) => {
    try { await fn(); } catch (e) {
      note("suite", `bridge-crud · ${name} completes`, false, String(e?.message ?? e).slice(0, 200));
    }
  };

  /* ---- fixtures: two episodes, a door, a pass ---- */
  let A = null, B = null, C = null, regPassId = null;
  try {
    const a = await stf.post("episodes", {
      slug: `e2e-crud-a-${stamp}`, title: `E2E crud sea fixture ${stamp}.`, setting: "sea", kind: "sea_day",
      starts_at: plus(30), time_zone: "America/New_York", passes_total: 6, status: "scheduled", price_cents: 0,
    });
    A = first(a)?.id ?? null;
    const b = await stf.post("episodes", {
      slug: `e2e-crud-b-${stamp}`, title: `E2E crud shore fixture ${stamp}.`, setting: "shore", kind: "port_day",
      starts_at: plus(31), time_zone: "America/New_York", passes_total: 12, status: "scheduled", price_cents: 0,
    });
    B = first(b)?.id ?? null;
    const c = await stf.post("episodes", {
      slug: `e2e-crud-c-${stamp}`, title: `E2E crud course fixture ${stamp}.`, setting: "sea", kind: "sea_day",
      starts_at: plus(32), time_zone: "America/New_York", passes_total: 4, status: "scheduled", price_cents: 0,
    });
    C = first(c)?.id ?? null;
    note("staff", "raises the bridge-crud fixtures", !!A && !!B && !!C, `got ${a.status}/${b.status}/${c.status} ${said(a).slice(0, 90)}`);
    if (!A || !B || !C) return;
    cleanup.push(async () => {
      for (const id of [A, B, C]) await stf.del(`episodes?id=eq.${id}`);
    });

    const pass = await reg.post("passes", { episode_id: A, profile_id: uid(p.regional), status: "aboard" });
    regPassId = first(pass)?.id ?? null;
    note("regional", "boards the sea fixture", pass.status === 201, `got ${pass.status} ${said(pass).slice(0, 90)}`);

    const grant = await stf.post("door_grants", { profile_id: uid(p.national), episode_id: A, expires_at: new Date(Date.now() + 3600e3).toISOString() });
    note("staff", "hands the national fixture the door for the night", grant.status === 201, `got ${grant.status} ${said(grant).slice(0, 90)}`);
    cleanup.push(async () => { await stf.del(`door_grants?profile_id=eq.${uid(p.national)}`); });
    const door = nat; // the door holder for the rest of the tour

    /* ================= episodes ================= */
    await section("episodes", async () => {
      // Unicode and emoji in a title, ten thousand characters of description.
      const uni = await stf.post("episodes", {
        slug: `e2e-crud-uni-${stamp}`, title: EMOJI, description: LONG, setting: "sea", kind: "sea_day",
        starts_at: plus(33), time_zone: "America/New_York", passes_total: 4, price_cents: 0,
      });
      const uniId = first(uni)?.id;
      note("staff", "an episode takes an emoji title and a 10k-character description", uni.status === 201 && first(uni)?.title === EMOJI && first(uni)?.description?.length === LONG.length,
        `got ${uni.status} ${said(uni).slice(0, 80)}`);
      if (uniId) cleanup.push(async () => { await stf.del(`episodes?id=eq.${uniId}`); });

      // The bounds the Bridge's forms talk about, each held by its CHECK.
      const base = { slug: `e2e-crud-x-${stamp}`, title: "E2E crud edge.", setting: "sea", kind: "sea_day", starts_at: plus(34), time_zone: "America/New_York", passes_total: 4, price_cents: 0 };
      const ageLine = await stf.post("episodes", { ...base, age_line: "x".repeat(41) });
      note("staff", "an age line runs to forty characters", checkFired(ageLine, "episodes_age_line_check"), said(ageLine).slice(0, 100));
      const standby = await stf.post("episodes", { ...base, standby_passes: 51 });
      note("staff", "standby passes stop at fifty", checkFired(standby, "episodes_standby_passes_check"), said(standby).slice(0, 100));
      const holds = await stf.post("episodes", { ...base, held_passes: 5 });
      note("staff", "held passes fit the hull", checkFired(holds, "holds_fit_the_hull"), said(holds).slice(0, 100));
      const presale = await stf.post("episodes", { ...base, presale_hours: 337 });
      note("staff", "a presale runs to fourteen days", checkFired(presale, "voyages_presale_hours_check"), said(presale).slice(0, 100));
      const deposit = await stf.post("episodes", { ...base, deposit_cents: 100001 });
      note("staff", "a deposit stops at a thousand dollars", checkFired(deposit, "voyages_deposit_cents_check"), said(deposit).slice(0, 100));
      const hullHigh = await stf.post("episodes", { ...base, hull_ceiling_heads: 401, hull_certificate: "M/Y E2E — USCG COI — 401 heads" });
      note("staff", "a hull ceiling stops at four hundred heads", checkFired(hullHigh, "voyages_hull_ceiling_heads_check"), said(hullHigh).slice(0, 100));
      const noCert = await stf.post("episodes", { ...base, hull_ceiling_heads: 60 });
      note("staff", "a hull above the club ceiling names its certificate", raised(noCert, /names its certificate/), said(noCert).slice(0, 120));
      const shortCert = await stf.post("episodes", { ...base, hull_ceiling_heads: 60, hull_certificate: "ab" });
      note("staff", "a certificate is at least three characters", checkFired(shortCert, "voyages_hull_certificate_check"), said(shortCert).slice(0, 100));
      const withCert = await stf.post("episodes", { ...base, slug: `e2e-crud-cert-${stamp}`, hull_ceiling_heads: 60, hull_certificate: "M/Y E2E — USCG COI — 60 heads" });
      note("staff", "with the certificate the tentpole stands", withCert.status === 201 && first(withCert)?.hull_ceiling_heads === 60, `got ${withCert.status} ${said(withCert).slice(0, 80)}`);
      if (first(withCert)?.id) cleanup.push(async () => { await stf.del(`episodes?id=eq.${first(withCert).id}`); });
      const byRequest = await stf.post("episodes", { ...base, slug: `e2e-crud-byreq-${stamp}`, by_request: true, standby_passes: 2, age_line: "21+" });
      note("staff", "by-request, standby and an age line ride the episode",
        byRequest.status === 201 && first(byRequest)?.by_request === true && first(byRequest)?.standby_passes === 2 && first(byRequest)?.age_line === "21+",
        `got ${byRequest.status} ${said(byRequest).slice(0, 100)}`);
      if (first(byRequest)?.id) cleanup.push(async () => { await stf.del(`episodes?id=eq.${first(byRequest).id}`); });

      // The taxonomy trigger fills, never overwrites: class from the format, kind from the setting.
      const tax = await stf.post("episodes", {
        ...base, slug: `e2e-crud-tax-${stamp}`, series: "sandbar", kind: "voyage",
        ends_at: new Date(Date.parse(base.starts_at) + 3 * 3600e3).toISOString(),
      });
      const taxRow = first(tax) ?? {};
      note("staff", "a sailing keeps its taxonomy — kind from the setting, class from the format, sub-class from the hours",
        tax.status === 201 && taxRow.kind === "sea_day" && !!taxRow.experience_class && taxRow.sub_class === "passage",
        `got ${tax.status} ${JSON.stringify({ kind: taxRow.kind, experience_class: taxRow.experience_class, sub_class: taxRow.sub_class })}`);
      if (taxRow.id) cleanup.push(async () => { await stf.del(`episodes?id=eq.${taxRow.id}`); });

      // Status is a course, on the fixture nobody has boarded.
      const s1 = await stf.patch(`episodes?id=eq.${C}`, { status: "weather_hold" });
      const s2 = await stf.patch(`episodes?id=eq.${C}`, { status: "live" });
      const back = await stf.patch(`episodes?id=eq.${C}`, { status: "scheduled" });
      note("staff", "a live episode does not go back to scheduled", raised(back, /does not go from live to scheduled/) && s1.status < 300 && s2.status < 300,
        `${s1.status}/${s2.status} then ${said(back).slice(0, 110)}`);
      const done = await stf.patch(`episodes?id=eq.${C}`, { status: "completed" });
      /* Completion banks miles for whoever was aboard; the suite's footprint
         check holds every persona to zero drift, so they are swept back. */
      cleanup.push(async () => {
        const banked = await stf.get(`knots_ledger?episode_id=eq.${C}&reason=like.Miles%20banked*&select=profile_id,delta`);
        for (const r of rows(banked)) await stf.rpc("adjust_knots", { p_profile: r.profile_id, p_delta: -r.delta, p_reason: `E2E crud — miles swept ${stamp}` });
      });
      const undone = await stf.patch(`episodes?id=eq.${C}`, { status: "scheduled" });
      note("staff", "an episode in the log stays in the log", done.status < 300 && raised(undone, /stays in the log/), `${done.status} then ${said(undone).slice(0, 110)}`);

      // Garbage, and the other hands.
      const garbage = await stf.get(`episodes?id=eq.${GARBAGE}&select=id`);
      note("staff", "a uuid-shaped garbage id is refused, not matched", badUuid(garbage), `got ${garbage.status} ${said(garbage).slice(0, 80)}`);
      const memberMake = await reg.post("episodes", { ...base, slug: `e2e-crud-m-${stamp}` });
      note("regional", "cannot raise an episode — a loud refusal", rlsRefused(memberMake), `got ${memberMake.status} ${said(memberMake).slice(0, 80)}`);
      const memberEdit = await reg.patch(`episodes?id=eq.${A}`, { title: "E2E hijack" });
      note("regional", "cannot retitle an episode — silent, the rows are not theirs to see for writing", silent(memberEdit), `got ${memberEdit.status} ${said(memberEdit).slice(0, 60)}`);
      const memberStrike = await reg.del(`episodes?id=eq.${A}`);
      note("regional", "cannot strike an episode — silent", silent(memberStrike), `got ${memberStrike.status}`);
      const doorEdit = await door.patch(`episodes?id=eq.${A}`, { title: "E2E door hijack" });
      note("door", "the door holder cannot retitle the night they hold — silent", silent(doorEdit), `got ${doorEdit.status}`);
      const still = await anon.get(`episodes?id=eq.${A}&select=title`);
      note("anon", "the fixture title stands after every attempt", first(still)?.title === `E2E crud sea fixture ${stamp}.`, said(still).slice(0, 80));

      // Two identical creates in one instant: one episode.
      const dup = await race(stf, "episodes", { ...base, slug: `e2e-crud-race-${stamp}` });
      note("staff", "two creates on one slug in the same instant land one episode", dup.made === 1 && dup.refused === 1, `made ${dup.made}, refused ${dup.refused}`);
      for (const id of dup.ids) cleanup.push(async () => { await stf.del(`episodes?id=eq.${id}`); });

      // On the record.
      const logged = await auditRows("episodes", C);
      note("staff", "the episode's raise and every course change are on the record, with a name",
        logged.some((l) => l.action === "INSERT") && logged.filter((l) => l.action === "UPDATE").length >= 3 && logged.every((l) => l.actor_id === uid(p.staff)),
        `${logged.length} rows: ${logged.map((l) => l.action).join(",")}`);
      const logMember = await reg.get(`audit_log?table_name=eq.episodes&row_id=eq.${C}&select=id`);
      note("regional", "the record is the Bridge's reading", silent(logMember) || loud(logMember), `got ${logMember.status}`);
    });

    /* ================= program: seasons, venues, editions, series ================= */
    await section("program", async () => {
      const badSlug = await stf.post("seasons", { slug: `E2E Bad ${stamp}`, title: "E2E", starts_on: "2027-01-01", ends_on: "2027-02-01" });
      note("staff", "a season slug is lower-case letters, digits and hyphens", checkFired(badSlug, "seasons_slug_check"), said(badSlug).slice(0, 100));
      const backwards = await stf.post("seasons", { slug: `e2e-crud-sb-${stamp}`, title: "E2E", starts_on: "2027-02-01", ends_on: "2027-01-01" });
      note("staff", "a season ends after it begins", checkFired(backwards, "a_season_ends_after_it_begins"), said(backwards).slice(0, 100));
      const blank = await stf.post("seasons", { slug: `e2e-crud-sk-${stamp}`, title: "   ", starts_on: "2027-01-01", ends_on: "2027-02-01" });
      note("staff", "a season is not titled with spaces", checkFired(blank, "seasons_title_check"), said(blank).slice(0, 100));
      const season = await stf.post("seasons", { slug: `e2e-crud-season-${stamp}`, title: EMOJI, blurb: LONG, starts_on: "2027-01-01", ends_on: "2027-02-01" });
      const seasonId = first(season)?.id;
      note("staff", "a season takes an emoji title and a 10k blurb", season.status === 201 && first(season)?.title === EMOJI, `got ${season.status} ${said(season).slice(0, 80)}`);
      if (seasonId) cleanup.push(async () => { await stf.del(`seasons?id=eq.${seasonId}`); });
      const closed = await stf.patch(`seasons?id=eq.${seasonId}`, { active: false });
      note("staff", "a season is closed by its flag", closed.status < 300 && first(closed)?.active === false, `got ${closed.status}`);
      const seasonLog = await auditRows("seasons", seasonId);
      note("staff", "a season's raise and change are on the record", seasonLog.some((l) => l.action === "INSERT") && seasonLog.some((l) => l.action === "UPDATE"), `${seasonLog.map((l) => l.action).join(",")}`);
      const seasonRace = await race(stf, "seasons", { slug: `e2e-crud-srace-${stamp}`, title: "E2E race", starts_on: "2027-01-01", ends_on: "2027-02-01" });
      note("staff", "two seasons on one slug in the same instant land one", seasonRace.made === 1 && seasonRace.refused === 1, `made ${seasonRace.made}, refused ${seasonRace.refused}`);
      for (const id of seasonRace.ids) cleanup.push(async () => { await stf.del(`seasons?id=eq.${id}`); });
      const seasonMember = await reg.patch(`seasons?id=eq.${seasonId}`, { title: "E2E hijack" });
      note("regional", "cannot retitle a season — silent", silent(seasonMember), `got ${seasonMember.status}`);

      const badKind = await stf.post("venues", { slug: `e2e-crud-vk-${stamp}`, name: "E2E", kind: "stadium" });
      note("staff", "a venue kind answers to the list", checkFired(badKind, "venues_kind_check"), said(badKind).slice(0, 100));
      const longNote = await stf.post("venues", { slug: `e2e-crud-vn-${stamp}`, name: "E2E", kind: "club", access_note: "x".repeat(201) });
      note("staff", "an access note runs to two hundred characters", checkFired(longNote, "venues_access_note_check"), said(longNote).slice(0, 100));
      const venue = await stf.post("venues", { slug: `e2e-crud-venue-${stamp}`, name: EMOJI, kind: "club", access_note: "y".repeat(200) });
      const venueId = first(venue)?.id;
      note("staff", "a venue takes an emoji name and a 200-character access note", venue.status === 201 && first(venue)?.name === EMOJI, `got ${venue.status} ${said(venue).slice(0, 80)}`);
      if (venueId) cleanup.push(async () => { await stf.del(`venues?id=eq.${venueId}`); });
      const noteSet = await stf.patch(`venues?id=eq.${venueId}`, { access_note: "Gate B, say the club's name." });
      note("staff", "the access note is rewritten in place", noteSet.status < 300 && first(noteSet)?.access_note === "Gate B, say the club's name.", `got ${noteSet.status}`);
      const venueLog = await auditRows("venues", venueId, "UPDATE");
      note("staff", "the venue note change is on the record", venueLog.length >= 1, `${venueLog.length} rows`);
      const venueMember = await reg.post("venues", { slug: `e2e-crud-vm-${stamp}`, name: "E2E", kind: "club" });
      note("regional", "cannot name a venue — loud", rlsRefused(venueMember), `got ${venueMember.status}`);

      // Editions: a cadence, a slug, and the series they raise.
      const cad0 = await stf.post("editions", { slug: `e2e-crud-ed0-${stamp}`, title: "E2E", cadence_days: 0, template_episode_id: A });
      const cad93 = await stf.post("editions", { slug: `e2e-crud-ed93-${stamp}`, title: "E2E", cadence_days: 93, template_episode_id: A });
      note("staff", "an edition's cadence runs one to ninety-two days", checkFired(cad0, "cadence_days_check") && checkFired(cad93, "cadence_days_check"), `${said(cad0).slice(0, 60)} / ${said(cad93).slice(0, 60)}`);
      const edSlug = await stf.post("editions", { slug: `e2e-crud-${"x".repeat(50)}`, title: "E2E", cadence_days: 7, template_episode_id: A });
      note("staff", "an edition slug runs to forty-eight characters", checkFired(edSlug, "slug_check"), said(edSlug).slice(0, 100));
      const edition = await stf.post("editions", { slug: `e2e-crud-ed-${stamp}`, title: EMOJI, cadence_days: 7, template_episode_id: A });
      const edId = first(edition)?.id;
      note("staff", "opens an edition on the fixture", edition.status === 201, `got ${edition.status} ${said(edition).slice(0, 80)}`);
      if (edId) cleanup.push(async () => { await stf.del(`episodes?edition_id=eq.${edId}`); await stf.del(`editions?id=eq.${edId}`); });
      const zero = await stf.rpc("extend_the_series", { p_series: edId, p_count: 0 });
      const many = await stf.rpc("extend_the_series", { p_series: edId, p_count: 27 });
      note("staff", "the series is raised one to twenty-six at a time", raised(zero, /one and twenty-six/) && raised(many, /one and twenty-six/), `${said(zero).slice(0, 60)} / ${said(many).slice(0, 60)}`);
      const noEd = await stf.rpc("extend_the_series", { p_series: NOBODY, p_count: 1 });
      note("staff", "an edition that is not on the books is named as such", raised(noEd, /no such edition/), said(noEd).slice(0, 80));
      const garbEd = await stf.rpc("extend_the_series", { p_series: GARBAGE, p_count: 1 });
      note("staff", "garbage for an edition id is refused", badUuid(garbEd), `got ${garbEd.status} ${said(garbEd).slice(0, 60)}`);
      const one = await stf.rpc("extend_the_series", { p_series: edId, p_count: 1 });
      note("staff", "the edition raises one episode", one.data === 1, `got ${one.status} ${JSON.stringify(one.data)}`);
      const templateStrike = await stf.del(`episodes?id=eq.${A}`);
      note("staff", "the template episode is held while its edition stands", fkFired(templateStrike) || raised(templateStrike, /foreign key|restrict|edition/), `got ${templateStrike.status} ${said(templateStrike).slice(0, 80)}`);
      const edLog = await auditRows("editions", edId, "INSERT");
      note("staff", "the edition is on the record", edLog.length === 1, `${edLog.length} rows`);

      // Series (the formats): the catalogue the taxonomy trigger reads.
      const fmtBase = { slug: `e2e-crud-fmt-${stamp}`, label: EMOJI, blurb: "E2E format.", division: "hinged", category: "sea", experience_class: "club" };
      const priceless = await stf.post("series", { ...fmtBase, access: "bookable" });
      note("staff", "a bookable format publishes a price", checkFired(priceless, "a_format_publishes_a_price_exactly_when_it_is_bookable"), said(priceless).slice(0, 100));
      const cap0 = await stf.post("series", { ...fmtBase, access: "included", capacity: 0 });
      note("staff", "a format's capacity is above nothing", checkFired(cap0, "activity_formats_capacity_check"), said(cap0).slice(0, 100));
      const badDiv = await stf.post("series", { ...fmtBase, access: "included", division: "sideways" });
      note("staff", "a format's division answers to the list", checkFired(badDiv, "activity_formats_division_check"), said(badDiv).slice(0, 100));
      const fmt = await stf.post("series", { ...fmtBase, access: "bookable", price_cents: 12000, capacity: 20 });
      note("staff", "a format is added to the catalogue", fmt.status === 201 && first(fmt)?.label === EMOJI, `got ${fmt.status} ${said(fmt).slice(0, 80)}`);
      cleanup.push(async () => { await stf.del(`series?slug=eq.${fmtBase.slug}`); });
      const fmtOff = await stf.patch(`series?slug=eq.${fmtBase.slug}`, { active: false });
      note("staff", "a format is retired by its flag", fmtOff.status < 300 && first(fmtOff)?.active === false, `got ${fmtOff.status}`);
      const fmtLog = await auditRows("series", fmtBase.slug);
      note("staff", "the format's raise and retirement are on the record", fmtLog.some((l) => l.action === "INSERT") && fmtLog.some((l) => l.action === "UPDATE"), fmtLog.map((l) => l.action).join(","));
      const fmtMember = await reg.get(`series?slug=eq.${fmtBase.slug}&select=slug`);
      note("regional", "a retired format is off the member's catalogue", silent(fmtMember), `got ${fmtMember.status} ${said(fmtMember).slice(0, 40)}`);
      const fmtWrite = await reg.post("series", { ...fmtBase, slug: `e2e-crud-fmtm-${stamp}`, access: "included" });
      note("regional", "cannot write the catalogue — loud", rlsRefused(fmtWrite), `got ${fmtWrite.status}`);
    });

    /* ================= composition ================= */
    await section("composition", async () => {
      const negative = await stf.post("episode_segment_caps", { episode_id: A, segment: "couple", cap: -1 });
      note("staff", "a cap is not negative", checkFired(negative, "voyage_segment_caps_cap_check"), said(negative).slice(0, 100));
      const trio = await stf.post("episode_segment_caps", { episode_id: A, segment: "trio", cap: 2 });
      note("staff", "a segment answers to the list", checkFired(trio, "voyage_segment_caps_segment_check"), said(trio).slice(0, 100));
      const caps = await stf.post("episode_segment_caps", [
        { episode_id: A, segment: "single_woman", cap: 10 },
        { episode_id: A, segment: "single_man", cap: 10 },
      ]);
      note("staff", "sets a composition on the fixture", caps.status === 201 && rows(caps).length === 2, `got ${caps.status}`);
      const over = await stf.post("episode_segment_caps", { episode_id: A, segment: "couple", cap: 11 });
      note("staff", "the composition is held to the hull's forty heads", raised(over, /the hull holds 40/), said(over).slice(0, 100));
      /* The caps table keys on (episode, segment), so record_the_change has no
         id to file the row under; the record is found by what it carries. */
      const capLog = await stf.get(`audit_log?table_name=eq.episode_segment_caps&action=eq.INSERT&after->>episode_id=eq.${A}&select=id,actor_id`);
      note("staff", "both caps are on the record, with a name", rows(capLog).length === 2 && rows(capLog).every((l) => l.actor_id === uid(p.staff)), `${rows(capLog).length} rows`);
      const capMember = await reg.post("episode_segment_caps", { episode_id: A, segment: "couple", cap: 1 });
      note("regional", "cannot set a cap — loud", rlsRefused(capMember), `got ${capMember.status}`);
      const capDoor = await door.patch(`episode_segment_caps?episode_id=eq.${A}`, { cap: 40 });
      note("door", "the door cannot move a cap — silent", silent(capDoor), `got ${capDoor.status}`);
    });

    /* ================= manifests / roster ================= */
    await section("manifests", async () => {
      const selfIn = await reg.patch(`passes?id=eq.${regPassId}`, { checked_in_at: new Date().toISOString() });
      note("regional", "cannot check themselves in, and is told so", raised(selfIn, /gangway checks you in/), said(selfIn).slice(0, 100));
      const doorHull = await door.patch(`passes?id=eq.${regPassId}`, { vessel_id: NOBODY });
      note("door", "the door does not assign hulls, and is told so", raised(doorHull, /bridge assigns hulls|door stamps arrivals/) || fkFired(doorHull), said(doorHull).slice(0, 100));
      const staffIn = await stf.patch(`passes?id=eq.${regPassId}`, { checked_in_at: new Date().toISOString(), checked_in_by: uid(p.staff) });
      note("staff", "checks the pass in, or is told the waiver is unsigned",
        (staffIn.status < 300 && !!first(staffIn)?.checked_in_at) || raised(staffIn, /unsigned/), `got ${staffIn.status} ${said(staffIn).slice(0, 90)}`);
      if (staffIn.status < 300) await stf.patch(`passes?id=eq.${regPassId}`, { checked_in_at: null, checked_in_by: null });
      const memberSeat = await reg.post("passes", { episode_id: A, profile_id: uid(p.national), status: "aboard" });
      note("regional", "cannot seat another member — loud (the pass guard speaks before the policy does)", loud(memberSeat), `got ${memberSeat.status} ${said(memberSeat).slice(0, 80)}`);
      const evenMember = await reg.rpc("assign_vessels_evenly", { p_episode: A });
      note("regional", "cannot level the flotilla", raised(evenMember, /staff only/), said(evenMember).slice(0, 60));
      const garbagePass = await stf.patch(`passes?id=eq.${GARBAGE}`, { vessel_id: null });
      note("staff", "garbage for a pass id is refused", badUuid(garbagePass), `got ${garbagePass.status}`);
    });

    /* ================= tonight: tables and seats ================= */
    await section("tonight", async () => {
      const one = await stf.post("tables", { episode_id: B, number: 1, seats: 1 });
      const thirteen = await stf.post("tables", { episode_id: B, number: 1, seats: 13 });
      note("staff", "a table seats two to twelve", checkFired(one, "dating_tables_seats_check") && checkFired(thirteen, "dating_tables_seats_check"), `${said(one).slice(0, 60)} / ${said(thirteen).slice(0, 60)}`);
      const table = await stf.post("tables", { episode_id: B, number: 7, seats: 4 });
      const tableId = first(table)?.id;
      note("staff", "lays a table", table.status === 201, `got ${table.status} ${said(table).slice(0, 60)}`);
      const twice = await stf.post("tables", { episode_id: B, number: 7, seats: 6 });
      note("staff", "table seven is laid once a night", uniqueFired(twice), `got ${twice.status} ${said(twice).slice(0, 60)}`);
      const tableRace = await race(stf, "tables", { episode_id: B, number: 8, seats: 4 });
      note("staff", "two table-eights in the same instant land one", tableRace.made === 1 && tableRace.refused === 1, `made ${tableRace.made}, refused ${tableRace.refused}`);
      const memberTable = await reg.post("tables", { episode_id: B, number: 9, seats: 4 });
      note("regional", "cannot lay a table — loud", rlsRefused(memberTable), `got ${memberTable.status}`);
      const doorTable = await door.post("tables", { episode_id: B, number: 9, seats: 4 });
      note("door", "the door cannot lay a table — loud", rlsRefused(doorTable), `got ${doorTable.status}`);
      const seen = await reg.get(`tables?episode_id=eq.${B}&select=number`);
      note("regional", "the tables are visible to the cast", rows(seen).length >= 2, `${rows(seen).length} tables`);
      const passB = await reg.post("passes", { episode_id: B, profile_id: uid(p.regional), status: "aboard" });
      const held = await reg.rpc("claim_table_seat", { p_table: tableId });
      note("regional", "holds a seat at the table from their pass", passB.status === 201 && held.status < 300 && typeof held.data === "string", `got ${passB.status}/${held.status} ${said(held).slice(0, 60)}`);
      const staffSeats = await stf.get(`table_seats?table_id=eq.${tableId}&select=profile_id,state`);
      note("staff", "the Bridge sees the seat", rows(staffSeats).some((s) => s.profile_id === uid(p.regional)), said(staffSeats).slice(0, 80));
      const strangerSeats = await glo.get(`table_seats?table_id=eq.${tableId}&select=profile_id`);
      note("global", "a member not at the table does not see who is", silent(strangerSeats), `got ${strangerSeats.status} ${said(strangerSeats).slice(0, 40)}`);
      const strangerClaim = await glo.rpc("claim_table_seat", { p_table: tableId });
      note("global", "cannot sit at a table on a night they are not booked on", raised(strangerClaim, /not booked/), said(strangerClaim).slice(0, 80));
      const strikeTable = await stf.del(`tables?id=eq.${tableId}`);
      note("staff", "strikes the table", strikeTable.status < 300, `got ${strikeTable.status}`);
    });

    /* ================= radar ================= */
    await section("radar", async () => {
      const memberOpen = await reg.rpc("open_the_radar", { p_episode: A });
      note("regional", "cannot open the radar", raised(memberOpen, /staff only/), said(memberOpen).slice(0, 60));
      const opened = await stf.rpc("open_the_radar", { p_episode: A });
      note("staff", "opens the radar on the night with three slots", opened.status < 300 && opened.data?.slots === 3 && !!opened.data?.locks_at, `got ${opened.status} ${said(opened).slice(0, 80)}`);
      const logged = await stf.rpc("open_the_radar", { p_episode: C });
      note("staff", "the radar does not open behind an episode in the log", raised(logged, /in the log/), said(logged).slice(0, 90));
      const four = await stf.patch(`episode_radar?episode_id=eq.${A}`, { slots: 4 });
      const zero = await stf.patch(`episode_radar?episode_id=eq.${A}`, { slots: 0 });
      note("staff", "the radar carries one to three slots", checkFired(four, "voyage_radar_slots_check") && checkFired(zero, "voyage_radar_slots_check"), `${said(four).slice(0, 60)} / ${said(zero).slice(0, 60)}`);
      const inverted = await stf.patch(`episode_radar?episode_id=eq.${A}`, { locks_at: opened.data?.opens_at });
      note("staff", "the radar locks after it opens", checkFired(inverted, "voyage_radar_check"), said(inverted).slice(0, 100));
      const memberClock = await reg.patch(`episode_radar?episode_id=eq.${A}`, { slots: 1 });
      note("regional", "cannot set the radar clock — silent", silent(memberClock), `got ${memberClock.status}`);
      const publicClock = await anon.get(`episode_radar?episode_id=eq.${A}&select=slots`);
      note("anon", "the radar clock is public reading", first(publicClock)?.slots === 3, said(publicClock).slice(0, 60));
      const garbage = await stf.rpc("open_the_radar", { p_episode: GARBAGE });
      note("staff", "garbage for an episode id is refused", badUuid(garbage), `got ${garbage.status}`);
    });

    /* ================= regattas / contests ================= */
    await section("regattas", async () => {
      const base = { slug: `e2e-crud-rg-${stamp}`, shape: "regatta", scope: "member", title: `E2E crud regatta ${stamp}`, metric: "episodes", starts_at: plus(-1), ends_at: plus(1), status: "draft", knots_award: 0 };
      const noTarget = await stf.post("contests", { ...base, shape: "challenge" });
      note("staff", "a challenge names its target", checkFired(noTarget, "challenge_has_target"), said(noTarget).slice(0, 100));
      const crewNoVoyage = await stf.post("contests", { ...base, scope: "crew" });
      note("staff", "a crew contest names its episode", checkFired(crewNoVoyage, "crew_scope_has_voyage"), said(crewNoVoyage).slice(0, 100));
      const inverted = await stf.post("contests", { ...base, starts_at: plus(1), ends_at: plus(-1) });
      note("staff", "a contest ends after it starts", checkFired(inverted, "contest_window"), said(inverted).slice(0, 100));
      const badMetric = await stf.post("contests", { ...base, metric: "vibes" });
      note("staff", "a metric answers to the list", checkFired(badMetric, "contests_metric_check"), said(badMetric).slice(0, 100));
      /* A plain title on purpose: settle_contest writes "<title> — the result."
         into the winners' inbox, a row nothing deletes, and the suite's
         lexicon gate reads /inbox for emoji. The emoji round-trip is proven on
         the episode, the season, the edition and the format above. */
      const made = await stf.post("contests", { ...base, title: `E2E crud contest ${stamp}`, blurb: LONG });
      const cid = first(made)?.id;
      note("staff", "drafts a regatta with a 10k blurb", made.status === 201 && first(made)?.title === `E2E crud contest ${stamp}`, `got ${made.status} ${said(made).slice(0, 80)}`);
      if (cid) cleanup.push(async () => { await stf.del(`contests?id=eq.${cid}`); });
      const draftSeen = await reg.get(`contests?id=eq.${cid}&select=id`);
      note("regional", "a draft contest is not yet visible", silent(draftSeen), `got ${draftSeen.status}`);
      const earlySettle = await stf.rpc("settle_contest", { p_contest_id: cid });
      note("staff", "a draft is not settled", raised(earlySettle, /not open/), said(earlySettle).slice(0, 60));
      const opened = await stf.patch(`contests?id=eq.${cid}`, { status: "open" });
      note("staff", "opens the regatta", opened.status < 300 && first(opened)?.status === "open", `got ${opened.status}`);
      const enter = await reg.post("contest_entries", { contest_id: cid, profile_id: uid(p.regional) });
      note("regional", "enters an open regatta", enter.status === 201, `got ${enter.status} ${said(enter).slice(0, 60)}`);
      const memberSettle = await reg.rpc("settle_contest", { p_contest_id: cid });
      note("regional", "cannot settle a contest", raised(memberSettle, /staff only/), said(memberSettle).slice(0, 60));
      const settled = await stf.rpc("settle_contest", { p_contest_id: cid });
      note("staff", "settles the regatta and writes one result per entrant", settled.status < 300 && settled.data === 1, `got ${settled.status} ${JSON.stringify(settled.data)}`);
      const again = await stf.rpc("settle_contest", { p_contest_id: cid });
      note("staff", "a regatta is settled once", raised(again, /already settled/), said(again).slice(0, 60));
      const result = await reg.get(`contest_results?contest_id=eq.${cid}&select=place,score`);
      note("regional", "reads their own result", rows(result).length === 1 && rows(result)[0].place === 1, said(result).slice(0, 60));
      const noKnots = await stf.get(`knots_ledger?profile_id=eq.${uid(p.regional)}&reason=like.*${encodeURIComponent(EMOJI.slice(0, 8))}*&select=delta`);
      note("staff", "a regatta with no award moves no knots", rows(noKnots).length === 0, `${rows(noKnots).length} rows`);
      const memberMake = await reg.post("contests", { ...base, slug: `e2e-crud-rgm-${stamp}` });
      note("regional", "cannot raise a contest — loud", rlsRefused(memberMake), `got ${memberMake.status}`);
    });

    /* ================= vetting ================= */
    await section("vetting", async () => {
      const badState = await stf.post("vetting_files", { profile_id: uid(p.regional), background_state: "maybe" });
      note("staff", "a background state answers to the list", checkFired(badState, "vetting_files_background_state_check"), said(badState).slice(0, 100));
      const memberFile = await reg.post("vetting_files", { profile_id: uid(p.regional), background_state: "cleared", age_ok: true });
      note("regional", "cannot open their own vetting file — loud", rlsRefused(memberFile), `got ${memberFile.status}`);
      const memberPeek = await reg.get(`vetting_files?profile_id=eq.${uid(p.regional)}&select=id`);
      note("regional", "cannot read the vetting file itself", silent(memberPeek), `got ${memberPeek.status}`);
      const badStance = await reg.post("preference_boundaries", { profile_id: uid(p.regional), topic: "e2e_crud", stance: "maybe" });
      note("regional", "a boundary's stance answers to the list", checkFired(badStance, "preference_boundaries_stance_check"), said(badStance).slice(0, 100));
      const badTopic = await reg.post("preference_boundaries", { profile_id: uid(p.regional), topic: "E2E Topic", stance: "never" });
      note("regional", "a boundary's topic is a lower-case key", checkFired(badTopic, "preference_boundaries_topic_check"), said(badTopic).slice(0, 100));
      const boundary = await reg.post("preference_boundaries", { profile_id: uid(p.regional), topic: `e2e_crud_${stamp.slice(0, 20)}`, stance: "never" });
      note("regional", "sets a boundary", boundary.status === 201, `got ${boundary.status} ${said(boundary).slice(0, 60)}`);
      const staffForMember = await stf.post("preference_boundaries", { profile_id: uid(p.regional), topic: "e2e_staff_set", stance: "never" });
      note("staff", "cannot set a boundary in a member's name — a boundary is theirs alone", rlsRefused(staffForMember), `got ${staffForMember.status}`);
      const otherPeek = await nat.get(`preference_boundaries?profile_id=eq.${uid(p.regional)}&select=topic`);
      note("national", "another member's boundaries are not readable", silent(otherPeek), `got ${otherPeek.status}`);
      const staffReads = await stf.get(`preference_boundaries?profile_id=eq.${uid(p.regional)}&topic=like.e2e_crud_*&select=topic,stance`);
      note("staff", "the vetting team reads the boundary", rows(staffReads).length === 1 && rows(staffReads)[0].stance === "never", said(staffReads).slice(0, 60));
      const dropped = await stf.del(`preference_boundaries?profile_id=eq.${uid(p.regional)}&topic=like.e2e_crud_*`);
      note("staff", "and may drop it", dropped.status < 300 && rows(dropped).length === 1, `got ${dropped.status}`);
    });

    /* ================= members ================= */
    await section("members", async () => {
      const memberAdjust = await reg.rpc("adjust_knots", { p_profile: uid(p.regional), p_delta: 500, p_reason: "E2E" });
      note("regional", "cannot adjust their own knots", raised(memberAdjust, /staff only/), said(memberAdjust).slice(0, 60));
      const zero = await stf.rpc("adjust_knots", { p_profile: uid(p.regional), p_delta: 0, p_reason: "E2E" });
      note("staff", "a zero adjustment is not an entry", raised(zero, /zero adjustment/), said(zero).slice(0, 60));
      const noReason = await stf.rpc("adjust_knots", { p_profile: uid(p.regional), p_delta: 5, p_reason: "   " });
      note("staff", "the ledger never writes without a reason", raised(noReason, /without a reason/), said(noReason).slice(0, 60));
      const nobody = await stf.rpc("adjust_knots", { p_profile: NOBODY, p_delta: 5, p_reason: "E2E" });
      note("staff", "an adjustment names a real member", raised(nobody, /no such member/), said(nobody).slice(0, 60));
      const up = await stf.rpc("adjust_knots", { p_profile: uid(p.regional), p_delta: 5, p_reason: `E2E crud up ${stamp}` });
      const down = await stf.rpc("adjust_knots", { p_profile: uid(p.regional), p_delta: -5, p_reason: `E2E crud down ${stamp}` });
      const lines = await reg.get(`knots_ledger?profile_id=eq.${uid(p.regional)}&reason=like.E2E crud *${stamp}&select=delta`);
      note("staff", "an adjustment up and one down net to nothing, both on the member's own ledger",
        up.status < 300 && down.status < 300 && rows(lines).length === 2 && rows(lines).reduce((s, l) => s + l.delta, 0) === 0, `got ${up.status}/${down.status} ${said(lines)}`);
      const selfStanding = await reg.patch(`profiles?id=eq.${uid(p.regional)}`, { status: "paused" });
      note("regional", "cannot move their own standing by hand, and is told where it moves from", raised(selfStanding, /moves from the bridge/), said(selfStanding).slice(0, 100));
      const selfTier = await reg.patch(`profiles?id=eq.${uid(p.regional)}`, { tier: "global" });
      note("regional", "cannot promote their own tier", raised(selfTier, /moves from the bridge/), said(selfTier).slice(0, 100));
      const badStatus = await stf.patch(`profiles?id=eq.${uid(p.regional)}`, { status: "banished" });
      note("staff", "a standing answers to the list", checkFired(badStatus, "profiles_status_check"), said(badStatus).slice(0, 100));
      const segment = await stf.post("saved_segments", { name: EMOJI, filters: { tier: "regional", note: LONG } });
      const segId = first(segment)?.id;
      note("staff", "saves a segment with an emoji name and a 10k filter", segment.status === 201, `got ${segment.status} ${said(segment).slice(0, 60)}`);
      if (segId) cleanup.push(async () => { await stf.del(`saved_segments?id=eq.${segId}`); });
      const segMember = await reg.get(`saved_segments?id=eq.${segId}&select=id`);
      note("regional", "a saved segment is the Bridge's", silent(segMember), `got ${segMember.status}`);
      const segDoor = await door.get(`saved_segments?select=id&limit=1`);
      note("door", "the door does not read segments", silent(segDoor), `got ${segDoor.status}`);
    });

    /* ================= applications / questions ================= */
    await section("applications", async () => {
      const badKey = await stf.post("application_questions", { key: "E2E Bad", prompt: "E2E question?", kind: "text", position: 98 });
      note("staff", "a question key is a lower-case identifier", checkFired(badKey, "application_questions_key_check"), said(badKey).slice(0, 100));
      const shortPrompt = await stf.post("application_questions", { key: `e2e_crud_${stamp.slice(0, 12)}`, prompt: "ab", kind: "text", position: 98 });
      note("staff", "a prompt is three to two hundred characters", checkFired(shortPrompt, "application_questions_prompt_check"), said(shortPrompt).slice(0, 100));
      const badKind = await stf.post("application_questions", { key: `e2e_crud_${stamp.slice(0, 12)}`, prompt: "E2E question?", kind: "radio", position: 98 });
      note("staff", "a question kind answers to the list", checkFired(badKind, "application_questions_kind_check"), said(badKind).slice(0, 100));
      const key = `e2e_crud_${stamp.slice(0, 12)}`;
      const q = await stf.post("application_questions", { key, prompt: `${EMOJI} — which harbour?`, kind: "choice", options: ["Miami", "Nassau"], position: 98, active: false });
      note("staff", "adds an inactive choice question with an emoji prompt", q.status === 201 && first(q)?.options?.length === 2, `got ${q.status} ${said(q).slice(0, 80)}`);
      cleanup.push(async () => { await stf.del(`application_questions?key=eq.${key}`); });
      const moved = await stf.patch(`application_questions?key=eq.${key}`, { position: 99, active: true });
      note("staff", "moves and switches the question on", moved.status < 300 && first(moved)?.position === 99, `got ${moved.status}`);
      const memberQ = await reg.post("application_questions", { key: `e2e_m_${stamp.slice(0, 12)}`, prompt: "E2E?", kind: "text" });
      note("regional", "cannot write the application form — loud", rlsRefused(memberQ), `got ${memberQ.status}`);
      const memberStatus = await reg.rpc("set_application_status", { p_id: NOBODY, p_status: "accepted" });
      note("regional", "cannot rule on an application", loud(memberStatus), `got ${memberStatus.status} ${said(memberStatus).slice(0, 60)}`);
      const garbage = await stf.rpc("set_application_status", { p_id: GARBAGE, p_status: "accepted" });
      note("staff", "garbage for an application id is refused", badUuid(garbage), `got ${garbage.status}`);
    });

    /* ================= polls ================= */
    await section("polls", async () => {
      const closes = new Date(Date.now() + 3600e3).toISOString();
      const seven = await stf.post("polls", { question: `E2E crud seven ${stamp}`, options: ["a", "b", "c", "d", "e", "f", "g"], closes_at: closes });
      note("staff", "a question carries at most six options", checkFired(seven, "polls_options_check"), said(seven).slice(0, 100));
      const terse = await stf.post("polls", { question: "E2", options: ["a", "b"], closes_at: closes });
      note("staff", "a question is at least three characters", checkFired(terse, "polls_question_check"), said(terse).slice(0, 100));
      const essay = await stf.post("polls", { question: `E2E ${"x".repeat(200)}`, options: ["a", "b"], closes_at: closes });
      note("staff", "a question runs to two hundred characters", checkFired(essay, "polls_question_check"), said(essay).slice(0, 100));
      const poll = await stf.post("polls", { question: `E2E ${EMOJI} ${stamp}`, options: ["Havana 🇨🇺", "Nassau 🇧🇸", "Key West"], closes_at: closes });
      const pollId = first(poll)?.id;
      note("staff", "puts a three-option question with emoji", poll.status === 201, `got ${poll.status} ${said(poll).slice(0, 80)}`);
      if (pollId) cleanup.push(async () => { await stf.del(`polls?id=eq.${pollId}`); });
      const closed = await stf.patch(`polls?id=eq.${pollId}`, { closes_at: new Date().toISOString() });
      note("staff", "closes the question by moving its hour", closed.status < 300, `got ${closed.status}`);
      const lateVote = await reg.rpc("cast_vote", { p_poll: pollId, p_option: 0 });
      note("regional", "cannot vote once the question is closed", loud(lateVote), `got ${lateVote.status} ${said(lateVote).slice(0, 60)}`);
      const settled = await stf.patch(`polls?id=eq.${pollId}`, { settled: 2 });
      note("staff", "settles the question on an option", settled.status < 300 && first(settled)?.settled === 2, `got ${settled.status}`);
      const memberSettle = await reg.patch(`polls?id=eq.${pollId}`, { settled: 0 });
      note("regional", "cannot settle a question — silent", silent(memberSettle), `got ${memberSettle.status}`);
      const doorPoll = await door.post("polls", { question: "E2E door question", options: ["a", "b"], closes_at: closes });
      note("door", "the door cannot put a question — loud", rlsRefused(doorPoll), `got ${doorPoll.status}`);
    });

    /* ================= plans ================= */
    await section("plans", async () => {
      const base = { plan_type: "regional", tier: 1, label: `E2E crud plan ${stamp}`, price_cents: 0, published: false, active: false };
      const seven = await stf.post("membership_plans", { ...base, guest_allowance: 7 });
      const minus = await stf.post("membership_plans", { ...base, guest_allowance: -1 });
      note("staff", "a guest allowance runs nought to six", checkFired(seven, "membership_plans_guest_allowance_check") && checkFired(minus, "membership_plans_guest_allowance_check"), `${said(seven).slice(0, 60)} / ${said(minus).slice(0, 60)}`);
      const tier4 = await stf.post("membership_plans", { ...base, tier: 4 });
      note("staff", "a plan tier is one to three", checkFired(tier4, "membership_plans_tier_check"), said(tier4).slice(0, 100));
      const badType = await stf.post("membership_plans", { ...base, plan_type: "platinum" });
      note("staff", "a plan type answers to the list", checkFired(badType, "membership_plans_plan_type_check"), said(badType).slice(0, 100));
      const plan = await stf.post("membership_plans", { ...base, guest_allowance: 6, label: `E2E ${EMOJI} ${stamp}` });
      const planId = first(plan)?.id;
      note("staff", "drafts an unpublished plan with the full allowance", plan.status === 201 && first(plan)?.guest_allowance === 6, `got ${plan.status} ${said(plan).slice(0, 80)}`);
      if (planId) cleanup.push(async () => { await stf.del(`membership_plans?id=eq.${planId}`); });
      /* The plan grid is public reading (the pricing page is anonymous), so an
         unpublished plan is readable and carries its own `published: false` —
         every grid that renders plans filters on it, and this is the row that
         proves the filter has something to filter. */
      const hidden = await reg.get(`membership_plans?id=eq.${planId}&select=id,published,active`);
      note("regional", "an unpublished plan reads back as unpublished — the grid filters on the flag, not the policy", first(hidden)?.published === false && first(hidden)?.active === false, `got ${hidden.status} ${said(hidden).slice(0, 80)}`);
      const planLog = await auditRows("membership_plans", planId, "INSERT");
      note("staff", "the plan is on the record", planLog.length === 1, `${planLog.length} rows`);
      const memberPlan = await reg.post("membership_plans", { ...base, label: `E2E crud member plan ${stamp}` });
      note("regional", "cannot write the plan grid — loud", rlsRefused(memberPlan), `got ${memberPlan.status}`);
    });

    /* ================= pnl ================= */
    await section("pnl", async () => {
      const badKind = await stf.post("episode_expenses", { episode_id: A, kind: "bribes", amount_cents: 100 });
      note("staff", "an expense kind answers to the list", fkFired(badKind), `got ${badKind.status} ${said(badKind).slice(0, 80)}`);
      const negative = await stf.post("episode_expenses", { episode_id: A, kind: "catering", amount_cents: -1 });
      note("staff", "an expense is not negative", checkFired(negative, "episode_expenses_amount_cents_check"), said(negative).slice(0, 100));
      const line = await stf.post("episode_expenses", { episode_id: A, kind: "catering", amount_cents: 12345, note: LONG, created_by: uid(p.staff) });
      const lineId = first(line)?.id;
      note("staff", "posts an expense line with a 10k note", line.status === 201 && first(line)?.settled === false, `got ${line.status} ${said(line).slice(0, 60)}`);
      const settled = await stf.patch(`episode_expenses?id=eq.${lineId}`, { settled: true });
      note("staff", "marks the line settled", settled.status < 300 && first(settled)?.settled === true, `got ${settled.status}`);
      const pnl = await stf.get(`episode_pnl?episode_id=eq.${A}&select=cost_cents`);
      note("staff", "the P&L view carries the line", (first(pnl)?.cost_cents ?? 0) >= 12345, said(pnl).slice(0, 60));
      const memberPnl = await reg.get(`episode_pnl?episode_id=eq.${A}&select=cost_cents`);
      note("regional", "the member's reading of the P&L view carries no cost", silent(memberPnl) || (first(memberPnl)?.cost_cents ?? 0) === 0, said(memberPnl).slice(0, 60));
      const memberLine = await reg.post("episode_expenses", { episode_id: A, kind: "catering", amount_cents: 1 });
      note("regional", "cannot post an expense — loud", rlsRefused(memberLine), `got ${memberLine.status}`);
      const memberRead = await reg.get(`episode_expenses?episode_id=eq.${A}&select=id`);
      note("regional", "cannot read the expenses", silent(memberRead), `got ${memberRead.status}`);
      const struck = await stf.del(`episode_expenses?id=eq.${lineId}`);
      note("staff", "strikes the line", struck.status < 300 && rows(struck).length === 1, `got ${struck.status}`);
    });

    /* ================= fleet ================= */
    let cityId = null, vesselId = null;
    await section("fleet", async () => {
      const sunk = await stf.post("cities", { slug: `e2e-crud-sunk-${stamp}`, name: "E2E", status: "sunk" });
      note("staff", "a city status answers to the list", checkFired(sunk, "cities_status_check"), said(sunk).slice(0, 100));
      /* A city is never struck from here: the Fleet console only ever upserts
         one, and a staff DELETE on cities answers 42501 — the policy says ALL
         but the table grant does not carry DELETE (see the run report). So the
         fixture city is ONE row, on a stable slug, CLOSED so no picker offers
         it, raised on the first run and found on every run after — a declared
         footprint, not a leak. A slug race on cities would leave a row per run
         and is deliberately not run. */
      const CITY_SLUG = "e2e-crud-city";
      const raise = await stf.post("cities", { slug: CITY_SLUG, name: "E2E fixture harbour (closed)", status: "closed", time_zone: "America/New_York" });
      const found = await stf.get(`cities?slug=eq.${CITY_SLUG}&select=id,status,name`);
      cityId = first(found)?.id ?? null;
      /* Struck at the end, dependents first. A fixture city left on the roll
         reads on the public home page ("… is next") and on the tax console; it
         did, for a day. */
      cleanup.push(async () => {
        await stf.del(`city_tax?city_id=eq.${cityId}`);
        await stf.del(`vessels?home_city=eq.${cityId}`);
        await stf.del(`cities?slug=eq.${CITY_SLUG}`);
      });
      note("staff", "raises the closed fixture city", (raise.status === 201 || uniqueFired(raise)) && !!cityId, `got ${raise.status}, ${rows(found).length} row`);
      const renamed = await stf.patch(`cities?id=eq.${cityId}`, { name: `E2E fixture harbour (closed) ${EMOJI}` });
      const restored = await stf.patch(`cities?id=eq.${cityId}`, { name: "E2E fixture harbour (closed)", status: "closed" });
      note("staff", "renames the city with emoji and puts the name back", renamed.status < 300 && first(renamed)?.name?.includes("🌊") && restored.status < 300, `got ${renamed.status}/${restored.status}`);
      const cityLog = await auditRows("cities", cityId, "UPDATE");
      note("staff", "a city is a reference table and its change is on the record",
        cityLog.length >= 2,
        `${cityLog.length} audit rows — SQL: create trigger zz_record_the_change after insert or update or delete on public.cities for each row execute function public.record_the_change()`);
      const memberCity = await reg.post("cities", { slug: `e2e-crud-cm-${stamp}`, name: "E2E", status: "soon" });
      note("regional", "cannot add a city — loud", rlsRefused(memberCity), `got ${memberCity.status}`);
      const memberOpen = await reg.patch(`cities?id=eq.${cityId}`, { status: "open" });
      note("regional", "cannot open a city — silent", silent(memberOpen), `got ${memberOpen.status}`);

      const negCap = await stf.post("vessels", { name: `E2E Charter Hull neg ${stamp}`, capacity: -1 });
      note("staff", "a hull's capacity is not negative", checkFired(negCap, "vessels_capacity_check"), said(negCap).slice(0, 100));
      const hull = await stf.post("vessels", { name: `E2E Charter Hull ${EMOJI} ${stamp}`, capacity: 0, home_city: cityId });
      vesselId = first(hull)?.id ?? null;
      note("staff", "adds a hull at nought capacity with an emoji name", hull.status === 201 && first(hull)?.capacity === 0, `got ${hull.status} ${said(hull).slice(0, 60)}`);
      if (vesselId) cleanup.push(async () => { await stf.del(`vessels?id=eq.${vesselId}`); });
      const refit = await stf.patch(`vessels?id=eq.${vesselId}`, { capacity: 12, length_ft: 60 });
      note("staff", "refits the hull", refit.status < 300 && first(refit)?.capacity === 12, `got ${refit.status}`);
      const hullLog = await auditRows("vessels", vesselId);
      note("staff", "a hull is a reference table and its raise and refit are on the record",
        hullLog.some((l) => l.action === "INSERT") && hullLog.some((l) => l.action === "UPDATE"),
        `${hullLog.length} audit rows — SQL: create trigger zz_record_the_change after insert or update or delete on public.vessels for each row execute function public.record_the_change()`);
      const sleeps0 = await stf.post("cabins", { vessel_id: vesselId, name: "E2E Owner", sleeps: 0 });
      const premiumNeg = await stf.post("cabins", { vessel_id: vesselId, name: "E2E Owner", premium_cents: -1 });
      note("staff", "a cabin sleeps somebody at a premium of nought or more", checkFired(sleeps0, "cabins_berths_check") && checkFired(premiumNeg, "cabins_premium_cents_check"), `${said(sleeps0).slice(0, 60)} / ${said(premiumNeg).slice(0, 60)}`);
      const cabin = await stf.post("cabins", { vessel_id: vesselId, name: `E2E ${EMOJI}`, sleeps: 2, premium_cents: 4000 });
      const cabinId = first(cabin)?.id;
      note("staff", "names a cabin", cabin.status === 201, `got ${cabin.status} ${said(cabin).slice(0, 60)}`);
      const cabinTwice = await stf.post("cabins", { vessel_id: vesselId, name: `E2E ${EMOJI}`, sleeps: 2 });
      note("staff", "a cabin is named once per hull", uniqueFired(cabinTwice), `got ${cabinTwice.status}`);
      const cabinLog = cabinId ? await auditRows("cabins", cabinId, "INSERT") : [];
      note("staff", "the cabin is on the record", cabinLog.length === 1, `${cabinLog.length} rows`);
      const memberHull = await reg.post("vessels", { name: `E2E Charter Hull member ${stamp}` });
      note("regional", "cannot add a hull — loud", rlsRefused(memberHull), `got ${memberHull.status}`);
      const doorHull = await door.patch(`vessels?id=eq.${vesselId}`, { capacity: 99 });
      note("door", "the door cannot refit a hull — silent", silent(doorHull), `got ${doorHull.status}`);
      const flotilla = await stf.post("episode_vessels", { episode_id: A, vessel_id: vesselId });
      const levelled = await stf.rpc("assign_vessels_evenly", { p_episode: A });
      const onHull = await stf.get(`passes?id=eq.${regPassId}&select=vessel_id`);
      note("staff", "puts the hull on the night and levels the flotilla onto it",
        flotilla.status === 201 && levelled.status < 300 && Number(levelled.data) >= 1 && first(onHull)?.vessel_id === vesselId,
        `got ${flotilla.status}/${levelled.status} ${JSON.stringify(levelled.data)} ${said(onHull).slice(0, 60)}`);
    });

    /* ================= tax ================= */
    await section("tax", async () => {
      if (!cityId) throw new Error("no fixture city to tax");
      /* The determination rides the permanent fixture city; the row itself is
         struck at the end so the next run starts from no determination. */
      cleanup.push(async () => { await stf.del(`city_tax?city_id=eq.${cityId}`); });
      await stf.del(`city_tax?city_id=eq.${cityId}`);
      const high = await stf.post("city_tax", { city_id: cityId, admissions_rate_bp: 5000, registered: true });
      note("staff", "a tax rate runs nought to three thousand basis points",
        checkFired(high),
        `got ${high.status} ${said(high).slice(0, 80)} — SQL: alter table public.city_tax add constraint city_tax_rates_are_basis_points check ((admissions_rate_bp is null or admissions_rate_bp between 0 and 3000) and (goods_rate_bp is null or goods_rate_bp between 0 and 3000))`);
      await stf.del(`city_tax?city_id=eq.${cityId}`);
      const negative = await stf.post("city_tax", { city_id: cityId, goods_rate_bp: -1, registered: true });
      note("staff", "a tax rate is not negative", checkFired(negative), `got ${negative.status} ${said(negative).slice(0, 80)}`);
      await stf.del(`city_tax?city_id=eq.${cityId}`);
      const set = await stf.post("city_tax", { city_id: cityId, admissions_rate_bp: 700, goods_rate_bp: 850, registered: false, determined_by: EMOJI, determined_on: "2026-09-01", note: LONG.slice(0, 500) });
      note("staff", "records a determination with the determiner's name", set.status === 201 && first(set)?.determined_by === EMOJI, `got ${set.status} ${said(set).slice(0, 60)}`);
      const registered = await stf.patch(`city_tax?city_id=eq.${cityId}`, { registered: true });
      note("staff", "marks the city registered", registered.status < 300 && first(registered)?.registered === true, `got ${registered.status}`);
      /* tax_cents_for is the ledger's own arithmetic, called from the
         a_charge_carries_its_tax trigger; it is not granted to the console or
         the member, and the tax console shows the rate it stored, not a sum. */
      const sealedFn = await reg.rpc("tax_cents_for", { p_city: cityId, p_kind: "pass", p_cents: 10000 });
      note("regional", "the tax arithmetic is the ledger's, not a call a member makes", rlsRefused(sealedFn), `got ${sealedFn.status} ${said(sealedFn).slice(0, 60)}`);
      const memberTax = await reg.patch(`city_tax?city_id=eq.${cityId}`, { admissions_rate_bp: 0 });
      note("regional", "cannot touch the tax table — silent", silent(memberTax), `got ${memberTax.status}`);
      const memberRead = await reg.get(`city_tax?city_id=eq.${cityId}&select=admissions_rate_bp`);
      note("regional", "the tax table is the Bridge's reading", silent(memberRead), `got ${memberRead.status}`);
      const taxLog = await auditRows("city_tax", cityId);
      note("staff", "a tax determination is on the record",
        taxLog.length >= 1,
        `${taxLog.length} audit rows — SQL: create trigger zz_record_the_change after insert or update or delete on public.city_tax for each row execute function public.record_the_change() (record_the_change keys on id/slug/key; city_tax keys on city_id, so extend rid to coalesce a->>'city_id')`);
    });

    /* ================= broadcast (refusals only — a sent word cannot be struck) ================= */
    await section("broadcast", async () => {
      const word = { p_title: `E2E crud ${stamp}`, p_body: "E2E", p_channels: ["notice"] };
      const noAudience = await stf.rpc("send_broadcast", { ...word, p_audience: { kind: "everyone" } });
      note("staff", "an audience answers to the list", raised(noAudience, /no such audience/), said(noAudience).slice(0, 60));
      const noId = await stf.rpc("send_broadcast", { ...word, p_audience: { kind: "city" } });
      note("staff", "a city word names its city", raised(noId, /needs an id/), said(noId).slice(0, 60));
      const otherMember = await stf.rpc("send_broadcast", { ...word, p_audience: { kind: "member", id: uid(p.regional) } });
      note("staff", "a single-member word goes only to yourself", raised(otherMember, /test goes to yourself/), said(otherMember).slice(0, 60));
      const badTier = await stf.rpc("send_broadcast", { ...word, p_audience: { kind: "tier", tier: "platinum" } });
      note("staff", "a tier word names a real tier", raised(badTier, /no such tier/), said(badTier).slice(0, 60));
      const longTitle = await stf.rpc("send_broadcast", { ...word, p_title: "x".repeat(121), p_audience: { kind: "all" } });
      note("staff", "a title is one line", raised(longTitle, /one line/), said(longTitle).slice(0, 60));
      const longBody = await stf.rpc("send_broadcast", { ...word, p_body: "x".repeat(2001), p_audience: { kind: "all" } });
      note("staff", "the word is up to two thousand characters", raised(longBody, /two thousand/), said(longBody).slice(0, 60));
      const noChannel = await stf.rpc("send_broadcast", { ...word, p_channels: ["fax"], p_audience: { kind: "all" } });
      note("staff", "a channel answers to the list", raised(noChannel, /pick a channel/), said(noChannel).slice(0, 60));
      const garbage = await stf.rpc("send_broadcast", { ...word, p_audience: { kind: "episode", id: GARBAGE } });
      note("staff", "garbage for an audience id is refused", badUuid(garbage), `got ${garbage.status} ${said(garbage).slice(0, 60)}`);
      const doorWord = await door.rpc("send_broadcast", { ...word, p_audience: { kind: "all" } });
      note("door", "the door does not speak for the Bridge", loud(doorWord), `got ${doorWord.status} ${said(doorWord).slice(0, 60)}`);
      const memberQueue = await reg.get("broadcasts?select=id&limit=1");
      note("regional", "the broadcast log is the Bridge's", silent(memberQueue), `got ${memberQueue.status}`);
    });

    /* ================= automations ================= */
    await section("automations", async () => {
      // Inactive: a live rule on pass_confirmed would fire on every booking in the run.
      const base = { name: `E2E crud ${EMOJI} ${stamp}`, trigger_event: "pass_confirmed", conditions: { tier: "regional" }, action: { kind: "notify", title: "E2E {member}", body: LONG }, active: false };
      const negative = await stf.post("automations", { ...base, delay_minutes: -1 });
      const month = await stf.post("automations", { ...base, delay_minutes: 43201 });
      note("staff", "a delay runs nought to thirty days", checkFired(negative, "automations_delay_minutes_check") && checkFired(month, "automations_delay_minutes_check"), `${said(negative).slice(0, 60)} / ${said(month).slice(0, 60)}`);
      const rule = await stf.post("automations", { ...base, delay_minutes: 60 });
      const ruleId = first(rule)?.id;
      note("staff", "writes an inactive rule with a condition, an emoji name and a 10k body", rule.status === 201 && first(rule)?.active === false, `got ${rule.status} ${said(rule).slice(0, 60)}`);
      if (ruleId) cleanup.push(async () => { await stf.del(`automations?id=eq.${ruleId}`); });
      const armed = await stf.patch(`automations?id=eq.${ruleId}`, { active: true });
      const disarmed = await stf.patch(`automations?id=eq.${ruleId}`, { active: false });
      note("staff", "arms and disarms the rule", armed.status < 300 && first(armed)?.active === true && first(disarmed)?.active === false, `got ${armed.status}/${disarmed.status}`);
      const memberRule = await reg.post("automations", { ...base, name: `E2E crud member ${stamp}` });
      note("regional", "cannot write a rule — loud", rlsRefused(memberRule), `got ${memberRule.status}`);
      const memberArm = await reg.patch(`automations?id=eq.${ruleId}`, { active: true });
      note("regional", "cannot arm a rule — silent", silent(memberArm), `got ${memberArm.status}`);
      const doorQueue = await door.get("automation_queue?select=id&limit=1");
      note("door", "the door does not read the queue", silent(doorQueue), `got ${doorQueue.status}`);
      /* The engine itself. run_automations is SECURITY DEFINER and reached by
         triggers; it must not be callable by hand from outside the Bridge, or
         anyone on the internet can aim every active rule at any member. */
      const anonEngine = await anon.rpc("run_automations", { p_event: `e2e-crud-nothing-${stamp}` });
      note("anon", "cannot turn the automation engine by hand", loud(anonEngine),
        `got ${anonEngine.status} ${said(anonEngine).slice(0, 60)} — SQL: revoke execute on function public.run_automations(text, uuid, uuid, uuid, boolean) from anon, authenticated`);
      const memberEngine = await reg.rpc("run_automations", { p_event: `e2e-crud-nothing-${stamp}` });
      note("regional", "cannot turn the automation engine by hand", loud(memberEngine), `got ${memberEngine.status} ${said(memberEngine).slice(0, 60)}`);
    });

    /* ================= codes ================= */
    await section("codes", async () => {
      const bogo = await stf.post("promo_codes", { code: `E2ECRUDBOGO${STAMP}`, kind: "bogo", value: 1 });
      note("staff", "a code's kind answers to the list", checkFired(bogo, "promo_codes_kind_check"), said(bogo).slice(0, 100));
      const code = `E2ECRUD${STAMP}`;
      const cut = await stf.post("promo_codes", { code, kind: "percent", value: 10, max_uses: 1, episode_id: A, expires_at: plus(1), note: EMOJI, created_by: uid(p.staff) });
      note("staff", "cuts a percent code scoped to the night", cut.status === 201 && first(cut)?.note === EMOJI, `got ${cut.status} ${said(cut).slice(0, 60)}`);
      cleanup.push(async () => { await stf.del(`promo_codes?code=like.E2ECRUD*${STAMP}`); });
      const twice = await race(stf, "promo_codes", { code: `E2ECRUDRACE${STAMP}`, kind: "comp", value: 0 });
      note("staff", "two cuts of one code in the same instant land one", twice.made === 1 && twice.refused === 1, `made ${twice.made}, refused ${twice.refused}`);
      const ok = await reg.rpc("check_promo", { p_code: code.toLowerCase(), p_episode: A });
      note("regional", "the code checks out on its night, however it is typed", ok.data?.ok === true && ok.data?.kind === "percent" && ok.data?.value === 10, said(ok).slice(0, 80));
      const elsewhere = await reg.rpc("check_promo", { p_code: code, p_episode: B });
      note("regional", "the code is for one night only", elsewhere.data?.ok === false && /another episode/.test(elsewhere.data?.reason ?? ""), said(elsewhere).slice(0, 80));
      const unknown = await reg.rpc("check_promo", { p_code: `NOPE${STAMP}`, p_episode: A });
      note("regional", "an unknown code is named as such", unknown.data?.ok === false && /no such code/i.test(unknown.data?.reason ?? ""), said(unknown).slice(0, 80));
      const expired = await stf.post("promo_codes", { code: `E2ECRUDOLD${STAMP}`, kind: "amount", value: 500, expires_at: plus(-1) });
      const late = await reg.rpc("check_promo", { p_code: `E2ECRUDOLD${STAMP}`, p_episode: A });
      note("regional", "an expired code says so", expired.status === 201 && late.data?.ok === false && /expired/.test(late.data?.reason ?? ""), said(late).slice(0, 80));
      const closed = await stf.patch(`promo_codes?code=eq.${code}`, { active: false });
      const shut = await reg.rpc("check_promo", { p_code: code, p_episode: A });
      note("staff", "closes the code and the door says closed", closed.status < 300 && shut.data?.ok === false && /closed/.test(shut.data?.reason ?? ""), said(shut).slice(0, 80));
      const memberCut = await reg.post("promo_codes", { code: `E2ECRUDM${STAMP}`, kind: "comp", value: 0 });
      note("regional", "cannot cut a code — loud", rlsRefused(memberCut), `got ${memberCut.status}`);
      const memberRead = await reg.get(`promo_codes?code=eq.${code}&select=code`);
      note("regional", "the code book is the Bridge's reading", silent(memberRead), `got ${memberRead.status}`);
      const doorRead = await door.get(`promo_codes?code=eq.${code}&select=code`);
      note("door", "the door does not read the code book", silent(doorRead), `got ${doorRead.status}`);
    });

    /* ================= sponsors ================= */
    await section("sponsors", async () => {
      const blank = await stf.post("sponsors", { name: "   ", tier: "presenting_partner", monthly_cents: 1 });
      note("staff", "a sponsor has a name", checkFired(blank, "sponsors_name_check"), said(blank).slice(0, 100));
      const negative = await stf.post("sponsors", { name: `E2E crud neg ${stamp}`, tier: "presenting_partner", monthly_cents: -1 });
      note("staff", "a retainer is not negative", checkFired(negative, "sponsors_monthly_cents_check"), said(negative).slice(0, 100));
      const backwards = await stf.post("sponsors", { name: `E2E crud back ${stamp}`, tier: "presenting_partner", monthly_cents: 1, starts_on: "2027-02-01", ends_on: "2027-01-01" });
      note("staff", "a retainer ends after it begins", checkFired(backwards, "a_retainer_ends_after_it_begins"), said(backwards).slice(0, 100));
      const sponsor = await stf.post("sponsors", { name: `E2E ${EMOJI} ${stamp}`, tier: "sandbar_hub", monthly_cents: 250000, notes: LONG });
      const spId = first(sponsor)?.id;
      note("staff", "opens a sponsor with an emoji name and 10k of notes", sponsor.status === 201, `got ${sponsor.status} ${said(sponsor).slice(0, 60)}`);
      if (spId) cleanup.push(async () => { await stf.del(`sponsors?id=eq.${spId}`); });
      /* The comp lands on the SHORE fixture: comp_a_pass_for_sponsor takes no
         segment, so on a night with a composition the ratio guard refuses it
         ("this episode seats by segment") and there is no way through — noted
         in the run report as a gap in the RPC, not tested as a refusal here. */
      const compEarly = await stf.rpc("comp_a_pass_for_sponsor", { p_episode: B, p_sponsor: spId, p_profile: uid(p.global) });
      note("staff", "a comp needs the activation placed first", raised(compEarly, /place the activation first/), said(compEarly).slice(0, 80));
      const placed = await stf.post("episode_sponsors", { episode_id: B, sponsor_id: spId, placement: `Bow banner ${EMOJI}` });
      note("staff", "places the activation on the night", placed.status === 201, `got ${placed.status} ${said(placed).slice(0, 60)}`);
      const placedLog = await stf.get(`audit_log?table_name=eq.episode_sponsors&action=eq.INSERT&after->>sponsor_id=eq.${spId}&select=id`);
      note("staff", "the activation is on the record", rows(placedLog).length === 1, `${rows(placedLog).length} rows`);
      const memberComp = await reg.rpc("comp_a_pass_for_sponsor", { p_episode: B, p_sponsor: spId, p_profile: uid(p.regional) });
      note("regional", "cannot comp a pass", raised(memberComp, /staff only/), said(memberComp).slice(0, 60));
      const comp = await stf.rpc("comp_a_pass_for_sponsor", { p_episode: B, p_sponsor: spId, p_profile: uid(p.global) });
      const compPass = typeof comp.data === "string" ? await stf.get(`passes?id=eq.${comp.data}&select=comp,sponsor_id,status`) : comp;
      note("staff", "comps the global fixture a pass on the sponsor's account", comp.status < 300 && first(compPass)?.comp === true && first(compPass)?.sponsor_id === spId, `got ${comp.status} ${said(compPass).slice(0, 80)}`);
      const compTwice = await stf.rpc("comp_a_pass_for_sponsor", { p_episode: B, p_sponsor: spId, p_profile: uid(p.global) });
      note("staff", "a member is comped once", raised(compTwice, /already holds a pass/), said(compTwice).slice(0, 80));
      const noMoney = await glo.get(`account_ledger?episode_id=eq.${B}&profile_id=eq.${uid(p.global)}&select=delta_cents`);
      note("global", "a comp costs the member nothing", rows(noMoney).length === 0, said(noMoney).slice(0, 60));
      const composedComp = await stf.rpc("comp_a_pass_for_sponsor", { p_episode: A, p_sponsor: spId, p_profile: uid(p.global) });
      note("staff", "on a composed night the comp is refused by the ratio guard, in words — the RPC takes no segment (see the run report)",
        raised(composedComp, /seats by segment|activation first/), said(composedComp).slice(0, 100));
      const delivered = await stf.patch(`episode_sponsors?episode_id=eq.${B}&sponsor_id=eq.${spId}`, { assets_delivered: ["banner", "pod-wrap"] });
      note("staff", "ticks the assets delivered", delivered.status < 300 && first(delivered)?.assets_delivered?.length === 2, `got ${delivered.status}`);
      const memberSees = await reg.get(`sponsors?id=eq.${spId}&select=name`);
      note("regional", "the sponsor book is sealed", silent(memberSees), `got ${memberSees.status}`);
      const credits = await anon.rpc("sponsor_credits", { p_episode: B });
      note("anon", "the public reads the credit and the tier, never the money", rows(credits).length === 1 && rows(credits)[0].tier === "sandbar_hub" && rows(credits)[0].monthly_cents === undefined, said(credits).slice(0, 100));
    });

    /* ================= crew ================= */
    await section("crew", async () => {
      const role = await stf.post("crew_roles", { title: `E2E ${EMOJI}`, city: "Miami", slug: `e2e-crud-role-${stamp}`, body: LONG, open: true });
      const roleId = first(role)?.id;
      note("staff", "opens a crew role with an emoji title and a 10k body", role.status === 201, `got ${role.status} ${said(role).slice(0, 60)}`);
      if (roleId) cleanup.push(async () => { await stf.del(`crew_roles?id=eq.${roleId}`); });
      const email = `e2e-anon-crew-${stamp}@example.com`;
      const applied = await anon.postMinimal("crew_candidates", { role_id: roleId, full_name: `E2E ${EMOJI}`, email });
      note("anon", "applies to the open role", applied.status < 300, `got ${applied.status} ${said(applied).slice(0, 60)}`);
      cleanup.push(async () => { await stf.del(`crew_candidates?email=eq.${email}`); });
      const cand = first(await stf.get(`crew_candidates?email=eq.${email}&select=id,stage`));
      const skip = await stf.patch(`crew_candidates?id=eq.${cand?.id}`, { stage: "offer" });
      note("staff", "a candidate does not skip to offer, and is told the order", raised(skip, /applied, interview, sea trial, offer/), said(skip).slice(0, 110));
      const badStage = await stf.patch(`crew_candidates?id=eq.${cand?.id}`, { stage: "hired" });
      note("staff", "a stage answers to the list (the order trigger speaks first, the CHECK stands behind it)", checkFired(badStage, "crew_candidates_stage_check") || raised(badStage, /pipeline runs/), said(badStage).slice(0, 100));
      const interview = await stf.patch(`crew_candidates?id=eq.${cand?.id}`, { stage: "interview" });
      const history = await stf.get(`crew_candidates_events_probe?select=id`).catch(() => null);
      void history;
      const events = await stf.get(`crew_candidate_events?candidate_id=eq.${cand?.id}&select=kind,from_stage,to_stage&order=at`);
      note("staff", "the move to interview is recorded in the candidate's history",
        interview.status < 300 && rows(events).some((e) => e.kind === "stage" && e.to_stage === "interview"), said(events).slice(0, 120));
      const badNote = await stf.post("crew_candidate_events", { candidate_id: cand?.id, kind: "memo", body: "E2E" });
      note("staff", "a history entry's kind answers to the list", checkFired(badNote, "crew_candidate_events_kind_check"), said(badNote).slice(0, 100));
      const memo = await stf.post("crew_candidate_events", { candidate_id: cand?.id, kind: "note", body: LONG, actor: uid(p.staff) });
      note("staff", "leaves a 10k note on the candidate", memo.status === 201, `got ${memo.status}`);
      const passed = await stf.patch(`crew_candidates?id=eq.${cand?.id}`, { stage: "passed" });
      note("staff", "a candidate is passed on from any stage", passed.status < 300 && first(passed)?.stage === "passed", `got ${passed.status}`);
      const memberStage = await reg.patch(`crew_candidates?id=eq.${cand?.id}`, { stage: "interview" });
      note("regional", "cannot move a candidate — silent", silent(memberStage), `got ${memberStage.status}`);
      const roleClosed = await stf.patch(`crew_roles?id=eq.${roleId}`, { open: false });
      const publicRole = await anon.get(`crew_roles?id=eq.${roleId}&select=open`);
      note("staff", "closes the role, and the public reads it closed", roleClosed.status < 300 && first(publicRole)?.open === false, `got ${roleClosed.status} ${said(publicRole).slice(0, 40)}`);

      const routeSlug = await stf.post("crew", { slug: "wanted", display_name: "E2E", role_title: "E2E" });
      note("staff", "a crew slug is not one of the crew routes", checkFired(routeSlug, "crew_slug_is_not_a_route"), said(routeSlug).slice(0, 100));
      const crew = await stf.post("crew", { slug: `e2e-crud-crew-${stamp}`, display_name: EMOJI, role_title: "Deckhand", bio: LONG, public: false });
      const crewId = first(crew)?.id;
      note("staff", "adds a crew member with an emoji name and a 10k bio", crew.status === 201, `got ${crew.status} ${said(crew).slice(0, 60)}`);
      if (crewId) cleanup.push(async () => { await stf.del(`crew?id=eq.${crewId}`); });
      const linked = await stf.patch(`crew?id=eq.${crewId}`, { profile_id: uid(p.regional) });
      note("staff", "links the crew member to a profile by hand(le)", linked.status < 300 && first(linked)?.profile_id === uid(p.regional), `got ${linked.status}`);
      const badPosition = await stf.post("crew_assignments", { episode_id: A, crew_id: crewId, position_slug: "figurehead" });
      note("staff", "a position answers to the list", fkFired(badPosition), `got ${badPosition.status} ${said(badPosition).slice(0, 60)}`);
      const assigned = await stf.post("crew_assignments", { episode_id: A, crew_id: crewId, position_slug: "deckhand", assigned_by: uid(p.staff), note: LONG });
      const asgId = first(assigned)?.id;
      note("staff", "assigns the crew member to the night", assigned.status === 201 && first(assigned)?.status === "offered", `got ${assigned.status} ${said(assigned).slice(0, 60)}`);
      const twice = await stf.post("crew_assignments", { episode_id: A, crew_id: crewId, position_slug: "host" });
      note("staff", "a crew member is assigned to a night once", uniqueFired(twice), `got ${twice.status}`);
      const badStatus = await stf.patch(`crew_assignments?id=eq.${asgId}`, { status: "maybe" });
      note("staff", "an assignment's status answers to the list", checkFired(badStatus, "crew_assignments_status_check"), said(badStatus).slice(0, 100));
      const confirmed = await stf.patch(`crew_assignments?id=eq.${asgId}`, { status: "confirmed" });
      const released = await stf.patch(`crew_assignments?id=eq.${asgId}`, { status: "released" });
      note("staff", "confirms and then releases the assignment", first(confirmed)?.status === "confirmed" && first(released)?.status === "released", `got ${confirmed.status}/${released.status}`);
      const needNeg = await stf.post("episode_crew_needs", { episode_id: A, position_slug: "host", headcount: -1 });
      note("staff", "a headcount is not negative", checkFired(needNeg, "episode_crew_needs_headcount_check"), said(needNeg).slice(0, 100));
      const need = await stf.post("episode_crew_needs", { episode_id: A, position_slug: "host", headcount: 2 });
      note("staff", "overrides the night's need for hosts", need.status === 201, `got ${need.status}`);
      const gaps = await stf.get(`episode_crew_gaps?episode_id=eq.${A}&select=*`);
      note("staff", "the crew gaps view reads the night", gaps.status < 300, `got ${gaps.status} ${said(gaps).slice(0, 60)}`);
      const memberCrew = await reg.post("crew", { slug: `e2e-crud-crewm-${stamp}`, display_name: "E2E", role_title: "E2E" });
      note("regional", "cannot write the crew list — loud", rlsRefused(memberCrew), `got ${memberCrew.status}`);
      const memberRota = await reg.get(`crew_assignments?id=eq.${asgId}&select=id`);
      note("regional", "a released assignment is not the member's to see", silent(memberRota), `got ${memberRota.status}`);

      // The door: one night, one grant, and it expires.
      const grantTwice = await stf.post("door_grants", { profile_id: uid(p.national), episode_id: A, expires_at: plus(1) });
      note("staff", "one grant per member per night", uniqueFired(grantTwice), `got ${grantTwice.status}`);
      const stale = await stf.post("door_grants", { profile_id: uid(p.national), episode_id: B, expires_at: new Date(Date.now() - 60e3).toISOString() });
      const isDoorB = await nat.rpc("is_door", { p_episode: B });
      const isDoorA = await nat.rpc("is_door", { p_episode: A });
      note("national", "an expired grant is no door; the live one is", stale.status === 201 && isDoorB.data === false && isDoorA.data === true, `${isDoorB.data} / ${isDoorA.data}`);
      const memberGrant = await reg.post("door_grants", { profile_id: uid(p.regional), episode_id: A, expires_at: plus(1) });
      note("regional", "cannot hand themselves the door — loud", rlsRefused(memberGrant), `got ${memberGrant.status}`);
      const doorGrants = await door.post("door_grants", { profile_id: uid(p.global), episode_id: A, expires_at: plus(1) });
      note("door", "the door cannot hand on the door — loud", rlsRefused(doorGrants), `got ${doorGrants.status}`);
      const revoked = await stf.del(`door_grants?profile_id=eq.${uid(p.national)}&episode_id=eq.${B}`);
      note("staff", "revokes the stale grant", revoked.status < 300 && rows(revoked).length === 1, `got ${revoked.status}`);
    });

    /* ================= documents ================= */
    await section("documents", async () => {
      const ver = await reg.rpc("published_version", { p_document_code: "member-waiver" });
      const vid = typeof ver.data === "string" ? ver.data : null;
      const backToDraft = await stf.patch(`document_versions?id=eq.${vid}`, { status: "draft" });
      note("staff", "a published version cannot return to draft", raised(backToDraft, /cannot return to draft/), said(backToDraft).slice(0, 80));
      const strikePublished = await stf.del(`document_versions?id=eq.${vid}`);
      note("staff", "a published version is a matter of record", raised(strikePublished, /matter of record/), said(strikePublished).slice(0, 80));
      const badStatus = await stf.post("document_versions", { document_code: "guest-waiver", version: 990, status: "pending" });
      note("staff", "a version's status answers to the list", checkFired(badStatus, "document_versions_status_check"), said(badStatus).slice(0, 100));
      const publishedNoDate = await stf.post("document_versions", { document_code: "guest-waiver", version: 991, status: "published" });
      note("staff", "a version is not born published — publishing stamps its dates", checkFired(publishedNoDate, "published_has_a_date") || loud(publishedNoDate), said(publishedNoDate).slice(0, 100));
      const version = 900 + (Date.now() % 80);
      const draft = await stf.post("document_versions", { document_code: "guest-waiver", version, status: "draft" });
      const draftId = first(draft)?.id;
      note("staff", "drafts the next guest waiver", draft.status === 201, `got ${draft.status} ${said(draft).slice(0, 60)}`);
      if (draftId) cleanup.push(async () => { await stf.del(`document_versions?id=eq.${draftId}`); });
      const anyClause = first(await stf.get("clause_versions?select=id,clause_code&order=published_at.asc&limit=1"));
      const composed = await stf.post("document_clauses", { document_version_id: draftId, clause_version_id: anyClause?.id, position: 1, condition: { class: "sea" } });
      note("staff", "composes a clause into the draft under a condition", composed.status === 201 && first(composed)?.condition?.class === "sea", `got ${composed.status} ${said(composed).slice(0, 60)}`);
      const recondition = await stf.patch(`document_clauses?document_version_id=eq.${draftId}&clause_version_id=eq.${anyClause?.id}`, { condition: {} });
      note("staff", "lifts the condition while the draft is open", recondition.status < 300 && rows(recondition).length === 1, `got ${recondition.status}`);
      const memberCompose = await reg.post("document_clauses", { document_version_id: draftId, clause_version_id: anyClause?.id, position: 2 });
      /* Loud, but by the clause guard rather than the policy: the guard reads
         the parent version as the member, who cannot see a draft, so it answers
         "fixed" before RLS gets its turn. A refusal either way. */
      note("regional", "cannot compose a document — loud", loud(memberCompose), `got ${memberCompose.status} ${said(memberCompose).slice(0, 80)}`);
      const memberDraft = await reg.post("document_versions", { document_code: "guest-waiver", version: version + 1, status: "draft" });
      note("regional", "cannot draft a version — loud", rlsRefused(memberDraft), `got ${memberDraft.status}`);
      const memberDoc = await reg.patch("documents?code=eq.guest-waiver", { title: "E2E hijack" });
      note("regional", "cannot retitle a document — silent", silent(memberDoc), `got ${memberDoc.status}`);
      const badCategory = await stf.post("clauses", { code: `e2e-crud-${stamp}`, title: "E2E", category: "gossip" });
      note("staff", "a clause's category answers to the list", checkFired(badCategory, "clauses_category_check"), said(badCategory).slice(0, 100));
      const emptyBody = await stf.post("clause_versions", { clause_code: anyClause?.clause_code, version: 900, body: "   " });
      note("staff", "a clause version says something", checkFired(emptyBody, "clause_versions_body_check"), said(emptyBody).slice(0, 100));
      const mine = first(await stf.get(`signatures?profile_id=eq.${uid(p.regional)}&document_version_id=eq.${vid}&select=id`));
      const oneWay = mine ? await stf.rpc("counter_sign", { p_signature_id: mine.id, p_title: "Harbourmaster" }) : null;
      note("staff", "a waiver is one-way — only a contract is counter-signed", oneWay ? raised(oneWay, /one-way/) : false, oneWay ? said(oneWay).slice(0, 80) : "no waiver signature to try (documentRules signs it earlier in the suite)");
      const memberCounter = await reg.rpc("counter_sign", { p_signature_id: mine?.id ?? NOBODY, p_title: "Me" });
      note("regional", "cannot counter-sign", raised(memberCounter, /staff only/), said(memberCounter).slice(0, 60));
      const noSig = await stf.rpc("counter_sign", { p_signature_id: NOBODY });
      note("staff", "counter-signing nothing is named as such", raised(noSig, /no such signature/), said(noSig).slice(0, 60));
      const redactNothing = await stf.rpc("redact_signature", { p_id: NOBODY });
      note("staff", "redacting nothing is named as such", raised(redactNothing, /no signature under that id/), said(redactNothing).slice(0, 60));
      /* A composed draft cannot be struck outright: the FK cascade deletes the
         clauses AFTER the version row, so guard_document_clauses looks up a
         parent that is already gone, reads its status as null, and refuses
         with "fixed" — the message for a PUBLISHED document, on a draft. The
         operator has no way to abandon a composed draft, and the suite's own
         sweep of drafts ≥ 900 quietly fails on any that carry a clause. */
      const struck = await stf.del(`document_versions?id=eq.${draftId}`);
      note("staff", "a composed draft is struck outright and its composition goes with it", struck.status < 300,
        `got ${struck.status} ${said(struck).slice(0, 70)} — SQL: in guard_document_clauses, `
        + `if tg_op = 'DELETE' and parent is null then return old (the version is already gone)`);
      if (struck.status >= 400) {
        const unpicked = await stf.del(`document_clauses?document_version_id=eq.${draftId}`);
        const struckEmpty = await stf.del(`document_versions?id=eq.${draftId}`);
        note("staff", "untick the clauses first and the draft can go", unpicked.status < 300 && struckEmpty.status < 300, `got ${unpicked.status}/${struckEmpty.status}`);
      }
    });

    /* ================= envelopes ================= */
    await section("envelopes", async () => {
      const memberIssue = await reg.rpc("issue_the_envelopes", { p_episode: A });
      note("regional", "cannot issue the envelopes", raised(memberIssue, /staff only/), said(memberIssue).slice(0, 60));
      const issued = await stf.rpc("issue_the_envelopes", { p_episode: A });
      note("staff", "issues one envelope per pass aboard", issued.status < 300 && Number(issued.data) >= 1, `got ${issued.status} ${JSON.stringify(issued.data)}`);
      const again = await stf.rpc("issue_the_envelopes", { p_episode: A });
      note("staff", "issuing again seals nothing new", Number(again.data) === 0, `got ${again.status} ${JSON.stringify(again.data)}`);
      const sealed = await stf.get(`captains_log_envelopes?rsvp_id=eq.${regPassId}&select=token,opened_at`);
      note("staff", "the envelope is on the pass, unopened", rows(sealed).length === 1 && rows(sealed)[0].opened_at === null, said(sealed).slice(0, 40));
      const memberPeek = await reg.get(`captains_log_envelopes?rsvp_id=eq.${regPassId}&select=token`);
      note("regional", "the envelope is sealed even to its addressee until it is handed over", silent(memberPeek), `got ${memberPeek.status}`);
      const doorPeek = await door.get(`captains_log_envelopes?select=token&limit=1`);
      note("door", "the door does not read the envelopes", silent(doorPeek), `got ${doorPeek.status}`);
    });

    /* ================= elements ================= */
    await section("elements", async () => {
      const base = { element_id: `E2E-${STAMP}`, urid: "4000.01.001", name: EMOJI, department: "4000 Build", discipline: "Rigging", category: "Deck", kind: "equipment", tier: "04 Physical", phase: "Install", grain: "class", element_state: "Draft", specifications: LONG, uom: "ea", qty: 2, unit_cost_usd: 3.5, price_confidence: "QUOTED", five_a: "arrival", weather: "all_weather" };
      const badUrid = await stf.post("elements", { ...base, urid: "4000-01-001" });
      note("staff", "a URID is dddd.dd.ddd", checkFired(badUrid, "elements_urid_check"), said(badUrid).slice(0, 100));
      const mismatch = await stf.post("elements", { ...base, department: "3000 Marketing" });
      note("staff", "a URID belongs to its department", checkFired(mismatch, "element_urid_matches_department"), said(mismatch).slice(0, 100));
      const negQty = await stf.post("elements", { ...base, qty: -1 });
      note("staff", "a quantity is not negative", checkFired(negQty, "elements_qty_check"), said(negQty).slice(0, 100));
      const badPhase = await stf.post("elements", { ...base, phase: "Rehearse" });
      note("staff", "a phase answers to the list", checkFired(badPhase, "elements_phase_check"), said(badPhase).slice(0, 100));
      const indoor = await stf.post("elements", { ...base, element_id: `E2E-IN-${STAMP}`, five_a: "activity", weather: "indoor_only", element_state: "Active" });
      note("staff", "an indoor-only activity names its substitute before it goes active", raised(indoor, /no named substitute/) && said(indoor).includes(`e2e-in-${stamp}`), said(indoor).slice(0, 120));
      const made = await stf.post("elements", base);
      const elId = first(made)?.id;
      note("staff", "catalogues an element and totals it", made.status === 201 && Number(first(made)?.total_cost_usd) === 7, `got ${made.status} total ${first(made)?.total_cost_usd}`);
      if (elId) cleanup.push(async () => { await stf.del(`elements?id=eq.${elId}`); });
      const twice = await stf.post("elements", base);
      note("staff", "an element id is catalogued once", uniqueFired(twice), `got ${twice.status}`);
      /* total_an_element only fills a NULL total, so a quantity change on its
         own leaves the old total standing. The console clears the total on
         every save so the trigger recomputes; any other writer gets a stale
         figure. */
      const retotal = await stf.patch(`elements?id=eq.${elId}`, { qty: 10 });
      note("staff", "a change of quantity re-totals the element", Number(first(retotal)?.total_cost_usd) === 35,
        `total ${first(retotal)?.total_cost_usd} after qty 10 × 3.5 — SQL: in total_an_element, recompute when tg_op = 'UPDATE' and (new.qty, new.unit_cost_usd) is distinct from (old.qty, old.unit_cost_usd), not only when the total is null`);
      const retotalNulled = await stf.patch(`elements?id=eq.${elId}`, { qty: 10, total_cost_usd: null });
      note("staff", "with the total cleared the trigger re-totals it", Number(first(retotalNulled)?.total_cost_usd) === 35, `total ${first(retotalNulled)?.total_cost_usd}`);
      const memberRead = await reg.get(`elements?id=eq.${elId}&select=id`);
      note("regional", "the catalogue is the crew's", silent(memberRead), `got ${memberRead.status}`);
      const memberWrite = await reg.post("elements", { ...base, element_id: `E2E-M-${STAMP}` });
      note("regional", "cannot catalogue an element — loud", rlsRefused(memberWrite), `got ${memberWrite.status}`);
    });

    /* ================= media ================= */
    await section("media", async () => {
      const path = `e2e-crud/${stamp}.jpg`;
      const frame = await stf.post("episode_media", { episode_id: A, storage_path: path, caption: EMOJI, uploaded_by: uid(p.regional), approved: false });
      const frameId = first(frame)?.id;
      note("staff", "files a frame against the night, unapproved", frame.status === 201 && first(frame)?.approved === false, `got ${frame.status} ${said(frame).slice(0, 60)}`);
      const selfApprove = await reg.patch(`episode_media?id=eq.${frameId}`, { approved: true });
      note("regional", "cannot clear their own frame, and is told where it clears from", raised(selfApprove, /cleared from the bridge/), said(selfApprove).slice(0, 100));
      const hidden = await anon.get(`episode_media?id=eq.${frameId}&select=id`);
      note("anon", "an uncleared frame is not public", silent(hidden), `got ${hidden.status}`);
      const approved = await stf.patch(`episode_media?id=eq.${frameId}`, { approved: true });
      const shown = await anon.get(`episode_media?id=eq.${frameId}&select=id`);
      note("staff", "clears the frame and it is public", approved.status < 300 && rows(shown).length === 1, `got ${approved.status}/${shown.status}`);
      const recaption = await reg.patch(`episode_media?id=eq.${frameId}`, { caption: "E2E rewritten" });
      note("regional", "rewriting the caption sends the frame back to the queue", recaption.status < 300 && first(recaption)?.approved === false, `got ${recaption.status} ${said(recaption).slice(0, 60)}`);
      const rejected = await stf.patch(`episode_media?id=eq.${frameId}`, { approved: false });
      note("staff", "rejects the frame", rejected.status < 300 && first(rejected)?.approved === false, `got ${rejected.status}`);
      const removed = await stf.del(`episode_media?id=eq.${frameId}`);
      const orphan = await stf.get(`orphaned_media?storage_path=eq.${encodeURIComponent(path)}&select=storage_path,cleared_at`);
      note("staff", "removing the row notes the path for the bucket sweep", removed.status < 300 && rows(orphan).length === 1, `got ${removed.status}, ${rows(orphan).length} orphan rows`);
      const memberOrphans = await reg.get("orphaned_media?select=storage_path&limit=1");
      note("regional", "the orphan list is the Bridge's", silent(memberOrphans), `got ${memberOrphans.status}`);
      /* orphaned_media has a staff SELECT policy and nothing else — the row is
         the bucket sweep's to clear, not the console's — so this run's one
         orphan path is a declared footprint, not a leak (see the run report). */
      const clearOrphan = await stf.del(`orphaned_media?storage_path=eq.${encodeURIComponent(path)}`);
      note("staff", "the orphan list is not the console's to clear — the sweep owns it", rlsRefused(clearOrphan), `got ${clearOrphan.status} ${said(clearOrphan).slice(0, 60)}`);
    });

    /* ================= moderation ================= */
    await section("moderation", async () => {
      const post = await reg.post("open_deck_posts", { author_id: uid(p.regional), body: `E2E crud post ${EMOJI} ${stamp}` });
      const postId = first(post)?.id;
      note("regional", "posts to the Open Deck", post.status === 201, `got ${post.status} ${said(post).slice(0, 60)}`);
      if (postId) cleanup.push(async () => { await stf.del(`open_deck_posts?id=eq.${postId}`); });
      const flag = await nat.post("open_deck_flags", { post_id: postId, flagger_id: uid(p.national), reason: "E2E" });
      const flagId = first(flag)?.id;
      note("national", "flags the post", flag.status === 201 && first(flag)?.status === "open", `got ${flag.status} ${said(flag).slice(0, 60)}`);
      if (flagId) cleanup.push(async () => { await stf.del(`open_deck_flags?id=eq.${flagId}`); });
      const badStatus = await stf.patch(`open_deck_flags?id=eq.${flagId}`, { status: "shrugged" });
      note("staff", "a flag's resolution answers to the list", checkFired(badStatus, "wardroom_flags_status_check"), said(badStatus).slice(0, 100));
      const memberResolve = await reg.patch(`open_deck_flags?id=eq.${flagId}`, { status: "left_up" });
      note("regional", "the author cannot resolve the flag on their own post — silent", silent(memberResolve), `got ${memberResolve.status}`);
      const memberWord = await reg.rpc("notify_member", { p_profile: uid(p.national), p_kind: "word", p_title: "E2E crud", p_body: "E2E" });
      note("regional", "cannot send a word in the Bridge's name", raised(memberWord, /staff only/), said(memberWord).slice(0, 60));
      const untitled = await stf.rpc("notify_member", { p_profile: uid(p.regional), p_kind: "word", p_title: "   ", p_body: "E2E" });
      note("staff", "a word needs a title", raised(untitled, /needs a title/), said(untitled).slice(0, 60));
      const nobody = await stf.rpc("notify_member", { p_profile: NOBODY, p_kind: "word", p_title: "E2E crud", p_body: "E2E" });
      note("staff", "a word goes to a real member", raised(nobody, /no such member/), said(nobody).slice(0, 60));
      const removed = await stf.patch(`open_deck_flags?id=eq.${flagId}`, { status: "removed", resolved_by: uid(p.staff) });
      const word = await stf.rpc("notify_member", { p_profile: uid(p.regional), p_kind: "word", p_title: `E2E crud removed ${stamp}`, p_body: "Against the code of conduct." });
      const struck = await stf.del(`open_deck_posts?id=eq.${postId}`);
      const heard = await reg.get(`notifications?title=eq.${encodeURIComponent(`E2E crud removed ${stamp}`)}&select=body`);
      note("staff", "removes the post, tells the author why, and the flag survives the post",
        removed.status < 300 && word.status < 300 && struck.status < 300 && rows(heard).length === 1,
        `got ${removed.status}/${word.status}/${struck.status}, ${rows(heard).length} words heard`);
      const flagStands = await stf.get(`open_deck_flags?id=eq.${flagId}&select=status,post_id`);
      note("staff", "the flag records the removal after the post is gone", first(flagStands)?.status === "removed", said(flagStands).slice(0, 60));
    });

    /* ================= shoreside ================= */
    await section("shoreside", async () => {
      const opened = await reg.rpc("open_shoreside_thread");
      const tid = typeof opened.data === "string" ? opened.data : null;
      note("regional", "opens a line to Shoreside", !!tid, `got ${opened.status} ${said(opened).slice(0, 60)}`);
      if (tid) cleanup.push(async () => { await stf.del(`messages?thread_id=eq.${tid}`); await stf.del(`thread_members?thread_id=eq.${tid}`); await stf.del(`threads?id=eq.${tid}`); });
      const unseated = await stf.post("messages", { thread_id: tid, author_id: uid(p.staff), body: "E2E before sitting down" });
      note("staff", "cannot speak in a thread before taking a seat — loud", rlsRefused(unseated), `got ${unseated.status} ${said(unseated).slice(0, 60)}`);
      const seated = await stf.post("thread_members", { thread_id: tid, profile_id: uid(p.staff) });
      const reply = await stf.post("messages", { thread_id: tid, author_id: uid(p.staff), body: `E2E ${EMOJI} ${"x".repeat(3900)}` });
      note("staff", "takes a seat and answers with a 4,000-character word", seated.status === 201 && reply.status === 201, `got ${seated.status}/${reply.status} ${said(reply).slice(0, 60)}`);
      const essay = await stf.post("messages", { thread_id: tid, author_id: uid(p.staff), body: "x".repeat(4001) });
      note("staff", "a message runs to four thousand characters", checkFired(essay, "messages_body_check"), said(essay).slice(0, 100));
      const asMember = await stf.post("messages", { thread_id: tid, author_id: uid(p.regional), body: "E2E ventriloquism" });
      note("staff", "cannot write in a member's name — loud", rlsRefused(asMember), `got ${asMember.status}`);
      const heard = await reg.get(`messages?thread_id=eq.${tid}&select=author_id&order=created_at`);
      note("regional", "reads Shoreside's answer", rows(heard).some((m) => m.author_id === uid(p.staff)), `${rows(heard).length} messages`);
      const stranger = await glo.get(`messages?thread_id=eq.${tid}&select=id`);
      note("global", "another member's line to Shoreside is not readable", silent(stranger), `got ${stranger.status}`);
      const doorThread = await door.get(`messages?thread_id=eq.${tid}&select=id`);
      note("door", "the door does not read Shoreside", silent(doorThread), `got ${doorThread.status}`);
      const closed = await stf.patch(`threads?id=eq.${tid}`, { closed_at: new Date().toISOString() });
      const afterClose = await reg.post("messages", { thread_id: tid, author_id: uid(p.regional), body: "E2E after close" });
      note("staff", "closes the thread and nothing more is written in it", closed.status < 300 && raised(afterClose, /closed/), `got ${closed.status} ${said(afterClose).slice(0, 80)}`);
      const memberClose = await reg.patch(`threads?id=eq.${tid}`, { closed_at: null });
      note("regional", "cannot reopen a thread — silent", silent(memberClose), `got ${memberClose.status}`);
    });

    /* ================= referrals ================= */
    await section("referrals", async () => {
      const roll = await reg.get("member_roll?select=email&limit=1");
      note("regional", "the roll is the Bridge's reading", silent(roll), `got ${roll.status}`);
      const others = await reg.get(`invites?inviter_id=eq.${uid(p.national)}&select=code`);
      note("regional", "another member's invites are not readable", silent(others), `got ${others.status}`);
      const staffInvites = await stf.get("invites?select=code&limit=1");
      note("staff", "reads the invites for reconciliation", staffInvites.status < 300, `got ${staffInvites.status}`);
      const forge = await reg.post("invites", { code: `E2E${STAMP}`.slice(0, 8), inviter_id: uid(p.national), max_uses: 3 });
      note("regional", "cannot mint an invite in another's name — loud", rlsRefused(forge), `got ${forge.status}`);
    });

    /* ================= keys ================= */
    await section("keys", async () => {
      const key = await stf.post("api_keys", { label: `E2E ${EMOJI} ${stamp}`, key_hash: `h-${stamp}`, prefix: `un_${stamp.slice(0, 5)}`, scopes: ["read:members"], created_by: uid(p.staff) });
      const keyId = first(key)?.id;
      note("staff", "mints a key with an emoji label", key.status === 201 && first(key)?.revoked === false, `got ${key.status} ${said(key).slice(0, 60)}`);
      if (keyId) cleanup.push(async () => { await stf.del(`api_keys?id=eq.${keyId}`); });
      const sameHash = await stf.post("api_keys", { label: `E2E twin ${stamp}`, key_hash: `h-${stamp}`, prefix: "un_twin" });
      note("staff", "one hash, one key", uniqueFired(sameHash), `got ${sameHash.status}`);
      const revoked = await stf.patch(`api_keys?id=eq.${keyId}`, { revoked: true });
      note("staff", "revokes the key", revoked.status < 300 && first(revoked)?.revoked === true, `got ${revoked.status}`);
      const memberRevoke = await reg.patch(`api_keys?id=eq.${keyId}`, { revoked: false });
      note("regional", "cannot un-revoke a key — silent", silent(memberRevoke), `got ${memberRevoke.status}`);
      const hook = await stf.post("webhooks", { url: `https://example.com/e2e-crud-${stamp}`, events: ["pass.confirmed"], secret: `whsec_${stamp}` });
      const hookId = first(hook)?.id;
      note("staff", "registers a webhook", hook.status === 201, `got ${hook.status} ${said(hook).slice(0, 60)}`);
      if (hookId) cleanup.push(async () => { await stf.del(`webhooks?id=eq.${hookId}`); });
      const paused = await stf.patch(`webhooks?id=eq.${hookId}`, { active: false });
      note("staff", "pauses the webhook", paused.status < 300 && first(paused)?.active === false, `got ${paused.status}`);
      const doorKeys = await door.get("api_keys?select=id&limit=1");
      note("door", "the door does not read the keys", silent(doorKeys), `got ${doorKeys.status}`);
      const consoleSetting = await anon.rpc("club_setting", { p_key: "keys_console_enabled" });
      note("anon", "the keys console is a setting", typeof consoleSetting.data === "number", `got ${consoleSetting.status} ${JSON.stringify(consoleSetting.data)}`);
    });

    /* ================= reports ================= */
    await section("reports", async () => {
      const funnel = await reg.get("application_funnel?select=stage,applicants");
      note("regional", "the application funnel shows a member nothing", silent(funnel), `got ${funnel.status} ${said(funnel).slice(0, 60)}`);
      const stripe = await reg.get("stripe_reconciliation?select=issue&limit=1");
      note("regional", "the Stripe reconciliation shows a member nothing", silent(stripe), `got ${stripe.status}`);
      const value = await reg.get(`member_value?profile_id=eq.${uid(p.global)}&select=dues_cents`);
      note("regional", "another member's value is not readable", silent(value), `got ${value.status}`);
      const lapsed = await reg.get(`lapsed_members?profile_id=eq.${uid(p.paused)}&select=profile_id`);
      note("regional", "the lapsed list does not name another member", silent(lapsed), `got ${lapsed.status}`);
      const cohorts = await reg.get("membership_cohorts?select=cohort,joined");
      note("regional", "the cohort table counts nobody but the reader", rows(cohorts).every((c) => c.joined <= 1), said(cohorts).slice(0, 80));
      const staffFunnel = await stf.get("application_funnel?select=stage,applicants");
      note("staff", "the Bridge reads the funnel", staffFunnel.status < 300 && Array.isArray(staffFunnel.data), `got ${staffFunnel.status}`);
      const health = await reg.rpc("delivery_health");
      note("regional", "delivery health is the Bridge's instrument", loud(health) || rows(health).length === 0, `got ${health.status} ${said(health).slice(0, 60)}`);
      const scheduler = await reg.rpc("scheduler_health", { p_limit: 5 });
      note("regional", "scheduler health is the Bridge's instrument", loud(scheduler) || rows(scheduler).length === 0, `got ${scheduler.status} ${said(scheduler).slice(0, 60)}`);
      const requeue = await reg.rpc("requeue_outbox_row", { p_table: "email_outbox", p_id: NOBODY });
      note("regional", "cannot requeue the outbox", raised(requeue, /staff only/), said(requeue).slice(0, 60));
      const notOutbox = await stf.rpc("requeue_outbox_row", { p_table: "profiles", p_id: NOBODY });
      note("staff", "only an outbox is requeued", raised(notOutbox, /not an outbox/), said(notOutbox).slice(0, 60));
      const doorLog = await door.get("audit_log?select=id&limit=1");
      note("door", "the door does not read the record", silent(doorLog), `got ${doorLog.status}`);
    });

    /* ================= gangway — light touch ================= */
    await section("gangway", async () => {
      const manifest = await door.get(`passes?episode_id=eq.${A}&select=id`);
      note("door", "reads the manifest of the night they hold", rows(manifest).some((r) => r.id === regPassId), `${rows(manifest).length} rows`);
      const other = await door.get(`passes?episode_id=eq.${B}&select=id`);
      note("door", "and not the night they do not", rows(other).every((r) => r.id !== regPassId) && rows(other).length <= 1, `${rows(other).length} rows (their own pass at most)`);
      const bridgeTables = await door.get("api_keys?select=id&limit=1");
      const bridgeCodes = await door.get("promo_codes?select=code&limit=1");
      const bridgeSegments = await door.get("saved_segments?select=id&limit=1");
      note("door", "the door is not the Bridge — keys, codes and segments stay shut", silent(bridgeTables) && silent(bridgeCodes) && silent(bridgeSegments), `${bridgeTables.status}/${bridgeCodes.status}/${bridgeSegments.status}`);
      const mintCode = await door.patch(`passes?id=eq.${regPassId}`, { boarding_code: "E2EDOOR" });
      note("door", "cannot issue a boarding code, and is told what the door does instead", raised(mintCode, /issued by the club|door stamps arrivals/), said(mintCode).slice(0, 80));
    });
  } finally {
    /* Strike what was raised, newest first, so the FKs unwind in order — and
       then once more, because the order is not a tree: the hull cannot go while
       a pass on the sea fixture still names it (assign_vessels_evenly put it
       there), and the fixture episodes were raised first, so they go last. The
       second pass takes the hull and its city once the passes have gone with
       the episode. */
    const undoAll = async () => {
      for (const undo of cleanup) {
        try { await undo(); } catch { /* the sweep takes what this misses */ }
      }
    };
    cleanup.reverse();
    await undoAll();
    await undoAll();
    const left = await stf.get(`episodes?slug=like.e2e-crud-*${RUN_TOKEN}*&select=slug`);
    note("staff", "every bridge-crud fixture is struck", rows(left).length === 0, rows(left).map((r) => r.slug).join(",").slice(0, 120));
  }
}
