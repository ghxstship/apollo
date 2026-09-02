import type { Metadata } from "next";
import Link from "next/link";
import { getMember } from "../../data";
import { moduleTables } from "@/lib/module-tables";
import { qrDataUrl } from "@/lib/commerce-qr";
import { roman } from "@/lib/format";
import { Wordmark } from "@/components/ds";
import {
  PAUSE_DAYS_A_YEAR,
  PRODUCT_KIND_LABEL,
  SCAN_LABEL,
  STANDING_LABEL,
  STANDING_LINE,
  memberMark,
  productPrice,
  productWeight,
  type ClubProduct,
  type StandingState,
} from "@/lib/membership";
import { Credential } from "./credential";
import "./standing.css";

export const metadata: Metadata = { title: "Standing" };

/* Membership — the credential and its lifecycle.

   This page speaks for ONE of the four product economies in play: the five
   products operations.md §3 sells, which is the only set the canonical
   operations document and the membership kit's own product table agree on. The
   kit's other two ladders (Coastal/Offshore/Deepwater at $90–$240 a year, and
   the Season/Table/Day Guest/+1 pass list) are not rendered anywhere, because
   rendering them would be the club quoting three different prices for the same
   thing on three different screens.

   The thirteen live membership_plans are not rendered here either, and are not
   touched. They are a different axis — geography × class, with an allowance and
   a booking head start — and the join between the two economies is one nullable
   column that is null on all thirteen. Deciding that mapping moves fourteen
   members between products and is not a rendering decision. */

const TONE: Record<StandingState, string> = {
  active: "var(--positive)",
  expiring: "var(--caution)",
  paused: "var(--caution)",
  lapsed: "var(--text-faint)",
  departed: "var(--text-faint)",
};

/* ABOARD, HOLD, VOID — what verify_member_qr() returns, and nothing else. VOID
   is never read aloud to a line, so its line here is written for a screen the
   crew turn away from the queue. */
const SCAN_LINES: Array<[keyof typeof SCAN_LABEL, string, string]> = [
  ["aboard", "Name, cabin, and the time you came aboard", "var(--positive)"],
  ["hold", "Something is open on the account — the crew have it", "var(--caution)"],
  ["void", "The code has rotated. The kiosk routes to help, quietly", "var(--text-faint)"],
];

export default async function StandingPage() {
  const { supabase, user, profile } = await getMember();
  const db = moduleTables(supabase);

  /* The third one was NOT destructured to `.data`. The first two are, a line
     apart, which is exactly why it read as correct. `credential` was the whole
     PostgrestResponse, so Array.isArray was false, `first.token` was undefined,
     and initialQr was ALWAYS null — the member held up a phone at the gangway
     and showed a blank square. Not an error, not a fallback with words in it:
     `std-cred__blank` is an empty aria-hidden div, so it was invisible to a
     screen reader too. It recovered only if they thought to press "New code",
     or waited out the 55-second rotation interval, which does not fire at
     mount. */
  const [{ data: productRows }, { data: pauseDays }, { data: credential }] = await Promise.all([
    db.from("club_products").select("*").eq("active", true).order("position"),
    db.rpc("membership_pause_days_used", { p_profile: user.id }),
    db.rpc("issue_member_qr"),
  ]);

  const products = (productRows ?? []) as ClubProduct[];
  const used = typeof pauseDays === "number" ? pauseDays : 0;

  const first = (Array.isArray(credential) ? credential[0] : credential) as
    | { token: string; expires_at: string }
    | undefined;
  const initialQr = first?.token ? await qrDataUrl(first.token) : null;

  const status = (profile?.status ?? "active") as "active" | "paused" | "departed";
  const state: StandingState =
    status === "departed" ? "departed" : status === "paused" ? "paused" : "active";

  const name = profile?.full_name ?? "A member";
  const joinedYear = profile?.joined_at
    ? new Date(profile.joined_at).getFullYear()
    : new Date().getFullYear();

  return (
    <div className="std">
      <span className="mbr-eyebrow">Membership · the card and the record</span>
      <h1 className="mbr-h1">Your standing</h1>
      <p className="std-lede">
        One card, two media. The printed one is static and gate-checked; this one
        rotates. Both carry the same number, and the number stays yours through a
        pause and for ninety days after a lapse.
      </p>

      <div className="std-card">
        <div className="std-card__id">
          <Wordmark size="sm" suffix="Hinged" inverse />
          <span className="std-card__no">Member {memberMark(profile?.member_no)}</span>
          <span className="std-card__name">{name}</span>
          <span className="std-card__est">Est. {roman(joinedYear)}</span>
        </div>
        <Credential initialQr={initialQr} initialExpiry={first?.expires_at ?? null} />
      </div>

      <section className="mbr-sec" aria-labelledby="std-life">
        <span className="mbr-eyebrow" id="std-life">Lifecycle</span>
        <div className="std-state" style={{ ["--std-tone" as string]: TONE[state] }}>
          <span className="std-state__name">{STANDING_LABEL[state]}</span>
          <p className="std-state__line">{STANDING_LINE[state]}</p>
          <p className="std-state__budget">
            {used} of {PAUSE_DAYS_A_YEAR} days at sea used this year. The club
            stops a pause that would run past the allowance, and says so.
          </p>
          <Link className="std-state__link" href="/you">
            Pause or resume on your page
          </Link>
        </div>
      </section>

      <section className="mbr-sec" aria-labelledby="std-prod">
        <span className="mbr-eyebrow" id="std-prod">What the club sells</span>
        <div className="std-grid">
          {products.map((p) => (
            <article className="std-prod" key={p.slug}>
              <div className="std-prod__head">
                <h2 className="std-prod__name">{p.label}</h2>
                <span className="std-prod__price">{productPrice(p)}</span>
              </div>
              <p className="std-prod__blurb">{p.blurb}</p>
              <div className="std-prod__facts">
                <span>{PRODUCT_KIND_LABEL[p.kind]}</span>
                <span>{productWeight(p)}</span>
                {p.active_cap ? <span>{p.active_cap} at a time</span> : null}
                <span>{p.vetting}</span>
              </div>
              {p.includes.length ? (
                <ul className="std-prod__inc">
                  {p.includes.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              ) : null}
            </article>
          ))}
        </div>
      </section>

      <section className="mbr-sec" aria-labelledby="std-scan">
        <span className="mbr-eyebrow" id="std-scan">At the gangway</span>
        <div className="std-scan">
          {SCAN_LINES.map(([key, line, tone]) => (
            <div className="std-scan__row" key={key} style={{ ["--std-tone" as string]: tone }}>
              <span className="std-scan__name">{SCAN_LABEL[key]}</span>
              <span className="std-scan__line">{line}</span>
            </div>
          ))}
        </div>
      </section>

      <p className="std-note">
        A price is the product and not a starting point. Where a product carries
        no number, there is no number to withhold — the record says so rather
        than printing a zero.
      </p>
    </div>
  );
}
