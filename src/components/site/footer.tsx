import Link from "next/link";
import { Wordmark } from "@/components/ds";
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
            <Wordmark size="lg" seam inverse />
            <p className="ws-footer__blurb">
              A membership club for experiential connection, at sea and ashore.
            </p>
          </div>
          <div className="ws-footer__col">
            <b>The club</b>
            <Link href="/voyages">Voyages</Link>
            <Link href="/membership">Membership</Link>
            <Link href="/dispatch">The Dispatch</Link>
            <Link href="/gallery">Gallery</Link>
            <Link href="/crew">Crew wanted</Link>
          </div>
          <div className="ws-footer__col">
            <b>Harbors</b>
            {harbors.map((h) => (
              <div className="ws-footer__harbor" key={h.id}>
                {h.name}
                <span>
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
            <Link href="/support">The shore office</Link>
          </div>
        </div>
        <div className="ws-footer__base">
          <span>© MMXXVI Lyre Social</span>
          <span>Est. MMXXIV · Marina del Rey</span>
        </div>
      </div>
    </footer>
  );
}
