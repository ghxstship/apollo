/* Which language the club is being read in, and which way it runs.

   The audit found no locale identity anywhere: `lang="en"` as a literal in the
   root layout, no negotiation, no region, no direction attribute, and every
   user-facing string an English literal in a component. The owner's answer to
   whether that matters was that the Global standing sells from launch, with
   localization, and without shortcuts that create rework later.

   This is the part that must exist BEFORE any string moves, because it is the
   part everything else reads. Extracting three thousand strings against a
   locale that is a literal in one file would mean extracting them twice.

   WHAT IS DELIBERATELY NOT HERE. No catalog loader, no message format, no
   translation files. Those follow the extraction and would be scaffolding
   without it — a catalog holding twenty strings while three thousand stay in
   components is a thing that looks like progress and is not. What is here is
   the identity, the direction and the negotiation, which every one of those
   three thousand will need and none of them can be written against twice. */

/* BCP-47, and the region matters. `en-GB` and `en-US` disagree about the order
   of a date and the name of a floor; `pt-BR` and `pt-PT` disagree about more
   than that. A locale list of bare languages is a list that has already decided
   to be wrong somewhere. */
export const LOCALES = ["en-US", "en-GB", "es-ES", "fr-FR", "pt-BR", "de-DE", "ar-AE", "he-IL"] as const;
export type Locale = (typeof LOCALES)[number];

/* The club's own. Not a fallback in the apologetic sense — it is the language
   the club is written in, and everything else is a translation of it. */
export const DEFAULT_LOCALE: Locale = "en-US";

/* Right-to-left scripts. A list rather than a lookup because it changes about
   as often as the alphabet does, and because a wrong answer here mirrors an
   entire page.

   Kept as language subtags: direction belongs to the script, and `ar-AE` and
   `ar-EG` run the same way. */
const RTL_LANGUAGES = new Set(["ar", "he", "fa", "ur", "ps", "sd", "yi", "dv", "ckb"]);

export function direction(locale: string): "ltr" | "rtl" {
  return RTL_LANGUAGES.has(locale.split("-")[0].toLowerCase()) ? "rtl" : "ltr";
}

/* A pseudo-locale, for finding the strings that never got extracted.

   `en-XA` is the convention: English, accented and padded, so a page rendered
   in it shows at a glance which words came from a catalog and which are still
   welded into a component — the unaccented ones. The padding is the second
   half of its job: German runs about a third longer than English, and a layout
   that only ever saw English breaks the first time it meets a real
   translation. Better to meet it in a test.

   Not in LOCALES: it is a tool, never negotiated into, and only reachable by
   asking for it outright. */
export const PSEUDO_LOCALE = "en-XA";

export function isSupported(tag: string): tag is Locale {
  return (LOCALES as readonly string[]).includes(tag);
}

/* Negotiation, in the order that respects the person most.

   1. What they chose, stored on their profile. A choice, once made, outranks
      everything — including a browser they are borrowing.
   2. What this request asked for, in a cookie. Covers somebody who has not
      signed in, and the moment between choosing and the profile catching up.
   3. What their browser says, by quality value.
   4. The club's own.

   Accept-Language is parsed rather than trusted: it arrives from the network
   and a header of ten thousand tags is a header somebody sent on purpose. */
export function negotiate(
  header: string | null | undefined,
  chosen?: string | null,
  cookie?: string | null,
): Locale {
  if (chosen && isSupported(chosen)) return chosen;
  if (cookie && isSupported(cookie)) return cookie;
  if (!header) return DEFAULT_LOCALE;

  const wanted = header
    .split(",")
    .slice(0, 20)
    .map((part) => {
      const [tag, ...params] = part.trim().split(";");
      const q = params.find((p) => p.trim().startsWith("q="));
      const weight = q ? Number.parseFloat(q.split("=")[1]) : 1;
      return { tag: tag.trim(), q: Number.isFinite(weight) ? weight : 0 };
    })
    .filter((w) => w.tag && w.q > 0)
    .sort((a, b) => b.q - a.q);

  for (const { tag } of wanted) {
    if (isSupported(tag)) return tag;
    /* `fr` should reach `fr-FR` — a browser asking for a language and not a
       region has not said it dislikes ours. Regionless requests match the
       first locale sharing the language, which is why LOCALES is ordered. */
    const lang = tag.split("-")[0].toLowerCase();
    const near = LOCALES.find((l) => l.split("-")[0].toLowerCase() === lang);
    if (near) return near;
  }
  return DEFAULT_LOCALE;
}

/* The cookie the club remembers a choice in. Named like the others here and
   deliberately not `httpOnly`: the language a page is in is not a secret, and
   a client that can read it can render without a round trip. */
export const LOCALE_COOKIE = "un-locale";
