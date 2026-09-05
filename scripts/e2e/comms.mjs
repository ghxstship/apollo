/* Communications and automations — every event that queues a letter, a text,
   a push or a notice; every switch a member holds; every shape a rule can
   take; every audience a broadcast can name.

   Extends rulesOfSept4 (items 6, 7, 10, 11) and section L of the suite rather
   than repeating them: those prove the delayed queue, the marketing switch on
   bridge-word, push on/off for one notice, and an episode broadcast now and
   later. This module walks the event → letter matrix end to end against the
   fixture personas, whose addresses are all on *.invalid and whose numbers are
   all in the 555 exchange — the two BEFORE INSERT guards on the outboxes are
   the safety net, and every letter below is asserted `skipped` for that reason.

   Nothing here invokes a drain or a cron. Nothing reaches Resend or sent.dm.

   Declared footprint (staff read the outboxes but no policy lets anyone delete
   from them, and a member's Word is append-only): each run leaves skipped
   outbox rows addressed to the fixtures, and notices on the regional, national
   and global personas. fixtures:reset clears them. */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

/* Every red line here is a regression: the SQL faults this module first
   reported (the open dispatcher grant, the waitlist letter behind the notice
   switch, a rule naming a letter it cannot fill) were fixed on 2026-09-05 in
   a_rule_fires_from_the_bridge_alone_and_a_letter_lands_where_it_may. */

export async function run(p, ctx) {
  const { rest, note, uid, RUN_TOKEN } = ctx;
  const stf = rest(p.staff), reg = rest(p.regional), nat = rest(p.national), glo = rest(p.global), pau = rest(p.paused), anon = rest(null);
  const stamp = `${Date.now().toString(36)}${RUN_TOKEN}`;
  const said = (r) => String(r.data?.message ?? r.data?.hint ?? JSON.stringify(r.data ?? "")).toLowerCase();
  /* A moment ago, with a little slack for the two clocks. Every read that
     follows also names its template or title, so slack cannot let a stranger's
     row in. */
  const since = () => new Date(Date.now() - 1500).toISOString();
  const enc = encodeURIComponent;
  const ids = { regional: uid(p.regional), national: uid(p.national), global: uid(p.global), paused: uid(p.paused), staff: uid(p.staff) };

  /* ── the sender, parsed once: what each letter requires, what renders ── */
  const senderSrc = readFileSync(join(root, "supabase/functions/send-outbox/index.ts"), "utf8");
  const senderCode = senderSrc.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
  const rendered = new Set([...senderCode.matchAll(/^\s*"([a-z0-9-]+)":\s*\(p\)\s*=>/gm)].map((m) => m[1]));
  for (const m of senderCode.matchAll(/templates\["([a-z0-9-]+)"\]\s*=\s*templates\["([a-z0-9-]+)"\]/g)) rendered.add(m[1]);
  const REQUIRES = new Map();
  const reqBlock = senderCode.match(/const REQUIRES[^=]*=\s*\{([\s\S]*?)\n\};/);
  for (const m of (reqBlock?.[1] ?? "").matchAll(/"([a-z0-9-]+)":\s*\[([^\]]*)\]/g)) {
    REQUIRES.set(m[1], [...m[2].matchAll(/"([a-z_][a-z0-9_]*)"/g)].map((x) => x[1]));
  }
  note("staff", "the sender's REQUIRES map could be read", REQUIRES.size > 0, `${REQUIRES.size} letters require something`);

  /* ── A. templates: registry ↔ sender, texts end on a word ─────────────── */
  const registry = (await stf.get("email_templates?select=code,active")).data || [];
  const active = registry.filter((t) => t.active).map((t) => t.code);
  note("staff", "the letter registry is readable and populated", active.length > 0, `${active.length} active codes`);
  const unrenderable = active.filter((c) => !rendered.has(c));
  note("staff", "every registered letter has a body in the sender", unrenderable.length === 0, unrenderable.join(", ") || `${active.length} codes render`);
  const unlisted = [...rendered].filter((c) => !active.includes(c));
  note("staff", "every body in the sender is registered", unlisted.length === 0, unlisted.join(", ") || `${rendered.size} bodies`);
  const texts = (await stf.get("sms_templates?select=code,draft_body,parameter_map,active&active=is.true")).data || [];
  note("staff", "the text templates are readable", texts.length > 0, `${texts.length} texts`);
  for (const t of texts) {
    const body = String(t.draft_body ?? "").trim();
    note("staff", `text ${t.code} ends on a word, not a variable`, body.length > 0 && !/\}\}$/.test(body) && /[A-Za-z0-9][.!?)]?$/.test(body), body.slice(-40));
    const vars = [...body.matchAll(/\{\{\s*([a-z_]+)\s*\}\}/g)].map((m) => m[1]);
    const mapped = Object.keys(t.parameter_map ?? {});
    const orphan = vars.filter((v) => !mapped.includes(v));
    note("staff", `text ${t.code} names only variables its parameter_map fills`, orphan.length === 0, orphan.length ? `unfilled: ${orphan.join(", ")}` : vars.join(", "));
  }
  const memberTexts = await reg.get("sms_templates?select=code&limit=1");
  note("regional", "the text templates are the Bridge's to read", (memberTexts.data || []).length === 0, `got ${memberTexts.status}`);

  /* ── the suppression read path (code review — no policy lets us insert) ── */
  note("staff", "the sender reads email_suppressions before every batch",
    /async function suppressed\(/.test(senderCode) && /email_suppressions\?email=in\./.test(senderCode), "supabase/functions/send-outbox/index.ts");
  note("staff", "a suppressed address is marked skipped, never sent",
    /address suppressed/.test(senderCode) && /mark\(row, "skipped", `address suppressed/.test(senderCode), "deliver()");
  const suppressionTrigger = (await stf.get("email_suppressions?select=email&limit=1")).status;
  note("staff", "SKIPPED marking a suppressed address at insert — no trigger does it yet; the sender is the only gate (SQL proposed in the gate report)", suppressionTrigger < 400, `email_suppressions readable: ${suppressionTrigger}`);

  /* ── snapshot what this module changes on the personas ──────────────── */
  const snap = {};
  for (const who of ["regional", "national", "global", "staff"]) {
    const row = (await stf.get(`profiles?id=eq.${ids[who]}&select=email,full_name,phone,phone_verified,notification_prefs,plan_id,home_city`)).data?.[0];
    snap[who] = row;
  }
  note("staff", "the personas were read", !!snap.regional?.email && !!snap.national?.email && !!snap.global?.email, JSON.stringify(Object.fromEntries(Object.entries(snap).map(([k, v]) => [k, v?.email]))));
  const mail = (who) => snap[who]?.email;
  const PHONE = "+13055550142";

  /* Every read names the fixture it is about — the episode title in the
     payload, the exact notice title — because another suite may be booking
     the same personas on its own fixtures at the same moment, and a clock
     window alone would count its rows as ours. */
  const letters = async (email, template, from, extra = "") =>
    (await stf.get(`email_outbox?to_email=eq.${enc(email)}&template=eq.${template}&created_at=gt.${from}&select=id,status,last_error,payload&order=created_at.desc${extra}`)).data || [];
  const textsTo = async (phone, template, from, extra = "") =>
    (await stf.get(`sms_outbox?to_phone=eq.${enc(phone)}&template=eq.${template}&created_at=gt.${from}&select=id,status,last_error,payload&order=created_at.desc${extra}`)).data || [];
  const about = (title) => `&payload->>voyage=eq.${enc(title)}`;
  const pushes = async (who, from, extra = "") =>
    (await stf.get(`push_outbox?profile_id=eq.${ids[who]}&created_at=gt.${from}&select=id,title,url${extra}`)).data || [];
  const notices = async (who, from, extra = "") =>
    (await rest(p[who]).get(`notifications?created_at=gt.${from}&select=id,kind,title,href,body${extra}`)).data || [];

  /* One letter, with what it requires, a clock never without its zone, and
     skipped for the fixture reason. */
  const expectLetter = (who, label, rows, code, extraKeys = []) => {
    const r = rows[0];
    note(who, `${label}: the ${code} letter is queued once`, rows.length === 1, `${rows.length} rows`);
    if (!r) return;
    const keys = [...new Set([...(REQUIRES.get(code) ?? []), ...extraKeys])];
    const missing = keys.filter((k) => r.payload?.[k] === undefined || r.payload?.[k] === null || r.payload?.[k] === "");
    note(who, `${label}: ${code} carries ${keys.join(", ") || "what it needs (nothing required)"}`, missing.length === 0,
      missing.length ? `missing ${missing.join(", ")}` : `payload ${Object.keys(r.payload || {}).join(", ")}`);
    if (r.payload?.starts_at !== undefined) {
      note(who, `${label}: a letter with a clock on it carries the episode's zone`, typeof r.payload?.time_zone === "string" && r.payload.time_zone.length > 0, JSON.stringify(r.payload?.time_zone));
    }
    note(who, `${label}: a fixture address is skipped, and the row says so`, r.status === "skipped" && /fixture address/.test(r.last_error ?? ""), `${r.status} ${r.last_error}`);
  };
  const expectText = (who, label, rows, code, keys) => {
    const r = rows[0];
    note(who, `${label}: the ${code} text is queued once`, rows.length === 1, `${rows.length} rows`);
    if (!r) return;
    const missing = keys.filter((k) => r.payload?.[k] === undefined || r.payload?.[k] === null || r.payload?.[k] === "");
    note(who, `${label}: the ${code} text carries the keys its parameter_map reads (${keys.join(", ")})`, missing.length === 0,
      missing.length ? `missing ${missing.join(", ")}` : `payload ${Object.keys(r.payload || {}).join(", ")}`);
    note(who, `${label}: a fixture number is skipped, not sent`, r.status === "skipped" && /fixture number/.test(r.last_error ?? ""), `${r.status} ${r.last_error}`);
  };

  const raise = async (label, extra = {}) => {
    const v = await stf.post("episodes", {
      slug: `e2e-comms-${label}-${stamp}`, title: `E2E comms ${label} ${stamp}.`, setting: "sea", kind: "sea_day", sub_class: "passage",
      starts_at: new Date(Date.now() + 3 * 86400_000).toISOString(), time_zone: "America/Chicago", passes_total: 8, price_cents: 0,
      status: "scheduled", min_tier: "regional", muster: "E2E Muster", ...extra,
    });
    note("staff", `raises the ${label} fixture`, v.status === 201, `got ${v.status} ${said(v).slice(0, 100)}`);
    return v.data?.[0] ?? null;
  };
  const release = async (who, id) => {
    if (!id) return;
    await rest(p[who]).del(`passes?id=eq.${id}`);
    const left = await stf.get(`passes?id=eq.${id}&select=id`);
    if ((left.data || []).length) await stf.del(`passes?id=eq.${id}`);
  };

  const miami = (await stf.get("cities?slug=eq.miami&select=id,slug")).data?.[0];
  note("staff", "the chart has Miami", !!miami?.id, JSON.stringify(miami));

  const made = { episodes: [], rules: [], webhook: null, subscription: null, application: null, crew: null, appEmail: null, broadcasts: [] };
  let phoneSet = false;
  const prefsTouched = new Set();

  try {
    /* ── a verified fixture number on the regional persona, for every text ── */
    const setPhone = await reg.patch(`profiles?id=eq.${ids.regional}`, { phone: PHONE });
    const verify = await stf.rpc("verify_member_phone", { p_profile: ids.regional });
    phoneSet = setPhone.status < 300;
    note("staff", "the Bridge verifies the regional fixture's 555 number", setPhone.status < 300 && verify.status < 300, `got ${setPhone.status}/${verify.status} ${said(verify).slice(0, 80)}`);

    /* ── B. the rules, written before the first event ───────────────────── */
    const rule = async (label, body) => {
      const r = await stf.post("automations", { name: `E2E comms ${label} ${stamp}`, active: true, delay_minutes: 0, ...body });
      if (r.data?.[0]?.id) made.rules.push(r.data[0].id);
      return { id: r.data?.[0]?.id ?? null, res: r };
    };
    const R = {};
    R.any = await rule("any", { trigger_event: "pass_confirmed", conditions: {}, action: { kind: "notify", title: `E2E R-any ${stamp}`, body: "{member} — {episode}." } });
    R.tier = await rule("tier", { trigger_event: "pass_confirmed", conditions: { tier: "national" }, action: { kind: "notify", title: `E2E R-tier ${stamp}`, body: "{member} — {episode}." } });
    R.city = await rule("city", { trigger_event: "pass_confirmed", conditions: { city: "miami" }, action: { kind: "notify", title: `E2E R-city ${stamp}`, body: "{episode}." } });
    R.setting = await rule("setting", { trigger_event: "pass_confirmed", conditions: { setting: "shore" }, action: { kind: "notify", title: `E2E R-setting ${stamp}`, body: "{episode}." } });
    R.mail = await rule("mail", { trigger_event: "pass_confirmed", conditions: {}, action: { kind: "email", template: "weather-hold" } });
    R.mailNeedsCode = await rule("mail-code", { trigger_event: "pass_confirmed", conditions: {}, action: { kind: "email", template: "boarding-pass" } });
    R.mailBogus = await rule("mail-bogus", { trigger_event: "pass_confirmed", conditions: {}, action: { kind: "email", template: `e2e-no-such-letter-${stamp}` } });
    R.text = await rule("text", { trigger_event: "pass_confirmed", conditions: {}, action: { kind: "sms", template: "bridge-word", title: `E2E text ${stamp}`, body: "{episode} — a word by text." } });
    const hook = await stf.post("webhooks", { url: `https://e2e-comms-${stamp}.invalid/hook`, secret: `e2e-${stamp}`, events: [] });
    made.webhook = hook.data?.[0]?.id ?? null;
    note("staff", "registers a fixture webhook on a .invalid host", !!made.webhook, `got ${hook.status} ${said(hook).slice(0, 80)}`);
    R.hook = await rule("hook", { trigger_event: "pass_confirmed", conditions: {}, action: { kind: "webhook", webhook_id: made.webhook } });
    R.hold = await rule("hold", { trigger_event: "weather_hold", conditions: {}, action: { kind: "notify", title: `E2E R-hold ${stamp}`, body: "{episode} is held." } });
    R.done = await rule("done", { trigger_event: "voyage_completed", conditions: {}, action: { kind: "notify", title: `E2E R-done ${stamp}`, body: "{episode} is logged." } });
    R.dues = await rule("dues", { trigger_event: "dues_failed", conditions: {}, action: { kind: "notify", title: `E2E R-dues ${stamp}`, body: "{member}." } });
    R.duesMail = await rule("dues-mail", { trigger_event: "dues_failed", conditions: {}, action: { kind: "email", template: "dues-failed" } });
    note("staff", "writes the thirteen rules", Object.values(R).every((r) => !!r.id), Object.entries(R).filter(([, r]) => !r.id).map(([k, r]) => `${k}: ${r.res.status} ${said(r.res).slice(0, 60)}`).join("; "));

    const memberRules = await reg.get("automations?select=id&limit=1");
    note("regional", "cannot read the rules", (memberRules.data || []).length === 0, `got ${memberRules.status}`);
    const memberWrite = await reg.post("automations", { name: `E2E comms member ${stamp}`, trigger_event: "pass_confirmed", conditions: {}, action: { kind: "notify", title: "x", body: "x" } });
    note("regional", "cannot write a rule", memberWrite.status >= 400, `got ${memberWrite.status}`);
    if (memberWrite.status === 201) made.rules.push(memberWrite.data[0].id);
    const pausedRules = await pau.get("automations?select=id&limit=1");
    note("paused", "cannot read the rules either", (pausedRules.data || []).length === 0, `got ${pausedRules.status}`);

    /* ── C. pass_confirmed: the boarding pass and every rule shape ─────── */
    const main = await raise("main", { city_id: miami?.id ?? null });
    if (main) made.episodes.push(main.id);
    const noCity = await raise("nocity", { city_id: null });
    if (noCity) made.episodes.push(noCity.id);
    if (!main || !noCity) return;

    const t1 = since();
    const regAboard = await reg.post("passes", { episode_id: main.id, profile_id: ids.regional, status: "aboard" });
    /* The code is minted by an AFTER trigger, so the insert's own
       representation does not carry it; read the row back. */
    const regPass = regAboard.data?.[0]?.id ? (await stf.get(`passes?id=eq.${regAboard.data[0].id}&select=id,boarding_code`)).data?.[0] : null;
    note("regional", "boards the main fixture and is minted a code", regAboard.status === 201 && !!regPass?.boarding_code, `got ${regAboard.status} ${said(regAboard).slice(0, 100)}`);
    if (!regPass) return;

    /* The real pass carries a code; the email rule below queues the same
       template without one — the two are told apart by that key. */
    const realPass = `${about(main.title)}&payload->>code=not.is.null`;
    expectLetter("regional", "aboard", await letters(mail("regional"), "boarding-pass", t1, realPass), "boarding-pass", ["name", "starts_at", "time_zone", "muster"]);
    const bp = (await letters(mail("regional"), "boarding-pass", t1, realPass))[0];
    /* The fixture was raised on America/Chicago with a Miami city; the city's
       clock wins at insert (episode_takes_city_clock), so the letter's zone is
       whatever the episode now carries — asserted against the row, not the
       request. The city-less fixture below keeps the clock it was given. */
    note("regional", "aboard: the pass letter carries this pass's code and the episode's own clock",
      bp?.payload?.code === regPass.boarding_code && !!main.time_zone && bp?.payload?.time_zone === main.time_zone, JSON.stringify([bp?.payload?.code, bp?.payload?.time_zone, main.time_zone]));
    const aboardNotice = (await notices("regional", t1, `&kind=eq.manifest&title=like.*${enc(main.title)}*`))[0];
    note("regional", "aboard: the manifest notice has somewhere to go", aboardNotice?.href === "/passes", JSON.stringify(aboardNotice ?? "").slice(0, 120));
    const aboardPush = (await pushes("regional", t1, `&title=like.*${enc(main.title)}*`));
    note("regional", "aboard: the notice fans out to push once, carrying the destination", aboardPush.length === 1 && aboardPush[0].url === "/passes", JSON.stringify(aboardPush).slice(0, 120));

    /* Scoped to the episode the rule spoke about, so a rule firing on
       another suite's booking of the same persona is not counted here. */
    const fired = async (who, title, episodeTitle = null) =>
      (await rest(p[who]).get(`notifications?title=eq.${enc(title)}&select=id,body,href${episodeTitle ? `&body=like.*${enc(episodeTitle)}*` : ""}`)).data || [];
    const anyReg = await fired("regional", `E2E R-any ${stamp}`, main.title);
    note("regional", "a rule with no condition fires exactly once per event", anyReg.length === 1, `${anyReg.length} notices`);
    note("regional", "the rule substitutes the member and the episode, and the word has somewhere to go",
      anyReg.length === 1 && !/\{member\}|\{episode\}/.test(anyReg[0].body ?? "") && anyReg[0].href === "/inbox", JSON.stringify(anyReg[0] ?? "").slice(0, 120));
    note("regional", "a tier condition that does not match keeps the rule silent", (await fired("regional", `E2E R-tier ${stamp}`, main.title)).length === 0, "tier=national vs a regional booking");
    note("regional", "a city condition matches the episode's city", (await fired("regional", `E2E R-city ${stamp}`, main.title)).length === 1, "city=miami on a Miami episode");
    note("regional", "a setting condition that does not match keeps the rule silent", (await fired("regional", `E2E R-setting ${stamp}`, main.title)).length === 0, "setting=shore vs an episode afloat");

    const ruleMail = await letters(mail("regional"), "weather-hold", t1, `${about(main.title)}&payload->>episode=not.is.null`);
    expectLetter("regional", "an email rule", ruleMail, "weather-hold", ["name", "episode", "voyage"]);
    const needsCode = await letters(mail("regional"), "boarding-pass", t1, `${about(main.title)}&payload->>code=is.null`);
    const ruleRow = needsCode[0];
    note("regional", "an email rule naming a letter no rule can fill (boarding-pass needs a code) queues nothing — rule_can_send is false at the registry",
      !ruleRow, ruleRow ? `queued with ${Object.keys(ruleRow.payload || {}).join(", ")}` : "no code-less boarding pass queued");
    const bogus = (await stf.get(`email_outbox?template=eq.e2e-no-such-letter-${stamp}&select=id`)).data || [];
    note("staff", "an email rule naming an unregistered letter queues nothing", bogus.length === 0, `${bogus.length} rows`);
    const ruleText = await textsTo(PHONE, "bridge-word", t1, `&payload->>title=eq.${enc(`E2E text ${stamp}`)}&payload->>body=like.*${enc(main.title)}*`);
    expectText("regional", "a text rule", ruleText, "bridge-word", ["title", "body"]);
    note("regional", "a text rule substitutes the episode into its body", !!ruleText[0] && !/\{episode\}/.test(ruleText[0].payload?.body ?? ""), ruleText[0]?.payload?.body ?? "");
    const deliveries = (await stf.get(`webhook_deliveries?webhook_id=eq.${made.webhook}&payload->>episode_id=eq.${main.id}&select=event,payload`)).data || [];
    note("staff", "a webhook rule writes one delivery for the event, with the member and the episode in it",
      deliveries.length === 1 && deliveries[0].event === "automation.pass_confirmed" && deliveries[0].payload?.profile_id === ids.regional && deliveries[0].payload?.episode_id === main.id,
      JSON.stringify(deliveries).slice(0, 160));
    const memberDeliveries = await reg.get("webhook_deliveries?select=id&limit=1");
    note("regional", "deliveries are the Bridge's to read", (memberDeliveries.data || []).length === 0, `got ${memberDeliveries.status}`);
    const last = (await stf.get(`automations?id=eq.${R.any.id}&select=last_run_at`)).data?.[0];
    note("staff", "a fired rule records when it ran", !!last?.last_run_at, JSON.stringify(last));

    /* The tier rule fires for the national persona, once. */
    const natAboard = await nat.post("passes", { episode_id: main.id, profile_id: ids.national, status: "aboard" });
    note("national", "boards the main fixture", natAboard.status === 201, `got ${natAboard.status} ${said(natAboard).slice(0, 100)}`);
    note("national", "a tier condition matches the member's tier, once", (await fired("national", `E2E R-tier ${stamp}`, main.title)).length === 1, "tier=national");
    note("national", "and the unconditioned rule fires once for this event too", (await fired("national", `E2E R-any ${stamp}`, main.title)).length === 1, "");

    /* The city rule stays silent on an episode with no city. */
    const gloAboard = await glo.post("passes", { episode_id: noCity.id, profile_id: ids.global, status: "aboard" });
    note("global", "boards the fixture with no city", gloAboard.status === 201, `got ${gloAboard.status} ${said(gloAboard).slice(0, 100)}`);
    note("global", "a city condition on an episode with no city keeps the rule silent", (await fired("global", `E2E R-city ${stamp}`, noCity.title)).length === 0, "");
    const gloLetter = (await letters(mail("global"), "boarding-pass", t1, `${about(noCity.title)}&payload->>code=not.is.null`))[0];
    note("global", "a letter's clock is the episode's own, not the club's — an episode with no city keeps the zone it was given",
      gloLetter?.payload?.time_zone === "America/Chicago" && noCity.time_zone === "America/Chicago", JSON.stringify([gloLetter?.payload?.time_zone, noCity.time_zone]));

    /* p_only: the clock's path fires one rule and no other. */
    const only = await stf.rpc("run_automation_now", { p_only: R.any.id, p_profile_id: ids.regional, p_episode_id: main.id });
    const anyAfterOnly = (await fired("regional", `E2E R-any ${stamp}`, main.title)).length;
    const cityAfterOnly = (await fired("regional", `E2E R-city ${stamp}`, main.title)).length;
    note("staff", "the Bridge fires one rule by hand and no other (run_automation_now)", only.status < 400 && Number(only.data) === 1 && anyAfterOnly === 2 && cityAfterOnly === 1,
      `got ${only.status} ${JSON.stringify(only.data)}; R-any ${anyAfterOnly}, R-city ${cityAfterOnly}`);
    await stf.patch(`automations?id=eq.${R.any.id}`, { active: false });
    const held = await stf.rpc("run_automation_now", { p_only: R.any.id, p_profile_id: ids.regional, p_episode_id: main.id });
    const anyAfterHeld = (await fired("regional", `E2E R-any ${stamp}`, main.title)).length;
    note("staff", "a held rule fires nothing", held.status < 400 && Number(held.data) === 0 && anyAfterHeld === 2, `got ${held.status} ${JSON.stringify(held.data)}; R-any ${anyAfterHeld}`);

    /* The dispatcher is SECURITY DEFINER and is the triggers' and the clock's
       alone since 2026-09-05: a member and anon are refused at the grant, and
       the by-hand wrapper is the Bridge's. Aimed at a HELD rule so that even a
       regression fires nothing. */
    const memberRun = await reg.rpc("run_automations", { p_event: "pass_confirmed", p_profile_id: ids.national, p_episode_id: main.id, p_only: R.any.id, p_immediate: true });
    note("regional", "a member cannot call the dispatcher against any member", memberRun.status >= 400, `got ${memberRun.status} ${said(memberRun).slice(0, 80)}`);
    const anonRun = await anon.rpc("run_automations", { p_event: "pass_confirmed", p_profile_id: ids.national, p_episode_id: main.id, p_only: R.any.id, p_immediate: true });
    note("anon", "anon cannot call the dispatcher", anonRun.status >= 400, `got ${anonRun.status} ${said(anonRun).slice(0, 80)}`);

    /* Proven; held now, so a booking made by anyone else while this run goes
       on — another suite shares these personas — fires none of them. */
    for (const k of ["tier", "city", "setting", "mail", "mailNeedsCode", "mailBogus", "text", "hook"]) {
      if (R[k]?.id) await stf.patch(`automations?id=eq.${R[k].id}`, { active: false });
    }

    /* ── D. weather_hold: notice, letter, text; the weather switch ──────── */
    const natPrefs = snap.national.notification_prefs ?? {};
    const natOff = await nat.patch(`profiles?id=eq.${ids.national}`, { notification_prefs: { ...natPrefs, weather: false } });
    prefsTouched.add("national");
    note("national", "turns their weather switch off", natOff.status < 300 && natOff.data?.[0]?.notification_prefs?.weather === false, `got ${natOff.status}`);
    const t2 = since();
    const hold = await stf.patch(`episodes?id=eq.${main.id}`, { status: "weather_hold" });
    note("staff", "calls a weather hold", hold.status < 300 && hold.data?.[0]?.status === "weather_hold", `got ${hold.status} ${said(hold).slice(0, 80)}`);
    const holdNotice = (await notices("regional", t2, `&kind=eq.weather&title=eq.${enc(`Weather hold: ${main.title}`)}`))[0];
    note("regional", "hold: the weather notice has somewhere to go", holdNotice?.href === "/passes", JSON.stringify(holdNotice ?? "").slice(0, 120));
    /* The event's letter carries the clock; the rule's letter (above) does not. */
    const eventHold = `${about(main.title)}&payload->>starts_at=not.is.null`;
    expectLetter("regional", "hold", await letters(mail("regional"), "weather-hold", t2, eventHold), "weather-hold", ["name", "starts_at", "time_zone"]);
    const holdText = `&payload->>sailing=eq.${enc(main.title)}&payload->>title=like.Weather%20hold*`;
    expectText("regional", "hold", await textsTo(PHONE, "weather-hold", t2, holdText), "weather-hold", ["title", "body", "sailing"]);
    note("national", "hold: with weather off, no weather notice", (await notices("national", t2, `&kind=eq.weather&title=eq.${enc(`Weather hold: ${main.title}`)}`)).length === 0, "");
    note("national", "hold: with weather off, no weather letter either", (await letters(mail("national"), "weather-hold", t2, eventHold)).length === 0, "");
    note("regional", "hold: a weather_hold rule fires once per member aboard", (await fired("regional", `E2E R-hold ${stamp}`, main.title)).length === 1 && (await fired("national", `E2E R-hold ${stamp}`, main.title)).length === 1, "");
    const t3 = since();
    const lift = await stf.patch(`episodes?id=eq.${main.id}`, { status: "scheduled" });
    note("staff", "lifts the hold", lift.status < 300, `got ${lift.status} ${said(lift).slice(0, 80)}`);
    const lifted = (await notices("regional", t3, `&kind=eq.weather&title=eq.${enc(`Hold lifted: ${main.title}`)}`))[0];
    note("regional", "lifted: the word says so and has somewhere to go", lifted?.href === "/passes", JSON.stringify(lifted ?? "").slice(0, 120));
    expectText("regional", "lifted", await textsTo(PHONE, "weather-hold", t3, `&payload->>sailing=eq.${enc(main.title)}&payload->>title=like.Hold%20lifted*`), "weather-hold", ["title", "body", "sailing"]);
    note("national", "lifted: the switch still holds", (await notices("national", t3, `&kind=eq.weather&title=eq.${enc(`Hold lifted: ${main.title}`)}`)).length === 0, "");
    const natBack = await nat.patch(`profiles?id=eq.${ids.national}`, { notification_prefs: natPrefs });
    if (natBack.status < 300) prefsTouched.delete("national");

    /* ── E. cancelled: the letter, the text, the notice, the push for the
       member whose switch would silence it ───────────────────────────── */
    const gloPrefs = snap.global.notification_prefs ?? {};
    const t4 = since();
    const cancel = await stf.patch(`episodes?id=eq.${main.id}`, { status: "cancelled" });
    note("staff", "calls the main fixture off", cancel.status < 300 && cancel.data?.[0]?.status === "cancelled", `got ${cancel.status} ${said(cancel).slice(0, 80)}`);
    expectLetter("regional", "cancelled", await letters(mail("regional"), "voyage-cancelled", t4, about(main.title)), "voyage-cancelled", ["name"]);
    expectLetter("national", "cancelled", await letters(mail("national"), "voyage-cancelled", t4, about(main.title)), "voyage-cancelled", ["name"]);
    expectText("regional", "cancelled", await textsTo(PHONE, "voyage-cancelled", t4, `&payload->>sailing=eq.${enc(main.title)}`), "voyage-cancelled", ["title", "body", "sailing"]);
    const cancelNotice = (await notices("regional", t4, `&kind=eq.manifest&title=eq.${enc(`Cancelled: ${main.title}`)}`))[0];
    note("regional", "cancelled: the manifest notice has somewhere to go", cancelNotice?.href === "/passes", JSON.stringify(cancelNotice ?? "").slice(0, 120));
    const cancelPush = await pushes("regional", t4, `&title=eq.${enc(`Cancelled: ${main.title}`)}`);
    note("regional", "cancelled: one push, not two — the fan-out carries it, the trigger does not double it", cancelPush.length === 1, `${cancelPush.length} pushes`);

    /* ── F. completed: frames, the debrief question, knots ──────────────── */
    const done = await raise("done", { city_id: miami?.id ?? null });
    if (done) made.episodes.push(done.id);
    if (done) {
      const regDone = await reg.post("passes", { episode_id: done.id, profile_id: ids.regional, status: "aboard" });
      const donePass = regDone.data?.[0];
      note("regional", "boards the completion fixture", regDone.status === 201, `got ${regDone.status} ${said(regDone).slice(0, 100)}`);
      const stampIn = donePass ? await stf.patch(`passes?id=eq.${donePass.id}`, { checked_in_at: new Date().toISOString() }) : { status: 0 };
      note("staff", "stamps the arrival", stampIn.status < 300, `got ${stampIn.status} ${said(stampIn).slice(0, 80)}`);
      const t5 = since();
      const complete = await stf.patch(`episodes?id=eq.${done.id}`, { status: "completed" });
      note("staff", "logs the night complete", complete.status < 300 && complete.data?.[0]?.status === "completed", `got ${complete.status} ${said(complete).slice(0, 80)}`);
      /* Completion banked miles for the arrival; the suite's footprint check
         holds every persona to zero drift, so they are swept back at once. */
      for (const r of (await stf.get(`knots_ledger?episode_id=eq.${done.id}&reason=like.Miles%20banked*&select=profile_id,delta`)).data ?? []) {
        await stf.rpc("adjust_knots", { p_profile: r.profile_id, p_delta: -r.delta, p_reason: `E2E comms — miles swept ${stamp}` });
      }
      expectLetter("regional", "completed", await letters(mail("regional"), "frames-wanted", t5, about(done.title)), "frames-wanted", ["name", "voyage", "slug"]);
      const debrief = (await notices("regional", t5, `&title=like.Anything%20the%20Bridge*&href=eq.${enc(`/debrief/${done.slug}`)}`))[0];
      note("regional", "completed: the one question has somewhere to go — this night's debrief", debrief?.href === `/debrief/${done.slug}`, JSON.stringify(debrief ?? "").slice(0, 120));
      const knots = (await notices("regional", t5, `&kind=eq.fathoms&body=like.*${enc(done.title)}*`))[0];
      note("regional", "completed: the knots notice lands on the knots", !!knots && knots.href === "/you#you-knots", JSON.stringify(knots ?? "").slice(0, 120));
      note("regional", "completed: a voyage_completed rule fires once", (await fired("regional", `E2E R-done ${stamp}`, done.title)).length === 1, "");
      const natDone = (await fired("national", `E2E R-done ${stamp}`, done.title)).length;
      note("national", "completed: and not for a member who was not aboard", natDone === 0, `${natDone} notices`);
    }

    /* ── G. the waitlist release: the letter with the code, and the switch
       that should not be able to silence it ─────────────────────────── */
    const line = await raise("line", { passes_total: 1 });
    if (line) made.episodes.push(line.id);
    if (line) {
      const first = await reg.post("passes", { episode_id: line.id, profile_id: ids.regional, status: "aboard" });
      const firstId = first.data?.[0]?.id;
      const second = await nat.post("passes", { episode_id: line.id, profile_id: ids.national, status: "waitlist" });
      const secondId = second.data?.[0]?.id;
      const gloOff = await glo.patch(`profiles?id=eq.${ids.global}`, { notification_prefs: { ...gloPrefs, berths: false } });
      prefsTouched.add("global");
      const third = await glo.post("passes", { episode_id: line.id, profile_id: ids.global, status: "waitlist" });
      const thirdId = third.data?.[0]?.id;
      note("staff", "one seat taken, two in line, the third with their passes switch off",
        first.status === 201 && second.status === 201 && third.status === 201 && gloOff.status < 300,
        `got ${first.status}/${second.status}/${third.status}/${gloOff.status} ${said(third).slice(0, 80)}`);

      const t6 = since();
      const give = await reg.del(`passes?id=eq.${firstId}`);
      note("regional", "hands the seat back", give.status < 300, `got ${give.status}`);
      const promoted = (await stf.get(`passes?id=eq.${secondId}&select=status,boarding_code`)).data?.[0];
      note("national", "is promoted in order", promoted?.status === "aboard" && !!promoted?.boarding_code, JSON.stringify(promoted));
      const wl = await letters(mail("national"), "waitlist-release", t6, about(line.title));
      expectLetter("national", "promoted", wl, "waitlist-release", ["name", "starts_at", "time_zone", "code", "muster"]);
      note("national", "promoted: the letter carries the promoted pass's own code", wl[0]?.payload?.code === promoted?.boarding_code, JSON.stringify([wl[0]?.payload?.code, promoted?.boarding_code]));
      note("national", "promoted: no second boarding pass — the release letter is the pass", (await letters(mail("national"), "boarding-pass", t6, `${about(line.title)}&payload->>code=not.is.null`)).length === 0, "");
      const wlNotice = (await notices("national", t6, `&kind=eq.manifest&title=eq.${enc(`A pass released to you: ${line.title}`)}`))[0];
      note("national", "promoted: the notice has somewhere to go", wlNotice?.href === "/passes", JSON.stringify(wlNotice ?? "").slice(0, 120));

      const t7 = since();
      const give2 = await nat.del(`passes?id=eq.${secondId}`);
      const promoted2 = (await stf.get(`passes?id=eq.${thirdId}&select=status`)).data?.[0];
      note("national", "hands the seat back, and the third is promoted", give2.status < 300 && promoted2?.status === "aboard", `got ${give2.status} ${JSON.stringify(promoted2)}`);
      const wl2 = await letters(mail("global"), "waitlist-release", t7, about(line.title));
      note("global", "the waitlist-release letter goes to the promoted member even with the berths notice switch off — the switch silences the notice, not the receipt",
        wl2.length === 1, `${wl2.length} letters to the promoted member with berths=false`);
      const gloBack = await glo.patch(`profiles?id=eq.${ids.global}`, { notification_prefs: gloPrefs });
      if (gloBack.status < 300) prefsTouched.delete("global");

      /* ── H. the broadcast, aimed where it can be counted ───────────────
         line: global aboard (promoted), nobody on the waitlist now — so the
         national persona re-joins the line to prove the audience is the
         manifest and not the queue. */
      const rejoin = await nat.post("passes", { episode_id: line.id, profile_id: ids.national, status: "waitlist" });
      const rejoinId = rejoin.data?.[0]?.id;
      note("national", "rejoins the line", rejoin.status === 201, `got ${rejoin.status} ${said(rejoin).slice(0, 80)}`);
      const t8 = since();
      const word = await stf.rpc("send_broadcast", { p_audience: { kind: "episode", id: line.id }, p_title: `E2E comms word ${stamp}`, p_body: "E2E — to the manifest.", p_channels: ["notice"] });
      note("staff", "an episode broadcast reaches the passes aboard and not the line", word.status < 400 && Number(word.data) === 1, `got ${word.status} ${JSON.stringify(word.data)}`);
      note("global", "hears it, in the Word, pointing at the passes", (await notices("global", t8, `&title=eq.${enc(`E2E comms word ${stamp}`)}`))[0]?.href === "/passes", "");
      note("national", "on the waitlist, hears nothing", (await notices("national", t8, `&title=eq.${enc(`E2E comms word ${stamp}`)}`)).length === 0, "");
      const wordPush = await pushes("global", t8, `&title=eq.${enc(`E2E comms word ${stamp}`)}`);
      note("global", "a notice implies push, once, with the destination", wordPush.length === 1 && wordPush[0].url === "/passes", JSON.stringify(wordPush).slice(0, 100));
      const wordRow = (await stf.get(`broadcasts?title=eq.${enc(`E2E comms word ${stamp}`)}&select=id,status,recipients`)).data?.[0];
      note("staff", "the record says sent, with the count", wordRow?.status === "sent" && wordRow?.recipients === 1, JSON.stringify(wordRow));
      if (wordRow?.id) made.broadcasts.push(wordRow.id);

      await release("national", rejoinId);
      await release("global", thirdId);
    }

    /* ── I. the broadcast to oneself: every channel through one path ───── */
    const t9 = since();
    const self = await stf.rpc("send_broadcast", { p_audience: { kind: "member", id: ids.staff }, p_title: `E2E comms self ${stamp}`, p_body: "E2E — a test to myself.", p_channels: ["notice", "email", "sms", "push"] });
    note("staff", "a word to oneself is admitted and reaches one", self.status < 400 && Number(self.data) === 1, `got ${self.status} ${JSON.stringify(self.data)} ${said(self).slice(0, 80)}`);
    const selfNotice = (await notices("staff", t9, `&title=eq.${enc(`E2E comms self ${stamp}`)}`))[0];
    note("staff", "the self-test notice lands in the Inbox", selfNotice?.href === "/inbox", JSON.stringify(selfNotice ?? "").slice(0, 100));
    expectLetter("staff", "self-test", await letters(mail("staff"), "bridge-word", t9, `&payload->>title=eq.${enc(`E2E comms self ${stamp}`)}`), "bridge-word", ["name"]);
    note("staff", "a text goes only to a verified number — none on the staff fixture, none queued", (await stf.get(`sms_outbox?template=eq.bridge-word&created_at=gt.${t9}&payload->>title=eq.${enc(`E2E comms self ${stamp}`)}&select=id`)).data?.length === 0, "");
    const t10 = since();
    const pushOnly = await stf.rpc("send_broadcast", { p_audience: { kind: "member", id: ids.staff }, p_title: `E2E comms push ${stamp}`, p_body: "E2E — push alone.", p_channels: ["push"] });
    note("staff", "push alone reaches one", pushOnly.status < 400 && Number(pushOnly.data) === 1, `got ${pushOnly.status}`);
    note("staff", "push alone writes no notice", (await notices("staff", t10, `&title=eq.${enc(`E2E comms push ${stamp}`)}`)).length === 0, "");
    const pushRow = await pushes("staff", t10, `&title=eq.${enc(`E2E comms push ${stamp}`)}`);
    note("staff", "and one push, to the Inbox", pushRow.length === 1 && pushRow[0].url === "/inbox", JSON.stringify(pushRow).slice(0, 100));
    for (const t of [`E2E comms self ${stamp}`, `E2E comms push ${stamp}`]) {
      const row = (await stf.get(`broadcasts?title=eq.${enc(t)}&select=id`)).data?.[0];
      if (row?.id) made.broadcasts.push(row.id);
    }
    const other = await stf.rpc("send_broadcast", { p_audience: { kind: "member", id: ids.regional }, p_title: "E2E", p_body: "x", p_channels: ["notice"] });
    note("staff", "a single-member word to anyone else is refused, and says a test goes to yourself", other.status >= 400 && /test goes to yourself/.test(said(other)), said(other).slice(0, 90));
    const memberWord = await reg.rpc("send_broadcast", { p_audience: { kind: "member", id: ids.regional }, p_title: "E2E", p_body: "x", p_channels: ["notice"] });
    note("regional", "a member cannot speak for the Bridge, even to themselves", memberWord.status >= 400 && /bridge speaks/.test(said(memberWord)), said(memberWord).slice(0, 90));
    const pausedWord = await pau.rpc("send_broadcast", { p_audience: { kind: "all" }, p_title: "E2E", p_body: "x", p_channels: ["notice"] });
    note("paused", "nor can a held membership", pausedWord.status >= 400, `got ${pausedWord.status}`);
    const anonWord = await anon.rpc("send_broadcast", { p_audience: { kind: "all" }, p_title: "E2E", p_body: "x", p_channels: ["notice"] });
    note("anon", "nor can the open water", anonWord.status >= 400, `got ${anonWord.status}`);
    const badChannel = await stf.rpc("send_broadcast", { p_audience: { kind: "member", id: ids.staff }, p_title: "E2E", p_body: "x", p_channels: ["carrier-pigeon"] });
    note("staff", "a channel off the list is refused, by name", badChannel.status >= 400 && /pick a channel/.test(said(badChannel)), said(badChannel).slice(0, 90));
    const badAudience = await stf.rpc("send_broadcast", { p_audience: { kind: "everyone-ever" }, p_title: "E2E", p_body: "x", p_channels: ["notice"] });
    note("staff", "an audience off the list is refused", badAudience.status >= 400 && /no such audience/.test(said(badAudience)), said(badAudience).slice(0, 90));
    const badTier = await stf.rpc("send_broadcast", { p_audience: { kind: "tier", tier: "admiral" }, p_title: "E2E", p_body: "x", p_channels: ["notice"] });
    note("staff", "a tier off the ladder is refused", badTier.status >= 400 && /no such tier/.test(said(badTier)), said(badTier).slice(0, 90));
    const noId = await stf.rpc("send_broadcast", { p_audience: { kind: "city" }, p_title: "E2E", p_body: "x", p_channels: ["notice"] });
    note("staff", "a city audience without a city is refused", noId.status >= 400 && /needs an id/.test(said(noId)), said(noId).slice(0, 90));

    /* A past hour is now: the word goes, the given hour stays on the record. */
    const t11 = since();
    const pastAt = new Date(Date.now() - 3600_000).toISOString();
    const pastWord = await stf.rpc("send_broadcast", { p_audience: { kind: "member", id: ids.staff }, p_title: `E2E comms past ${stamp}`, p_body: "E2E — an hour ago.", p_channels: ["notice"], p_send_at: pastAt });
    const pastRow = (await stf.get(`broadcasts?title=eq.${enc(`E2E comms past ${stamp}`)}&select=id,status,recipients,send_at`)).data?.[0];
    note("staff", "a word given a past hour goes now, and keeps the hour it was given",
      pastWord.status < 400 && Number(pastWord.data) === 1 && pastRow?.status === "sent" && Math.abs(Date.parse(pastRow?.send_at ?? 0) - Date.parse(pastAt)) < 2000,
      `got ${pastWord.status} ${JSON.stringify(pastRow)}`);
    note("staff", "and is heard", (await notices("staff", t11, `&title=eq.${enc(`E2E comms past ${stamp}`)}`)).length === 1, "");
    if (pastRow?.id) made.broadcasts.push(pastRow.id);

    /* The wide audiences — all, city, tier, lapsed — resolve to REAL members,
       so they are only ever queued for an hour ahead and struck before the
       clock reaches them. broadcasts has a staff DELETE policy since 09-04. */
    const wide = [
      { kind: "all" }, { kind: "city", id: miami?.id }, { kind: "tier", tier: "global" }, { kind: "lapsed" },
    ];
    for (const a of wide) {
      const t = `E2E comms queued ${a.kind} ${stamp}`;
      const q = await stf.rpc("send_broadcast", { p_audience: a, p_title: t, p_body: "E2E — never said.", p_channels: ["notice"], p_send_at: new Date(Date.now() + 3600_000).toISOString() });
      const row = (await stf.get(`broadcasts?title=eq.${enc(t)}&select=id,status,recipients`)).data?.[0];
      note("staff", `a ${a.kind} audience is admitted and waits for its hour, reaching nobody yet`, q.status < 400 && Number(q.data) === 0 && row?.status === "queued" && row?.recipients === 0, `got ${q.status} ${JSON.stringify(row)}`);
      const struck = row?.id ? await stf.del(`broadcasts?id=eq.${row.id}`) : { status: 0 };
      const gone = row?.id ? (await stf.get(`broadcasts?id=eq.${row.id}&select=id`)).data?.length === 0 : false;
      note("staff", `and is struck before the clock reaches it (${a.kind})`, struck.status < 300 && gone, `got ${struck.status}`);
    }
    const tooFar = await stf.rpc("send_broadcast", { p_audience: { kind: "member", id: ids.staff }, p_title: "E2E", p_body: "x", p_channels: ["notice"], p_send_at: new Date(Date.now() + 91 * 86400_000).toISOString() });
    note("staff", "a word is scheduled inside ninety days", tooFar.status >= 400 && /ninety days/.test(said(tooFar)), said(tooFar).slice(0, 90));
    const memberBroadcasts = await reg.get("broadcasts?select=id&limit=1");
    note("regional", "what was said is the Bridge's to read", (memberBroadcasts.data || []).length === 0, `got ${memberBroadcasts.status}`);

    /* ── J. dues_failed: the rule and the letter, without a card ───────── */
    const t12 = since();
    const sub = await stf.post("subscriptions", { profile_id: ids.regional, status: "past_due" });
    made.subscription = sub.data?.[0]?.id ?? null;
    note("staff", "records a lapse on the regional fixture", sub.status === 201 && !!sub.data?.[0]?.past_due_since, `got ${sub.status} ${said(sub).slice(0, 100)}`);
    note("regional", "a dues_failed rule fires once", (await fired("regional", `E2E R-dues ${stamp}`)).length === 1, "");
    expectLetter("regional", "dues rule", await letters(mail("regional"), "dues-failed", t12), "dues-failed", ["name"]);
    note("regional", "and the rule fires for the member whose dues lapsed, nobody else", (await fired("national", `E2E R-dues ${stamp}`)).length === 0, "");
    const status = (await stf.get(`profiles?id=eq.${ids.regional}&select=status`)).data?.[0]?.status;
    note("regional", "a lapse alone does not hold the membership — the ladder does, on its date", status === "active", `status ${status}`);
    if (made.subscription) {
      const gone = await stf.del(`subscriptions?id=eq.${made.subscription}`);
      if (gone.status < 300) made.subscription = null;
      note("staff", "the lapse is struck before the ladder runs", gone.status < 300, `got ${gone.status}`);
    }

    /* ── K. the funnels: received, invited, welcomed, and the crew ─────── */
    made.appEmail = `e2e-comms-app-${stamp}@fixtures.invalid`;
    /* Since 2026-09-05 an application answers every required question the
       committee asks (guard_the_answers); the form reads them signed out. */
    let questions = (await anon.get("application_questions?active=is.true&required=is.true&select=key")).data;
    if (!Array.isArray(questions)) questions = (await stf.get("application_questions?active=is.true&required=is.true&select=key")).data || [];
    const answers = Object.fromEntries(questions.map((q) => [q.key, "E2E — an answer for the committee."]));
    note("anon", "reads the committee's required questions", Array.isArray(questions), `${questions.length} required`);
    const t13 = since();
    const apply = await anon.postMinimal("applications", { email: made.appEmail, full_name: `E2E Comms Applicant ${stamp}`, answers });
    note("anon", "lodges an application", apply.status < 400, `got ${apply.status} ${said(apply).slice(0, 120)}`);
    expectLetter("anon", "applied", await letters(made.appEmail, "application-received", t13), "application-received", ["name"]);
    const again = await anon.postMinimal("applications", { email: made.appEmail, full_name: `E2E Comms Applicant ${stamp}`, answers });
    note("anon", "a second application inside the hour gets no second receipt", again.status < 500 && (await letters(made.appEmail, "application-received", t13)).length === 1, `got ${again.status}`);
    const appRows = (await stf.get(`applications?email=eq.${enc(made.appEmail)}&select=id&order=created_at.asc`)).data || [];
    made.application = appRows.map((r) => r.id);
    if (appRows[0]) {
      const t14 = since();
      const invite = await stf.rpc("set_application_status", { p_id: appRows[0].id, p_status: "invited" });
      note("staff", "invites the applicant", invite.status < 400, `got ${invite.status} ${said(invite).slice(0, 80)}`);
      expectLetter("staff", "invited", await letters(made.appEmail, "port-invite", t14), "port-invite", ["name"]);
      const t15 = since();
      const accept = await stf.rpc("accept_application", { p_id: appRows[0].id });
      note("staff", "welcomes them aboard", accept.status < 400, `got ${accept.status} ${said(accept).slice(0, 80)}`);
      expectLetter("staff", "welcomed", await letters(made.appEmail, "welcome-aboard", t15), "welcome-aboard", ["name", "tier"]);
      const twice = await stf.rpc("accept_application", { p_id: appRows[0].id });
      note("staff", "a second welcome is not said", twice.status < 400 && (await letters(made.appEmail, "welcome-aboard", t15)).length === 1, `got ${twice.status}`);
    }
    const memberApps = await reg.get("applications?select=id&limit=1");
    note("regional", "the application queue is the Bridge's to read", (memberApps.data || []).length === 0, `got ${memberApps.status}`);

    const roleId = (await anon.get("crew_roles?select=id,title&limit=1")).data?.[0]?.id;
    if (roleId) {
      const t16 = since();
      const crew = await anon.postMinimal("crew_candidates", { role_id: roleId, email: made.appEmail, full_name: `E2E Comms Crew ${stamp}` });
      note("anon", "applies to crew", crew.status < 400, `got ${crew.status}`);
      expectLetter("anon", "crew applied", await letters(made.appEmail, "crew-application-received", t16), "crew-application-received", ["name", "role"]);
      made.crew = ((await stf.get(`crew_candidates?email=eq.${enc(made.appEmail)}&select=id`)).data || []).map((r) => r.id);
    }

    /* ── L. notices: every kind has somewhere to go; every switch holds ─── */
    const KIND_HREF = { pass: "/passes", crew: "/passes", fathoms: "/you#you-knots", dues: "/account", thread: "/threads", radar: "/radar" };
    const t17 = since();
    for (const [kind, href] of Object.entries(KIND_HREF)) {
      /* The kind's internal name is plumbing; a notice title is visible text
         the lexicon gate reads on /inbox, so the knots kind is titled knots. */
      const w = await stf.rpc("notify_member", { p_profile: ids.regional, p_kind: kind, p_title: `E2E comms ${kind === "fathoms" ? "knots" : kind} ${stamp}`, p_body: "E2E" });
      const row = (await reg.get(`notifications?id=eq.${w.data}&select=href,kind`)).data?.[0];
      note("regional", `a ${kind} notice goes to ${href}`, row?.href === href, JSON.stringify(row ?? said(w)).slice(0, 80));
    }
    const allPush = await pushes("regional", t17, `&title=like.E2E comms*${stamp}`);
    note("regional", "with every switch on, every kind fans out to push with its destination",
      allPush.length === Object.keys(KIND_HREF).length && allPush.every((x) => Object.values(KIND_HREF).includes(x.url)), `${allPush.length} pushes`);
    const memberNotify = await reg.rpc("notify_member", { p_profile: ids.national, p_kind: "word", p_title: "E2E", p_body: "x" });
    note("regional", "a member cannot write into another member's Word", memberNotify.status >= 400 && /staff only/.test(said(memberNotify)), said(memberNotify).slice(0, 80));
    const anonNotify = await anon.rpc("notify_member", { p_profile: ids.national, p_kind: "word", p_title: "E2E", p_body: "x" });
    note("anon", "nor can the open water", anonNotify.status >= 400, `got ${anonNotify.status}`);
    const untitled = await stf.rpc("notify_member", { p_profile: ids.regional, p_kind: "word", p_title: "  ", p_body: "x" });
    note("staff", "a word needs a title", untitled.status >= 400 && /needs a title/.test(said(untitled)), said(untitled).slice(0, 80));

    const regPrefs = snap.regional.notification_prefs ?? {};
    const flip = await reg.patch(`profiles?id=eq.${ids.regional}`, { notification_prefs: { ...regPrefs, fathoms: false, channels: { push: true, email: false, sms: false } } });
    prefsTouched.add("regional");
    note("regional", "turns knots off, and mail and texts off, leaving push on", flip.status < 300 && flip.data?.[0]?.notification_prefs?.fathoms === false, `got ${flip.status}`);
    const t18 = since();
    await stf.rpc("notify_member", { p_profile: ids.regional, p_kind: "fathoms", p_title: `E2E comms knots-off ${stamp}`, p_body: "E2E" });
    await stf.rpc("notify_member", { p_profile: ids.regional, p_kind: "dues", p_title: `E2E comms dues-on ${stamp}`, p_body: "E2E" });
    const knotsPush = await pushes("regional", t18, `&title=eq.${enc(`E2E comms knots-off ${stamp}`)}`);
    const duesPush = await pushes("regional", t18, `&title=eq.${enc(`E2E comms dues-on ${stamp}`)}`);
    note("regional", "the category switch holds — a knots notice does not push, a dues notice does",
      knotsPush.length === 0 && duesPush.length === 1, `knots ${knotsPush.length}, dues ${duesPush.length}`);
    const t19 = since();
    const marketing = await stf.rpc("queue_email", { p_to: mail("regional"), p_template: "season-card", p_payload: { name: "E2E", season: `E2E ${stamp}` } });
    const mrow = (await stf.get(`email_outbox?id=eq.${marketing.data}&select=status,last_error`)).data?.[0];
    note("regional", "with mail off, a marketing letter is skipped and the reason survives the fixture guard",
      mrow?.status === "skipped" && /marketing mail off/.test(mrow?.last_error ?? ""), JSON.stringify(mrow ?? said(marketing)));
    const receipt = await stf.rpc("queue_email", { p_to: mail("regional"), p_template: "application-received", p_payload: { name: "E2E" } });
    const rrow = (await stf.get(`email_outbox?id=eq.${receipt.data}&select=status,last_error`)).data?.[0];
    note("regional", "with mail off, a transactional letter is untouched by the switch", !!rrow && !/marketing/.test(rrow.last_error ?? "") && /fixture address/.test(rrow.last_error ?? ""), JSON.stringify(rrow ?? said(receipt)));
    const unknown = await stf.rpc("queue_email", { p_to: mail("regional"), p_template: `e2e-nope-${stamp}`, p_payload: {} });
    note("staff", "queue_email refuses a letter the registry does not list", unknown.status >= 400 && /no such letter/.test(said(unknown)), said(unknown).slice(0, 80));
    const memberQueue = await reg.rpc("queue_email", { p_to: mail("regional"), p_template: "application-received", p_payload: {} });
    note("regional", "a member cannot queue a letter", memberQueue.status >= 400, `got ${memberQueue.status}`);
    /* The text switch: a_text_honours_the_switch marks the row skipped with
       its reason, and no_real_texts_to_a_fixture then OVERWRITES that reason
       on a 555 number (the mail guard coalesces; the text guard does not). So
       the row can be asserted skipped, and the reason cannot. */
    const t20 = since();
    void t19;
    /* The regional persona is aboard the completed fixture; a broadcast's
       episode audience is the manifest whatever the episode's status. */
    const textOff = done
      ? await stf.rpc("send_broadcast", { p_audience: { kind: "episode", id: done.id }, p_title: `E2E comms text-off ${stamp}`, p_body: "E2E — a text to a switched-off number.", p_channels: ["sms"] })
      : { status: 0, data: null };
    const offRows = await textsTo(PHONE, "bridge-word", t20, `&payload->>title=eq.${enc(`E2E comms text-off ${stamp}`)}`);
    note("regional", "with texts off, a text is queued and skipped", textOff.status < 400 && Number(textOff.data) === 1 && offRows.length === 1 && offRows[0].status === "skipped",
      `got ${textOff.status} ${JSON.stringify(textOff.data)} ${JSON.stringify(offRows[0] ?? "")}`);
    if (offRows[0]) {
      note("regional", "SKIPPED the text-switch REASON — no_real_texts_to_a_fixture overwrites last_error where the mail guard coalesces (SQL in the gate report)", true, offRows[0].last_error ?? "");
    }
    const textOffRow = (await stf.get(`broadcasts?title=eq.${enc(`E2E comms text-off ${stamp}`)}&select=id`)).data?.[0];
    if (textOffRow?.id) made.broadcasts.push(textOffRow.id);
    const t21 = since();
    await stf.rpc("notify_member", { p_profile: ids.regional, p_kind: "dues", p_title: `E2E comms push-off ${stamp}`, p_body: "E2E" });
    const stillPush = await pushes("regional", t21, `&title=eq.${enc(`E2E comms push-off ${stamp}`)}`);
    note("regional", "push stays on while the other channels are off", stillPush.length === 1, `${stillPush.length} pushes`);
    const pushOff = await reg.patch(`profiles?id=eq.${ids.regional}`, { notification_prefs: { ...regPrefs, channels: { push: false } } });
    const t22 = since();
    await stf.rpc("notify_member", { p_profile: ids.regional, p_kind: "dues", p_title: `E2E comms push-gone ${stamp}`, p_body: "E2E" });
    const noPush = await pushes("regional", t22, `&title=eq.${enc(`E2E comms push-gone ${stamp}`)}`);
    const inbox = (await notices("regional", t22, `&title=eq.${enc(`E2E comms push-gone ${stamp}`)}`))[0];
    note("regional", "with push off the notice still lands in the Word, and nothing fans out", pushOff.status < 300 && noPush.length === 0 && inbox?.href === "/account", `${noPush.length} pushes; ${JSON.stringify(inbox ?? "").slice(0, 80)}`);
    const regBack = await reg.patch(`profiles?id=eq.${ids.regional}`, { notification_prefs: regPrefs });
    if (regBack.status < 300) prefsTouched.delete("regional");

    /* ── M. the drains are not for members, and are not invoked here ───── */
    const requeueMember = await reg.rpc("requeue_outbox_row", { p_table: "email_outbox", p_id: ids.regional });
    note("regional", "a member cannot requeue a letter", requeueMember.status >= 400, `got ${requeueMember.status}`);
    const notOutbox = await stf.rpc("requeue_outbox_row", { p_table: "profiles", p_id: ids.regional });
    note("staff", "requeue names only an outbox", notOutbox.status >= 400 && /not an outbox/.test(said(notOutbox)), said(notOutbox).slice(0, 80));
    for (const fn of ["run_dunning", "run_automation_queue", "run_due_broadcasts", "carry_the_clock", "write_to_the_long_held", "perform_broadcast"]) {
      const r = await stf.rpc(fn, fn === "perform_broadcast" ? { p_id: ids.staff } : {});
      note("staff", `${fn} is the clock's, not the Bridge's`, r.status >= 400, `got ${r.status} ${said(r).slice(0, 60)}`);
    }

    /* Untested on purpose, said here rather than left to look covered:
       member_joined fires on a profile insert only auth makes; farewell fires
       on `departed`, which a persona does not come back from; gangway-details,
       the Sunday digest, the win-back and the dunning ladder ride the cron. */
    note("staff", "SKIPPED member_joined, farewell, gangway-details, lore-digest, win-back, dunning letters — cron- or auth-fired; bodies code-reviewed", true, "declared");
  } finally {
    /* Restore, then strike. Never leave a persona changed. */
    for (const who of prefsTouched) {
      const back = await rest(p[who]).patch(`profiles?id=eq.${ids[who]}`, { notification_prefs: snap[who]?.notification_prefs ?? {} });
      note(who, "the switches are back as they were", back.status < 300, `got ${back.status}`);
    }
    if (phoneSet) {
      const back = await reg.patch(`profiles?id=eq.${ids.regional}`, { phone: snap.regional?.phone ?? null, phone_verified: false });
      note("regional", "the fixture number is taken off again", back.status < 300 && back.data?.[0]?.phone_verified === false, `got ${back.status}`);
    }
    if (made.subscription) await stf.del(`subscriptions?id=eq.${made.subscription}`);
    for (const vid of made.episodes) {
      await stf.del(`passes?episode_id=eq.${vid}`);
      const del = await stf.del(`episodes?id=eq.${vid}`);
      note("staff", "a comms fixture is struck", del.status < 300, `got ${del.status} ${said(del).slice(0, 80)}`);
    }
    for (const id of made.rules) await stf.del(`automations?id=eq.${id}`);
    const rulesLeft = await stf.get(`automations?name=like.E2E comms*${stamp}&select=id`);
    note("staff", "the rules are struck", (rulesLeft.data || []).length === 0, `${(rulesLeft.data || []).length} left`);
    if (made.webhook) {
      const gone = await stf.del(`webhooks?id=eq.${made.webhook}`);
      const left = await stf.get(`webhook_deliveries?webhook_id=eq.${made.webhook}&select=id`);
      note("staff", "the fixture webhook is struck and takes its deliveries with it", gone.status < 300 && (left.data || []).length === 0, `got ${gone.status}; ${(left.data || []).length} deliveries`);
    }
    if (made.appEmail) {
      await stf.del(`member_roll?email=eq.${enc(made.appEmail)}`);
      await stf.del(`applications?email=eq.${enc(made.appEmail)}`);
      await stf.del(`crew_candidates?email=eq.${enc(made.appEmail)}`);
    }
    for (const id of made.broadcasts) await stf.del(`broadcasts?id=eq.${id}`);
    const saidLeft = await stf.get(`broadcasts?title=like.E2E comms*${stamp}&select=id`);
    note("staff", "what this run said is struck from the record", (saidLeft.data || []).length === 0, `${(saidLeft.data || []).length} left`);
  }
}
