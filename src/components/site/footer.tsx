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

export function SiteFooter({ harbors }: { harbors: Tables<"harbors">[] }) {
  return (
    <footer className="ws-footer">
      <div className="ls-container">
        <div className="ws-footer__rule"></div>
        <div className="ws-footer__in">
          <div>
            {/* System A: the umbrella is speaking in a footer, and the parent anchor
                compounds recognition across every division instead of splitting it. */}
            <Wordmark size="lg" suffix={null} inverse />
            <p className="ws-footer__blurb">
              A membership club for experiential connection, at sea and ashore.
            </p>
          </div>
          <div className="ws-footer__col">
            <b>The club</b>
            <Link href="/episodes">Episodes</Link>
            <Link href="/membership">Membership</Link>
            <Link href="/log">The Log</Link>
            <Link href="/gallery">Gallery</Link>
            <Link href="/crew">Crew wanted</Link>
          </div>
          <div className="ws-footer__col">
            <b>{PLACE.markets}</b>
            {harbors.map((h) => (
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
          <span>Est. {EST_YEAR_ROMAN} · Marina del Rey</span>
        </div>
      </div>
    </footer>
  );
}
