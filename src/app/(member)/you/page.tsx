import type { Metadata } from "next";
import { CameraConsent } from "./camera-consent";
import Link from "next/link";
import { Avatar, Badge, Button, ThemeToggle } from "@/components/ds";
import { TIER_LABEL, roman } from "@/lib/format";
import { PushControls } from "@/components/push-controls";
import { PhoneField } from "@/components/phone-field";
import { stripeEnabled } from "@/lib/stripe";
import { getMember } from "../data";
import { SettleCardButton } from "../portal/settle-card";
import { NotificationPrefsForm, Offboarding, ProfileForm, ResumeBanner } from "./you-client";

export const metadata: Metadata = { title: "You" };

export default async function YouPage() {
  const { supabase, user, profile } = await getMember();
  const [{ data: harbors }, { data: account }] = await Promise.all([
    supabase.from("harbors").select("*").order("position", { ascending: true }),
    supabase.from("account_balance").select("*").eq("profile_id", user.id).maybeSingle(),
  ]);

  const tier = profile?.tier ?? "regional";
  const status = profile?.status ?? "active";
  const balanceCents = account?.balance_cents ?? 0;
  const joinedYear = profile?.joined_at
    ? new Date(profile.joined_at).getFullYear()
    : new Date().getFullYear();

  const prefs = (profile?.notification_prefs ?? {}) as Record<string, unknown>;
  const prefOn = (key: string, fallback: boolean) =>
    typeof prefs[key] === "boolean" ? (prefs[key] as boolean) : fallback;

  return (
    <div style={{ maxWidth: 720, marginInline: "auto", display: "flex", flexDirection: "column", gap: 28 }}>
      <div>
        <span className="mbr-eyebrow">You</span>
        <h1 className="mbr-h1" style={{ marginTop: 6 }}>
          The ship&apos;s papers.
        </h1>
      </div>

      {status === "paused" ? <ResumeBanner /> : null}

      <div className="you-sec" style={{ marginTop: 0 }}>
        <div className="you-row">
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <Avatar
              name={profile?.full_name ?? "A member"}
              tone={(profile?.avatar_tone ?? "ink") as "ink" | "sea" | "gold" | "sand"}
              size="lg"
              ring
            />
            <div>
              <b style={{ fontFamily: "var(--font-display)", fontWeight: 400, fontSize: 20 }}>
                {profile?.full_name ?? "A member"}
              </b>
              {profile?.handle ? (
                <p style={{ fontSize: 12.5, color: "var(--text-2)", marginTop: 2 }}>
                  @{profile.handle}
                </p>
              ) : null}
              <p className="mbr-mono" style={{ marginTop: 4 }}>
                {profile?.member_no ?? "SYR-0000"} · MEMBER SINCE {roman(joinedYear)}
              </p>
            </div>
          </div>
          <Badge tone="gold">{TIER_LABEL[tier]}</Badge>
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
            bio={profile?.bio ?? ""}
            interests={profile?.interests ?? []}
            inDirectory={profile?.in_directory ?? true}
          />
        </div>
      </div>

      <div>
        <div className="you-h">The cameras</div>
        <div className="you-sec">
          <CameraConsent onCamera={profile?.on_camera ?? true} />
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
          <NotificationPrefsForm
            weather={prefOn("weather", true)}
            berths={prefOn("berths", true)}
            fathoms={prefOn("fathoms", false)}
          />
          <PushControls />
          {/* Weather holds are the one message that must not wait in an inbox. */}
          <PhoneField defaultValue={profile?.phone ?? null} verified={profile?.phone_verified ?? false} />
        </div>
      </div>

      <div>
        <div className="you-h">Membership</div>
        <div className="you-sec">
          <div className="you-row">
            <div>
              <b>{TIER_LABEL[tier]} tier</b>
              <p className="mbr-mono" style={{ marginTop: 4 }}>
                {status === "paused" ? "ON WEATHER HOLD · " : ""}
                {balanceCents < 0 ? (
                  <span style={{ color: "var(--siren)" }}>
                    ACCOUNT — ${(Math.abs(balanceCents) / 100).toFixed(2)} DUE
                  </span>
                ) : (
                  "ACCOUNT — SETTLED"
                )}
              </p>
            </div>
            <Link href="/portal" className="ls-btn ls-btn--outline ls-btn--sm">
              Manage membership
            </Link>
          </div>
          {balanceCents < 0 && stripeEnabled() ? (
            <div className="you-row">
              <div>
                <b>Settle the account</b>
                <p>Card payments post to the ledger when the processor confirms.</p>
              </div>
              <SettleCardButton
                amountLabel={`$${(Math.abs(balanceCents) / 100).toFixed(2)}`}
              />
            </div>
          ) : null}
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
            <Offboarding status={status} />
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
