import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/* One search, and it finds everything.

   The whole app had two search fields — the member roster and the Bridge —
   across eighty-two routes and eleven lists. A member who remembered "that
   sandbar thing in March" had nowhere to type it. This is the field.

   ON THE MEMBER LINE. It searches a reader's own passes and threads alongside
   the public catalogue, and that is safe by construction rather than by care
   taken here: every query below goes through the cookie-scoped server client,
   so row-level security decides what comes back. There is no service role on
   this path and no SECURITY DEFINER function; an anonymous visitor searching
   gets the public catalogue and nothing else, because that is all the database
   will hand them.

   What the sections do is the part that needed deciding. Results are GROUPED BY
   KIND, never mixed into one ranked list — an episode called Sandbar Social and
   the pass you hold for it are different objects, and a flat list makes the
   reader work out which is which. Yours comes first and simply is not there
   when a reader has nothing of their own matching. A new kind of thing becomes
   a new section, never a new mode: a scope toggle would be a control you have
   to understand before you are allowed to search.

   A route handler rather than a server action on purpose. This runs on every
   keystroke after a pause; server actions are router POSTs that revalidate, and
   typeahead is not a mutation. */

export const dynamic = "force-dynamic";

type Hit = { id: string; title: string; meta: string | null; href: string };
type Section = { kind: string; label: string; items: Hit[] };

const PER_SECTION = 5;

/* PostgREST's or() takes a comma-separated filter grammar, so a comma or a
   parenthesis in the needle is not a character to escape — it is a syntax
   error, or worse, a second filter. Percent and underscore are ilike
   wildcards. None of them are things a person searches for by name here, so
   they are dropped rather than quoted. */
function clean(raw: string): string {
  return raw.replace(/[,()%_*\\]/g, " ").trim().slice(0, 64);
}

export async function GET(request: Request) {
  const q = clean(new URL(request.url).searchParams.get("q") ?? "");
  /* Two characters is where a prefix stops matching most of the corpus. */
  if (q.length < 2) return NextResponse.json({ sections: [] satisfies Section[] });

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const like = `%${q}%`;
  const nowIso = new Date().toISOString();

  const [episodes, members, log, shop, passes, threads] = await Promise.all([
    supabase
      .from("episodes")
      .select("id,slug,title,starts_at,setting")
      .in("status", ["scheduled", "live", "weather_hold"])
      .gte("starts_at", nowIso)
      .ilike("title", like)
      .order("starts_at", { ascending: true })
      .limit(PER_SECTION),
    supabase
      .from("member_directory")
      .select("id,full_name,handle")
      .or(`full_name.ilike.${like},handle.ilike.${like}`)
      .limit(PER_SECTION),
    supabase
      .from("log_posts")
      .select("id,slug,title,dek,published_at")
      .or(`title.ilike.${like},dek.ilike.${like}`)
      .order("published_at", { ascending: false })
      .limit(PER_SECTION),
    supabase
      .from("products")
      .select("id,name,category")
      .eq("active", true)
      .ilike("name", like)
      .limit(PER_SECTION),
    /* Yours. Both of these return nothing at all for a signed-out reader —
       the policies see no member — so the section disappears on its own
       without this file testing for it. The inner join is what lets the filter
       reach the episode's title from the pass. */
    user
      ? supabase
          .from("passes")
          .select("id,episodes!inner(slug,title,starts_at)")
          .eq("profile_id", user.id)
          .ilike("episodes.title", like)
          .limit(PER_SECTION)
      : Promise.resolve({ data: null }),
    user
      ? supabase
          .from("threads")
          .select("id,title")
          .ilike("title", like)
          .limit(PER_SECTION)
      : Promise.resolve({ data: null }),
  ]);

  const day = (iso: string) =>
    new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" }).toUpperCase();

  const yours: Hit[] = [
    ...((passes.data ?? []) as unknown as Array<{
      id: string;
      episodes: { slug: string; title: string; starts_at: string } | null;
    }>)
      .filter((p) => p.episodes)
      .map((p) => ({
        id: `pass-${p.id}`,
        title: p.episodes!.title,
        meta: `Your pass · ${day(p.episodes!.starts_at)}`,
        href: `/passes`,
      })),
    ...((threads.data ?? []) as Array<{ id: string; title: string | null }>).map((t) => ({
      id: `thread-${t.id}`,
      title: t.title || "A thread",
      meta: "Your thread",
      href: `/threads/${t.id}`,
    })),
  ].slice(0, PER_SECTION);

  const sections: Section[] = [
    { kind: "yours", label: "Yours", items: yours },
    {
      kind: "episodes",
      label: "Episodes",
      items: ((episodes.data ?? []) as Array<{
        id: string;
        slug: string;
        title: string;
        starts_at: string;
        setting: string;
      }>).map((v) => ({
        id: v.id,
        title: v.title,
        meta: `${v.setting === "sea" ? "Afloat" : "Ashore"} · ${day(v.starts_at)}`,
        href: `/episodes/${v.slug}`,
      })),
    },
    {
      kind: "members",
      label: "Members",
      items: ((members.data ?? []) as Array<{
        id: string;
        full_name: string | null;
        handle: string | null;
      }>).map((m) => ({
        id: m.id,
        title: m.full_name || "A member",
        meta: m.handle ? `@${m.handle}` : null,
        href: m.handle ? `/directory/${m.handle}` : "/directory",
      })),
    },
    {
      kind: "log",
      label: "The Log",
      items: ((log.data ?? []) as Array<{
        id: string;
        slug: string;
        title: string;
        dek: string | null;
      }>).map((p) => ({ id: p.id, title: p.title, meta: p.dek, href: `/log/${p.slug}` })),
    },
    {
      kind: "shop",
      label: "The Shop",
      items: ((shop.data ?? []) as Array<{ id: string; name: string; category: string }>).map(
        (p) => ({ id: p.id, title: p.name, meta: p.category, href: "/shop" })
      ),
    },
  ].filter((s) => s.items.length > 0);

  return NextResponse.json({ sections });
}
