import Link from "next/link";
import { Wordmark } from "@/components/ds";
import { ANCHOR, CITY_CODES, EST_YEAR_ROMAN, PLACE } from "@/lib/brand";
import { roman } from "@/lib/format";
import type { Tables } from "@/lib/supabase/types";

const HARBOR_STATUS: Record<string, string> = {
  open: "Open",
  waitlist: "Waitlist",
  soon: "Soon",
};

export function SiteFooter({ cities }: { cities: Tables<"cities">[] }) {
  return (
    <footer className="ws-footer">
      <div className="ls-container">
        <div className="ws-footer__rule"></div>
        <div className="ws-footer__in">
          <div>
            {/* System A: the umbrella is speaking in a footer, and the parent anchor
                compounds recognition across every division instead of splitting it. */}
            <Wordmark size="lg" suffix={null} inverse />
            {/* Was "A membership club for experiential connection, at sea and
                ashore." — an abstraction on every page of the site, and the
                register the voice rules exist to keep out. A fact, then a line
                that lands. */}
            <p className="ws-footer__blurb">
              Fifty-two episodes a season, afloat and ashore. The cameras stay on.
            </p>
          </div>
          <div className="ws-footer__col">
            <b>The club</b>
            <Link href="/episodes">Episodes</Link>
            <Link href="/series">Series</Link>
            <Link href="/the-show">The show</Link>
            {/* One name per destination: the nav called this Casting and the
                footer called it Membership, for the same page. Casting is the
                show's word and it wins. */}
            <Link href="/membership">Casting</Link>
            <Link href="/log">The Log</Link>
            <Link href="/gallery">Gallery</Link>
            <Link href="/crew/wanted">Crew wanted</Link>
            <Link href="/crew">The Cast &amp; Crew</Link>
          </div>
          <div className="ws-footer__col">
            <b>{PLACE.markets}</b>
            {cities.map((h) => (
              <div className="ws-footer__harbor" key={h.id}>
                {h.name}
                <span>
                  {CITY_CODES[h.slug] ? CITY_CODES[h.slug] + " · " : ""}
                  {h.launch_year ? roman(h.launch_year) + " · " : ""}
                  {HARBOR_STATUS[h.status] || h.status}
                </span>
              </div>
            ))}
          </div>
          <div className="ws-footer__col">
            <b>Fine print</b>
            <Link href="/brand">The brand kit</Link>
            <Link href="/legal#conduct">Code of conduct</Link>
            <Link href="/legal#terms">Terms of passage</Link>
            <Link href="/legal#privacy">Privacy</Link>
            <Link href="/support">Shoreside</Link>
          </div>
        </div>
        <div className="ws-footer__base">
          <span>© MMXXVI {ANCHOR}</span>
          {/* Marina del Rey is Los Angeles; the club was founded in Miami and
              /brand's own facts table has said so all along. */}
          <span>Est. {EST_YEAR_ROMAN} · Miami</span>
        </div>
      </div>
    </footer>
  );
}
