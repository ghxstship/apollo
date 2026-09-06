#!/usr/bin/env node
/* The row-level security policies, read from the migration corpus.
 *
 * Two rules, both ratchets. Neither sweeps what is already there; both stop
 * the next policy from being written the slow way.
 *
 *   Run:  node scripts/audit-policies.mjs [--json] [--list]
 *   Exit: 0 when every policy is either compliant or grandfathered.
 *
 * RULE ONE — the wrapped form.
 *   auth.uid() is a SQL function the planner inlines, so written bare it
 *   becomes a current_setting() and a jsonb parse for every candidate row.
 *   public.is_staff() is worse: SECURITY DEFINER, so it cannot be inlined at
 *   all, and a definer call plus a profiles lookup happens per row. Written
 *   as (select auth.uid()) and (select public.is_staff()) each becomes an
 *   InitPlan the executor evaluates once for the whole statement.
 *
 *   The measurement that settled this is in the head of
 *   20260906037000_a_policy_asks_the_session_once_not_once_a_row.sql: on
 *   account_ledger at 250 000 rows, 1 055 ms bare against 10.2 ms wrapped;
 *   on the tables this database actually has today, four tenths of one
 *   millisecond. That is why the ninety-odd existing policies were left
 *   alone and why this gate exists instead. The list below is what was
 *   measured as not worth touching. It is allowed to shrink. It is not
 *   allowed to grow.
 *
 * RULE TWO — no per-row argument to a definer.
 *   is_door(episode_id) takes a column, so there is nothing to hoist: no
 *   amount of wrapping saves it, because the answer genuinely differs per
 *   row. A definer called that way is a query per row. The fix is always the
 *   same shape — ask the definer for the SET once and test membership — and
 *   the same migration did it for the two policies where it was measured to
 *   matter. This rule keeps the shape from coming back.
 *
 * WHY AN ALLOW-LIST OF NAMES AND NOT A COUNT.
 *   A count would let one policy be fixed and another added on the same day
 *   and call it even. A name can only leave the list by being fixed or
 *   dropped, and a name that has left MUST be deleted from the list or this
 *   gate fails — so the list is checked in both directions and cannot rot
 *   into a blanket "ignore what exists". Adding a name is a diff a reviewer
 *   sees, next to the policy that needed it.
 *
 * WHY THE FILES AND NOT THE DATABASE.
 *   This runs in the fast battery, with no Docker and no network. The corpus
 *   on disk is the authority — scripts/replay-migrations.mjs is what proves
 *   the corpus and the database agree — and the effective state of a policy
 *   is whatever the last CREATE, ALTER or DROP in timestamp order left it as.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const MIGRATIONS = join(ROOT, "supabase/migrations");
const JSON_OUT = process.argv.includes("--json");
const LIST = process.argv.includes("--list");

/* ── grandfathered under rule one ─────────────────────────────────────────
   Policies whose USING or WITH CHECK calls auth.uid() or public.is_staff()
   bare, as measured on 2026-09-06. Every one of them is on a table with tens
   to thousands of rows where the wrap was measured at four tenths of a
   millisecond. Remove a name when you wrap it; the gate fails if a name here
   no longer needs to be. */
const GRANDFATHERED_BARE = new Set([
  "public.account_ledger :: staff posts anything",
  "public.addons :: staff write addons",
  "public.api_keys :: staff manage api keys",
  "public.app_errors :: the bridge reads the errors",
  "public.application_questions :: staff keep the questions",
  "public.applications :: staff clear the application queue",
  "public.applications :: staff read applications",
  "public.applications :: staff update applications",
  "public.audit_log :: the bridge reads the log",
  "public.automation_queue :: the bridge reads the queue",
  "public.automations :: staff manage automations",
  "public.broadcasts :: staff strike a broadcast",
  "public.broadcasts :: the bridge reads what was said",
  "public.cabins :: cast and crew read cabins",
  "public.cabins :: staff keep cabins",
  "public.captains_log_envelopes :: the envelope is sealed",
  "public.card_notices :: the bridge reads what was sent about cards",
  "public.charter_options :: staff clear options",
  "public.charter_options :: your own options or staff",
  "public.charter_requests :: a member raises their own request",
  "public.charter_requests :: a member reads their own requests",
  "public.charter_requests :: a member withdraws a standing request",
  "public.charter_requests :: the bridge answers requests",
  "public.cities :: staff keep the cities",
  "public.city_tax :: staff keep the tax table",
  "public.clause_versions :: staff publish clause versions",
  "public.clause_versions :: staff read clause versions",
  "public.clauses :: staff keep the clause library",
  "public.club_products :: cast and crew read products",
  "public.club_products :: staff keep products",
  "public.club_settings :: the bridge turns the dials",
  "public.contest_entries :: enter yourself",
  "public.contest_entries :: entries readable",
  "public.contest_entries :: withdraw yourself",
  "public.contest_results :: results readable",
  "public.contests :: contests readable",
  "public.contests :: contests staff writes",
  "public.counter_signatures :: staff curate counter-signatures",
  "public.counter_signatures :: staff read counter-signatures",
  "public.crew :: staff keep the crew list",
  "public.crew :: staff read every crew member",
  "public.crew_assignments :: staff keep the rota",
  "public.crew_assignments :: staff read the rota",
  "public.crew_blackouts :: staff keep the blackouts",
  "public.crew_candidate_events :: staff read the crew history",
  "public.crew_candidate_events :: staff write the crew history",
  "public.crew_candidates :: staff clear the crew queue",
  "public.crew_candidates :: staff move candidates",
  "public.crew_candidates :: staff read candidates",
  "public.crew_needs :: staff keep the needs",
  "public.crew_positions :: staff keep the positions",
  "public.crew_requests :: manage own crew request",
  "public.crew_roles :: staff write roles",
  "public.debriefs :: a member reads their own debrief",
  "public.debriefs :: a member writes their own debrief",
  "public.debriefs :: staff strike a debrief",
  "public.direct_thread_pairs :: see your own pairs",
  "public.document_clauses :: staff compose documents",
  "public.document_requirements :: staff set requirements",
  "public.document_versions :: members see published versions",
  "public.document_versions :: staff draft versions",
  "public.documents :: members see the document list",
  "public.documents :: staff keep documents",
  "public.door_grants :: a door reads their own grant",
  "public.door_grants :: staff keep the door grants",
  "public.dunning_log :: the bridge reads what was sent",
  "public.dunning_steps :: the bridge reads the ladder",
  "public.editions :: the bridge writes the series",
  "public.element_substitutes :: substitutes are the crew's",
  "public.elements :: the catalogue is the crew's",
  "public.email_outbox :: staff read outbox",
  "public.email_outbox :: the Bridge strikes a letter",
  "public.email_outbox :: the Bridge works the outbox",
  "public.email_suppressions :: the bridge reads suppressions",
  "public.episode_crew_needs :: staff keep the episode needs",
  "public.episode_cuts :: cast and crew read episodes",
  "public.episode_cuts :: staff keep episodes",
  "public.episode_daybeds :: the bridge may strike a daybed",
  "public.episode_daybeds :: your daybed, or the bridge's ledger",
  "public.episode_expenses :: staff keep the expenses",
  "public.episode_legs :: staff post legs",
  "public.episode_media :: aboard members upload",
  "public.episode_media :: members see approved, own, and staff see all",
  "public.episode_media :: staff curate media",
  "public.episode_media :: the uploader amends their own frame",
  "public.episode_media :: the uploader withdraws their own frame",
  "public.episode_radar :: staff set the radar clock",
  "public.episode_segment_caps :: staff set the composition",
  "public.episode_sponsors :: the bridge places the activations",
  "public.episode_stops :: staff post stops",
  "public.episode_vessels :: staff write flotilla",
  "public.episodes :: staff write voyages",
  "public.expense_kinds :: kinds are readable",
  "public.expense_kinds :: staff keep the kinds",
  "public.galley_items :: staff write galley",
  "public.galley_order_items :: read own galley lines",
  "public.galley_order_items :: staff write galley lines",
  "public.galley_orders :: own or staff orders read",
  "public.galley_orders :: staff run the galley",
  "public.galley_orders :: staff update orders",
  "public.installment_plans :: own or staff installments",
  "public.installment_plans :: staff write installments",
  "public.invites :: mint own invite",
  "public.invites :: own invites",
  "public.invoices :: own or staff invoices",
  "public.knots_ledger :: own or staff fathoms",
  "public.log_posts :: staff write the log",
  "public.marks :: marks readable",
  "public.marks :: marks staff writes",
  "public.matches :: staff clear matches",
  "public.matches :: your matches are yours",
  "public.member_blocks :: block someone",
  "public.member_blocks :: see your own blocks",
  "public.member_blocks :: unblock someone",
  "public.member_event_proposals :: a member raises their own proposal",
  "public.member_event_proposals :: a member reads their own proposals",
  "public.member_event_proposals :: a member withdraws a standing proposal",
  "public.member_event_proposals :: the bridge rules on proposals",
  "public.member_event_proposals :: the bridge strikes the record",
  "public.member_marks :: member marks readable",
  "public.member_number_releases :: staff keep the number pool",
  "public.member_qr_tokens :: your own credential",
  "public.member_roll :: staff manage roll",
  "public.membership_pauses :: staff strike a pause window",
  "public.membership_pauses :: your own pauses or staff",
  "public.membership_plans :: staff write plans",
  "public.messages :: delete own message",
  "public.notifications :: a member archives what they have read",
  "public.notifications :: mark word read",
  "public.notifications :: own notifications",
  "public.notifications :: the Bridge strikes a word",
  "public.open_deck_comments :: members comment",
  "public.open_deck_comments :: own comment delete",
  "public.open_deck_comments :: staff moderate comments",
  "public.open_deck_flags :: flag a post",
  "public.open_deck_flags :: lower your own flag",
  "public.open_deck_flags :: own or staff flags",
  "public.open_deck_flags :: staff clear a flag",
  "public.open_deck_flags :: staff resolve flags",
  "public.open_deck_hails :: members hail",
  "public.open_deck_hails :: unhail",
  "public.open_deck_posts :: members post wardroom",
  "public.open_deck_posts :: own post delete",
  "public.open_deck_posts :: staff moderate posts",
  "public.orphaned_media :: staff read orphaned media",
  "public.pass_addons :: read own rsvp addons",
  "public.pass_addons :: staff attach addons",
  "public.pass_credits :: a member reads their own credit",
  "public.pass_guests :: erase a guest who never signed",
  "public.pass_guests :: host manages own guests",
  "public.pass_guests :: staff remove a guest",
  "public.pass_transfers :: offer own pass",
  "public.pass_transfers :: parties read transfers",
  "public.pass_transfers :: parties update transfers",
  "public.pass_transfers :: withdraw your own offer",
  "public.passes :: own rsvp insert",
  "public.passes :: own rsvp update",
  "public.passes :: staff manage rsvps",
  "public.passes :: staff remove an erroneous booking",
  "public.passes :: staff seat a member",
  "public.payment_methods :: own or staff payment methods",
  "public.pod_sessions :: the queue is the crew's",
  "public.pod_sessions :: your own pod session, or the crew's",
  "public.poll_votes :: a member sees their own vote",
  "public.polls :: staff keep the polls",
  "public.preference_boundaries :: you may drop a boundary",
  "public.preference_boundaries :: you may move your own boundaries",
  "public.preference_boundaries :: you set your own boundaries",
  "public.preference_boundaries :: your boundaries, and the vetting team's",
  "public.preference_sheets :: staff clear a sheet",
  "public.preference_sheets :: you answer for yourself",
  "public.preference_sheets :: you may change your mind",
  "public.preference_sheets :: your sheet, and the vetting team's",
  "public.producer_turns :: staff read producer turns",
  "public.products :: staff write products",
  "public.profiles :: own profile or staff",
  "public.profiles :: own profile update",
  "public.profiles :: staff correct member records",
  "public.promo_codes :: staff manage promo codes",
  "public.push_outbox :: staff read push outbox",
  "public.push_outbox :: the Bridge strikes a push",
  "public.push_outbox :: the Bridge works the outbox",
  "public.push_subscriptions :: manage own push subs",
  "public.radar_picks :: plot from your own pass",
  "public.radar_picks :: unplot your own course",
  "public.radar_picks :: your own picks and no one else's",
  "public.reward_redemptions :: own or staff redemptions",
  "public.reward_redemptions :: staff strike a redemption",
  "public.rewards :: staff write rewards",
  "public.run_of_show :: the board is the crew's",
  "public.saved_segments :: staff manage segments",
  "public.seasons :: the bridge writes the seasons",
  "public.series :: cast and crew read formats",
  "public.series :: staff keep formats",
  "public.shared_anchors :: an anchor surfaces once it is opened",
  "public.shared_anchors :: staff clear an anchor",
  "public.shared_anchors :: staff may cut an anchor short",
  "public.shop_order_items :: read own shop lines",
  "public.shop_order_items :: staff write shop lines",
  "public.shop_orders :: member requests refund",
  "public.shop_orders :: own or staff shop orders",
  "public.shop_orders :: staff place shop order",
  "public.shop_orders :: staff remove an erroneous order",
  "public.shop_orders :: staff update shop orders",
  "public.signatures :: own or staff signatures",
  "public.sms_outbox :: staff read sms outbox",
  "public.sms_outbox :: the Bridge strikes a text",
  "public.sms_outbox :: the Bridge works the outbox",
  "public.sms_templates :: staff keep sms templates",
  "public.sponsor_tiers :: the bridge writes the rate card",
  "public.sponsors :: the bridge keeps the sponsor book",
  "public.status_lookups :: staff read status lookups",
  "public.stripe_events :: the bridge reads the stripe log",
  "public.subscriptions :: own or staff subscriptions",
  "public.subscriptions :: staff write subscriptions",
  "public.table_picks :: pick from your own chair",
  "public.table_picks :: staff clear picks",
  "public.table_picks :: staff read picks",
  "public.table_picks :: your own picks",
  "public.table_seats :: release your own seat",
  "public.table_seats :: staff clear tables",
  "public.tables :: staff keep tables",
  "public.thread_members :: leave a thread you are in",
  "public.thread_members :: mark own thread read",
  "public.thread_members :: shoreside keeps its seat",
  "public.thread_members :: shoreside takes a seat",
  "public.thread_members :: staff manage the roster",
  "public.venues :: the bridge writes the venues",
  "public.vessels :: staff assign berths",
  "public.vessels :: staff write fleet",
  "public.vetting_files :: the vetting file is the vetting team's",
  "public.waitlist_entries :: join the line yourself",
  "public.waitlist_entries :: leave the line yourself",
  "public.waitlist_entries :: staff work the line",
  "public.waitlist_entries :: your place in line",
  "public.wallet_registrations :: the bridge reads which phones hold a pass",
  "public.wallet_tokens :: your own wallet token",
  "public.webhook_deliveries :: staff read deliveries",
  "public.webhooks :: staff manage webhooks",
  "storage.objects :: aboard members upload episode media",
  "storage.objects :: owner or staff reads episode media",
  "storage.objects :: owner or staff removes episode media",
]);

/* ── grandfathered under rule two ─────────────────────────────────────────
   Policies that hand a column to a project function. Each one is a query per
   candidate row and none of them can be helped by wrapping. The two that
   were measured to matter have been rewritten as set lookups; these are what
   is left, with the reason each was left. */
const GRANDFATHERED_PER_ROW = new Map([
  ["public.pass_guests :: erase a guest who never signed",
    "guest_has_signed(id) reads signatures, which the host cannot read directly for a " +
    "guest seated without a pass — inlining it would widen who may delete a signed guest. " +
    "A DELETE names its rows, so the call runs once or twice, not per table row. " +
    "The reasoning is written out in 20260906104857_a_policy_asks_for_the_set_not_for_every_row.sql."],
]);

/* ── the corpus, statement by statement ───────────────────────────────────
   A hand-rolled splitter rather than a parser: strip comments, respect
   single quotes, double-quoted identifiers and dollar quoting (the corpus is
   full of $function$ bodies that contain semicolons), then cut on the
   semicolons that are left. */
function statements(sql) {
  const out = [];
  let buf = "";
  for (let i = 0; i < sql.length; i++) {
    const c = sql[i];
    const two = sql.slice(i, i + 2);
    if (two === "--") {
      const nl = sql.indexOf("\n", i);
      i = nl === -1 ? sql.length : nl - 1;
      continue;
    }
    if (two === "/*") {
      let depth = 1;
      let j = i + 2;
      while (j < sql.length && depth > 0) {
        if (sql.slice(j, j + 2) === "/*") { depth++; j += 2; }
        else if (sql.slice(j, j + 2) === "*/") { depth--; j += 2; }
        else j++;
      }
      i = j - 1;
      continue;
    }
    if (c === "'" || c === '"') {
      let j = i + 1;
      while (j < sql.length) {
        if (sql[j] === c && sql[j + 1] === c) { j += 2; continue; }
        if (sql[j] === c) break;
        j++;
      }
      buf += sql.slice(i, j + 1);
      i = j;
      continue;
    }
    if (c === "$") {
      const tag = /^\$[A-Za-z_][A-Za-z0-9_]*\$|^\$\$/.exec(sql.slice(i));
      if (tag) {
        const end = sql.indexOf(tag[0], i + tag[0].length);
        const stop = end === -1 ? sql.length : end + tag[0].length;
        buf += sql.slice(i, stop);
        i = stop - 1;
        continue;
      }
    }
    if (c === ";") { out.push(buf); buf = ""; continue; }
    buf += c;
  }
  if (buf.trim()) out.push(buf);
  return out;
}

/* Several dozen policies in this corpus are created inside a DO block, behind
   an `if not exists (select 1 from pg_policy …) then` guard, so the statement
   splitter sees one DO and nothing else. Every such guard in the corpus is an
   idempotence check rather than a condition on the data, so the body is read
   as if it had been written at the top level. */
function expanded(text) {
  const out = [];
  for (const s of statements(text)) {
    const doBlock = /^\s*do\s+(\$[A-Za-z_][A-Za-z0-9_]*\$|\$\$)/is.exec(s);
    if (!doBlock) { out.push(s); continue; }
    const tag = doBlock[1];
    const from = s.indexOf(tag) + tag.length;
    const to = s.lastIndexOf(tag);
    out.push(...(to > from ? statements(s.slice(from, to)) : []));
  }
  return out;
}

/* `"a name" on public.t` or `a_name on t` — the identifier grammar policies
   are written with in this corpus. */
const NAME = `(?:"((?:[^"]|"")*)"|([a-z_][a-z0-9_$]*))`;
const TARGET = `(?:${NAME}\\s*\\.\\s*)?${NAME}`;
const HEAD = (verb) =>
  new RegExp(`^\\s*${verb}\\s+policy\\s+(?:if\\s+exists\\s+)?${NAME}\\s+on\\s+(?:table\\s+)?${TARGET}`, "is");
const RENAME = new RegExp(
  `^\\s*alter\\s+table\\s+(?:if\\s+exists\\s+)?(?:only\\s+)?${TARGET}\\s+rename\\s+to\\s+${NAME}`, "is");
const DROP_TABLE = new RegExp(
  `^\\s*drop\\s+table\\s+(?:if\\s+exists\\s+)?${TARGET}`, "is");

const unquote = (q, bare) => (q === undefined ? bare : q.replace(/""/g, '"'));

function readPolicies() {
  const files = readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort();
  const live = new Map(); /* key -> { key, using, check, file } */
  const functions = new Set();

  for (const file of files) {
    const text = readFileSync(join(MIGRATIONS, file), "utf8");
    for (const m of text.matchAll(/create\s+(?:or\s+replace\s+)?function\s+(?:public\s*\.\s*)?([a-z_][a-z0-9_]*)\s*\(/gi)) {
      functions.add(m[1].toLowerCase());
    }
    for (const raw of expanded(text)) {
      const s = raw.trim();

      /* A table that is renamed takes its policies with it, and this corpus
         renames a lot of them — rsvps to passes, voyages to episodes, the
         wardroom to the open deck. A rename that is not followed leaves the
         gate reporting policies on tables that have not existed for months.
         A dropped table takes its policies with it too. */
      const ren = RENAME.exec(s);
      if (ren) {
        const from = `${unquote(ren[1], ren[2]) ?? "public"}.${unquote(ren[3], ren[4])}`;
        const to = `${unquote(ren[1], ren[2]) ?? "public"}.${unquote(ren[5], ren[6])}`;
        for (const [key, p] of [...live]) {
          if (!key.startsWith(`${from} :: `)) continue;
          live.delete(key);
          const moved = `${to} :: ${key.slice(from.length + 4)}`;
          live.set(moved, { ...p, key: moved });
        }
        continue;
      }
      const dropped = DROP_TABLE.exec(s);
      if (dropped) {
        const t = `${unquote(dropped[1], dropped[2]) ?? "public"}.${unquote(dropped[3], dropped[4])} :: `;
        for (const key of [...live.keys()]) if (key.startsWith(t)) live.delete(key);
        continue;
      }

      const start = /\b(create|alter|drop)\s+policy\b/is.exec(s);
      if (!start) continue;
      /* Policy DDL written inside a STRING is not policy DDL.
         20260906202000 rewrites eighty-nine policies programmatically, so it
         holds `format('alter policy %I on %I.%I', …)` — which reads to this
         parser as a statement whose table name is a format specifier, and
         threw. A statement the database builds at run time cannot be read
         statically anyway: the ratchet's business is the DDL somebody wrote
         down, and this one's effect is asserted inside its own transaction
         instead. Detected by counting the unescaped quotes before the match:
         an odd number means the match is inside one. */
      if (((s.slice(0, start.index).match(/(?<!')'(?!')/g) ?? []).length % 2) === 1) continue;
      const stmt = s.slice(start.index);
      const verb = start[1].toLowerCase();
      const head = HEAD(verb).exec(stmt);
      if (!head) throw new Error(`${file}: could not read the head of\n${stmt.slice(0, 160)}`);
      const [, pq, pb, sq, sb, tq, tb] = head;
      const key = `${unquote(sq, sb) ?? "public"}.${unquote(tq, tb)} :: ${unquote(pq, pb)}`;
      const body = stmt.slice(head[0].length);

      if (verb === "drop") { live.delete(key); continue; }
      const using = clause(body, "using");
      const check = clause(body, "with\\s+check");
      if (verb === "create") { live.set(key, { key, using, check, file }); continue; }
      const prev = live.get(key) ?? { key, using: null, check: null, file };
      live.set(key, {
        key,
        using: using === null ? prev.using : using,
        check: check === null ? prev.check : check,
        file,
      });
    }
  }
  return { live, functions };
}

/* The parenthesised expression after USING / WITH CHECK, balanced. */
function clause(body, keyword) {
  const at = new RegExp(`\\b${keyword}\\s*\\(`, "is").exec(body);
  if (!at) return null;
  let depth = 0;
  const from = at.index + at[0].length - 1;
  for (let i = from; i < body.length; i++) {
    const c = body[i];
    if (c === "'" || c === '"') {
      let j = i + 1;
      while (j < body.length) {
        if (body[j] === c && body[j + 1] === c) { j += 2; continue; }
        if (body[j] === c) break;
        j++;
      }
      i = j;
      continue;
    }
    if (c === "(") depth++;
    else if (c === ")") { depth--; if (depth === 0) return body.slice(from, i + 1); }
  }
  return body.slice(from);
}

/* ── the two rules ────────────────────────────────────────────────────────
   Both read the expression with its string literals blanked, so a policy that
   mentions auth.uid() inside a text constant is not accused of calling it. */
const blanked = (e) => e.replace(/'(?:[^']|'')*'/g, "''").replace(/\s+/g, " ");

function bareCalls(expr) {
  const flat = blanked(expr);
  const found = new Set();
  for (const [re, label] of [
    [/\bauth\s*\.\s*uid\s*\(\s*\)/gi, "auth.uid()"],
    [/\b(?:public\s*\.\s*)?is_staff\s*\(\s*\)/gi, "public.is_staff()"],
    /* is_active() has the same shape and the same cost as is_staff(): no
       argument, STABLE, SECURITY DEFINER, so the planner cannot inline it and
       calls it once a row. It was left out of the first cut of this rule
       because adding it means adding its existing callers to the list, and
       that was not the author's call to make alone. It is covered now, on the
       same terms as the other two: what exists is grandfathered by NAME, and a
       name only leaves by being fixed. */
    [/\b(?:public\s*\.\s*)?is_active\s*\(\s*\)/gi, "public.is_active()"],
  ]) {
    for (const m of flat.matchAll(re)) {
      const before = flat.slice(Math.max(0, m.index - 48), m.index);
      if (!/\(\s*select\s+(?:public\s*\.\s*)?$/i.test(before)) found.add(label);
    }
  }
  return [...found];
}

/* A project function given something other than a literal — that is a call
   per candidate row and no wrapping hoists it. */
function perRowCalls(expr, functions) {
  const flat = blanked(expr);
  const found = new Set();
  for (const m of flat.matchAll(/\b(?:public\s*\.\s*)?([a-z_][a-z0-9_]*)\s*\(([^()]*)\)/gi)) {
    const [, name, args] = m;
    if (!functions.has(name.toLowerCase())) continue;
    const a = args.trim();
    if (a === "" || /^(?:''(?:::[a-z_ ]+)?|-?\d+(?:\.\d+)?|true|false|null)$/i.test(a)) continue;
    found.add(`${name}(${a})`);
  }
  return [...found];
}

/* ── report ───────────────────────────────────────────────────────────────*/
const { live, functions } = readPolicies();
const bare = [];
const perRow = [];
for (const p of [...live.values()].sort((a, b) => a.key.localeCompare(b.key))) {
  const expr = [p.using, p.check].filter(Boolean).join(" ");
  if (!expr) continue;
  const b = bareCalls(expr);
  if (b.length) bare.push({ ...p, calls: b });
  const r = perRowCalls(expr, functions);
  if (r.length) perRow.push({ ...p, calls: r });
}

const newBare = bare.filter((p) => !GRANDFATHERED_BARE.has(p.key));
const newPerRow = perRow.filter((p) => !GRANDFATHERED_PER_ROW.has(p.key));
const bareKeys = new Set(bare.map((p) => p.key));
const perRowKeys = new Set(perRow.map((p) => p.key));
const staleBare = [...GRANDFATHERED_BARE].filter((k) => !bareKeys.has(k));
const stalePerRow = [...GRANDFATHERED_PER_ROW.keys()].filter((k) => !perRowKeys.has(k));

if (LIST) {
  for (const p of bare) console.log(`bare      ${p.key}  (${p.calls.join(", ")})`);
  for (const p of perRow) console.log(`per-row   ${p.key}  (${p.calls.join(", ")})`);
}

const failures = [];
for (const p of newBare) {
  failures.push([
    `${p.key}`,
    `  calls ${p.calls.join(" and ")} bare, last touched in ${p.file}.`,
    `  Write it as (select auth.uid()) / (select public.is_staff()) so the session is`,
    `  asked once for the statement instead of once for every candidate row.`,
  ].join("\n"));
}
for (const p of newPerRow) {
  failures.push([
    `${p.key}`,
    `  hands a column to ${p.calls.join(" and ")}, last touched in ${p.file}.`,
    `  A definer with a per-row argument is a query per row and wrapping cannot hoist it.`,
    `  Ask for the set once instead: col in (select ... where profile_id = (select auth.uid())).`,
  ].join("\n"));
}
for (const k of staleBare) {
  failures.push([
    `${k}`,
    `  is on the grandfathered bare-call list but no longer makes one.`,
    `  Delete the line from GRANDFATHERED_BARE in this script. The list only shrinks,`,
    `  and it only stays honest if a fixed policy leaves it.`,
  ].join("\n"));
}
for (const k of stalePerRow) {
  failures.push([
    `${k}`,
    `  is on the grandfathered per-row list but no longer makes such a call.`,
    `  Delete its entry from GRANDFATHERED_PER_ROW in this script.`,
  ].join("\n"));
}

if (JSON_OUT) {
  console.log(JSON.stringify({
    policies: live.size,
    bare: bare.length,
    perRow: perRow.length,
    grandfatheredBare: GRANDFATHERED_BARE.size,
    grandfatheredPerRow: GRANDFATHERED_PER_ROW.size,
    failures: failures.length,
    newBare: newBare.map((p) => p.key),
    newPerRow: newPerRow.map((p) => p.key),
    staleBare,
    stalePerRow,
  }, null, 2));
} else if (failures.length) {
  console.error(`\npolicy gate — ${failures.length} to answer for\n`);
  for (const f of failures) console.error(f + "\n");
  console.error(
    `${live.size} policies read from ${MIGRATIONS.replace(ROOT + "/", "")}; ` +
    `${GRANDFATHERED_BARE.size} bare and ${GRANDFATHERED_PER_ROW.size} per-row calls are grandfathered.`
  );
} else {
  console.log(
    `policies ${live.size} · bare calls ${bare.length}/${GRANDFATHERED_BARE.size} grandfathered · ` +
    `per-row calls ${perRow.length}/${GRANDFATHERED_PER_ROW.size} grandfathered`
  );
}

process.exit(failures.length ? 1 : 0);
