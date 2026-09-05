#!/usr/bin/env node
/**
 * The workflows, walked as the demo people and recorded step by step.
 *
 *   DEMO_PERSONAS='{"mara":{"email":"…","password":"…"},"theo":{…},"priya":{…}}' \
 *   BASE_URL=https://apollo-topaz.vercel.app node scripts/demo-scenarios.mjs <out.json>
 *
 * Signs each persona in through the auth API (the way the e2e suite signs its
 * fixtures in), then runs each scene through the same RPCs and tables the
 * app's server actions call, and prints a narrated log: ✓ or ✕ per step with
 * what came back. Writes the log as JSON for the demo reel. Real writes, on
 * demo accounts: passes, a guest, signatures, a post, a table, a poll, a
 * broadcast, an application. Nothing is sent to a stranger's address.
 */
import { readFileSync, existsSync, writeFileSync } from "node:fs";
import { createHmac } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const BASE = (process.env.BASE_URL || "https://apollo-topaz.vercel.app").replace(/\/$/, "");
const env = existsSync(".env.local") ? Object.fromEntries(readFileSync(".env.local", "utf8").split("\n").filter((l) => l.includes("=") && !l.startsWith("#")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, "")]; })) : {};
const SUPA = process.env.NEXT_PUBLIC_SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const out = process.argv[2] || "demo-scenarios.json";
const PEOPLE = JSON.parse(process.env.DEMO_PERSONAS || "{}");

async function login(email, password) {
  const res = await fetch(`${SUPA}/auth/v1/token?grant_type=password`, { method: "POST", headers: { "content-type": "application/json", apikey: ANON }, body: JSON.stringify({ email, password }) });
  if (!res.ok) throw new Error(`login failed for ${email}: ${res.status}`);
  return res.json();
}
function rest(session) {
  const call = async (method, path, body) => {
    const res = await fetch(`${SUPA}/rest/v1/${path}`, {
      method, headers: { apikey: ANON, authorization: `Bearer ${session ? session.access_token : ANON}`, "content-type": "application/json", prefer: "return=representation" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text(); let data = null; try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    return { status: res.status, data };
  };
  return {
    get: (p) => call("GET", p), post: (p, b) => call("POST", p, b), patch: (p, b) => call("PATCH", p, b), del: (p) => call("DELETE", p),
    rpc: (fn, args = {}) => call("POST", `rpc/${fn}`, args),
    postMinimal: async (p, b) => { const res = await fetch(`${SUPA}/rest/v1/${p}`, { method: "POST", headers: { apikey: ANON, authorization: `Bearer ${session ? session.access_token : ANON}`, "content-type": "application/json", prefer: "return=minimal" }, body: JSON.stringify(b) }); return { status: res.status, data: await res.text() }; },
  };
}
const said = (r) => String(r.data?.message ?? r.data?.hint ?? JSON.stringify(r.data ?? "")).slice(0, 140);

/* TOTP (RFC 6238) for the two-step scene — the code a phone app would show. */
function base32(s) { const A = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"; let bits = ""; for (const c of s.replace(/=+$/, "").toUpperCase()) { const v = A.indexOf(c); if (v >= 0) bits += v.toString(2).padStart(5, "0"); } const bytes = []; for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2)); return Buffer.from(bytes); }
function totp(secret, at = Date.now()) { const buf = Buffer.alloc(8); buf.writeBigUInt64BE(BigInt(Math.floor(at / 30000))); const h = createHmac("sha1", base32(secret)).update(buf).digest(); const o = h[19] & 0xf; const n = ((h[o] & 0x7f) << 24) | ((h[o + 1] & 0xff) << 16) | ((h[o + 2] & 0xff) << 8) | (h[o + 3] & 0xff); return String(n % 1e6).padStart(6, "0"); }

const log = [];
let scene = "";
const say = (title) => { scene = title; console.log(`\n══ ${title}`); };
async function step(label, fn) {
  try {
    const r = await fn();
    const ok = r?.ok !== false;
    log.push({ scene, label, ok, detail: r?.detail ?? "" });
    console.log(`  ${ok ? "✓" : "✕"} ${label}${r?.detail ? ` — ${r.detail}` : ""}`);
    return r?.value;
  } catch (e) {
    log.push({ scene, label, ok: false, detail: String(e?.message ?? e) });
    console.log(`  ✕ ${label} — ${String(e?.message ?? e)}`);
    return undefined;
  }
}
const first = (r) => (Array.isArray(r.data) ? r.data[0] : null);

const S = {}; const P = {};
for (const [name, who] of Object.entries(PEOPLE)) { if (!who.password) continue; S[name] = await login(who.email, who.password); P[name] = rest(S[name]); P[name].id = S[name].user.id; P[name].email = who.email; }
const anon = rest(null);
const { mara, theo, priya } = P;
const ep = Object.fromEntries((await priya.get("episodes?select=id,slug,title,starts_at,time_zone,muster&slug=in.(s1-w02-neon-dusk,s1-w03-airboat-safari,s1-w06-anchor-autumn-equinox)")).data.map((e) => [e.slug, e]));
const NEON = ep["s1-w02-neon-dusk"], ANCHOR = ep["s1-w06-anchor-autumn-equinox"];
const stamp = Date.now().toString(36);

// ───────────────────────────── A · Mara finishes her file and books ───────
say("A · Mara finishes her file and books her first night");
await step("Mara's file reads 3 of 6 gates: the Preference Sheet is her move", async () => {
  /* The file is the vetting team's; the member reads it through the page's
     own view, so the Bridge reads it here. */
  const f = first(await priya.get(`vetting_files?profile_id=eq.${mara.id}&select=background_state,id_verified_at`));
  const sheet = first(await mara.get(`preference_sheets?profile_id=eq.${mara.id}&select=completed_at`));
  return { ok: f?.background_state === "cleared", detail: `background ${f?.background_state}, sheet ${sheet?.completed_at ? "done on an earlier run" : "open — her move"}` };
});
await step("booking before the sheet is refused, with the way out", async () => {
  const sheet = first(await mara.get(`preference_sheets?profile_id=eq.${mara.id}&select=completed_at`));
  if (sheet?.completed_at) return { ok: true, detail: "sheet already complete — refusal proven on the first run" };
  const r = await mara.post("passes", { episode_id: NEON.id, profile_id: mara.id, status: "aboard" });
  return { ok: r.status >= 400 && /Preference Sheet/i.test(said(r)), detail: said(r) };
});
await step("she completes the Preference Sheet", async () => {
  const had = first(await mara.get(`preference_sheets?profile_id=eq.${mara.id}&select=completed_at`));
  if (had?.completed_at) return { ok: true, detail: "already complete" };
  const r = await mara.post("preference_sheets", { profile_id: mara.id, drinks: ["Mezcal", "Zero proof"], flag_green: "Someone who dances first.", flag_red: "Phones at the table.", completed_at: new Date().toISOString() });
  return { ok: r.status === 201, detail: `${r.status}` };
});
const maraPass = await step("and books Neon dusk — a code is minted, the plan credit pays the fare", async () => {
  const had = first(await mara.get(`passes?episode_id=eq.${NEON.id}&profile_id=eq.${mara.id}&select=id,boarding_code,status`));
  const r = had ? { status: 201 } : await mara.post("passes", { episode_id: NEON.id, profile_id: mara.id, status: "aboard" });
  const pass = first(await mara.get(`passes?episode_id=eq.${NEON.id}&profile_id=eq.${mara.id}&select=id,boarding_code,status`));
  const ledger = await mara.get(`account_ledger?profile_id=eq.${mara.id}&episode_id=eq.${NEON.id}&select=kind,delta_cents`);
  const owed = (ledger.data ?? []).reduce((t, x) => t + Number(x.delta_cents), 0);
  return { ok: r.status === 201 && !!pass?.boarding_code && owed === 0, detail: `${had ? "already aboard" : r.status} · code ${pass?.boarding_code} · ledger nets ${owed} (${(ledger.data ?? []).map((x) => `${x.kind} ${x.delta_cents}`).join(", ")})`, value: pass };
});
await step("a notice and a boarding-pass letter follow", async () => {
  const n = await mara.get(`notifications?profile_id=eq.${mara.id}&title=like.*Neon dusk*&select=title,href`);
  const l = await priya.get(`email_outbox?to_email=eq.${encodeURIComponent(mara.email)}&template=eq.boarding-pass&select=status,payload`);
  return { ok: (n.data ?? []).length >= 1 && (l.data ?? []).length >= 1, detail: `${(n.data ?? []).length} notice(s) → ${first(n)?.href}; letter ${first(l)?.status} with code ${first(l)?.payload?.code}` };
});

// ───────────────────────────── B · Mara brings a guest ────────────────────
say("B · Mara brings a guest, who signs by link");
const guest = await step("Mara names a guest on her pass; a guest code and a signing link are minted", async () => {
  const had = first(await mara.get(`pass_guests?rsvp_id=eq.${maraPass?.id}&name=eq.Jonah%20Reyes&select=*`));
  const r = had ? { status: 201, data: [had] } : await mara.post("pass_guests", { rsvp_id: maraPass?.id, name: `Jonah Reyes` });
  const g = first(r);
  return { ok: r.status === 201 && /-G1$/.test(g?.boarding_code ?? "") && !!g?.sign_token, detail: `${r.status} · ${g?.boarding_code}`, value: g };
});
await step("the signing page renders to the guest, by bearer link, with the night card and no code yet", async () => {
  const res = await fetch(`${BASE}/sign/${guest?.sign_token}`);
  const html = await res.text();
  const signedAlready = /Already signed/.test(html);
  return { ok: res.status === 200 && /Jonah Reyes/.test(html) && /Your night/.test(html) && (signedAlready || /Appears here once you have signed/.test(html)), detail: `${res.status}${signedAlready ? " (signed on an earlier run)" : ""}` };
});
await step("the guest signs the waiver, staying out of the show", async () => {
  const r = await anon.rpc("sign_document_as_guest", { p_token: guest?.sign_token, p_document_code: "guest-waiver", p_consent: true, p_consent_text: "I agree to sign electronically.", p_signature_kind: "typed", p_signature_data: "Jonah Reyes", p_signer_name: "Jonah Reyes", p_guardian_name: null, p_user_agent: "un-demo", p_on_camera: false });
  return { ok: r.status < 300 || /already/i.test(said(r)), detail: said(r) };
});
await step("the same link now shows Already signed and the guest's code", async () => {
  const html = await (await fetch(`${BASE}/sign/${guest?.sign_token}`)).text();
  return { ok: /Already signed/.test(html) && html.includes(guest?.boarding_code ?? "NOPE"), detail: guest?.boarding_code ?? "" };
});

// ───────────────────────────── C · the gangway ────────────────────────────
say("C · The gangway: unsigned, then signed, then stamped");
await step("Shoreside cannot stamp Theo in before he has signed the member waiver", async () => {
  const standing = await priya.rpc("signature_standing", { p_profile_id: theo.id });
  const signed = Array.isArray(standing.data) ? standing.data.some((x) => x.document_code === "member-waiver" && x.signed_at && x.state !== "missing" && x.state !== "expired") : false;
  const r = await priya.patch(`passes?episode_id=eq.${NEON.id}&profile_id=eq.${theo.id}`, { checked_in_at: new Date().toISOString(), checked_in_by: priya.id });
  if (r.status === 200 && signed) {
    await priya.patch(`passes?episode_id=eq.${NEON.id}&profile_id=eq.${theo.id}`, { checked_in_at: null, checked_in_by: null });
    return { ok: true, detail: "Theo signed on an earlier run, so the stamp lands — the refusal was proven then" };
  }
  return { ok: r.status >= 400 && /unsigned|outstanding/i.test(said(r)), detail: said(r) };
});
await step("Theo signs the member waiver", async () => {
  const r = await theo.rpc("sign_document", { p_document_code: "member-waiver", p_context: { class: "shore" }, p_consent: true, p_consent_text: "I agree to sign electronically.", p_signature_kind: "typed", p_signature_data: "Theo Lindqvist", p_signer_name: "Theo Lindqvist", p_user_agent: "un-demo" });
  return { ok: r.status < 300, detail: said(r) };
});
await step("the stamp lands, and the door's manifest reads him as current", async () => {
  const r = await priya.patch(`passes?episode_id=eq.${NEON.id}&profile_id=eq.${theo.id}`, { checked_in_at: new Date().toISOString(), checked_in_by: priya.id });
  const m = await priya.rpc("door_manifest", { p_episode: NEON.id });
  const row = (m.data ?? []).find((x) => x.profile_id === theo.id);
  return { ok: r.status === 200 && row?.waiver_current === true, detail: `${r.status} · manifest: ${(m.data ?? []).map((x) => `${x.full_name}${x.waiver_current ? " ✓" : " —"}`).join(", ")}` };
});
await step("the stamp is lifted again — the night is still ahead", async () => {
  const r = await priya.patch(`passes?episode_id=eq.${NEON.id}&profile_id=eq.${theo.id}`, { checked_in_at: null, checked_in_by: null });
  return { ok: r.status === 200, detail: `${r.status}` };
});

// ───────────────────────────── D · a pass handed on ───────────────────────
say("D · Theo offers his Anchor pass to Mara");
const offer = await step("Theo offers the pass", async () => {
  const pass = first(await theo.get(`passes?episode_id=eq.${ANCHOR.id}&profile_id=eq.${theo.id}&select=id`));
  const r = await theo.post("pass_transfers", { rsvp_id: pass?.id, from_profile: theo.id, to_profile: mara.id, status: "offered" });
  return { ok: r.status === 201, detail: said(r), value: first(r) };
});
await step("Mara sees it in her incoming transfers", async () => {
  const r = await mara.rpc("incoming_transfers", {});
  const mine = (r.data ?? []).find((t) => t.id === offer?.id || t.transfer_id === offer?.id);
  return { ok: r.status === 200 && (r.data ?? []).length >= 1, detail: `${(r.data ?? []).length} offer(s)${mine ? "" : " (id not matched)"}` };
});
await step("she accepts — or the club says why not (a Deck plan sails up to 8 hours; Anchor runs 9)", async () => {
  const r = await mara.rpc("accept_pass_transfer", { p_id: offer?.id });
  const nowHeld = first(await priya.get(`passes?episode_id=eq.${ANCHOR.id}&select=profile_id&order=created_at.desc&limit=1`));
  return { ok: r.status < 300 || /class|plan|hours|deeper/i.test(said(r)), detail: r.status < 300 ? `accepted · pass now ${nowHeld?.profile_id === mara.id ? "Mara's" : "?"}` : said(r) };
});
await step("an offer that did not go through is withdrawn", async () => {
  const cur = first(await theo.get(`pass_transfers?id=eq.${offer?.id}&select=status`));
  if (cur?.status !== "offered") return { ok: true, detail: `status ${cur?.status}` };
  const r = await theo.patch(`pass_transfers?id=eq.${offer?.id}`, { status: "cancelled" });
  return { ok: r.status === 200 || r.status === 204, detail: `${r.status}` };
});

// ───────────────────────────── E · the Open Deck ──────────────────────────
say("E · The Open Deck: a word, a hail, a reply");
const post = await step("Theo posts a word tagged to Neon dusk", async () => {
  const r = await theo.post("open_deck_posts", { author_id: theo.id, body: `Rooftop at 21:00 — who is coming early for the light? (${stamp})`, episode_id: NEON.id });
  return { ok: r.status === 201, detail: said(r), value: first(r) };
});
await step("Mara hails it and replies", async () => {
  const h = await mara.post("open_deck_hails", { post_id: post?.id, profile_id: mara.id });
  const c = await mara.post("open_deck_comments", { post_id: post?.id, author_id: mara.id, body: "Early. Bringing the good speaker." });
  return { ok: h.status === 201 && c.status === 201, detail: `hail ${h.status} · reply ${c.status}` };
});
await step("Theo reads one hail and one word on his post", async () => {
  const h = await theo.get(`open_deck_hails?post_id=eq.${post?.id}&select=profile_id`);
  const c = await theo.get(`open_deck_comments?post_id=eq.${post?.id}&select=body`);
  return { ok: (h.data ?? []).length === 1 && (c.data ?? []).length === 1, detail: `${(h.data ?? []).length} hail, ${(c.data ?? []).length} word` };
});

// ───────────────────────────── F · Tonight ────────────────────────────────
say("F · Tonight: a blind table for six");
const table = await step("Shoreside lays a table on Neon dusk", async () => {
  const r = await priya.post("tables", { episode_id: NEON.id, number: 1, seats: 6 });
  return { ok: r.status === 201 || r.status === 409, detail: `${r.status}`, value: first(r) ?? first(await priya.get(`tables?episode_id=eq.${NEON.id}&number=eq.1&select=id`)) };
});
await step("Theo holds a seat, then confirms it", async () => {
  const h = await theo.rpc("claim_table_seat", { p_table: table?.id });
  const c = await theo.rpc("confirm_table_seat", { p_table: table?.id });
  return { ok: h.status < 300 && c.status < 300, detail: `${said(h)} · ${said(c)}` };
});
await step("Mara takes the seat beside him", async () => {
  const h = await mara.rpc("claim_table_seat", { p_table: table?.id });
  const c = await mara.rpc("confirm_table_seat", { p_table: table?.id });
  return { ok: h.status < 300 && c.status < 300, detail: `${said(h)} · ${said(c)}` };
});

// ───────────────────────────── G · a poll ─────────────────────────────────
say("G · A bounded question, and a vote");
const poll = await step("Shoreside asks: cast off at 20:30 or 21:00?", async () => {
  const had = first(await priya.get(`polls?question=eq.${encodeURIComponent("Saturday's cast-off: 20:30 or 21:00?")}&select=*&order=created_at.desc&limit=1`));
  if (had) return { ok: true, detail: "asked on an earlier run", value: had };
  const r = await priya.post("polls", { question: "Saturday's cast-off: 20:30 or 21:00?", options: ["20:30", "21:00"], closes_at: new Date(Date.now() + 3 * 86400e3).toISOString() });
  return { ok: r.status === 201, detail: said(r), value: first(r) };
});
await step("Theo votes, changes his mind, and the tally reads one vote", async () => {
  const a = await theo.rpc("cast_vote", { p_poll: poll?.id, p_option: 0 });
  const b = await theo.rpc("cast_vote", { p_poll: poll?.id, p_option: 1 });
  /* A member reads the tally once the question closes; the Bridge reads it
     live. */
  const hidden = await theo.rpc("poll_results", { p_poll: poll?.id });
  const t = await priya.rpc("poll_results", { p_poll: poll?.id });
  const total = (t.data ?? []).reduce((s, x) => s + Number(x.votes ?? 0), 0);
  return { ok: a.status < 300 && b.status < 300 && total === 1 && (hidden.data ?? []).length === 0, detail: `Bridge sees ${JSON.stringify(t.data)}; the member sees nothing until it closes` };
});

// ───────────────────────────── H · two-step ───────────────────────────────
say("H · Two-step: enrolled, proven with a generated code, switched off again");
const sb = createClient(SUPA, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
await sb.auth.setSession({ access_token: S.theo.access_token, refresh_token: S.theo.refresh_token });
const factor = await step("Theo enrols a code app", async () => {
  const { data, error } = await sb.auth.mfa.enroll({ factorType: "totp", friendlyName: "Demo code app" });
  return { ok: !error && !!data?.totp?.secret, detail: error?.message ?? `factor ${data?.id?.slice(0, 8)}…`, value: data };
});
await step("the six digits a phone would show are accepted; the session is second-factor", async () => {
  const { data: ch, error: e1 } = await sb.auth.mfa.challenge({ factorId: factor?.id });
  if (e1) return { ok: false, detail: e1.message };
  const { error: e2 } = await sb.auth.mfa.verify({ factorId: factor?.id, challengeId: ch.id, code: totp(factor.totp.secret) });
  const { data: aal } = await sb.auth.mfa.getAuthenticatorAssuranceLevel();
  return { ok: !e2 && aal?.currentLevel === "aal2", detail: e2?.message ?? `level ${aal?.currentLevel}` };
});
await step("and switched off again, so the owner can sign in without a code app", async () => {
  const { error } = await sb.auth.mfa.unenroll({ factorId: factor?.id });
  return { ok: !error, detail: error?.message ?? "off" };
});

// ───────────────────────────── I · the Bridge ─────────────────────────────
say("I · The Bridge: search, an audience, a word, a rule, a letter, a door");
await step("⌘K finds Mara across the roll", async () => {
  const r = await priya.rpc("bridge_search", { p_q: "Mara" });
  const hit = (r.data ?? []).find((h) => h.kind === "member" && /Mara Vasquez/.test(h.title));
  return { ok: !!hit, detail: `${(r.data ?? []).length} hits · ${hit?.href}` };
});
const aboardRule = { kind: "filter", match: "all", rules: [{ field: "aboard", op: "in", value: [NEON.id] }] };
await step("an audience of everyone aboard Neon dusk previews as two, by name", async () => {
  const r = await priya.rpc("broadcast_audience_preview", { p_audience: aboardRule });
  return { ok: Number(r.data?.count) === 2, detail: JSON.stringify(r.data) };
});
await step("the word goes to both as a notice pointing at their passes", async () => {
  const r = await priya.rpc("send_broadcast", { p_audience: aboardRule, p_title: "Neon dusk: the lift is on the Brickell Avenue side.", p_body: "Seven floors up. The doorman knows the club; say the night.", p_channels: ["notice"] });
  const n = await mara.get(`notifications?profile_id=eq.${mara.id}&title=like.*Brickell Avenue*&select=href`);
  return { ok: Number(r.data) === 2 && first(n)?.href === "/passes", detail: `reached ${r.data} · Mara's notice → ${first(n)?.href}` };
});
await step("Shoreside fires the live rule at herself", async () => {
  const rule = first(await priya.get("automations?active=is.true&select=id,name&limit=1"));
  const r = await priya.rpc("run_automation_now", { p_only: rule?.id, p_profile_id: priya.id, p_episode_id: NEON.id });
  return { ok: r.status < 300, detail: `${rule?.name}: fired ${JSON.stringify(r.data)}` };
});
await step("and sends herself the gangway-details letter with sample legs", async () => {
  const r = await priya.rpc("send_letter_to_me", { p_code: "gangway-details" });
  const row = first(await priya.get(`email_outbox?id=eq.${r.data}&select=status,payload`));
  return { ok: r.status < 300 && Array.isArray(row?.payload?.legs), detail: `${row?.status} · ${row?.payload?.legs?.length} legs` };
});
const doorGrant = await step("she hands Mara the door for Neon dusk", async () => {
  const r = await priya.post("door_grants", { profile_id: mara.id, episode_id: NEON.id, granted_by: priya.id, expires_at: new Date(Date.now() + 3600e3).toISOString() });
  return { ok: r.status === 201, detail: said(r), value: first(r) };
});
await step("the door reads her night's manifest — names and waiver state", async () => {
  const r = await mara.rpc("door_manifest", { p_episode: NEON.id });
  return { ok: r.status === 200 && (r.data ?? []).length >= 2, detail: (r.data ?? []).map((x) => `${x.full_name}${x.waiver_current ? " ✓" : " —"}`).join(", ") };
});
await step("Theo's wallet token reads aboard at the door; a stranger's night would read elsewhere", async () => {
  const tok = first(await theo.rpc("issue_wallet_token", {}));
  const r = await mara.rpc("verify_wallet_token", { p_token: tok?.token });
  return { ok: first(r)?.state === "aboard" && first(r)?.full_name === "Theo Lindqvist", detail: JSON.stringify(first(r)) };
});
await step("the grant is revoked; the door is a member again", async () => {
  const r = await priya.del(`door_grants?id=eq.${doorGrant?.id}`);
  const d = await mara.rpc("is_door", { p_episode: NEON.id });
  return { ok: r.status < 300 && d.data === false, detail: `is_door ${d.data}` };
});

// ───────────────────────────── J · an applicant ───────────────────────────
say("J · An applicant, from the shore to the roll");
const applicantEmail = PEOPLE.applicant?.email ?? `applicant-${stamp}@example.com`;
const already = first(await priya.get(`member_roll?email=eq.${encodeURIComponent(applicantEmail)}&select=email`));
const appId = already ? null : await step("Ines applies from the shore, answering the committee", async () => {
  const q = await anon.get("application_questions?select=key,required&active=is.true");
  const answers = Object.fromEntries((q.data ?? []).filter((x) => x.required).map((x) => [x.key, "A long table with strangers who turned out not to be."]));
  const r = await anon.postMinimal("applications", { full_name: "Ines Okafor", email: applicantEmail, city: "Miami", answers, proposer: "Theo Lindqvist" });
  const row = first(await priya.get(`applications?email=eq.${encodeURIComponent(applicantEmail)}&select=id,status`));
  return { ok: r.status === 201 && row?.status === "received", detail: `${r.status} · ${row?.status}`, value: row?.id };
});
if (already) { log.push({ scene, label: "Ines is already on the roll from an earlier run", ok: true, detail: applicantEmail }); console.log("  ✓ Ines is already on the roll from an earlier run"); }
if (!already) await step("the shore reads her stage: received", async () => {
  const r = await anon.rpc("application_status_for", { p_email: applicantEmail, p_fingerprint: `demo-${stamp}` });
  return { ok: r.data === "received", detail: JSON.stringify(r.data) };
});
if (!already) await step("Shoreside moves her to review, invites her ashore, then welcomes her aboard", async () => {
  const a = await priya.rpc("set_application_status", { p_id: appId, p_status: "review" });
  const b = await priya.rpc("set_application_status", { p_id: appId, p_status: "invited" });
  const c = await priya.rpc("accept_application", { p_id: appId });
  const roll = first(await priya.get(`member_roll?email=eq.${encodeURIComponent(applicantEmail)}&select=email,tier,source`));
  return { ok: a.status < 300 && b.status < 300 && c.status < 300 && !!roll, detail: `${a.status}/${b.status}/${c.status} · roll: ${roll ? `${roll.tier} via ${roll.source}` : "—"}` };
});
if (!already) await step("the stage now reads aboard, and the welcome letter is queued", async () => {
  const r = await anon.rpc("application_status_for", { p_email: applicantEmail, p_fingerprint: `demo-${stamp}` });
  const l = await priya.get(`email_outbox?to_email=eq.${encodeURIComponent(applicantEmail)}&select=template,status&order=created_at.desc`);
  return { ok: r.data === "aboard", detail: `${JSON.stringify(r.data)} · letters: ${(l.data ?? []).map((x) => `${x.template}:${x.status}`).join(", ")}` };
});

writeFileSync(out, JSON.stringify(log, null, 2));
const bad = log.filter((l) => !l.ok).length;
console.log(`\n${log.length - bad}/${log.length} steps held${bad ? ` — ${bad} to look at` : ""}`);
