/* ---------- public site, applicant and guest ----------
   Everyone who reaches the club without a session: the shore reading the
   site, an applicant at the front door, a guest signing a waiver by token
   and presenting a stub at the gangway.

   What the route audit already holds (status, <title>, banned terms, spilled
   placeholders, images with alt, the skip link) is not repeated here. This
   module asks the questions the audit structurally cannot: what the
   ANONYMOUS HTML of an episode page carries and does not carry (the venue
   comes with the pass; the club's own mark in the nav is not the venue), what
   the handlers beside the pages answer, whether the two public funnels keep
   their bounds under PostgREST as well as under the form, and whether a guest
   with no account can read, sign once, and be refused at the door unsigned.

   Every fixture carries ctx.RUN_TOKEN and is struck in `finally`. The one
   row a run cannot remove is a guest who has signed: a signature is
   deliberately undeletable and the guest it names goes with it, so each run
   leaves exactly one DETACHED guest row (rsvp_id null, no code) and one
   signature — the same footprint documentRules already declares for its
   redaction guest. */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readBannedTerms } from "../lib/banned-terms.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const manifest = JSON.parse(readFileSync(join(root, "src", "lib", "route-manifest.json"), "utf8"));
const BANNED = readBannedTerms(root);

const ZERO = "00000000-0000-0000-0000-000000000000";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/* What a reader sees: no script, no style, no comments, no tags. Attributes
   and code may carry anything; visible text may not. */
function visible(html) {
  return String(html)
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<![^>]*>/g, "")
    .replace(/<[^>]+>/g, " ");
}
const count = (s, re) => (String(s).match(re) || []).length;
const said = (r) => String(r?.data?.message ?? r?.data?.hint ?? JSON.stringify(r?.data ?? "")).toLowerCase();

export async function run(p, ctx) {
  const { BASE, SUPA, rest, note, uid, RUN_TOKEN } = ctx;
  const stf = rest(p.staff), glo = rest(p.global), anon = rest(null);
  const stamp = `${Date.now().toString(36)}${RUN_TOKEN}`;
  const REF = new URL(SUPA).hostname.split(".")[0];

  /* The address comes with the pass — at the API as on the page. Anon holds a
     column-level grant on episodes that leaves out coordinates and muster, so a
     "*" read is refused whole and a public page must name its columns. The
     list the pages name (src/lib/episode-columns.ts) must be exactly what the
     grant hands over: every column in it reads, and the two withheld do not. */
  {
    const src = readFileSync(join(root, "src", "lib", "episode-columns.ts"), "utf8");
    const stmt = src.match(/EPISODE_PUBLIC_COLUMNS\s*=\s*([\s\S]*?);/)?.[1] ?? "";
    const listed = [...stmt.matchAll(/"([^"]+)"/g)].map((m) => m[1]).join("").split(",").map((c) => c.trim()).filter(Boolean);
    const named = await anon.get(`episodes?select=${listed.join(",")}&limit=1`);
    note("anon", "every column the public episode page names is anon-readable", named.status === 200 && Array.isArray(named.data) && named.data.length === 1 && listed.length > 30,
      `got ${named.status} for ${listed.length} columns ${JSON.stringify(named.data).slice(0, 60)}`);
    const star = await anon.get("episodes?select=*&limit=1");
    note("anon", "a \"*\" read of episodes is refused whole (the place is withheld)", star.status >= 400 && /permission denied/.test(JSON.stringify(star.data)), `got ${star.status}`);
    for (const col of ["coordinates", "muster"]) {
      const one = await anon.get(`episodes?select=${col}&limit=1`);
      note("anon", `episodes.${col} is not the shore's to read`, one.status >= 400, `got ${one.status}`);
    }
    /* The listing must show what the board holds. The routes audit demands
       200 and a <main>; a manifest that rendered "0 episodes" to the shore
       passed it. Counted here against the API's own answer. */
    const upcoming = await anon.get(`episodes?select=slug&status=in.(scheduled,live,weather_hold)&starts_at=gte.${new Date().toISOString()}&order=starts_at&limit=3`);
    const listingHtml = await (await fetch(`${BASE}/episodes`, { redirect: "manual" })).text();
    const linked = (upcoming.data ?? []).filter((r) => listingHtml.includes(`/episodes/${r.slug}`)).length;
    note("anon", "the public manifest lists the board's upcoming episodes", (upcoming.data ?? []).length === 0 || linked > 0,
      `${linked} of ${(upcoming.data ?? []).length} upcoming slugs linked from /episodes`);
    const slugRow = await anon.get("episodes?select=slug&status=eq.scheduled&limit=1");
    const slug = slugRow.data?.[0]?.slug;
    if (slug) {
      const page = await fetch(`${BASE}/episodes/${slug}`, { redirect: "manual" });
      const html = await page.text();
      note("anon", "the public episode page renders to the shore with named columns", page.status === 200 && /<main/.test(html), `got ${page.status} for /episodes/${slug}`);
      note("anon", "the anonymous episode page carries no muster or coordinates markup", !/>Muster<|>Address</.test(html), "checked the HTML for the place");
    }
  }
  /* A signed-in fetch, the way the browser makes one: the session in the
     cookie @supabase/ssr reads. The suite's page() helper is not on ctx, so
     it is rebuilt here from the same recipe. */
  const cookieFor = (session) =>
    `sb-${REF}-auth-token=base64-${Buffer.from(JSON.stringify(session)).toString("base64url")}`;
  const get = (path, session = null) =>
    fetch(BASE + path, {
      redirect: "manual",
      headers: { "user-agent": "un-e2e", ...(session ? { cookie: cookieFor(session) } : {}) },
    });
  /* An insert that does not read itself back — the only kind anon may make. */
  const postMin = anon.postMinimal ? anon.postMinimal.bind(anon) : anon.post;

  /* ── fixtures: a venue with an address, an episode that names it ──────── */
  const cityId = (await stf.get("cities?slug=eq.miami&select=id&limit=1")).data?.[0]?.id;
  const venue = await stf.post("venues", {
    slug: `e2e-quay-${stamp}`, name: `E2E Quay ${stamp}`, city_id: cityId, kind: "marina",
    address: `1 E2E Quay ${stamp}, Miami`, access_note: "step-free from the quay, lift to the deck",
  });
  const venueId = venue.data?.[0]?.id ?? null;
  note("staff", "raises a venue fixture with an address and an access note", !!venueId, `got ${venue.status} ${said(venue).slice(0, 90)}`);

  const slug = `e2e-public-${stamp}`;
  const COORDS = "25.5555° N — 80.5555° W";
  const MUSTER = `E2E dock ${stamp}`;
  const AGE = "18+ · open door for this one";
  const starts = new Date(Date.now() + 30 * 864e5);
  const episode = await stf.post("episodes", {
    slug, title: `E2E public fixture ${stamp}.`, setting: "shore", kind: "sea_day", sub_class: "passage",
    blurb: "A fixture the public-and-guest module raises and strikes.",
    starts_at: starts.toISOString(), ends_at: new Date(starts.getTime() + 3 * 36e5).toISOString(),
    time_zone: "America/New_York", city_id: cityId, venue_id: venueId,
    coordinates: COORDS, muster: MUSTER, age_line: AGE,
    passes_total: 8, price_cents: 0, status: "scheduled", min_tier: "regional",
  });
  const epId = episode.data?.[0]?.id ?? null;
  note("staff", "raises a public episode fixture carrying coordinates, a muster and a venue", !!epId, `got ${episode.status} ${said(episode).slice(0, 120)}`);

  let passId = null, guestA = null, guestB = null;
  const applied = []; // addresses to strike
  try {
    /* ══════════ A. every public page ══════════ */
    const sample = async (table, filter = "") =>
      (await anon.get(`${table}?select=slug&limit=1${filter}`)).data?.[0]?.slug ?? null;
    const dynamicSamples = {
      "/episodes/[slug]": epId ? slug : await sample("episodes", "&status=eq.scheduled"),
      "/log/[slug]": await sample("log_posts"),
      "/series/[slug]": await sample("series", "&active=eq.true"),
      "/crew/wanted/[slug]": await sample("crew_roles"),
      "/crew/[slug]": await sample("crew", "&public=eq.true&active=eq.true"),
    };
    const pages = [];
    for (const r of manifest.routes) {
      if (r.type !== "page" || r.access !== "public" || r.credential) continue;
      if (!r.dynamic) { pages.push(r.path); continue; }
      const s = dynamicSamples[r.path];
      if (s) pages.push(r.path.replace(/\[[^\]]+\]/, s));
      else note("anon", `${r.path} has a sample slug to render`, r.source?.allowEmpty === true, "no row to expand and the source does not allow empty");
    }

    const ogImages = [];
    for (const path of pages) {
      const res = await get(path);
      note("anon", `${path} answers 200`, res.status === 200, `got ${res.status}`);
      if (res.status !== 200) continue;
      const html = await res.text();
      const text = visible(html);
      const lower = text.toLowerCase();
      note("anon", `${path} has exactly one <main id="main">`, count(html, /<main\b[^>]*\bid="main"/g) === 1 && count(html, /<main\b/g) === 1, `${count(html, /<main\b/g)} <main>, ${count(html, /<main\b[^>]*\bid="main"/g)} with id`);
      note("anon", `${path} has exactly one <h1>`, count(html, /<h1\b/g) === 1, `${count(html, /<h1\b/g)} <h1>`);
      note("anon", `${path} has a <title>`, /<title[^>]*>[^<]+<\/title>/i.test(html));
      note("anon", `${path} has a canonical`, /<link rel="canonical" href="https?:\/\/[^"]+"/.test(html));
      const off = BANNED.filter((t) => lower.includes(t.toLowerCase()));
      note("anon", `${path} is on-lexicon`, off.length === 0, off.length ? `banned: ${off.join(", ")}` : "");
      const spilled = ["undefined", "NaN", "[object"].filter((w) => new RegExp(`(^|[\\s·—,:(>])${w.replace(/[[\]]/g, "\\$&")}([\\s·—,.:)<]|$)`).test(text));
      note("anon", `${path} spills no placeholder`, spilled.length === 0, spilled.join(", "));
      /* Security headers ride on every page, from next.config headers(). */
      const csp = res.headers.get("content-security-policy") || "";
      note("anon", `${path} carries the security headers`,
        csp.includes("frame-ancestors 'none'") && csp.includes("default-src 'self'")
          && res.headers.get("x-content-type-options") === "nosniff"
          && !!res.headers.get("referrer-policy") && !res.headers.get("x-powered-by"),
        `csp=${csp.slice(0, 40)}… nosniff=${res.headers.get("x-content-type-options")} referrer=${res.headers.get("referrer-policy")}`);
      const og = html.match(/<meta property="og:image" content="([^"]+)"/);
      if (og) ogImages.push([path, og[1]]);
    }

    /* Open Graph images: every page that advertises one serves it as PNG. */
    note("anon", "public pages advertise Open Graph images", ogImages.length >= 3, `${ogImages.length} pages`);
    for (const [path, url] of ogImages.slice(0, 6)) {
      const u = new URL(url);
      const img = await get(u.pathname + u.search);
      note("anon", `${path} og:image is a PNG`, img.status === 200 && (img.headers.get("content-type") || "").startsWith("image/png"), `got ${img.status} ${img.headers.get("content-type")}`);
    }

    /* ══════════ B. the episode page, read from the shore ══════════ */
    if (epId) {
      const res = await get(`/episodes/${slug}`);
      const html = await res.text();
      const text = visible(html);
      /* The club's own mark in the nav is coordinates too — Haulover Inlet —
         and must not be mistaken for a leak. It is asserted PRESENT so the
         absence check below cannot pass on a page that rendered nothing. */
      note("anon", "the nav carries the club's own position (control)", /25\.9007° N/.test(text), "nav COORDS missing — the absence check below would be vacuous");
      note("anon", "the episode's coordinates are not in the anonymous HTML", !html.includes(COORDS) && !html.includes("25.5555"), "coordinates leaked");
      note("anon", "the muster point is not in the anonymous HTML", !html.includes(MUSTER), "muster leaked");
      note("anon", "the venue's name and address are not in the anonymous HTML", !html.includes(`E2E Quay ${stamp}`) && !html.includes("1 E2E Quay"), "venue leaked");
      note("anon", "the shore is told the address comes with the pass", /address comes with your pass/i.test(text));
      note("anon", "the age line renders when set", text.includes(AGE), AGE);
      note("anon", "the venue's access note renders without its address", /step-free from the quay/i.test(text));
      note("anon", "the city is named", /Miami/.test(text));

      /* The page keeps the rule; PostgREST is a direct call away with the
         same anon key, and the rule has to hold there too or the page is a
         curtain. Asserted on the fixture so the leak, if there is one, is a
         fixture's address and not a real dock's. */
      const place = await anon.get(`episodes?slug=eq.${slug}&select=muster,coordinates`);
      const placeRow = place.data?.[0] ?? {};
      note("anon", "the episode's muster and coordinates are not readable from the shore by API", place.status >= 400 || (placeRow.muster == null && placeRow.coordinates == null), `got ${place.status} ${JSON.stringify(placeRow).slice(0, 100)}`);
      const venueRead = await anon.get(`venues?id=eq.${venueId}&select=name,address`);
      note("anon", "the venue's address is not readable from the shore by API", venueRead.status >= 400 || (venueRead.data || []).length === 0, `got ${venueRead.status} ${JSON.stringify(venueRead.data).slice(0, 100)}`);

      for (const [label, q] of [["story", ""], ["post", "?ratio=4x5"]]) {
        const card = await get(`/episodes/${slug}/share${q}`);
        note("anon", `the ${label} share card is a PNG`, card.status === 200 && (card.headers.get("content-type") || "").startsWith("image/png") && card.headers.get("x-robots-tag") === "noindex", `got ${card.status} ${card.headers.get("content-type")} robots=${card.headers.get("x-robots-tag")}`);
      }
      const ics = await get(`/api/calendar/episode/${slug}`);
      const body = await ics.text();
      note("anon", "the public calendar feed is text/calendar", ics.status === 200 && /text\/calendar/.test(ics.headers.get("content-type") || ""), `got ${ics.status} ${ics.headers.get("content-type")}`);
      note("anon", "the feed's LOCATION is the city, not the venue", /^LOCATION:Miami\r?$/m.test(body) && !body.includes("E2E Quay") && !body.includes(MUSTER) && !body.includes("25.5555"), body.match(/^LOCATION:.*$/m)?.[0] ?? "no LOCATION");
      note("anon", "the feed carries no-store and no referrer", /no-store/.test(ics.headers.get("cache-control") || "") && ics.headers.get("referrer-policy") === "no-referrer", `${ics.headers.get("cache-control")} / ${ics.headers.get("referrer-policy")}`);
    }

    /* Unknown slugs: 404, never 500, on every dynamic public route. */
    for (const path of ["/episodes/e2e-no-such-slug", "/log/e2e-no-such-slug", "/series/e2e-no-such-slug", "/crew/e2e-no-such-slug", "/crew/wanted/e2e-no-such-slug", "/episodes/e2e-no-such-slug/share", "/api/calendar/episode/e2e-no-such-slug", `/api/calendar/${ZERO}`, `/sign/${ZERO}`, "/sign/not-a-token", "/episodes/Not%20A%20Slug/share"]) {
      const res = await get(path);
      note("anon", `${path} → 404`, res.status === 404, `got ${res.status}`);
    }
    const sign404 = await get(`/sign/${ZERO}`);
    const sign404Html = await sign404.text();
    note("anon", "a wrong signing token answers in the club's words", sign404.status === 404 && /Off the chart/i.test(sign404Html) && !/Application error|Internal Server Error/i.test(sign404Html), `got ${sign404.status}`);

    /* Dev-only and credential handlers. */
    const preview = await get("/preview/documents");
    note("anon", "/preview/documents is not reachable in a production build", preview.status === 404 && /Off the chart/i.test(await preview.text()), `got ${preview.status}`);
    const w = await get(`/w/${ZERO}`);
    note("anon", "/w/<token> hands the browser to /card", w.status === 307 && /\/card$/.test(w.headers.get("location") || ""), `got ${w.status} → ${w.headers.get("location")}`);
    note("anon", "/w/<token> is no-store and noindex", /no-store/.test(w.headers.get("cache-control") || "") && w.headers.get("x-robots-tag") === "noindex" && w.headers.get("referrer-policy") === "no-referrer", `${w.headers.get("cache-control")} / ${w.headers.get("x-robots-tag")} / ${w.headers.get("referrer-policy")}`);

    /* robots.txt: every path that carries a credential or is not a page. */
    const robots = await (await get("/robots.txt")).text();
    const disallow = new Set(robots.split("\n").filter((l) => /^Disallow:/i.test(l)).map((l) => l.replace(/^Disallow:\s*/i, "").trim()));
    for (const path of ["/sign/", "/api/", "/preview/", "/w/", "/stub/", "/auth/"]) {
      note("anon", `robots.txt disallows ${path}`, disallow.has(path), `has: ${[...disallow].filter((d) => d.startsWith(path.slice(0, 3))).join(", ") || "nothing like it"}`);
    }
    note("anon", "robots.txt names the sitemap", /^Sitemap: https:\/\/.+\/sitemap\.xml$/m.test(robots));

    /* sitemap.xml: public routes and only those. */
    const sm = await get("/sitemap.xml");
    const xml = await sm.text();
    const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => new URL(m[1]).pathname.replace(/\/$/, "") || "/");
    note("anon", "the sitemap is XML with entries", sm.status === 200 && locs.length > 10, `got ${sm.status}, ${locs.length} entries`);
    const publicStatic = new Set(manifest.routes.filter((r) => r.type === "page" && r.access === "public" && !r.dynamic).map((r) => r.path));
    const publicDynamic = manifest.routes
      .filter((r) => r.type === "page" && r.access === "public" && r.dynamic && !r.credential)
      .map((r) => new RegExp("^" + r.path.replace(/\[[^\]]+\]/g, "[^/]+") + "$"));
    const strangers = locs.filter((l) => !publicStatic.has(l) && !publicDynamic.some((re) => re.test(l)));
    note("anon", "every sitemap entry is a public page route", strangers.length === 0, strangers.slice(0, 8).join(", "));
    const sealed = locs.filter((l) => /^\/(preview|sign|w|api|auth|stub)(\/|$)/.test(l) || manifest.protectedPrefixes.some((pre) => l === pre || l.startsWith(pre + "/")));
    note("anon", "the sitemap lists no preview, credential, api or member route", sealed.length === 0, sealed.slice(0, 8).join(", "));
    note("anon", "every public static page is in the sitemap", [...publicStatic].every((s) => locs.includes(s)), [...publicStatic].filter((s) => !locs.includes(s)).join(", "));

    /* ══════════ C. the application, at the data layer ══════════ */
    const questions = await anon.get("application_questions?select=key,kind,required&active=eq.true&order=position.asc");
    const qkeys = (questions.data || []).map((q) => q.key);
    note("anon", "the committee's questions are readable so the form can ask them", questions.status === 200 && qkeys.length > 0, `got ${questions.status} ${qkeys.join(",")}`);

    const addr = (label, localLen = null) => {
      const base = `e2e-anon-pub-${label}-${stamp}`;
      const local = localLen == null ? base : (base + "a".repeat(400)).slice(0, localLen);
      const a = `${local}@fixtures.invalid`;
      applied.push(a);
      return a;
    };
    const DOMAIN_LEN = "@fixtures.invalid".length;
    /* The policy's own bounds: full_name 1..120, email 5..254 with an @. At the
       bound it lands; one past it the policy refuses. */
    const atBounds = [
      ["a 120-character name", { full_name: "N".repeat(120), email: addr("name120"), city: "Miami" }],
      ["a one-character name", { full_name: "N", email: addr("name1"), city: "Miami" }],
      ["a 254-character address", { full_name: "E2E Bound", email: addr("mail254", 254 - DOMAIN_LEN), city: "Miami" }],
    ];
    const answers = Object.fromEntries(qkeys.map((k) => [k, `E2E answer for ${k}`]));
    for (const [label, body] of atBounds) {
      const r = await postMin("applications", { ...body, answers });
      note("anon", `an application with ${label} lands`, r.status === 201, `got ${r.status} ${said(r).slice(0, 90)}`);
    }
    const pastBounds = [
      ["a 121-character name", { full_name: "N".repeat(121), email: addr("name121"), city: "Miami" }],
      ["an empty name", { full_name: "", email: addr("name0"), city: "Miami" }],
      ["a 255-character address", { full_name: "E2E Bound", email: addr("mail255", 255 - DOMAIN_LEN), city: "Miami" }],
      ["an address with no @", { full_name: "E2E Bound", email: `e2e-anon-pub-noat-${stamp}.fixtures.invalid`, city: "Miami" }],
    ];
    for (const [label, body] of pastBounds) {
      const r = await postMin("applications", body);
      note("anon", `an application with ${label} is refused by the policy`, r.status >= 400, `got ${r.status} ${said(r).slice(0, 90)}`);
    }

    /* The invite path carries the same bounds and speaks them. The bounds and
       the answers are checked before the code, so a dead code proves each. */
    const viaCode = (over) => anon.rpc("apply_with_invite", {
      p_full_name: "E2E Coded", p_email: addr("coded"), p_city: "Miami", p_note: "", p_code: "UN-DEAD-0000", p_answers: {}, ...over,
    });
    const badKey = await viaCode({ p_answers: { [`no_such_question_${stamp}`]: "x" } });
    note("anon", "an answer keyed to a question the committee never asked is refused", badKey.status >= 400 && /not one of the questions/.test(said(badKey)), `got ${badKey.status} ${said(badKey).slice(0, 90)}`);
    const longAnswer = qkeys[0] ? await viaCode({ p_answers: { [qkeys[0]]: "a".repeat(1001) } }) : null;
    if (longAnswer) note("anon", "an answer past a thousand characters is refused", longAnswer.status >= 400 && /thousand characters/.test(said(longAnswer)), `got ${longAnswer.status} ${said(longAnswer).slice(0, 90)}`);
    const longProposer = await viaCode({ p_proposer: "P".repeat(121) });
    note("anon", "a proposer past 120 characters is refused as a paragraph", longProposer.status >= 400 && /proposer is a name/.test(said(longProposer)), `got ${longProposer.status} ${said(longProposer).slice(0, 90)}`);
    const longCity = await viaCode({ p_city: "C".repeat(121) });
    note("anon", "a city past 120 characters is refused", longCity.status >= 400 && /city name is too long/.test(said(longCity)), `got ${longCity.status} ${said(longCity).slice(0, 90)}`);
    const deadCode = await viaCode({});
    note("anon", "a code the club never cut is refused in the club's words", deadCode.status >= 400 && /doesn't answer/.test(said(deadCode)), `got ${deadCode.status} ${said(deadCode).slice(0, 110)}`);

    /* A live code, if the roll holds one, proves the positive. A code is
       spent when uses reaches max_uses, and nothing but the lifecycle engine
       may advance `uses` — there is no UPDATE policy on invites for anyone —
       so the spent-code branch shares its EXISTS with the dead-code branch
       above and cannot be driven separately from here (see the gate report). */
    const liveCodes = await stf.get("invites?select=code,uses,max_uses&limit=50");
    const live = (liveCodes.data || []).find((c) => c.uses < c.max_uses)?.code ?? null;
    if (live) {
      const codedAddr = addr("live");
      const answers = Object.fromEntries(qkeys.map((k) => [k, `E2E answer for ${k}`]));
      const ok = await anon.rpc("apply_with_invite", { p_full_name: "E2E Coded", p_email: codedAddr, p_city: "Miami", p_note: "E2E", p_code: live, p_answers: answers, p_proposer: "P".repeat(120) });
      note("anon", "a coded application with every answer and a 120-character proposer lands", ok.status === 200 && UUID.test(String(ok.data)), `got ${ok.status} ${said(ok).slice(0, 90)}`);
      const twiceCoded = await anon.rpc("apply_with_invite", { p_full_name: "E2E Coded", p_email: codedAddr, p_city: "Miami", p_note: "E2E", p_code: live, p_answers: answers });
      note("anon", "a second open application to the same address collides (23505)", twiceCoded.status === 409 && twiceCoded.data?.code === "23505", `got ${twiceCoded.status} ${twiceCoded.data?.code}`);
      const kept = await stf.get(`applications?email=eq.${encodeURIComponent(codedAddr)}&select=answers,proposer,invite_code`);
      note("staff", "the coded application kept its answers, proposer and code", kept.data?.[0]?.invite_code === live && kept.data?.[0]?.proposer?.length === 120 && qkeys.every((k) => kept.data?.[0]?.answers?.[k]), JSON.stringify(kept.data ?? "").slice(0, 120));
    } else {
      note("staff", "the roll holds a live invite code to prove the coded path", false, "no invite with uses < max_uses — mint one from a member's You page");
    }

    /* One open application per address, on the plain path too. The action
       voices the 23505 as "already with Shoreside"; the source is the only
       place that mapping can be read without a browser. */
    const dupAddr = addr("dup");
    const first = await postMin("applications", { full_name: "E2E Twice", email: dupAddr, city: "Miami", answers });
    const second = await postMin("applications", { full_name: "E2E Twice", email: dupAddr, city: "Miami", answers });
    note("anon", "a second open application to one address is a 23505, not a second row", first.status === 201 && second.status === 409 && second.data?.code === "23505", `got ${first.status} then ${second.status} ${second.data?.code}`);
    const actionSrc = readFileSync(join(root, "src", "app", "(site)", "membership", "actions.ts"), "utf8");
    note("anon", "the front door voices 23505 as already with Shoreside", /23505[\s\S]{0,200}already with Shoreside/.test(actionSrc));

    /* The status lookup: unknown and pending answer in the same shape. */
    const fp = `e2e-pub-${stamp}`;
    const unknown = await anon.rpc("application_status_for", { p_email: `e2e-anon-pub-nobody-${stamp}@fixtures.invalid`, p_fingerprint: fp });
    const pending = await anon.rpc("application_status_for", { p_email: dupAddr, p_fingerprint: fp });
    note("anon", "an unknown address answers 200 with nothing, not an error", unknown.status === 200 && unknown.data === null, `got ${unknown.status} ${JSON.stringify(unknown.data)}`);
    note("anon", "a pending address answers 200 with its stage alone", pending.status === 200 && pending.data === "received", `got ${pending.status} ${JSON.stringify(pending.data)}`);
    /* One shape for both: a 200 and a bare stage-or-null. Nothing else about
       the application — no id, no name, no dates — leaves the database for
       either, so the only thing an enumerator learns per call is the stage,
       and the pacing below prices that. */
    const bare = (v) => v === null || typeof v === "string";
    note("anon", "unknown and pending share one shape (a bare stage or null, same status)", unknown.status === pending.status && bare(unknown.data) && bare(pending.data), `${JSON.stringify(unknown.data)} vs ${JSON.stringify(pending.data)}`);

    /* Pacing. The status page allows eight looks at one address in ten
       minutes; the door check allows ten tries. Both refuse in the club's
       words and both are exercised on fixture addresses under a fixture
       fingerprint, so the shared "unknown" bucket is untouched. */
    const paced = `e2e-anon-pub-paced-${stamp}@fixtures.invalid`;
    let statusRefusedAt = null, statusMsg = "";
    for (let i = 1; i <= 9; i++) {
      const r = await anon.rpc("application_status_for", { p_email: paced, p_fingerprint: fp });
      if (r.status >= 400) { statusRefusedAt = i; statusMsg = said(r); break; }
    }
    note("anon", "the ninth status look at one address in ten minutes is refused, and says to wait", statusRefusedAt === 9 && /checked a few times/.test(statusMsg), `refused at ${statusRefusedAt}: ${statusMsg.slice(0, 90)}`);
    let doorRefusedAt = null, doorMsg = "", doorAnswers = [];
    for (let i = 1; i <= 11; i++) {
      const r = await anon.rpc("email_may_board", { p_email: paced, p_fingerprint: fp });
      if (r.status >= 400) { doorRefusedAt = i; doorMsg = said(r); break; }
      doorAnswers.push(r.data);
    }
    note("anon", "an applicant's address may not board (the door says no, quietly)", doorAnswers.length === 10 && doorAnswers.every((a) => a === false), JSON.stringify(doorAnswers).slice(0, 60));
    note("anon", "the eleventh try at one address in ten minutes closes the door with the club's words", doorRefusedAt === 11 && /tried a few times/.test(doorMsg), `refused at ${doorRefusedAt}: ${doorMsg.slice(0, 90)}`);
    /* The whole-door ceiling cannot be tripped from a test — six hundred tries
       — so its existence is read from the migration that installed it. */
    const ceiling = readFileSync(join(root, "supabase", "migrations", "20260904115627_the_door_check_has_a_ceiling_the_caller_cannot_move.sql"), "utf8");
    note("anon", "the door has a whole-door ceiling with its own words (600, not tripped)", /600/.test(ceiling) && /the door is busy just now/.test(ceiling));

    /* ══════════ D. a guest, seated, signing, at the door ══════════ */
    if (epId) {
      const plan = (await stf.get(`profiles?id=eq.${uid(p.global)}&select=plan_id,membership_plans(guest_allowance)`)).data?.[0];
      note("staff", "the global fixture rides a plan with an allowance of two", plan?.membership_plans?.guest_allowance === 2, JSON.stringify(plan ?? "").slice(0, 90));

      const pass = await glo.post("passes", { episode_id: epId, profile_id: uid(p.global), status: "aboard" });
      passId = pass.data?.[0]?.id ?? null;
      note("global", "boards the fixture", pass.status === 201 && !!passId, `got ${pass.status} ${said(pass).slice(0, 90)}`);
    }
    if (passId) {
      const gA = await glo.post("pass_guests", { rsvp_id: passId, name: `E2E Signing Guest ${stamp}` });
      const gB = await glo.post("pass_guests", { rsvp_id: passId, name: `E2E Unsigned Guest ${stamp}` });
      guestA = gA.data?.[0] ?? null; guestB = gB.data?.[0] ?? null;
      note("global", "seats two guests, each with a code and a signing token", !!guestA?.sign_token && !!guestB?.sign_token && /-G\d$/.test(guestA?.boarding_code ?? "") && guestA.boarding_code !== guestB.boarding_code, `got ${gA.status}/${gB.status} ${guestA?.boarding_code} ${guestB?.boarding_code}`);
      note("global", "a seated guest is off camera until they say otherwise", guestA?.on_camera === false && guestB?.on_camera === false, `${guestA?.on_camera} / ${guestB?.on_camera}`);
    }
    if (guestA?.sign_token) {
      const tok = guestA.sign_token;
      const page = await get(`/sign/${tok}`);
      const html = await page.text();
      const text = visible(html);
      note("anon", "a guest opens their signing page by token, no account", page.status === 200, `got ${page.status}`);
      note("anon", "the signing page has the landing, one h1 and a title", count(html, /<main\b[^>]*\bid="main"/g) === 1 && count(html, /<h1\b/g) === 1 && /<title[^>]*>[^<]+<\/title>/.test(html), `${count(html, /<main\b/g)} main, ${count(html, /<h1\b/g)} h1`);
      note("anon", "the signing page names the guest and the episode", text.includes(`E2E Signing Guest ${stamp}`) && text.includes(`E2E public fixture ${stamp}`));
      note("anon", "the signing page carries the waiver's title and text", /Guest waiver/i.test(text) && text.length > 1500, `${text.length} chars of text`);
      note("anon", "the signing page tells robots to stay out", /<meta name="robots" content="noindex/.test(html));
      const off = BANNED.filter((t) => text.toLowerCase().includes(t.toLowerCase()));
      note("anon", "the signing page is on-lexicon", off.length === 0, off.join(", "));
      note("anon", "the signing page is no-store and sends no referrer", /no-store/.test(page.headers.get("cache-control") || "") && page.headers.get("referrer-policy") === "no-referrer" && (page.headers.get("content-security-policy") || "").includes("frame-ancestors 'none'"), `${page.headers.get("cache-control")} / ${page.headers.get("referrer-policy")}`);

      /* Sign as the guest — the RPC the page's server action calls, with the
         camera consent the waiver promises. */
      const sig = await anon.rpc("sign_document_as_guest", {
        p_token: tok, p_document_code: "guest-waiver", p_consent: true, p_consent_text: "E2E consent",
        p_signature_kind: "typed", p_signature_data: `E2E Signing Guest ${stamp}`, p_signer_name: null,
        p_guardian_name: null, p_user_agent: "un-e2e", p_on_camera: true,
      });
      note("anon", "the guest signs by token", sig.status === 200 && UUID.test(String(sig.data)), `got ${sig.status} ${said(sig).slice(0, 90)}`);
      const camera = await stf.get(`pass_guests?id=eq.${guestA.id}&select=on_camera`);
      note("staff", "the guest's own token flipped their camera consent on", camera.data?.[0]?.on_camera === true, JSON.stringify(camera.data));
      /* A second tap records no second signature — but the consent it carries
         is still the guest's to say, so saying no again is honoured. */
      const again = await anon.rpc("sign_document_as_guest", {
        p_token: tok, p_document_code: "guest-waiver", p_consent: true, p_signature_kind: "typed",
        p_signature_data: "E2E twice", p_on_camera: false,
      });
      note("anon", "signing twice is idempotent — the same signature comes back", again.status === 200 && again.data === sig.data, `${String(sig.data).slice(0, 8)} vs ${String(again.data).slice(0, 8)}`);
      const cameraOff = await stf.get(`pass_guests?id=eq.${guestA.id}&select=on_camera`);
      note("staff", "and the guest's token alone may take the consent back", cameraOff.data?.[0]?.on_camera === false, JSON.stringify(cameraOff.data));
      const signedPage = await get(`/sign/${tok}`);
      note("anon", "the signing page now says already signed", signedPage.status === 200 && /Already signed/.test(visible(await signedPage.text())));

      const wrongDoc = await anon.rpc("sign_document_as_guest", { p_token: tok, p_document_code: "member-waiver", p_consent: true, p_signature_kind: "typed", p_signature_data: "x" });
      note("anon", "a guest token signs guest paper only", wrongDoc.status >= 400 && /not for guests/.test(said(wrongDoc)), `got ${wrongDoc.status} ${said(wrongDoc).slice(0, 80)}`);
      const badTok = await anon.rpc("sign_document_as_guest", { p_token: ZERO, p_document_code: "guest-waiver", p_consent: true, p_signature_kind: "typed", p_signature_data: "x" });
      note("anon", "a token the club never issued is not recognised", badTok.status >= 400 && /not recognised/.test(said(badTok)), `got ${badTok.status} ${said(badTok).slice(0, 80)}`);
    }
    if (guestB) {
      /* The host cannot say yes to the camera for a guest, nor reissue the
         guest's credentials. A refusal is the guard's message; an RLS no-op
         is a 200 with nothing touched — either way the row must not move. */
      const hostFlip = await glo.patch(`pass_guests?id=eq.${guestB.id}`, { on_camera: true });
      const afterFlip = await stf.get(`pass_guests?id=eq.${guestB.id}&select=on_camera`);
      note("global", "the host cannot flip a guest's camera consent", afterFlip.data?.[0]?.on_camera === false && (hostFlip.status >= 400 ? /guest's to say/.test(said(hostFlip)) : (hostFlip.data || []).length === 0), `got ${hostFlip.status} ${said(hostFlip).slice(0, 80)}; on_camera=${afterFlip.data?.[0]?.on_camera}`);
      const hostToken = await glo.patch(`pass_guests?id=eq.${guestB.id}`, { sign_token: ZERO });
      const afterToken = await stf.get(`pass_guests?id=eq.${guestB.id}&select=sign_token`);
      note("global", "the host cannot reissue a guest's signing token", afterToken.data?.[0]?.sign_token === guestB.sign_token && (hostToken.status >= 400 ? /issued by the club/.test(said(hostToken)) : (hostToken.data || []).length === 0), `got ${hostToken.status} ${said(hostToken).slice(0, 80)}`);

      /* The door: an unsigned guest is refused with the document named; the
         signed one boards, and is un-stamped again for the strike below. */
      const refused = await stf.patch(`pass_guests?id=eq.${guestB.id}`, { checked_in_at: new Date().toISOString() });
      note("staff", "the door refuses an unsigned guest and names the waiver", refused.status >= 400 && /no guest boards unsigned/.test(said(refused)) && /outstanding/.test(said(refused)), `got ${refused.status} ${said(refused).slice(0, 110)}`);
      if (guestA) {
        const boards = await stf.patch(`pass_guests?id=eq.${guestA.id}&select=checked_in_at`, { checked_in_at: new Date().toISOString() });
        note("staff", "the signed guest boards", boards.status < 300 && !!boards.data?.[0]?.checked_in_at, `got ${boards.status} ${said(boards).slice(0, 80)}`);
        await stf.patch(`pass_guests?id=eq.${guestA.id}`, { checked_in_at: null });
      }

      /* The guest's stub: the static code, on the host's session. */
      const stub = await get(`/stub/${guestB.boarding_code}`, p.global);
      const stubHtml = await stub.text();
      const stubText = visible(stubHtml);
      note("global", "the guest stub renders the static code for the host to hand over", stub.status === 200 && /GUEST STUB/.test(stubText) && stubText.includes(guestB.boarding_code) && stubText.includes(`E2E UNSIGNED GUEST ${stamp}`.toUpperCase()) && /Present at the gangway/.test(stubText), `got ${stub.status}; code ${stubText.includes(guestB.boarding_code)}; label ${/GUEST STUB/.test(stubText)}`);
      note("global", "the guest stub draws a QR of the code", /<img[^>]+alt="Boarding code"/.test(stubHtml));
      const stubAnon = await get(`/stub/${guestB.boarding_code}`);
      note("anon", "a stub is behind the gangway", stubAnon.status >= 300 && stubAnon.status < 400 && /\/gangway/.test(stubAnon.headers.get("location") || ""), `got ${stubAnon.status} → ${stubAnon.headers.get("location")}`);
      const stubHeaders = stub.headers;
      note("global", "a stub is no-store and sends no referrer", /no-store/.test(stubHeaders.get("cache-control") || "") && stubHeaders.get("referrer-policy") === "no-referrer", `${stubHeaders.get("cache-control")} / ${stubHeaders.get("referrer-policy")}`);
    }

    /* The member's stub carries the rotating credential; its rule is a
       sixty-second row only the member may mint and only the member may read. */
    const mint = await glo.rpc("issue_member_qr");
    const cred = Array.isArray(mint.data) ? mint.data[0] : mint.data;
    note("global", "a member mints a rotating credential", mint.status === 200 && UUID.test(String(cred?.token)), `got ${mint.status} ${said(mint).slice(0, 80)}`);
    const anonMint = await anon.rpc("issue_member_qr");
    note("anon", "the open water cannot mint a member credential", anonMint.status >= 400, `got ${anonMint.status} ${said(anonMint).slice(0, 80)}`);
    if (cred?.token) {
      const row = await glo.get(`member_qr_tokens?token=eq.${cred.token}&select=issued_at,expires_at`);
      const ttl = row.data?.[0] ? (Date.parse(row.data[0].expires_at) - Date.parse(row.data[0].issued_at)) / 1000 : NaN;
      note("global", "the credential expires sixty seconds after it is issued", row.status === 200 && row.data?.length === 1 && Math.abs(ttl - 60) < 1, `ttl ${ttl}s`);
      const peek = await anon.get(`member_qr_tokens?token=eq.${cred.token}&select=token`);
      note("anon", "a live credential is not readable from the shore", peek.status === 200 && (peek.data || []).length === 0, `got ${peek.status} ${JSON.stringify(peek.data).slice(0, 60)}`);
    }

    /* ══════════ E. the host lets go; the guests detach ══════════ */
    if (passId) {
      const release = await glo.del(`passes?id=eq.${passId}`);
      const gone = await stf.get(`passes?id=eq.${passId}&select=id`);
      note("global", "the host releases the pass", release.status < 300 && (gone.data || []).length === 0, `got ${release.status} ${said(release).slice(0, 80)}`);
      passId = (gone.data || []).length ? passId : null;
      const rows = await stf.get(`pass_guests?id=in.(${[guestA?.id, guestB?.id].filter(Boolean).join(",")})&select=id,rsvp_id,boarding_code,checked_in_at`);
      const detached = (rows.data || []);
      note("staff", "the guests detach and their codes return to the pool", detached.length === [guestA, guestB].filter(Boolean).length && detached.every((g) => g.rsvp_id === null && g.boarding_code === null && g.checked_in_at === null), JSON.stringify(detached).slice(0, 160));
      if (guestA?.sign_token) {
        const stale = await get(`/sign/${guestA.sign_token}`);
        note("anon", "a detached guest's signing link goes off the chart", stale.status === 404, `got ${stale.status}`);
      }
    }
  } finally {
    /* Strike what the run made. The signed guest stays — see the header. */
    if (passId) await stf.del(`passes?id=eq.${passId}`);
    if (guestB?.id) {
      const rm = await stf.del(`pass_guests?id=eq.${guestB.id}`);
      note("staff", "the unsigned guest is struck", rm.status < 300, `got ${rm.status} ${said(rm).slice(0, 80)}`);
    }
    if (guestA?.id) {
      const keep = await stf.del(`pass_guests?id=eq.${guestA.id}`);
      note("staff", "a guest who signed cannot be struck — the club holds their signature", keep.status >= 400, `got ${keep.status} ${said(keep).slice(0, 80)}`);
    }
    if (epId) await stf.del(`episodes?id=eq.${epId}`);
    if (venueId) await stf.del(`venues?id=eq.${venueId}`);
    for (const a of applied) await stf.del(`applications?email=eq.${encodeURIComponent(a)}`);
    await stf.del(`applications?email=like.e2e-anon-pub-*${stamp}*`);
  }
}
