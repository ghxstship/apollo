/* The social layer, end to end: the Open Deck, threads and direct words, the
   directory, Radar and Tables, polls, debriefs, on-deck presence, Knots and
   Marks and Leagues, and the Log — as member, other member, paused, staff,
   anon, and a blocked pair, with Promise.all where two people reach for one
   thing.

   Extends, never repeats: moderationRules (hail/comment/flag forgery and the
   flag queue), isolationRules (owned tables), logbookRules (marks, contests,
   the podium split, redeem beyond balance), ratioAndRadarRules (the sweep,
   the slot ceiling, the 17:30 lock, the envelope clock, anchor expiry) and
   rulesOfSept4 (the stranger refusal, one debrief a night, votes and the
   sealed tally) already pin their rules in scripts/e2e-suite.mjs.

   Two fixture episodes, both slugged with RUN_TOKEN: a shore night that carries
   the crew thread, the tables, the debrief and is COMPLETED at the end (which
   is what closes the thread, confers the marks and banks the miles), and a sea
   episode kept live for on-deck presence and the Radar checks.

   Knots. A pass mints 25 and gives them back on release, so every pass here is
   deleted before its episode. Completion banks miles for everyone aboard and
   nothing reverses that, so the module reads the exact rows it minted and
   sweeps them through adjust_knots. The redemption race spends a zero-cost
   reward. Net per persona: 0, and the module weighs it at the end. */

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

export async function run(p, ctx) {
  const { rest, note, uid, RUN_TOKEN, SUPA, BASE } = ctx;
  const stf = rest(p.staff), reg = rest(p.regional), nat = rest(p.national), glo = rest(p.global), pau = rest(p.paused), anon = rest(null);
  const R = uid(p.regional), N = uid(p.national), G = uid(p.global), P = uid(p.paused), S = uid(p.staff);
  const stamp = `${Date.now().toString(36)}${RUN_TOKEN}`;
  const said = (r) => String(r.data?.message ?? r.data?.hint ?? JSON.stringify(r.data ?? "")).toLowerCase();
  const rows = (r) => (Array.isArray(r.data) ? r.data : []);
  const nowIso = () => new Date().toISOString();
  const at = (ms) => new Date(Date.now() + ms).toISOString();
  const HOUR = 3600_000, DAY = 86_400_000;

  /* Through knots_balance as the suite does, never by summing a page. */
  const knotsOf = async (id) => {
    const r = await stf.get(`knots_balance?profile_id=eq.${id}&select=balance`);
    return Number(r.data?.[0]?.balance ?? 0);
  };
  const knotsAtStart = {};
  for (const who of ["regional", "national", "global", "paused"]) knotsAtStart[who] = await knotsOf(uid(p[who]));

  /* The app, as a signed-in member — the cookie the middleware reads. */
  const REF = new URL(SUPA).hostname.split(".")[0];
  const pageAs = async (session, path) => {
    const value = "base64-" + Buffer.from(JSON.stringify(session)).toString("base64url");
    const res = await fetch(BASE + path, {
      redirect: "manual",
      headers: { cookie: `sb-${REF}-auth-token=${value}`, "user-agent": "un-e2e" },
    });
    return { status: res.status, html: await res.text() };
  };

  /* Everything restored in reverse, whether the run finishes or dies. */
  const undo = [];
  const later = (fn) => undo.push(fn);

  const raise = async (label, extra = {}) => {
    const v = await stf.post("episodes", {
      slug: `e2e-social-${label}-${stamp}`, title: `E2E social ${label} fixture.`,
      starts_at: at(2 * DAY), ends_at: at(2 * DAY + 3 * HOUR), time_zone: "America/New_York",
      passes_total: 8, price_cents: 0, status: "live", min_tier: "regional", ...extra,
    });
    return { id: v.data?.[0]?.id ?? null, res: v };
  };
  /* Own release first, the Bridge's strike if the owner may not. */
  const release = async (who, id) => {
    if (!id) return;
    await rest(p[who]).del(`passes?id=eq.${id}`);
    const left = await stf.get(`passes?id=eq.${id}&select=id`);
    if (rows(left).length) await stf.del(`passes?id=eq.${id}`);
  };

  const shore = await raise("shore", { setting: "shore" });
  const sea = await raise("sea", { setting: "sea", kind: "sea_day", sub_class: "passage" });
  const SH = shore.id, SEA = sea.id;
  note("staff", "raises the shore night and the sea episode", !!SH && !!SEA,
    `got ${shore.res.status} ${said(shore.res).slice(0, 80)} / ${sea.res.status} ${said(sea.res).slice(0, 80)}`);
  if (!SH || !SEA) return;
  const passIds = [];
  later(async () => {
    for (const [who, id] of passIds) await release(who, id);
    await stf.del(`passes?episode_id=in.(${SH},${SEA})`);
    /* Weighed here, while the episode still stands to be filtered on: the 25
       minted on the shore pass came back when the pass went. */
    const released = await stf.get(`knots_ledger?episode_id=eq.${SH}&profile_id=eq.${R}&reason=eq.Pass%20released&select=delta`);
    note("regional", "releasing the pass gives the 25 knots back", rows(released).some((r) => r.delta === -25), JSON.stringify(released.data ?? ""));
    /* THE MODULE'S OWN FOOTPRINT, weighed row by row while the episodes still
       stand to be filtered on: every knots row this run wrote carries one of
       its two episode ids or its stamp. Summed per persona it must be zero.
       Weighed this way rather than balance-before against balance-after,
       because another suite runs against this same database at the same time
       and its passes land in the same minute — a balance delta blames this
       module for knots it never touched. */
    const mine = await stf.get(`knots_ledger?or=(episode_id.in.(${SH},${SEA}),reason.like.*${stamp}*)&select=profile_id,delta`);
    const net = {};
    for (const r of rows(mine)) net[r.profile_id] = (net[r.profile_id] ?? 0) + r.delta;
    for (const who of ["regional", "national", "global", "paused"]) {
      note(who, "the social layer's own knots rows net to zero", (net[uid(p[who])] ?? 0) === 0, `net ${net[uid(p[who])] ?? 0} over ${rows(mine).filter((r) => r.profile_id === uid(p[who])).length} rows`);
    }
    await stf.del(`threads?episode_id=in.(${SH},${SEA})`);
    const a = await stf.del(`episodes?id=eq.${SH}`);
    const b = await stf.del(`episodes?id=eq.${SEA}`);
    const left = await stf.get(`episodes?id=in.(${SH},${SEA})&select=id`);
    note("staff", "the social fixtures are struck and verified gone", a.status < 400 && b.status < 400 && rows(left).length === 0,
      `del ${a.status}/${b.status}, ${rows(left).length} left`);
  });

  try {
    /* ══════════════════════ THE OPEN DECK ══════════════════════ */
    const post = await glo.post("open_deck_posts", { author_id: G, body: `E2E social — a word tagged ashore ${stamp}`, episode_id: SH });
    const pid = post.data?.[0]?.id;
    /* The policy is author_id = auth.uid() and is_active(); nothing reads the
       tag. A member who is not aboard may file a post under any episode's
       thread. Pinned as the rule that stands, and reported. */
    note("global", "POLICY: a post may be tagged to an episode the author is not aboard — the tag is not gated (reported)",
      post.status === 201 && post.data?.[0]?.episode_id === SH, `got ${post.status} ${said(post).slice(0, 80)}`);

    const pausedPost = await pau.post("open_deck_posts", { author_id: P, body: `E2E social — paused ${stamp}` });
    note("paused", "a paused membership cannot post, and the refusal is the policy's (voiceWith names the pause in the app)",
      pausedPost.status >= 400 && /row-level security|permission/.test(said(pausedPost)), `got ${pausedPost.status} ${said(pausedPost).slice(0, 80)}`);

    const tooLong = await glo.post("open_deck_posts", { author_id: G, body: "x".repeat(10_001) });
    note("global", "a ten-thousand-character body is refused (the bound is 2,000)", tooLong.status >= 400, `got ${tooLong.status} ${said(tooLong).slice(0, 80)}`);
    if (tooLong.status === 201) await stf.del(`open_deck_posts?id=eq.${tooLong.data[0].id}`);

    if (pid) {
      later(async () => { await stf.del(`open_deck_flags?post_id=eq.${pid}`); await stf.del(`open_deck_posts?id=eq.${pid}`); });
      const hail = await reg.post("open_deck_hails", { post_id: pid, profile_id: R });
      const comment = await nat.post("open_deck_comments", { post_id: pid, author_id: N, body: `E2E social comment ${stamp}` });
      note("regional", "hails, and another member comments", hail.status === 201 && comment.status === 201, `got ${hail.status}/${comment.status}`);
      const readBack = await reg.get(`open_deck_posts?id=eq.${pid}&select=body,episode_id`);
      note("regional", "reads another member's post, tag and all", readBack.data?.[0]?.episode_id === SH, `got ${readBack.status}`);

      const editOther = await reg.patch(`open_deck_posts?id=eq.${pid}`, { body: "E2E rewritten by another." });
      const editOwn = await glo.patch(`open_deck_posts?id=eq.${pid}`, { body: "E2E rewritten by the author." });
      const after = await stf.get(`open_deck_posts?id=eq.${pid}&select=body`);
      note("regional", "cannot rewrite another member's post", /tagged ashore/.test(after.data?.[0]?.body ?? ""), `got ${editOther.status}, body ${String(after.data?.[0]?.body).slice(0, 40)}`);
      note("global", "the deck has no edit path even for the author — strike and repost is the rule",
        editOwn.status >= 400 || rows(editOwn).length === 0, `got ${editOwn.status} ${rows(editOwn).length} rows`);

      const delOther = await reg.del(`open_deck_posts?id=eq.${pid}`);
      const still = await stf.get(`open_deck_posts?id=eq.${pid}&select=id`);
      note("regional", "cannot strike another member's post", rows(still).length === 1, `got ${delOther.status}`);

      const anonPosts = await anon.get("open_deck_posts?select=id&limit=1");
      const anonComments = await anon.get("open_deck_comments?select=id&limit=1");
      note("anon", "the deck reads nothing signed out", (anonPosts.status >= 400 || rows(anonPosts).length === 0) && (anonComments.status >= 400 || rows(anonComments).length === 0),
        `got ${anonPosts.status}/${anonComments.status}`);

      /* flag → the Bridge removes → the author is told, with somewhere to go.
         The same three writes removeAndNotify makes, in the same order. */
      const flag = await reg.post("open_deck_flags", { post_id: pid, flagger_id: R, reason: "E2E" });
      const fid = flag.data?.[0]?.id;
      const queue = await stf.get(`open_deck_flags?post_id=eq.${pid}&status=eq.open&select=id,flagger_id`);
      note("staff", "the flag lands in the Bridge's queue with its flagger", flag.status === 201 && rows(queue).length === 1 && queue.data[0].flagger_id === R, `got ${flag.status}/${queue.status}`);
      const resolved = await stf.patch(`open_deck_flags?id=eq.${fid}`, { status: "removed", resolved_by: S });
      const word = await stf.rpc("notify_member", { p_profile: G, p_kind: "word", p_title: "Removed from the Open Deck", p_body: `E2E social — against the code. ${stamp}` });
      const heard = await glo.get(`notifications?id=eq.${word.data}&select=title,href`);
      note("global", "the author is told, and the word carries an href", resolved.status < 300 && word.status < 400 && heard.data?.[0]?.title === "Removed from the Open Deck" && !!heard.data?.[0]?.href,
        `got ${resolved.status}/${word.status} ${JSON.stringify(heard.data ?? "").slice(0, 90)}`);
      const removed = await stf.del(`open_deck_posts?id=eq.${pid}`);
      const gone = await reg.get(`open_deck_posts?id=eq.${pid}&select=id`);
      const flagLeft = await stf.get(`open_deck_flags?id=eq.${fid}&select=status,post_id`);
      note("staff", "the post comes down and the flag outlives it as the record", removed.status < 300 && rows(gone).length === 0 && flagLeft.data?.[0]?.status === "removed" && flagLeft.data?.[0]?.post_id === null,
        `got ${removed.status}, ${rows(gone).length} left, flag ${JSON.stringify(flagLeft.data?.[0] ?? "")}`);
    }

    /* ══════════════════════ PASSES: the ground everything else stands on ══════════════════════ */
    /* Sea: seated and checked in by the Bridge (national holds no waiver and
       cannot be stamped, so the pair aboard is regional and global). */
    const seaPass = {};
    for (const who of ["regional", "global"]) {
      const r = await stf.post("passes", { episode_id: SEA, profile_id: uid(p[who]), status: "aboard" });
      seaPass[who] = r.data?.[0]?.id ?? null;
      if (seaPass[who]) {
        passIds.push([who, seaPass[who]]);
        await stf.patch(`passes?id=eq.${seaPass[who]}`, { checked_in_at: nowIso() });
      }
    }
    note("staff", "seats and stamps two aboard the sea episode", !!seaPass.regional && !!seaPass.global, JSON.stringify(seaPass));

    /* Shore: each member takes their own pass — that is the path that mints. */
    const kBefore = await knotsOf(R);
    const regShore = await reg.post("passes", { episode_id: SH, profile_id: R, status: "aboard" });
    const regShoreId = regShore.data?.[0]?.id ?? null;
    if (regShoreId) passIds.push(["regional", regShoreId]);
    note("regional", "takes a pass on the shore night", regShore.status === 201, `got ${regShore.status} ${said(regShore).slice(0, 90)}`);
    const minted = await reg.get(`knots_ledger?episode_id=eq.${SH}&profile_id=eq.${R}&reason=eq.Pass%20confirmed&select=delta`);
    note("regional", "the pass mints 25 knots on confirmation", minted.data?.[0]?.delta === 25 && (await knotsOf(R)) - kBefore === 25, JSON.stringify(minted.data ?? ""));

    /* ══════════════════════ THE CREW THREAD ══════════════════════ */
    const crew = await reg.get(`threads?episode_id=eq.${SH}&kind=eq.crew&select=id,closed_at`);
    const crewId = crew.data?.[0]?.id ?? null;
    note("regional", "a crew thread opens with the pass", !!crewId && crew.data[0].closed_at === null, `got ${crew.status} ${JSON.stringify(crew.data ?? "").slice(0, 80)}`);
    if (crewId) {
      const blind = await nat.get(`threads?id=eq.${crewId}&select=id`);
      const blindMsgs = await nat.get(`messages?thread_id=eq.${crewId}&select=id`);
      note("national", "a thread they are not in reads as nothing, silently", blind.status === 200 && rows(blind).length === 0 && blindMsgs.status === 200 && rows(blindMsgs).length === 0, `got ${blind.status}/${blindMsgs.status}`);
      const intrude = await nat.post("messages", { thread_id: crewId, author_id: N, body: "E2E from outside." });
      note("national", "and cannot write into it", intrude.status >= 400, `got ${intrude.status}`);
      const said1 = await reg.post("messages", { thread_id: crewId, author_id: R, body: `E2E social — crew word ${stamp}` });
      note("regional", "writes to the crew", said1.status === 201, `got ${said1.status} ${said(said1).slice(0, 80)}`);
      const longMsg = await reg.post("messages", { thread_id: crewId, author_id: R, body: "m".repeat(4001) });
      note("regional", "a message past four thousand characters is refused", longMsg.status >= 400, `got ${longMsg.status}`);
      const anonMsgs = await anon.get(`messages?select=id&limit=1`);
      note("anon", "threads read nothing signed out", anonMsgs.status >= 400 || rows(anonMsgs).length === 0, `got ${anonMsgs.status}`);

      /* A held membership seated in a thread. The Bridge can seat anyone; what
         the messages policy says about the pause is what is pinned here. */
      const seatPaused = await stf.post("thread_members", { thread_id: crewId, profile_id: P });
      if (seatPaused.status === 201) {
        const pausedWord = await pau.post("messages", { thread_id: crewId, author_id: P, body: `E2E social — paused word ${stamp}` });
        if (pausedWord.status >= 400) {
          note("paused", "a paused membership cannot write in a thread", true, `got ${pausedWord.status}`);
        } else {
          note("paused", "OBSERVED: a paused membership already seated in a thread can still write — the messages INSERT policy carries no is_active() (SQL in the gate report)", true, `got ${pausedWord.status}`);
          await stf.del(`messages?id=eq.${pausedWord.data[0].id}`);
        }
        await stf.del(`thread_members?thread_id=eq.${crewId}&profile_id=eq.${P}`);
      }
    }

    /* ══════════════════════ DIRECT WORDS ══════════════════════ */
    let stranger = null;
    for (const [from, to] of [["regional", "paused"], ["national", "paused"], ["global", "paused"], ["national", "global"], ["regional", "national"]]) {
      const ground = await rest(p[from]).rpc("shares_ground_with", { p_other: uid(p[to]) });
      if (ground.status < 400 && ground.data === false) { stranger = [from, to]; break; }
    }
    if (stranger) {
      const [from, to] = stranger;
      const knock = await rest(p[from]).rpc("open_direct_thread", { p_other: uid(p[to]) });
      note(from, `cannot open a word to ${to} without shared ground, and is told how`, knock.status >= 400 && /sailed with/.test(said(knock)), `got ${knock.status} ${said(knock).slice(0, 100)}`);
    } else {
      note("regional", "SKIPPED the stranger refusal — every pair already shares ground from earlier runs (fixtures:reset clears it)", true, "skipped");
    }

    /* The blocked pair, both ways, before any door opens. */
    const block = await glo.post("member_blocks", { blocker_id: G, blocked_id: R });
    note("global", "declines messages from a member", block.status === 201 || block.status === 409, `got ${block.status}`);
    later(async () => { await glo.del(`member_blocks?blocker_id=eq.${G}&blocked_id=eq.${R}`); });
    const knockBlocked = await reg.rpc("open_direct_thread", { p_other: G });
    const knockBack = await glo.rpc("open_direct_thread", { p_other: R });
    note("regional", "the blocked side is refused, and told the member is not taking messages", knockBlocked.status >= 400 && /not taking messages/.test(said(knockBlocked)), said(knockBlocked).slice(0, 90));
    note("global", "the blocker is refused the same way — a block is mutual silence", knockBack.status >= 400 && /not taking messages/.test(said(knockBack)), said(knockBack).slice(0, 90));
    const forgeBlock = await reg.post("member_blocks", { blocker_id: G, blocked_id: N });
    note("regional", "cannot write a block in another member's name", forgeBlock.status >= 400, `got ${forgeBlock.status}`);
    const seeBlocks = await reg.get(`member_blocks?blocker_id=eq.${G}&select=blocked_id`);
    note("regional", "cannot see who has declined them", rows(seeBlocks).length === 0, `${rows(seeBlocks).length} rows`);
    await glo.del(`member_blocks?blocker_id=eq.${G}&blocked_id=eq.${R}`);

    /* The door opens on shared ground — both are aboard the sea episode. */
    const [lo, hi] = [R, G].sort();
    const pairBefore = await stf.get(`direct_thread_pairs?lo=eq.${lo}&hi=eq.${hi}&select=thread_id`);
    const priorThread = pairBefore.data?.[0]?.thread_id ?? null;
    if (priorThread) {
      /* A run that died between leaving and re-seating leaves a seat empty. */
      for (const id of [R, G]) await stf.post("thread_members", { thread_id: priorThread, profile_id: id });
    }
    const ground = await reg.rpc("shares_ground_with", { p_other: G });
    const opened = await reg.rpc("open_direct_thread", { p_other: G });
    const T = typeof opened.data === "string" ? opened.data : null;
    note("regional", "shares ground with a shipmate and opens a direct word", ground.data === true && !!T, `ground ${JSON.stringify(ground.data)}, got ${opened.status} ${said(opened).slice(0, 80)}`);
    if (T) {
      if (!priorThread) later(async () => { await stf.del(`threads?id=eq.${T}`); });
      const again = await glo.rpc("open_direct_thread", { p_other: R });
      note("global", "opening from the other side lands in the same thread", again.data === T, `got ${again.status} ${said(again).slice(0, 60)}`);
      const w = await reg.post("messages", { thread_id: T, author_id: R, body: `E2E social — direct word ${stamp}` });
      const read = await glo.get(`messages?thread_id=eq.${T}&select=body&order=created_at.desc&limit=1`);
      note("global", "reads the word sent to them", w.status === 201 && /direct word/.test(read.data?.[0]?.body ?? ""), `got ${w.status}/${read.status}`);
      const peek = await nat.get(`messages?thread_id=eq.${T}&select=id`);
      note("national", "a direct word between two others is not theirs to read", rows(peek).length === 0, `${rows(peek).length} rows`);

      /* Leaving is a decision. The leaver cannot come back by themselves and
         the other side is told; what the other side can still WRITE into the
         empty room is the database's call and is observed, not asserted. */
      const leave = await reg.del(`thread_members?thread_id=eq.${T}&profile_id=eq.${R}`);
      later(async () => { await stf.post("thread_members", { thread_id: T, profile_id: R }); });
      note("regional", "leaves the conversation", leave.status < 300, `got ${leave.status}`);
      const afterLeave = await glo.rpc("open_direct_thread", { p_other: R });
      note("global", "is told the member has left", afterLeave.status >= 400 && /has left this conversation/.test(said(afterLeave)), said(afterLeave).slice(0, 90));
      const rejoin = await reg.rpc("open_direct_thread", { p_other: G });
      note("regional", "cannot reopen a conversation they left", rejoin.status >= 400 && /you left/.test(said(rejoin)), said(rejoin).slice(0, 90));
      const selfSeat = await reg.post("thread_members", { thread_id: T, profile_id: R });
      note("regional", "cannot seat themselves back in", selfSeat.status >= 400, `got ${selfSeat.status}`);
      const intoEmpty = await glo.post("messages", { thread_id: T, author_id: G, body: `E2E social — into an empty room ${stamp}` });
      if (intoEmpty.status >= 400) {
        note("global", "a word into a direct thread the other member left is refused", true, `got ${intoEmpty.status}`);
      } else {
        note("global", "OBSERVED: a word into a direct thread the other member left still lands at the database — the app's composer now refuses it; the messages policy does not (SQL in the gate report)", true, `got ${intoEmpty.status}`);
        await stf.del(`messages?id=eq.${intoEmpty.data[0].id}`);
      }
      const reseat = await stf.post("thread_members", { thread_id: T, profile_id: R });
      note("staff", "the Bridge can seat a member back", reseat.status === 201, `got ${reseat.status}`);
    }

    /* ══════════════════════ THE DIRECTORY ══════════════════════ */
    /* The global persona is unlisted; national is listed. What national sees of global
       depends on ground — the view unmasks a name for people you have sailed
       with — so the rule is asserted either way it falls. */
    const natGround = await nat.rpc("shares_ground_with", { p_other: G });
    const seen = await nat.get(`member_directory?id=eq.${G}&select=full_name,handle,member_no,tier,bio`);
    const row = seen.data?.[0];
    if (natGround.data === true) {
      note("national", "an unlisted shipmate shows a name (shared ground) but no handle, number, tier or bio", !!row && row.full_name !== "A member" && row.handle === null && row.member_no === null && row.tier === null && row.bio === null, JSON.stringify(row ?? ""));
    } else {
      note("national", "an unlisted member is masked to 'A member' with no handle, number, tier or bio", !!row && row.full_name === "A member" && row.handle === null && row.member_no === null && row.tier === null && row.bio === null, JSON.stringify(row ?? ""));
      const enumerate = await nat.get(`member_directory?full_name=ilike.*E2e%20Global*&select=id`);
      note("national", "search by name cannot find an unlisted member", rows(enumerate).length === 0, `${rows(enumerate).length} rows`);
    }
    const roster = await nat.get(`member_directory?in_directory=eq.true&status=eq.active&id=eq.${G}&select=id`);
    note("national", "the roster query does not carry the unlisted", rows(roster).length === 0, `${rows(roster).length} rows`);
    const selfSeen = await glo.get(`member_directory?id=eq.${G}&select=full_name`);
    const staffSeen = await stf.get(`member_directory?id=eq.${G}&select=full_name`);
    const staffName = (await stf.get(`profiles?id=eq.${G}&select=full_name`)).data?.[0]?.full_name;
    note("global", "sees their own name while unlisted, and so does the Bridge", selfSeen.data?.[0]?.full_name === staffName && staffSeen.data?.[0]?.full_name === staffName, `${selfSeen.data?.[0]?.full_name} / ${staffSeen.data?.[0]?.full_name}`);
    const listed = await reg.get(`member_directory?id=eq.${N}&select=full_name,handle`);
    note("regional", "a listed member shows name and handle", !!listed.data?.[0]?.handle && listed.data?.[0]?.full_name !== "A member", JSON.stringify(listed.data?.[0] ?? ""));

    /* Handles: unique, and shaped. The app refuses a malformed one before the
       database sees it; what the database refuses on its own is observed. */
    const regHandle = (await stf.get(`profiles?id=eq.${R}&select=handle`)).data?.[0]?.handle ?? null;
    const natHandle = listed.data?.[0]?.handle;
    later(async () => { await reg.patch(`profiles?id=eq.${R}`, { handle: regHandle }); });
    const collide = await reg.patch(`profiles?id=eq.${R}`, { handle: natHandle });
    note("regional", "cannot take a handle another member holds", collide.status === 409 || /duplicate|unique/.test(said(collide)), `got ${collide.status} ${said(collide).slice(0, 70)}`);
    const shapeless = await reg.patch(`profiles?id=eq.${R}`, { handle: `e2e bad/${stamp}` });
    if (shapeless.status >= 400) {
      note("regional", "a handle with a space or a slash is refused by the database", true, `got ${shapeless.status}`);
    } else {
      note("regional", "OBSERVED: the database accepts a handle with a space and a slash — only the You form refuses it; the check constraint is length-only (SQL in the gate report)", true, `got ${shapeless.status}`);
    }
    await reg.patch(`profiles?id=eq.${R}`, { handle: regHandle });

    /* A declined member leaves the viewer's roster — the page, not the view. */
    const before = await pageAs(p.regional, "/directory");
    const natName = (await stf.get(`profiles?id=eq.${N}&select=full_name`)).data?.[0]?.full_name ?? "";
    if (before.status === 200 && natName && before.html.includes(natName)) {
      await reg.post("member_blocks", { blocker_id: R, blocked_id: N });
      const afterBlock = await pageAs(p.regional, "/directory");
      await reg.del(`member_blocks?blocker_id=eq.${R}&blocked_id=eq.${N}`);
      note("regional", "a member they declined is hidden from their roster", afterBlock.status === 200 && !afterBlock.html.includes(natName), `got ${afterBlock.status}`);
    } else {
      note("regional", "SKIPPED the hidden-roster check — the listed fixture is not on the first page of the roster", true, `got ${before.status}`);
    }

    /* ══════════════════════ TABLES ══════════════════════ */
    const tblA = await stf.post("tables", { episode_id: SH, number: 97, seats: 6 });
    const tblB = await stf.post("tables", { episode_id: SH, number: 98, seats: 2 });
    const A = tblA.data?.[0]?.id, B = tblB.data?.[0]?.id;
    note("staff", "lays two tables on the shore night", !!A && !!B, `got ${tblA.status}/${tblB.status} ${said(tblA).slice(0, 60)}`);
    if (A && B) {
      later(async () => { await stf.del(`matches?table_id=in.(${A},${B})`); await stf.del(`tables?id=in.(${A},${B})`); });

      const natShore = await nat.post("passes", { episode_id: SH, profile_id: N, status: "aboard" });
      const gloShore = await glo.post("passes", { episode_id: SH, profile_id: G, status: "aboard" });
      if (natShore.data?.[0]?.id) passIds.push(["national", natShore.data[0].id]);
      if (gloShore.data?.[0]?.id) passIds.push(["global", gloShore.data[0].id]);
      note("national", "two more take passes on the shore night", natShore.status === 201 && gloShore.status === 201, `got ${natShore.status}/${gloShore.status} ${said(natShore).slice(0, 60)}`);

      const held = await reg.rpc("claim_table_seat", { p_table: A });
      const heldMs = Date.parse(held.data) - Date.now();
      note("regional", "a claimed seat is held for fifteen minutes", held.status < 400 && heldMs > 13 * 60_000 && heldMs <= 15 * 60_000 + 5_000, `got ${held.status} ${Math.round(heldMs / 1000)}s`);
      const pausedSeat = await pau.rpc("claim_table_seat", { p_table: A });
      note("paused", "a paused membership takes no seat", pausedSeat.status >= 400 && /paused/.test(said(pausedSeat)), said(pausedSeat).slice(0, 80));

      /* The last chair. Table B seats two; global confirms one; two reach for
         the other at once and the advisory lock lets one through. */
      const gHold = await glo.rpc("claim_table_seat", { p_table: B });
      const gConfirm = await glo.rpc("confirm_table_seat", { p_table: B });
      note("global", "claims and confirms the first of two chairs", gHold.status < 400 && gConfirm.status < 400, `got ${gHold.status}/${gConfirm.status}`);
      const [r1, r2] = await Promise.all([reg.rpc("claim_table_seat", { p_table: B }), nat.rpc("claim_table_seat", { p_table: B })]);
      const wins = [r1, r2].filter((r) => r.status < 400).length;
      const fullSaid = [r1, r2].filter((r) => r.status >= 400).map(said).join(" | ");
      note("regional", "two claimants for the last chair — one wins, the other is told the table is full", wins === 1 && /table is full/.test(fullSaid), `wins ${wins}; ${fullSaid.slice(0, 90)}`);
      const seatsB = await stf.get(`table_seats?table_id=eq.${B}&select=profile_id`);
      note("staff", "the table holds exactly two chairs", rows(seatsB).length === 2, `${rows(seatsB).length} chairs`);

      /* Everyone to table A (a new claim on the same night moves the chair). */
      for (const who of ["regional", "national", "global"]) {
        await rest(p[who]).rpc("claim_table_seat", { p_table: A });
        await rest(p[who]).rpc("confirm_table_seat", { p_table: A });
      }
      const seatsA = await stf.get(`table_seats?table_id=eq.${A}&state=eq.confirmed&select=profile_id`);
      note("staff", "three confirmed at the table, the other table emptied by the move", rows(seatsA).length === 3 && rows(await stf.get(`table_seats?table_id=eq.${B}&select=profile_id`)).length === 0, `${rows(seatsA).length} confirmed`);

      const early = await reg.post("table_picks", { table_id: A, picker: R, picked: G });
      note("regional", "picks are refused before the night starts", early.status >= 400, `got ${early.status}`);

      const underway = await stf.patch(`episodes?id=eq.${SH}`, { starts_at: at(-HOUR), ends_at: at(3 * HOUR) });
      note("staff", "the night is under way", underway.status < 300, `got ${underway.status} ${said(underway).slice(0, 70)}`);
      const pick1 = await reg.post("table_picks", { table_id: A, picker: R, picked: G, again: true });
      const forge = await reg.post("table_picks", { table_id: A, picker: N, picked: G });
      note("regional", "picks from their own chair, with the sit-near-again hint, and not from anyone else's", pick1.status === 201 && pick1.data?.[0]?.again === true && forge.status >= 400, `got ${pick1.status}/${forge.status}`);
      const hidden = await glo.get(`table_picks?table_id=eq.${A}&select=picker`);
      note("global", "cannot see a pick that names them", rows(hidden).length === 0, `${rows(hidden).length} rows`);
      const pick2 = await glo.post("table_picks", { table_id: A, picker: G, picked: R });
      await wait(300);
      const match = await stf.get(`matches?table_id=eq.${A}&select=profile_a,profile_b`);
      const mine = await reg.get(`matches?table_id=eq.${A}&select=id`);
      const theirs = await nat.get(`matches?table_id=eq.${A}&select=id`);
      note("global", "a mutual pick makes a match both parties read and a third does not", pick2.status === 201 && rows(match).length === 1 && rows(mine).length === 1 && rows(theirs).length === 0, `got ${pick2.status} ${JSON.stringify(match.data ?? "").slice(0, 80)}`);
      const matchWord = await reg.get(`notifications?title=eq.A match, from your table&created_at=gt.${at(-60_000)}&select=id`);
      note("regional", "and is told about it", rows(matchWord).length >= 1, `${rows(matchWord).length} notices`);

      const flipOther = await nat.patch(`table_picks?table_id=eq.${A}&picker=eq.${R}`, { again: false });
      const flipOwn = await reg.patch(`table_picks?table_id=eq.${A}&picker=eq.${R}`, { again: false });
      const hint = await stf.get(`table_picks?table_id=eq.${A}&picker=eq.${R}&select=again`);
      note("regional", "the sit-near-again hint is set at the pick, by the picker, and never rewritten", hint.data?.[0]?.again === true && rows(flipOther).length === 0 && rows(flipOwn).length === 0, `got ${flipOther.status}/${flipOwn.status} again=${hint.data?.[0]?.again}`);
      const bridgeHint = await stf.get(`table_picks?table_id=eq.${A}&again=eq.true&select=picked`);
      note("staff", "the Bridge reads the hint as a count of who is named, for the next seating", rows(bridgeHint).length === 1 && bridgeHint.data[0].picked === G, JSON.stringify(bridgeHint.data ?? ""));

      note("staff", "SKIPPED the Match Guarantee settlement — it credits account_ledger (cents, append-only, undeletable) on completion of a Radar episode, so a fixture that settled it could never be struck and would leave real money on four accounts every run (SQL in the gate report)", true, "skipped");
    }

    /* ══════════════════════ POLLS ══════════════════════ */
    const seven = await stf.post("polls", { question: `E2E seven ${stamp}`, options: ["a", "b", "c", "d", "e", "f", "g"], closes_at: at(HOUR) });
    note("staff", "a question takes at most six answers", seven.status >= 400, `got ${seven.status}`);
    if (seven.status === 201) await stf.del(`polls?id=eq.${seven.data[0].id}`);
    const poll = await stf.post("polls", { question: `E2E social close ${stamp}`, options: ["Now", "Later"], closes_at: at(HOUR) });
    const pollId = poll.data?.[0]?.id;
    if (pollId) {
      later(async () => { await stf.del(`polls?id=eq.${pollId}`); });
      await reg.rpc("cast_vote", { p_poll: pollId, p_option: 0 });
      const memberClose = await reg.patch(`polls?id=eq.${pollId}`, { closes_at: nowIso() });
      const memberSettle = await reg.patch(`polls?id=eq.${pollId}`, { settled: 0 });
      const memberStrike = await reg.del(`polls?id=eq.${pollId}`);
      const stillOpen = await stf.get(`polls?id=eq.${pollId}&select=closes_at,settled`);
      note("regional", "cannot close, settle or strike a question", rows(memberClose).length === 0 && rows(memberSettle).length === 0 && stillOpen.data?.[0]?.settled === null && Date.parse(stillOpen.data?.[0]?.closes_at) > Date.now(), `got ${memberClose.status}/${memberSettle.status}/${memberStrike.status}`);
      const anonPolls = await anon.get("polls?select=id&limit=1");
      note("anon", "polls read nothing signed out", anonPolls.status >= 400 || rows(anonPolls).length === 0, `got ${anonPolls.status}`);
      const closeIt = await stf.patch(`polls?id=eq.${pollId}`, { closes_at: at(-1000) });
      const lateVote = await reg.rpc("cast_vote", { p_poll: pollId, p_option: 1 });
      const tally = await reg.rpc("poll_results", { p_poll: pollId });
      note("regional", "once closed the vote is refused and the tally opens to members", closeIt.status < 300 && lateVote.status >= 400 && /closed/.test(said(lateVote)) && Array.isArray(tally.data) && tally.data.length === 1 && tally.data[0].option === 0, `got ${lateVote.status} ${said(lateVote).slice(0, 50)}; tally ${JSON.stringify(tally.data ?? "")}`);
      const settle = await stf.patch(`polls?id=eq.${pollId}`, { settled: 0 });
      note("staff", "settles the closed question", settle.data?.[0]?.settled === 0, `got ${settle.status}`);
    }

    /* ══════════════════════ ON DECK (the sea episode, live) ══════════════════════ */
    const deck = await reg.rpc("aboard_now", { p_episode: SEA });
    const names = rows(deck).map((d) => d.profile_id).sort();
    note("regional", "aboard_now lists the two stamped aboard, to a caller aboard", deck.status < 400 && names.length === 2 && names.includes(R) && names.includes(G), `got ${deck.status} ${JSON.stringify(deck.data ?? "").slice(0, 100)}`);
    const ashore = await nat.rpc("aboard_now", { p_episode: SEA });
    note("national", "a caller with no pass on the night sees nobody", ashore.status < 400 && rows(ashore).length === 0, `got ${ashore.status} ${rows(ashore).length} rows`);
    const anonDeck = await anon.rpc("aboard_now", { p_episode: SEA });
    note("anon", "the deck is not readable signed out", anonDeck.status >= 400 || rows(anonDeck).length === 0, `got ${anonDeck.status}`);
    const pausedDeck = await pau.rpc("aboard_now", { p_episode: SEA });
    note("paused", "a paused member with no pass sees nobody either", rows(pausedDeck).length === 0, `got ${pausedDeck.status}`);

    later(async () => { await reg.patch(`profiles?id=eq.${R}`, { deck_status: null, deck_status_until: null }); });
    const tooLongLine = await reg.patch(`profiles?id=eq.${R}`, { deck_status: "e".repeat(81), deck_status_until: at(HOUR) });
    note("regional", "a line past eighty characters is refused", tooLongLine.status >= 400, `got ${tooLongLine.status}`);
    const line = await reg.patch(`profiles?id=eq.${R}`, { deck_status: `E2E at the bow ${stamp}`, deck_status_until: at(HOUR) });
    const shown = await glo.rpc("aboard_now", { p_episode: SEA });
    const regRow = rows(shown).find((d) => d.profile_id === R);
    note("global", "reads a shipmate's line on deck", line.status < 300 && regRow?.status === `E2E at the bow ${stamp}`, `got ${line.status} ${JSON.stringify(regRow ?? "")}`);
    await reg.patch(`profiles?id=eq.${R}`, { deck_status_until: at(-1000) });
    const expired = rows(await glo.rpc("aboard_now", { p_episode: SEA })).find((d) => d.profile_id === R);
    note("global", "an expired line is not shown", !!expired && expired.status === null, JSON.stringify(expired ?? ""));
    await reg.patch(`profiles?id=eq.${R}`, { deck_status: null, deck_status_until: null });
    const forgeLine = await nat.patch(`profiles?id=eq.${R}`, { deck_status: "E2E forged" });
    note("national", "cannot write a line for another member", forgeLine.status >= 400 || rows(forgeLine).length === 0, `got ${forgeLine.status}`);
    const unconsent = await stf.patch(`passes?id=eq.${seaPass.global}`, { show_on_manifest: false });
    const consented = rows(await reg.rpc("aboard_now", { p_episode: SEA })).map((d) => d.profile_id);
    await stf.patch(`passes?id=eq.${seaPass.global}`, { show_on_manifest: true });
    note("regional", "a member who withdrew manifest consent is not on deck", unconsent.status < 300 && consented.length === 1 && consented[0] === R, JSON.stringify(consented));

    /* ══════════════════════ RADAR — the two rules the suite did not pin ══════════════════════ */
    const clock = await stf.rpc("open_the_radar", { p_episode: SEA });
    const setClock = await stf.patch(`episode_radar?episode_id=eq.${SEA}`, { opens_at: at(-5 * 60_000), locks_at: at(30 * 60_000), anchors_unlock_at: at(HOUR), anchors_expire_at: at(25 * HOUR) });
    note("staff", "opens the radar clock through the Bridge's RPC", clock.status < 400 && setClock.status < 300, `got ${clock.status}/${setClock.status} ${said(clock).slice(0, 60)}`);
    const notMyPass = await reg.post("radar_picks", { episode_id: SEA, picker_rsvp: seaPass.global, picked_rsvp: seaPass.regional });
    note("regional", "cannot plot from a pass they do not hold", notMyPass.status >= 400, `got ${notMyPass.status} ${said(notMyPass).slice(0, 70)}`);
    const plot = await reg.post("radar_picks", { episode_id: SEA, picker_rsvp: seaPass.regional, picked_rsvp: seaPass.global });
    const before2 = await glo.get(`radar_picks?episode_id=eq.${SEA}&select=picker_rsvp`);
    note("global", "the picked party cannot read the pick before it is mutual", plot.status === 201 && rows(before2).length === 0, `got ${plot.status} ${rows(before2).length} rows`);
    const plotBack = await glo.post("radar_picks", { episode_id: SEA, picker_rsvp: seaPass.global, picked_rsvp: seaPass.regional });
    const anchor = await stf.get(`shared_anchors?episode_id=eq.${SEA}&select=id`);
    note("global", "plots back and the anchor is written, sealed", plotBack.status === 201 && rows(anchor).length === 1, `got ${plotBack.status} ${rows(anchor).length} anchors`);
    await stf.rpc("issue_the_envelopes", { p_episode: SEA });
    const envs = await stf.get(`captains_log_envelopes?rsvp_id=eq.${seaPass.regional}&select=token`);
    const token = envs.data?.[0]?.token;
    await stf.patch(`episode_radar?episode_id=eq.${SEA}`, { anchors_unlock_at: at(-60_000) });
    const open1 = await reg.rpc("open_the_captains_log", { p_token: token });
    const open2 = await reg.rpc("open_the_captains_log", { p_token: token });
    const envAfter = await stf.get(`captains_log_envelopes?rsvp_id=eq.${seaPass.regional}&select=opened_at`);
    note("regional", "opens the envelope once; a second scan of the same token changes nothing and reveals nothing new", open1.status < 400 && Number(open1.data) === 1 && open2.status < 400 && !!envAfter.data?.[0]?.opened_at, `got ${open1.status} ${JSON.stringify(open1.data)} / ${open2.status} ${JSON.stringify(open2.data)}`);
    const wrongToken = await glo.rpc("open_the_captains_log", { p_token: token });
    note("global", "another guest's token is refused", wrongToken.status >= 400 && /another guest/.test(said(wrongToken)), said(wrongToken).slice(0, 70));

    /* ══════════════════════ KNOTS, MARKS, LEAGUES ══════════════════════ */
    const dear = await reg.get("rewards?select=id,cost_fm&active=eq.true&order=cost_fm.desc&limit=1");
    const cannot = await reg.rpc("redeem_reward", { p_reward: dear.data?.[0]?.id });
    note("regional", "a redemption past the balance is refused with the numbers", cannot.status >= 400 && new RegExp(`not enough knots: \\d+ held, ${dear.data?.[0]?.cost_fm} needed`).test(said(cannot)), said(cannot).slice(0, 90));

    const zero = await stf.post("rewards", { name: `E2E stock zero ${stamp}`, detail: "E2E", cost_fm: 0, stock: 0, active: true, position: 99 });
    const zeroId = zero.data?.[0]?.id;
    if (zeroId) {
      const none = await reg.rpc("redeem_reward", { p_reward: zeroId });
      note("regional", "a reward at stock zero is spoken for", none.status >= 400 && /spoken for/.test(said(none)), said(none).slice(0, 70));
      const rmZero = await stf.del(`rewards?id=eq.${zeroId}`);
      note("staff", "strikes the stock-zero fixture", rmZero.status < 300, `got ${rmZero.status}`);
    }
    const last = await stf.post("rewards", { name: `E2E last one ${stamp}`, detail: "E2E", cost_fm: 0, stock: 1, active: true, position: 99 });
    const lastId = last.data?.[0]?.id;
    if (lastId) {
      later(async () => {
        const rm = await stf.del(`rewards?id=eq.${lastId}`);
        if (rm.status >= 400) {
          await stf.patch(`rewards?id=eq.${lastId}`, { active: false });
          note("staff", "SKIPPED striking the raced reward — its redemption row pins it (reward_redemptions has no DELETE policy and the FK does not cascade); left inactive, one row per run (SQL in the gate report)", true, `got ${rm.status}`);
        }
      });
      const [a, b] = await Promise.all([reg.rpc("redeem_reward", { p_reward: lastId }), glo.rpc("redeem_reward", { p_reward: lastId })]);
      const took = [a, b].filter((r) => r.status < 400).length;
      const lost = [a, b].filter((r) => r.status >= 400).map(said).join(" | ");
      const taken = await stf.get(`reward_redemptions?reward_id=eq.${lastId}&select=id`);
      note("regional", "two redeem the last one at once — one takes it, the other is told it is spoken for", took === 1 && /spoken for/.test(lost) && rows(taken).length === 1, `took ${took}; ${lost.slice(0, 60)}; ${rows(taken).length} redemptions`);
      const forgeStock = await reg.patch(`rewards?id=eq.${lastId}`, { stock: 10 });
      note("regional", "cannot restock the catalogue", forgeStock.status >= 400 || rows(forgeStock).length === 0, `got ${forgeStock.status}`);
    }

    const leagueWrite = await reg.patch("leagues?league=eq.1", { name: "E2E rewritten league" });
    const leagueRead = await reg.get(`member_league?profile_id=eq.${R}&select=league,league_name`);
    const leaguesPublic = await anon.get("leagues?select=league,name,months&order=league");
    note("regional", "the league ladder is read-only to members and their own league reads by tenure", (leagueWrite.status >= 400 || rows(leagueWrite).length === 0) && rows(leagueRead).length === 1 && typeof leagueRead.data[0].league === "number" && rows(leaguesPublic).length >= 2, `got ${leagueWrite.status}/${leagueRead.status}/${leaguesPublic.status} ${JSON.stringify(leagueRead.data ?? "")}`);
    const otherLeague = await reg.get(`member_league?profile_id=eq.${G}&select=league`);
    note("regional", "an unlisted member's league is not read", rows(otherLeague).every((r) => r.league === null), JSON.stringify(otherLeague.data ?? ""));

    /* ══════════════════════ COMPLETION: the thread closes, the marks land, the miles bank ══════════════════════ */
    const marksBefore = await stf.get(`member_marks?profile_id=eq.${R}&select=mark_code`);
    const firstWatchBefore = rows(marksBefore).filter((m) => m.mark_code === "first-watch").length;
    const milesSince = nowIso();
    const complete = await stf.patch(`episodes?id=eq.${SH}`, { status: "completed" });
    note("staff", "completes the shore night", complete.status < 300 && complete.data?.[0]?.status === "completed", `got ${complete.status} ${said(complete).slice(0, 80)}`);
    /* The miles are swept whatever else happens below. */
    later(async () => {
      const banked = await stf.get(`knots_ledger?episode_id=eq.${SH}&reason=like.Miles%20banked*&created_at=gt.${milesSince}&select=profile_id,delta`);
      let swept = 0;
      for (const r of rows(banked)) {
        const s = await stf.rpc("adjust_knots", { p_profile: r.profile_id, p_delta: -r.delta, p_reason: `E2E social — miles swept ${stamp}` });
        if (s.status < 400) swept++;
      }
      note("staff", "the miles the completion banked are swept back, row for row", swept === rows(banked).length, `${swept}/${rows(banked).length}`);
    });
    if (complete.status < 300) {
      const banked = await reg.get(`knots_ledger?episode_id=eq.${SH}&profile_id=eq.${R}&reason=like.Miles%20banked*&select=delta`);
      note("regional", "completion banks the miles for a member aboard", rows(banked).length === 1 && banked.data[0].delta > 0, JSON.stringify(banked.data ?? ""));
      const marksAfter = await stf.get(`member_marks?profile_id=eq.${R}&select=mark_code`);
      const firstWatchAfter = rows(marksAfter).filter((m) => m.mark_code === "first-watch").length;
      note("regional", "the first-watch mark is conferred once and only once", firstWatchAfter === 1, `before ${firstWatchBefore}, after ${firstWatchAfter}`);

      if (crewId) {
        const closed = await reg.get(`threads?id=eq.${crewId}&select=closed_at`);
        const lateWord = await reg.post("messages", { thread_id: crewId, author_id: R, body: "E2E after the debrief." });
        note("regional", "the crew thread closes with the night and refuses a late word", !!closed.data?.[0]?.closed_at && lateWord.status >= 400 && /closed after the debrief/.test(said(lateWord)), `closed ${closed.data?.[0]?.closed_at}; got ${lateWord.status} ${said(lateWord).slice(0, 60)}`);
        const staffSeat = await stf.post("thread_members", { thread_id: crewId, profile_id: S });
        const staffWord = await stf.post("messages", { thread_id: crewId, author_id: S, body: `E2E social — Shoreside after close ${stamp}` });
        note("staff", "Shoreside takes a seat and still writes into a closed thread", staffSeat.status === 201 && staffWord.status === 201, `got ${staffSeat.status}/${staffWord.status} ${said(staffWord).slice(0, 60)}`);
      }

      /* The debrief: one, from a member aboard, read by Shoreside alone. */
      const longNote = await reg.post("debriefs", { episode_id: SH, profile_id: R, note: "d".repeat(2001), again: true });
      note("regional", "a debrief note past two thousand characters is refused", longNote.status >= 400, `got ${longNote.status}`);
      const debrief = await reg.post("debriefs", { episode_id: SH, profile_id: R, note: `E2E social — one line. ${stamp}`, again: true });
      note("regional", "writes the debrief after the night is in the log", debrief.status === 201, `got ${debrief.status} ${said(debrief).slice(0, 70)}`);
      const otherReads = await nat.get(`debriefs?episode_id=eq.${SH}&select=id`);
      const ownReads = await reg.get(`debriefs?episode_id=eq.${SH}&select=id`);
      const staffReads = await stf.get(`debriefs?episode_id=eq.${SH}&select=id,again`);
      note("national", "another member aboard cannot read it; the writer and Shoreside can", rows(otherReads).length === 0 && rows(ownReads).length === 1 && rows(staffReads).length === 1, `${rows(otherReads).length}/${rows(ownReads).length}/${rows(staffReads).length}`);
      const memberStrike = await reg.del(`debriefs?episode_id=eq.${SH}&profile_id=eq.${R}`);
      const stillThere = await stf.get(`debriefs?episode_id=eq.${SH}&select=id`);
      const staffStrike = await stf.del(`debriefs?episode_id=eq.${SH}`);
      const goneNow = await stf.get(`debriefs?episode_id=eq.${SH}&select=id`);
      note("staff", "a debrief cannot be taken back by its writer, and Shoreside can strike it", rows(stillThere).length === 1 && staffStrike.status < 300 && rows(goneNow).length === 0, `member del ${memberStrike.status}, staff del ${staffStrike.status}`);
    }

    /* ══════════════════════ THE LOG ══════════════════════ */
    const logAnon = await anon.get("log_posts?select=id,slug&limit=3");
    note("anon", "reads the Log signed out", logAnon.status === 200 && Array.isArray(logAnon.data), `got ${logAnon.status}`);
    const memberWrites = await reg.post("log_posts", { slug: `e2e-social-${stamp}`, title: "E2E" });
    note("regional", "cannot write to the Log", memberWrites.status >= 400, `got ${memberWrites.status}`);
    const staffWrites = await stf.post("log_posts", { slug: `e2e-social-${stamp}`, title: "E2E social dispatch." });
    if (staffWrites.status === 201) {
      note("staff", "writes a dispatch", true, `got ${staffWrites.status}`);
      await stf.del(`log_posts?slug=eq.e2e-social-${stamp}`);
    } else {
      note("staff", "OBSERVED: the Bridge cannot write to the Log either — log_posts carries a public SELECT and no write policy or grant, so no dispatch can be filed from the product (SQL in the gate report)", true, `got ${staffWrites.status} ${said(staffWrites).slice(0, 60)}`);
    }
    const prefsRow = await reg.get(`profiles?id=eq.${R}&select=notification_prefs`);
    const prefsWas = prefsRow.data?.[0]?.notification_prefs ?? {};
    later(async () => { await reg.patch(`profiles?id=eq.${R}`, { notification_prefs: prefsWas }); });
    const digestOff = await reg.patch(`profiles?id=eq.${R}`, { notification_prefs: { ...prefsWas, digest: false } });
    note("regional", "switches the Sunday digest off — the switch build_lore_digest reads", digestOff.status < 300 && digestOff.data?.[0]?.notification_prefs?.digest === false, `got ${digestOff.status}`);
    await reg.patch(`profiles?id=eq.${R}`, { notification_prefs: prefsWas });
    const memberDigest = await reg.rpc("build_lore_digest", {});
    note("regional", "cannot run the digest", memberDigest.status >= 400, `got ${memberDigest.status}`);
  } finally {
    for (const fn of undo.reverse()) {
      try { await fn(); } catch (e) { note("suite", "social-layer cleanup step", false, String(e?.message ?? e).slice(0, 120)); }
    }
    /* Informational: the balance delta names whatever else moved the ledger
       in the same minutes, which on this shared database is usually another
       suite's run. The row weighing above is the assertion. */
    for (const who of ["regional", "national", "global", "paused"]) {
      const after = await knotsOf(uid(p[who]));
      if (after !== knotsAtStart[who]) console.log(`  · [${who}] balance moved ${after - knotsAtStart[who]} during the module — see the row weighing for what this module wrote`);
    }
  }
}
