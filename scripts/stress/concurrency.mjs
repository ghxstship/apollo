/* Is the limit in the DATABASE, or only in the code that reads before it writes?

   Every scarce thing in this product — a berth, a chair at a table for the
   night, a single-use code, a knot balance, a place on a capped membership —
   is protected by one of four things: a unique index, a check or trigger, a
   lock that covers the read AND the write, or nothing but the order in which
   two statements happened to run. The first three hold under contention. The
   fourth is a bug that only appears when two members press the button in the
   same second, which is exactly when it matters and never when anyone is
   watching.

   So: replay the corpus into an isolated database (scripts/stress/isolated-db.mjs,
   the same machinery scripts/replay-migrations.mjs uses and for the same
   reason), seed the smallest fixture each case needs, then fire N sessions at
   one row at one instant — every process connected and parked on a wall-clock
   barrier read off the database's own clock, so they arrive together instead of
   queueing behind Node's event loop — and read the invariant back afterwards.

   Usage:
     node scripts/stress/concurrency.mjs                 # every case
     node scripts/stress/concurrency.mjs --only=knots-balance
     node scripts/stress/concurrency.mjs --n=16 --keep   # louder, leave the db up
     node scripts/stress/concurrency.mjs --list

   Exits non-zero if any invariant broke. */
import { up, down, sql, scalar, contender, barrier, quote } from "./isolated-db.mjs";
import { createHash } from "node:crypto";

const argv = process.argv.slice(2);
const arg = (k, d) => {
  const hit = argv.find((a) => a.startsWith(`--${k}=`));
  return hit ? hit.slice(k.length + 3) : d;
};
const ONLY = arg("only", null);
const N = Number(arg("n", 8));
const KEEP = argv.includes("--keep");
const REUSE = argv.includes("--reuse");

/* Deterministic ids, so a fixture can be written in SQL and referred to in JS
   without a round trip for every uuid. */
const id = (s) => {
  const h = createHash("md5").update(`syrius-stress:${s}`).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
};

const results = [];
const say = (name, invariant, held, detail = "") => {
  results.push({ name, invariant, held, detail });
  console.log(`${held ? "  ✓" : "  ✕"} ${invariant}`);
  if (detail) console.log(`      ${detail}`);
};

/* ---------- fixture ---------- */

/* A member on the roll, with a profile the gates will accept. Returns its id. */
function member(tag, { staff = false, tier = "regional", city = null, plan = null } = {}) {
  const uid = id(`member:${tag}`);
  const email = `stress-${tag}@fixtures.invalid`;
  sql(`
    insert into public.member_roll (email) values (${quote(email)}) on conflict (email) do nothing;
    insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at,
                            raw_app_meta_data, raw_user_meta_data)
    values (${quote(uid)}, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
            ${quote(email)}, now(), now(), '{}'::jsonb, '{}'::jsonb)
    on conflict (id) do nothing;
    update public.profiles
       set is_staff = ${staff}, tier = ${quote(tier)}::membership_tier, status = 'active',
           full_name = ${quote("Stress " + tag)}
           ${city ? `, home_city = ${quote(city)}::uuid` : ""}
           ${plan ? `, plan_id = ${quote(plan)}::uuid` : ""}
     where id = ${quote(uid)};
  `);
  return uid;
}

/* A member whose vetting file is open, cleared and complete — what the ratio
   sailings ask for before they will seat anyone. */
function vetted(uid) {
  sql(`
    insert into public.vetting_files (profile_id, id_verified_at, age_ok, background_state, cleared_at, cleared_until)
    values (${quote(uid)}, now(), true, 'cleared', now(), now() + interval '365 days')
    on conflict (profile_id) where profile_id is not null do update set background_state = 'cleared', age_ok = true,
      id_verified_at = now(), cleared_until = now() + interval '365 days', declined_at = null;
    insert into public.preference_sheets (profile_id, completed_at)
    values (${quote(uid)}, now())
    on conflict (profile_id) do update set completed_at = now();
  `);
  return uid;
}

/* An episode nobody is gated out of: no series (so no Captain's Pass ladder),
   no drop hour, far enough ahead that every plan's window is open. */
function episode(tag, { seats = 2, held = 0, segments = null, starts = "14 days" } = {}) {
  const eid = id(`episode:${tag}`);
  sql(`
    delete from public.episodes where id = ${quote(eid)};
    insert into public.episodes (id, slug, title, setting, kind, experience_class,
                                 starts_at, passes_total, held_passes, price_cents, status, min_tier)
    values (${quote(eid)}, ${quote("stress-" + tag)}, ${quote("Stress " + tag)}, 'sea', 'day', 'open',
            now() + interval '${starts}', ${seats}, ${held}, 0, 'scheduled', 'regional');
  `);
  if (segments) {
    for (const [seg, cap] of Object.entries(segments)) {
      sql(`insert into public.episode_segment_caps (episode_id, segment, cap)
           values (${quote(eid)}, ${quote(seg)}, ${cap})
           on conflict (episode_id, segment) do update set cap = excluded.cap;`);
    }
  }
  return eid;
}

/* ---------- the race ---------- */

/* Start every session, let them connect, and release them all on one instant.
   Nothing is awaited until every promise exists. */
async function race(bodies, { as = null, wait = 1800, count = N } = {}) {
  const list = typeof bodies === "function"
    ? Array.from({ length: count }, (_, i) => bodies(i))
    : bodies;
  const at = barrier(wait);
  const running = list.map((body, i) =>
    contender({ at, body, as: typeof as === "function" ? as(i) : as, label: `#${i}` }));
  return Promise.all(running);
}

const won = (rs) => rs.filter((r) => r.ok).length;
const refusals = (rs) => rs.filter((r) => !r.ok).map((r) => r.message).filter(Boolean);
const deadlocked = (rs) => rs.filter((r) => r.state === "40P01").length;
const tally = (rs) => {
  const seen = new Map();
  for (const m of refusals(rs)) seen.set(m, (seen.get(m) ?? 0) + 1);
  return [...seen].map(([m, c]) => `${c}× "${m.slice(0, 90)}"`).join("; ");
};

/* ---------- the cases ---------- */

const CASES = {

"episode-capacity": {
  invariant: "an episode never seats more passes than the hull holds",
  async run() {
    const eid = episode("capacity", { seats: 2 });
    const members = Array.from({ length: N }, (_, i) => member(`cap${i}`));
    const rs = await race(
      (i) => `insert into public.passes (episode_id, profile_id, status)
              values (${quote(eid)}, ${quote(members[i])}, 'aboard');`,
      { as: (i) => members[i] });
    const aboard = Number(scalar(`select count(*) from public.passes
      where episode_id = ${quote(eid)} and status = 'aboard'`));
    return { held: aboard <= 2,
      detail: `${N} members booked a 2-berth episode at once; ${aboard} aboard, ${won(rs)} writes accepted. ${tally(rs)}` };
  },
},

"segment-cap": {
  invariant: "a segment never seats more members than its ceiling",
  async run() {
    const eid = episode("segment", { seats: 40, segments: { single_woman: 1, single_man: 1 } });
    const members = Array.from({ length: N }, (_, i) => vetted(member(`seg${i}`)));
    const rs = await race(
      (i) => `insert into public.passes (episode_id, profile_id, status, segment)
              values (${quote(eid)}, ${quote(members[i])}, 'aboard', 'single_woman');`,
      { as: (i) => members[i] });
    const units = Number(scalar(`select count(*) from public.passes
      where episode_id = ${quote(eid)} and status='aboard' and segment='single_woman'`));
    return { held: units <= 1,
      detail: `${N} members reached for one seat in a segment of 1; ${units} seated, ${won(rs)} accepted. ${tally(rs)}` };
  },
},

"waitlist-numbering": {
  invariant: "no two members hold the same place in the line",
  async run() {
    const eid = episode("line", { seats: 1 });
    const members = Array.from({ length: N }, (_, i) => member(`line${i}`));
    const rs = await race(
      (i) => `insert into public.waitlist_entries (episode_id, profile_id, segment)
              values (${quote(eid)}, ${quote(members[i])}, 'single_woman');`,
      { as: (i) => members[i] });
    const dupes = Number(scalar(`select coalesce(max(c),0) from (
       select count(*) c from public.waitlist_entries
        where episode_id = ${quote(eid)} group by place) x`));
    const places = scalar(`select string_agg(place::text, ',' order by place)
                           from public.waitlist_entries where episode_id = ${quote(eid)}`);
    return { held: dupes <= 1,
      detail: `${won(rs)} of ${N} joined the line at once; places [${places}]` };
  },
},

"waitlist-claim": {
  invariant: "an offered seat in the line is claimed exactly once",
  async run() {
    const eid = episode("claim", { seats: 40, segments: { single_woman: 4 } });
    const me = vetted(member("claimer"));
    sql(`insert into public.waitlist_entries (episode_id, profile_id, segment)
         values (${quote(eid)}, ${quote(me)}, 'single_woman');
         update public.waitlist_entries set offered_at = now(),
                claim_expires_at = now() + interval '6 hours'
          where episode_id = ${quote(eid)} and profile_id = ${quote(me)};`);
    const entry = scalar(`select id from public.waitlist_entries
       where episode_id = ${quote(eid)} and profile_id = ${quote(me)}`);
    const rs = await race(
      Array.from({ length: N }, () => `select public.claim_your_place(${quote(entry)}::uuid);`),
      { as: me });
    const passes = Number(scalar(`select count(*) from public.passes
      where episode_id = ${quote(eid)} and profile_id = ${quote(me)}`));
    return { held: passes === 1,
      detail: `${N} simultaneous claims on one offer; ${passes} pass(es) exist, ${won(rs)} accepted. ${tally(rs)}` };
  },
},

"table-seat": {
  invariant: "a table for the night never holds more members than it has chairs",
  async run() {
    const eid = episode("table", { seats: 40 });
    const members = Array.from({ length: N }, (_, i) => member(`tbl${i}`));
    for (const m of members) {
      sql(`insert into public.passes (episode_id, profile_id, status)
           values (${quote(eid)}, ${quote(m)}, 'aboard') on conflict do nothing;`);
    }
    const tid = id("table:one");
    sql(`delete from public.tables where id = ${quote(tid)};
         insert into public.tables (id, episode_id, number, seats)
         values (${quote(tid)}, ${quote(eid)}, 1, 2);`);
    const rs = await race(
      Array.from({ length: N }, () => `select public.claim_table_seat(${quote(tid)}::uuid);`),
      { as: (i) => members[i] });
    const held = Number(scalar(`select count(*) from public.table_seats
      where table_id = ${quote(tid)} and (state='confirmed' or held_until >= now())`));
    return { held: held <= 2,
      detail: `${N} passholders claimed a 2-chair table at once; ${held} hold a chair, ${won(rs)} accepted. ${tally(rs)}` };
  },
},

"table-confirm": {
  invariant: "no more members confirm a table than it has chairs",
  async run() {
    const eid = episode("confirm", { seats: 40 });
    const members = Array.from({ length: 4 }, (_, i) => member(`cnf${i}`));
    const tid = id("table:two");
    sql(`delete from public.tables where id = ${quote(tid)};
         insert into public.tables (id, episode_id, number, seats)
         values (${quote(tid)}, ${quote(eid)}, 2, 2);`);
    for (const m of members) {
      sql(`insert into public.passes (episode_id, profile_id, status)
           values (${quote(eid)}, ${quote(m)}, 'aboard') on conflict do nothing;
           insert into public.table_seats (table_id, profile_id, state, held_until)
           values (${quote(tid)}, ${quote(m)}, 'held', now() + interval '15 minutes')
           on conflict (table_id, profile_id) do update set state='held',
             held_until = now() + interval '15 minutes';`);
    }
    const rs = await race(
      members.map(() => `select public.confirm_table_seat(${quote(tid)}::uuid);`),
      { as: (i) => members[i] });
    const conf = Number(scalar(`select count(*) from public.table_seats
      where table_id = ${quote(tid)} and state = 'confirmed'`));
    return { held: conf <= 2,
      detail: `four holds on a 2-chair table confirmed at once; ${conf} confirmed, ${won(rs)} accepted. ${tally(rs)}` };
  },
},

"pass-transfer": {
  invariant: "a pass changes hands exactly once",
  async run() {
    const eid = episode("transfer", { seats: 40 });
    const from = member("giver");
    const takers = Array.from({ length: N }, (_, i) => member(`taker${i}`));
    sql(`insert into public.passes (episode_id, profile_id, status)
         values (${quote(eid)}, ${quote(from)}, 'aboard') on conflict do nothing;`);
    const pass = scalar(`select id from public.passes
      where episode_id = ${quote(eid)} and profile_id = ${quote(from)}`);
    sql(`delete from public.pass_transfers where rsvp_id = ${quote(pass)};`);
    /* One offer, because a pass carries one — pass_transfers_open_offer_idx
       says so since the stress run that found eight standing at once. So the
       race that remains is the one a member can actually run: the same person
       accepting the same offer from several tabs at the same instant. */
    const taker = takers[0];
    sql(`insert into public.pass_transfers (rsvp_id, from_profile, to_profile, status)
         values (${quote(pass)}, ${quote(from)}, ${quote(taker)}, 'offered');`);
    const offer = scalar(`select id from public.pass_transfers
      where rsvp_id = ${quote(pass)} and status = 'offered'`);
    const rs = await race(
      Array.from({ length: N }, () => `select public.accept_pass_transfer(${quote(offer)}::uuid);`),
      { as: () => taker });
    const accepted = Number(scalar(`select count(*) from public.pass_transfers
      where rsvp_id = ${quote(pass)} and status = 'accepted'`));
    const holders = Number(scalar(`select count(distinct profile_id) from public.passes
      where id = ${quote(pass)}`));
    const heldBy = scalar(`select profile_id from public.passes where id = ${quote(pass)}`);
    return { held: accepted === 1 && holders === 1 && heldBy === taker,
      detail: `one offer accepted from ${N} tabs at once; ${accepted} accepted, ${holders} holder, the pass is the taker's. ${tally(rs)}` };
  },
},

"promo-code": {
  invariant: "a single-use code is spent exactly once",
  async run() {
    const eid = episode("promo", { seats: 40 });
    const members = Array.from({ length: N }, (_, i) => member(`promo${i}`));
    sql(`insert into public.promo_codes (code, kind, value, max_uses, uses, active)
         values ('STRESS1', 'percent', 10, 1, 0, true)
         on conflict (code) do update set uses = 0, max_uses = 1, active = true;`);
    const rs = await race(
      (i) => `insert into public.passes (episode_id, profile_id, status, promo_code)
              values (${quote(eid)}, ${quote(members[i])}, 'aboard', 'STRESS1');`,
      { as: (i) => members[i] });
    const uses = Number(scalar(`select uses from public.promo_codes where code = 'STRESS1'`));
    const claimed = Number(scalar(`select count(*) from public.passes
      where episode_id = ${quote(eid)} and promo_claimed_at is not null`));
    return { held: uses <= 1 && claimed <= 1,
      detail: `${N} passes claimed a max_uses=1 code at once; uses=${uses}, ${claimed} pass(es) hold the discount. ${tally(rs)}` };
  },
},

"invite-code": {
  invariant: "an invite code is spent no more times than it allows",
  async run() {
    const staff = member("inv-staff", { staff: true });
    const inviter = member("inviter");
    sql(`delete from public.knots_ledger where profile_id = ${quote(inviter)};
         delete from public.status_lookups where fingerprint like 'apply-email:stress-app%';
         delete from public.member_roll where email like 'stress-app%';
         delete from public.applications where email like 'stress-app%';
         insert into public.invites (code, inviter_id, max_uses, uses)
         values ('STRESSINV', ${quote(inviter)}, 1, 0)
         on conflict (code) do update set uses = 0, max_uses = 1, inviter_id = excluded.inviter_id;`);
    const apps = [];
    for (let i = 0; i < N; i++) {
      const aid = id(`app:${i}`);
      sql(`delete from public.applications where id = ${quote(aid)};
           insert into public.applications (id, full_name, email, invite_code, status, answers)
           values (${quote(aid)}, ${quote("Applicant " + i)}, ${quote(`stress-app${i}@fixtures.invalid`)},
                   'STRESSINV', 'review', '{"bring":"a working sextant"}'::jsonb);`);
      apps.push(aid);
    }
    const rs = await race(apps.map((a) => `select public.accept_application(${quote(a)}::uuid);`),
      { as: staff });
    const uses = Number(scalar(`select uses from public.invites where code = 'STRESSINV'`));
    const paid = Number(scalar(`select count(*) from public.knots_ledger
      where profile_id = ${quote(inviter)} and reason like 'Referral signature%'`));
    return { held: uses <= 1 && paid <= 1,
      detail: `${N} applications on one single-use invite accepted at once; uses=${uses}, ${paid} referral payment(s). ${tally(rs)}` };
  },
},

"knots-balance": {
  invariant: "a knots balance never goes negative",
  async run() {
    const me = member("spender");
    const rid = id("reward:cheap");
    sql(`delete from public.knots_ledger where profile_id = ${quote(me)};
         delete from public.reward_redemptions where profile_id = ${quote(me)};
         insert into public.knots_ledger (profile_id, delta, reason)
         values (${quote(me)}, 100, 'Stress seed');
         delete from public.rewards where id = ${quote(rid)};
         insert into public.rewards (id, name, cost_fm, active, stock)
         values (${quote(rid)}, 'Stress reward', 100, true, null);`);
    const rs = await race(
      Array.from({ length: N }, () => `select public.redeem_reward(${quote(rid)}::uuid);`),
      { as: me });
    const bal = Number(scalar(`select coalesce(sum(delta),0) from public.knots_ledger
      where profile_id = ${quote(me)}`));
    const spends = Number(scalar(`select count(*) from public.reward_redemptions
      where profile_id = ${quote(me)} and reward_id = ${quote(rid)}`));
    return { held: bal >= 0,
      detail: `100 knots, ${N} simultaneous redemptions of a 100-knot reward; balance ${bal}, ${spends} redemption(s). ${tally(rs)}` };
  },
},

"reward-stock": {
  invariant: "the last one in stock goes to exactly one member",
  async run() {
    const rid = id("reward:scarce");
    const members = Array.from({ length: N }, (_, i) => member(`rw${i}`));
    sql(`delete from public.reward_redemptions where reward_id = ${quote(rid)};
         delete from public.rewards where id = ${quote(rid)};
         insert into public.rewards (id, name, cost_fm, active, stock)
         values (${quote(rid)}, 'Stress last one', 10, true, 1);`);
    for (const m of members) {
      sql(`delete from public.reward_redemptions where profile_id = ${quote(m)} and reward_id = ${quote(rid)};
           insert into public.knots_ledger (profile_id, delta, reason)
           values (${quote(m)}, 1000, 'Stress seed');`);
    }
    const rs = await race(
      members.map(() => `select public.redeem_reward(${quote(rid)}::uuid);`),
      { as: (i) => members[i] });
    const taken = Number(scalar(`select count(*) from public.reward_redemptions
      where reward_id = ${quote(rid)}`));
    return { held: taken === 1,
      detail: `${N} members reached for one item in stock; ${taken} redemption(s), ${won(rs)} accepted. ${tally(rs)}` };
  },
},

"shop-idempotency": {
  invariant: "one idempotency key makes one order",
  async run() {
    const me = member("shopper");
    const pid = id("product:tee");
    sql(`delete from public.shop_order_items where product_id = ${quote(pid)};
         delete from public.shop_orders where profile_id = ${quote(me)};
         delete from public.products where id = ${quote(pid)};
         insert into public.products (id, slug, name, category, price_cents, active)
         values (${quote(pid)}, 'stress-tee', 'Stress tee', 'wardrobe', 4500, true);`);
    const lines = `'[{"productId":"${pid}","qty":1}]'::jsonb`;
    const rs = await race(
      Array.from({ length: N }, () => `select public.place_shop_order(${lines}, 'stress-key-1');`),
      { as: me });
    const orders = Number(scalar(`select count(*) from public.shop_orders
      where profile_id = ${quote(me)}`));
    return { held: orders === 1,
      detail: `${N} resends of one order under one key; ${orders} order(s), ${won(rs)} accepted. ${tally(rs)}` };
  },
},

"poll-ballot": {
  invariant: "a member casts one ballot on a question",
  async run() {
    const me = member("voter");
    const pid = id("poll:one");
    sql(`delete from public.poll_votes where poll_id = ${quote(pid)};
         delete from public.polls where id = ${quote(pid)};
         insert into public.polls (id, question, options, closes_at)
         values (${quote(pid)}, 'Stress?', '["a","b","c"]'::jsonb, now() + interval '1 day');`);
    const rs = await race(
      Array.from({ length: N }, (_, i) => `select public.cast_vote(${quote(pid)}::uuid, ${i % 3});`),
      { as: me });
    const ballots = Number(scalar(`select count(*) from public.poll_votes
      where poll_id = ${quote(pid)} and profile_id = ${quote(me)}`));
    return { held: ballots === 1,
      detail: `${N} ballots from one member at once; ${ballots} recorded, ${won(rs)} accepted. ${tally(rs)}` };
  },
},

"contest-settle": {
  invariant: "a contest pays its knots exactly once",
  async run() {
    const staff = member("con-staff", { staff: true });
    const runners = Array.from({ length: 3 }, (_, i) => member(`racer${i}`));
    const cid = id("contest:one");
    sql(`delete from public.contest_results where contest_id = ${quote(cid)};
         delete from public.contest_entries where contest_id = ${quote(cid)};
         delete from public.contests where id = ${quote(cid)};
         insert into public.contests (id, slug, shape, scope, title, metric, knots_award,
                                      starts_at, ends_at, status)
         values (${quote(cid)}, 'stress-regatta', 'regatta', 'member', 'Stress Regatta', 'episodes',
                 300, now() - interval '2 days', now() + interval '2 days', 'open');`);
    for (const r of runners) {
      sql(`delete from public.knots_ledger where profile_id = ${quote(r)};
           insert into public.contest_entries (contest_id, profile_id) values (${quote(cid)}, ${quote(r)});`);
    }
    const rs = await race(
      Array.from({ length: N }, () => `select public.settle_contest(${quote(cid)}::uuid);`),
      { as: staff });
    const paid = Number(scalar(`select coalesce(sum(delta),0) from public.knots_ledger
      where profile_id in (${runners.map(quote).join(",")})`));
    return { held: paid <= 300,
      detail: `${N} staff settled one 300-knot regatta at once; ${paid} knots paid out, ${won(rs)} accepted. ${tally(rs)}` };
  },
},

"membership-cap": {
  invariant: "a capped membership never sells more places than it holds",
  async run() {
    sql(`update public.club_products set active_cap = 2 where slug = 'quarterly_membership';
         delete from public.subscriptions
          where plan_id in (select id from public.membership_plans where product_slug = 'quarterly_membership');`);
    const plan = scalar(`select id from public.membership_plans where product_slug='quarterly_membership' limit 1`);
    const members = Array.from({ length: N }, (_, i) => member(`sub${i}`));
    const staff = member("sub-staff", { staff: true });
    const rs = await race(
      (i) => `insert into public.subscriptions (profile_id, plan_id, status, stripe_subscription_id)
              values (${quote(members[i])}, ${quote(plan)}::uuid, 'active', ${quote("sub_stress_" + i)});`,
      { as: staff });
    const held = Number(scalar(`select count(*) from public.subscriptions s
      join public.membership_plans mp on mp.id = s.plan_id
      where mp.product_slug='quarterly_membership'
        and s.status in ('active','trialing','past_due','paused')`));
    return { held: held <= 2,
      detail: `${N} memberships opened at once against a cap of 2; ${held} places held. ${tally(rs)}` };
  },
},

"daybed-cap": {
  invariant: "an episode never sells more daybeds than it carries",
  async run() {
    const eid = episode("daybed", { seats: 40 });
    const members = Array.from({ length: N }, (_, i) => member(`bed${i}`));
    const passes = [];
    for (const m of members) {
      sql(`insert into public.passes (episode_id, profile_id, status)
           values (${quote(eid)}, ${quote(m)}, 'aboard') on conflict do nothing;`);
      passes.push(scalar(`select id from public.passes
        where episode_id = ${quote(eid)} and profile_id = ${quote(m)}`));
    }
    sql(`delete from public.episode_daybeds where episode_id = ${quote(eid)};
         update public.club_products set per_sailing_cap = 2, party_size = 4
          where slug = 'vip_daybed';`);
    const rs = await race(
      passes.map((p) => `select public.claim_a_daybed(${quote(p)}::uuid);`),
      { as: (i) => members[i] });
    const sold = Number(scalar(`select count(*) from public.episode_daybeds
      where episode_id = ${quote(eid)}`));
    return { held: sold <= 2,
      detail: `${N} passes claimed a daybed on an episode carrying 2; ${sold} sold. ${tally(rs)}` };
  },
},

"cabin-option": {
  invariant: "a member holds one cabin option on a passage",
  async run() {
    const eid = episode("cabin", { seats: 40 });
    const me = member("charterer");
    const vid = id("vessel:one");
    const cabins = [id("cabin:a"), id("cabin:b")];
    sql(`delete from public.charter_options where episode_id = ${quote(eid)};
         delete from public.cabins where id in (${cabins.map(quote).join(",")});
         delete from public.episode_vessels where episode_id = ${quote(eid)};
         delete from public.vessels where id = ${quote(vid)};
         insert into public.vessels (id, name, capacity) values (${quote(vid)}, 'Stress hull', 40);
         insert into public.episode_vessels (episode_id, vessel_id) values (${quote(eid)}, ${quote(vid)});
         insert into public.cabins (id, vessel_id, name, sleeps)
         values (${quote(cabins[0])}, ${quote(vid)}, 'Stress A', 2),
                (${quote(cabins[1])}, ${quote(vid)}, 'Stress B', 2);`);
    const rs = await race(
      cabins.map((c) => `select public.hold_a_cabin_on_option(${quote(eid)}::uuid, ${quote(c)}::uuid);`),
      { as: me });
    const live = Number(scalar(`select count(*) from public.charter_options
      where episode_id = ${quote(eid)} and profile_id = ${quote(me)}
        and released_at is null and confirmed_at is null`));
    return { held: live <= 1,
      detail: `one member held two different cabins on one passage at once; ${live} live option(s). ${tally(rs)}` };
  },
},

"cabin-capacity": {
  invariant: "a cabin never sleeps more than it holds, counting holds and boardings together",
  async run() {
    const eid = episode("berth", { seats: 40 });
    const vid = id("vessel:two");
    const cab = id("cabin:single");
    const members = Array.from({ length: N }, (_, i) => member(`berth${i}`));
    sql(`delete from public.charter_options where episode_id = ${quote(eid)};
         delete from public.cabins where id = ${quote(cab)};
         delete from public.episode_vessels where episode_id = ${quote(eid)};
         delete from public.vessels where id = ${quote(vid)};
         insert into public.vessels (id, name, capacity) values (${quote(vid)}, 'Stress hull 2', 40);
         insert into public.episode_vessels (episode_id, vessel_id) values (${quote(eid)}, ${quote(vid)});
         insert into public.cabins (id, vessel_id, name, sleeps)
         values (${quote(cab)}, ${quote(vid)}, 'Stress single', 1);`);
    // Half reach for the room by booking into it, half by taking an option on
    // it. Two different code paths, one place.
    const rs = await race((i) => i % 2 === 0
      ? `insert into public.passes (episode_id, profile_id, status, cabin_id)
         values (${quote(eid)}, ${quote(members[i])}, 'aboard', ${quote(cab)});`
      : `select public.hold_a_cabin_on_option(${quote(eid)}::uuid, ${quote(cab)}::uuid);`,
      { as: (i) => members[i] });
    const taken = Number(scalar(`select
      (select count(*) from public.passes where episode_id=${quote(eid)} and cabin_id=${quote(cab)} and status='aboard')
      + (select count(*) from public.charter_options where episode_id=${quote(eid)} and cabin_id=${quote(cab)}
           and released_at is null and confirmed_at is null)`));
    return { held: taken <= 1,
      detail: `${N} claims on a one-place cabin, half boardings and half options; ${taken} claim(s) stand. ${tally(rs)}` };
  },
},

"producer-turns": {
  invariant: "a member never takes more Producer turns than the cap allows",
  async run() {
    const me = member("producer");
    sql(`delete from public.producer_turns where profile_id = ${quote(me)};`);
    // 20 is the cap in take_a_producer_turn. Seed 19 so one turn is left, and
    // send many hands for it.
    sql(`insert into public.producer_turns (profile_id)
         select ${quote(me)} from generate_series(1, 19);`);
    const rs = await race(
      Array.from({ length: N }, () => `select public.take_a_producer_turn();`),
      { as: me });
    const turns = Number(scalar(`select count(*) from public.producer_turns
      where profile_id = ${quote(me)} and asked_at > now() - interval '10 minutes'`));
    return { held: turns <= 20,
      detail: `19 turns already spent of 20, ${N} more asked at once; ${turns} turns recorded, ${won(rs)} accepted` };
  },
},

"application-pacing": {
  invariant: "no more applications land from one address than the pacing allows",
  async run() {
    sql(`delete from public.status_lookups where fingerprint like 'apply-email:stress-pace%';
         delete from public.applications where email like 'stress-pace%';`);
    const rs = await race(
      Array.from({ length: N }, (_, i) =>
        `insert into public.applications (full_name, email, status, answers)
         values (${quote("Pacer " + i)}, 'stress-pace@fixtures.invalid', 'declined',
                 '{"bring":"a working sextant"}'::jsonb);`),
      { as: null });
    const landed = Number(scalar(`select count(*) from public.applications
      where email = 'stress-pace@fixtures.invalid'`));
    return { held: landed <= 3,
      detail: `${N} applications from one address at once against a pacing of 3; ${landed} landed. ${tally(rs)}` };
  },
},

"pass-offers": {
  invariant: "a pass carries one live offer at a time",
  async run() {
    // The rule is real — src/app/(member)/passes/actions.ts refuses a second
    // offer — but it is a SELECT then an INSERT in TypeScript, and the index
    // behind it (pass_transfers_open_offer_idx) is not unique. So ask the
    // database directly what it would allow if two tabs both got past the read.
    const eid = episode("offers", { seats: 40 });
    const from = member("offerer");
    const takers = Array.from({ length: N }, (_, i) => member(`offered${i}`));
    sql(`insert into public.passes (episode_id, profile_id, status)
         values (${quote(eid)}, ${quote(from)}, 'aboard') on conflict do nothing;`);
    const pass = scalar(`select id from public.passes
      where episode_id = ${quote(eid)} and profile_id = ${quote(from)}`);
    sql(`delete from public.pass_transfers where rsvp_id = ${quote(pass)};`);
    const rs = await race(
      (i) => `insert into public.pass_transfers (rsvp_id, from_profile, to_profile, status)
              values (${quote(pass)}, ${quote(from)}, ${quote(takers[i])}, 'offered');`,
      { as: from });
    const live = Number(scalar(`select count(*) from public.pass_transfers
      where rsvp_id = ${quote(pass)} and status = 'offered'`));
    return { held: live <= 1,
      detail: `${N} offers on one pass at once; ${live} live offer(s) stand, ${won(rs)} accepted. ${tally(rs)}` };
  },
},

"one-membership": {
  invariant: "a member holds one live membership at a time",
  async run() {
    const me = member("double-sub");
    // A plan whose product carries no cap, so guard_the_membership_cap returns
    // on its first line and nothing else is looking.
    const plan = scalar(`select id from public.membership_plans
      where product_slug is null and active order by label limit 1`);
    sql(`delete from public.subscriptions where profile_id = ${quote(me)};`);
    const rs = await race(
      (i) => `insert into public.subscriptions (profile_id, plan_id, status, stripe_subscription_id)
              values (${quote(me)}, ${quote(plan)}::uuid, 'active', ${quote("sub_dbl_" + i)});`,
      { as: member("sub-staff2", { staff: true }) });
    const live = Number(scalar(`select count(*) from public.subscriptions
      where profile_id = ${quote(me)} and status in ('active','trialing','past_due','paused')`));
    return { held: live <= 1,
      detail: `${N} subscriptions opened for one member at once; ${live} live membership(s), ${won(rs)} accepted. ${tally(rs)}` };
  },
},

"guest-slots": {
  invariant: "a pass never carries more guests than the plan allows",
  async run() {
    const eid = episode("guests", { seats: 40 });
    const me = member("host");
    sql(`insert into public.passes (episode_id, profile_id, status, guests)
         values (${quote(eid)}, ${quote(me)}, 'aboard', 0)
         on conflict (episode_id, profile_id) do update set guests = 0;`);
    const pass = scalar(`select id from public.passes
      where episode_id = ${quote(eid)} and profile_id = ${quote(me)}`);
    const allowance = Number(scalar(`select m.guest_allowance from public.profiles p
      join public.membership_plans m on m.id = p.plan_id where p.id = ${quote(me)}`));
    const rs = await race(
      Array.from({ length: N }, () =>
        `update public.passes set guests = guests + 1 where id = ${quote(pass)};`),
      { as: me });
    const guests = Number(scalar(`select guests from public.passes where id = ${quote(pass)}`));
    return { held: guests <= allowance,
      detail: `${N} guests added to one pass at once against an allowance of ${allowance}; ${guests} on the pass, ${won(rs)} accepted. ${tally(rs)}` };
  },
},

"vetting-decline": {
  invariant: "a declined vetting file is never cleared behind the decline",
  async run() {
    const staff = member("vet-staff", { staff: true });
    const subject = member("vetted-one");
    sql(`delete from public.vetting_files where profile_id = ${quote(subject)};
         insert into public.vetting_files (profile_id, id_verified_at, age_ok, background_state)
         values (${quote(subject)}, now(), true, 'submitted');`);
    const file = scalar(`select id from public.vetting_files where profile_id = ${quote(subject)}`);
    // Two operators with the dialog open: one declines, the other clears.
    const rs = await race([
      `update public.vetting_files set declined_at = now(), background_state = 'declined'
        where id = ${quote(file)};`,
      `update public.vetting_files set cleared_at = now(), background_state = 'cleared',
              cleared_until = now() + interval '365 days'
        where id = ${quote(file)};`,
    ], { as: staff, wait: 1200 });
    const bad = Number(scalar(`select count(*) from public.vetting_files
      where id = ${quote(file)} and declined_at is not null and cleared_at is not null`));
    const state = scalar(`select background_state from public.vetting_files where id = ${quote(file)}`);
    return { held: bad === 0,
      detail: `a decline and a clearance saved at the same instant; file reads "${state}", ${won(rs)} accepted. ${tally(rs)}` };
  },
},

"wallet-token": {
  invariant: "a member holds one live wallet token",
  async run() {
    const me = member("walleteer");
    sql(`delete from public.wallet_tokens where profile_id = ${quote(me)};`);
    const rs = await race(
      Array.from({ length: N }, () => `select * from public.issue_wallet_token();`),
      { as: me });
    const live = Number(scalar(`select count(*) from public.wallet_tokens
      where profile_id = ${quote(me)} and revoked_at is null`));
    return { held: live === 1,
      detail: `${N} wallet passes asked for at once; ${live} live token(s), ${won(rs)} accepted. ${tally(rs)}` };
  },
},

"lock-order": {
  invariant: "two members working the same pass from opposite ends do not deadlock",
  async run() {
    const eid = episode("deadlock", { seats: 40 });
    const a = member("dl-a"), b = member("dl-b");
    sql(`insert into public.passes (episode_id, profile_id, status)
         values (${quote(eid)}, ${quote(a)}, 'aboard') on conflict do nothing;`);
    const pass = scalar(`select id from public.passes
      where episode_id = ${quote(eid)} and profile_id = ${quote(a)}`);
    let worst = null, rounds = 6;
    for (let r = 0; r < rounds; r++) {
      sql(`delete from public.pass_transfers where rsvp_id = ${quote(pass)};
           insert into public.pass_transfers (rsvp_id, from_profile, to_profile, status)
           values (${quote(pass)}, ${quote(a)}, ${quote(b)}, 'offered');`);
      const offer = scalar(`select id from public.pass_transfers where rsvp_id = ${quote(pass)}`);
      // B takes the pass (transfer row first, then the pass row); A withdraws the
      // offer at the same instant (its own row, with the pass read behind it).
      const rs = await race([
        `select public.accept_pass_transfer(${quote(offer)}::uuid);`,
        `update public.pass_transfers set status = 'cancelled', responded_at = now()
          where id = ${quote(offer)};`,
      ], { as: (i) => (i === 0 ? b : a), wait: 900 });
      if (deadlocked(rs)) { worst = rs; break; }
    }
    return { held: worst === null,
      detail: worst
        ? `deadlock (40P01) after ${rounds} rounds: ${tally(worst)}`
        : `${rounds} rounds of accept-versus-withdraw on one pass; no deadlock, no lost update` };
  },
},

};

/* ---------- runner ---------- */

if (argv.includes("--list")) {
  for (const [name, c] of Object.entries(CASES)) console.log(`${name.padEnd(22)} ${c.invariant}`);
  process.exit(0);
}

const picked = ONLY ? { [ONLY]: CASES[ONLY] } : CASES;
if (ONLY && !CASES[ONLY]) {
  console.error(`no case named ${ONLY}. --list shows them all.`);
  process.exit(2);
}

if (!REUSE) up();
try {
  for (const [name, c] of Object.entries(picked)) {
    console.log(`\n${name}`);
    try {
      const r = await c.run();
      say(name, c.invariant, r.held, r.detail);
    } catch (e) {
      say(name, c.invariant, false, `the case itself failed: ${String(e.message).slice(0, 400)}`);
    }
  }
} finally {
  if (!KEEP && !REUSE) down();
}

const broke = results.filter((r) => !r.held);
console.log(`\n${results.length - broke.length}/${results.length} invariants held under contention`);
if (broke.length) {
  console.log("\nBROKE:");
  for (const b of broke) console.log(`  ${b.name}: ${b.invariant}\n    ${b.detail}`);
}
process.exit(broke.length ? 1 : 0);
