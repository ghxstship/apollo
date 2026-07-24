import type { Metadata } from "next";
import Link from "next/link";
import { Avatar, Badge, Button, Switch, ThemeToggle } from "@/components/ds";
import { TIER_LABEL, roman } from "@/lib/format";
import { getMember } from "../data";
import { Offboarding, ProfileForm } from "./you-client";

export const metadata: Metadata = { title: "You" };

const DUES: Record<string, string> = {
  regional: "$95 / MO",
  national: "$240 / MO",
  global: "$520 / MO",
};

export default async function YouPage() {
  const { supabase, profile } = await getMember();
  const { data: harbors } = await supabase
    .from("harbors")
    .select("*")
    .order("position", { ascending: true });

  const tier = profile?.tier ?? "regional";
  const joinedYear = profile?.joined_at
    ? new Date(profile.joined_at).getFullYear()
    : new Date().getFullYear();

  return (
    <div style={{ maxWidth: 720, marginInline: "auto", display: "flex", flexDirection: "column", gap: 28 }}>
      <div>
        <span className="mbr-eyebrow">You</span>
        <h1 className="mbr-h1" style={{ marginTop: 6 }}>
          The ship&apos;s papers.
        </h1>
      </div>

      <div className="you-sec" style={{ marginTop: 0 }}>
        <div className="you-row">
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <Avatar
              name={profile?.full_name ?? "A member"}
              tone={(profile?.avatar_tone ?? "ink") as "ink" | "sea" | "brass" | "sand"}
              size="lg"
              ring
            />
            <div>
              <b style={{ fontFamily: "var(--font-display)", fontWeight: 400, fontSize: 20 }}>
                {profile?.full_name ?? "A member"}
              </b>
              <p className="mbr-mono" style={{ marginTop: 4 }}>
                {profile?.member_no ?? "LYR-0000"} · MEMBER SINCE {roman(joinedYear)}
              </p>
            </div>
          </div>
          <Badge tone="brass">{TIER_LABEL[tier]}</Badge>
        </div>
      </div>

      <div>
        <div className="you-h">The manifest reads</div>
        <div className="you-sec" style={{ padding: 18 }}>
          <ProfileForm
            fullName={profile?.full_name ?? ""}
            handle={profile?.handle ?? ""}
            homeHarbor={profile?.home_harbor ?? ""}
            avatarTone={profile?.avatar_tone ?? "ink"}
            harbors={(harbors ?? []).map((h) => ({ value: h.id, label: h.name }))}
          />
        </div>
      </div>

      <div>
        <div className="you-h">Appearance</div>
        <div className="you-sec">
          <div className="you-row">
            <div>
              <b>Theme</b>
              <p>Dark, light, or follow the sky.</p>
            </div>
            <ThemeToggle />
          </div>
        </div>
      </div>

      <div>
        <div className="you-h">The word</div>
        <div className="you-sec">
          <div className="you-row">
            <div>
              <b>Weather holds</b>
              <p>Called by 18:00 the night before.</p>
            </div>
            <Switch defaultChecked label="" aria-label="Weather hold notices" />
          </div>
          <div className="you-row">
            <div>
              <b>Berth releases</b>
              <p>Waitlist offers, in order.</p>
            </div>
            <Switch defaultChecked label="" aria-label="Berth release notices" />
          </div>
          <div className="you-row">
            <div>
              <b>Fathoms</b>
              <p>Every entry, as it lands in the ledger.</p>
            </div>
            <Switch label="" aria-label="Fathoms notices" />
          </div>
        </div>
      </div>

      <div>
        <div className="you-h">Membership</div>
        <div className="you-sec">
          <div className="you-row">
            <div>
              <b>{TIER_LABEL[tier]} tier</b>
              <p className="mbr-mono" style={{ marginTop: 4 }}>
                DUES · {DUES[tier]}
              </p>
            </div>
            <Link href="/portal" className="ls-btn ls-btn--outline ls-btn--sm">
              Manage membership
            </Link>
          </div>
        </div>
      </div>

      <div>
        <div className="you-h">The gangway out</div>
        <div className="you-sec">
          <div className="you-row">
            <div>
              <b>Pause or depart</b>
              <p>No exit surveys, no retention calls, no games.</p>
            </div>
            <Offboarding />
          </div>
          <div className="you-row">
            <div>
              <b>Sign out</b>
              <p>This device only.</p>
            </div>
            <form action="/auth/signout" method="post">
              <Button type="submit" variant="outline" size="sm">
                Sign out
              </Button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
