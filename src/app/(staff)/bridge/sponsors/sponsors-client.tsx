"use client";

import React from "react";
import { Badge, Button, Checkbox, Dialog, Input, ListToolbar, Select, StateBlock, Switch, Table, Toast } from "@/components/ds";
import { logDate, price } from "@/lib/format";
import { useToast } from "../../ui";
import {
  attachSponsor,
  compAPass,
  createSponsor,
  detachSponsor,
  setAssetsDelivered,
  setSponsorActive,
  type SponsorTier,
} from "./actions";

/* One activation — the sponsor on one episode — with what it has delivered
   against the tier's checklist and the passes comped on its account. */
export type Activation = {
  episodeId: string;
  label: string;
  placement: string | null;
  /** episode_sponsors.assets_delivered — the ticked entries of the tier's list. */
  assetsDelivered: string[];
  /** passes stamped with this sponsor on this episode, by member name. */
  comps: Array<{ id: string; name: string; status: string }>;
  /** The episode can still take a pass, so a comp can be given. */
  open: boolean;
};

export type SponsorItem = {
  id: string;
  name: string;
  tier: SponsorTier;
  tierLabel: string;
  monthlyCents: number;
  contactEmail: string | null;
  startsOn: string | null;
  endsOn: string | null;
  notes: string | null;
  active: boolean;
  /* Who signed them, by name. Null on rows from before the column existed. */
  signedBy: string | null;
  activations: Activation[];
  [key: string]: unknown;
};

/* One row of the rate card — sponsor_tiers, read server-side. The label, the
   opening figure and the assets a tier promises all come from the table, so
   a change on the card reaches this screen without a deploy. */
export type TierCard = {
  slug: string;
  label: string;
  rateCents: number;
  assets: string[];
};

/* starts_on/ends_on are date-only rows; read them on UTC so the term shown
   is the term signed, whatever clock the console runs on. */
function termLine(s: SponsorItem): string {
  if (!s.startsOn && !s.endsOn) return "—";
  const from = s.startsOn ? logDate(s.startsOn, "UTC") : "OPEN";
  const to = s.endsOn ? logDate(s.endsOn, "UTC") : "OPEN";
  return `${from} — ${to}`;
}

export function SponsorsClient({
  rows,
  tiers,
  episodes,
  members,
}: {
  rows: SponsorItem[];
  tiers: TierCard[];
  episodes: Array<{ value: string; label: string }>;
  /** Members in standing, for the comp picker. */
  members: Array<{ value: string; label: string }>;
}) {
  const [pending, startTransition] = React.useTransition();
  const { toast, show, clear } = useToast();
  const [signing, setSigning] = React.useState(false);
  /* Take it off fired straight off the click — the only control on this screen
     that undoes a placement, and the only one that never asked. The credit line
     is already on the episode's public page by then, and the delivered-assets
     ticks go with it. Same confirm-first shape as Sign a sponsor below. */
  const [detaching, setDetaching] = React.useState<{ sponsor: SponsorItem; act: Activation } | null>(
    null
  );

  const detach = (sponsor: SponsorItem, act: Activation) =>
    startTransition(async () => {
      const res = await detachSponsor(act.episodeId, sponsor.id);
      setDetaching(null);
      if (res.error) show({ msg: res.error, tone: "danger" });
      else show({ msg: "Taken off the episode.", meta: sponsor.name.toUpperCase(), tone: "caution" });
    });

  const firstTier = tiers[0];
  const cardFor = (slug: string) => tiers.find((t) => t.slug === slug);

  const [name, setName] = React.useState("");
  const [tier, setTier] = React.useState<SponsorTier>(firstTier?.slug ?? "");
  const [retainer, setRetainer] = React.useState(String((firstTier?.rateCents ?? 0) / 100));
  const [email, setEmail] = React.useState("");
  const [startsOn, setStartsOn] = React.useState("");
  const [endsOn, setEndsOn] = React.useState("");
  const [notes, setNotes] = React.useState("");

  /* Per-sponsor picks for the activation control below the book. */
  const [picks, setPicks] = React.useState<Record<string, { episode: string; placement: string }>>({});
  const pickFor = (id: string) => picks[id] ?? { episode: "", placement: "" };
  const setPick = (id: string, patch: Partial<{ episode: string; placement: string }>) =>
    setPicks((p) => ({ ...p, [id]: { ...pickFor(id), ...patch } }));

  /* Per-activation member pick for a comp, keyed episode:sponsor. */
  const [compPicks, setCompPicks] = React.useState<Record<string, string>>({});
  const compKey = (episodeId: string, sponsorId: string) => `${episodeId}:${sponsorId}`;

  const toggleAsset = (s: SponsorItem, a: Activation, asset: string, on: boolean) =>
    startTransition(async () => {
      const next = on
        ? [...a.assetsDelivered.filter((x) => x !== asset), asset]
        : a.assetsDelivered.filter((x) => x !== asset);
      const res = await setAssetsDelivered(a.episodeId, s.id, next);
      if (res.error) show({ msg: res.error, tone: "danger" });
    });

  const comp = (s: SponsorItem, a: Activation) => {
    const key = compKey(a.episodeId, s.id);
    const profileId = compPicks[key] ?? "";
    const who = members.find((m) => m.value === profileId)?.label ?? "";
    startTransition(async () => {
      const res = await compAPass(a.episodeId, s.id, profileId);
      if (res.error) {
        show({ msg: res.error, tone: "danger" });
        return;
      }
      setCompPicks((p) => ({ ...p, [key]: "" }));
      show({
        msg: "Comped. The pass rides on the sponsor's account.",
        meta: `${who.toUpperCase()} · ${s.name.toUpperCase()}`,
      });
    });
  };

  const columns = [
    {
      key: "name",
      label: "Sponsor",
      render: (r: SponsorItem) => (
        <span>
          <b style={{ fontWeight: 700 }}>{r.name}</b>
          {r.contactEmail ? (
            <span style={{ display: "block", marginTop: 2, color: "var(--text-3)" }}>
              {r.contactEmail}
            </span>
          ) : null}
          {r.signedBy ? (
            <span style={{ display: "block", marginTop: 2, color: "var(--text-3)" }}>
              signed by {r.signedBy}
            </span>
          ) : null}
        </span>
      ),
    },
    {
      key: "tier",
      label: "Tier",
      width: 170,
      render: (r: SponsorItem) => r.tierLabel,
    },
    {
      key: "retainer",
      label: "Retainer",
      width: 110,
      mono: true,
      /* price(0) reads COMPLIMENTARY — right for a pass, wrong for a ledger. */
      render: (r: SponsorItem) => `${r.monthlyCents ? price(r.monthlyCents) : "$0"} / MO`,
    },
    {
      key: "term",
      label: "Term",
      width: 170,
      mono: true,
      render: (r: SponsorItem) => termLine(r),
    },
    {
      key: "active",
      label: "State",
      width: 100,
      render: (r: SponsorItem) => (
        <Badge tone={r.active ? "positive" : "outline"}>{r.active ? "Active" : "Retired"}</Badge>
      ),
    },
    {
      key: "act",
      label: "",
      width: 70,
      render: (r: SponsorItem) => (
        <Switch
          aria-label={r.active ? `Retire ${r.name}` : `Reinstate ${r.name}`}
          checked={r.active}
          disabled={pending}
          onChange={() =>
            startTransition(async () => {
              const res = await setSponsorActive(r.id, !r.active);
              if (res.error) show({ msg: res.error, tone: "danger" });
              else if (r.active)
                show({ msg: "Retired. The shore stops crediting them now.", meta: r.name.toUpperCase() });
              else show({ msg: "Back on the book.", meta: r.name.toUpperCase() });
            })
          }
        />
      ),
    },
  ];

  return (
    <>
      <div style={{ margin: "22px 0 14px", display: "flex", gap: 10 }}>
        <Button variant="gold" onClick={() => setSigning(true)} disabled={tiers.length === 0}>
          Sign a sponsor
        </Button>
      </div>

      <ListToolbar
        resultCount={rows.length}
        resultNoun="sponsor"
        countSuffix={` · ${rows.filter((r) => r.active).length} active`}
      />
      {tiers.length === 0 ? (
        <StateBlock
          status="error"
          title="The rate card is empty."
          detail="sponsor_tiers has no rows, so there is nothing to sign a sponsor to. Seed the card before signing anyone."
        />
      ) : rows.length === 0 ? (
        <StateBlock
          title="No names on the book."
          detail="A sponsor keeps a retainer and gets a credit on the episodes it rides. Sign the first one and place it below."
        />
      ) : (
        <Table columns={columns} rows={rows} rowKey={(r) => r.id} />
      )}

      {rows.length > 0 ? (
        <section className="hm-sec">
          <h2>Placements.</h2>
          <p className="hm-lede" style={{ marginTop: 4 }}>
            An activation puts the name on an episode — the public page reads it as a
            credit line, presenting partner first. Placement is a note for the crew,
            not copy for the shore. Each activation carries the tier&rsquo;s assets as a
            checklist, ticked as they are delivered, and can comp a member a pass on
            the sponsor&rsquo;s account.
          </p>
          {rows.map((s) => {
            const pick = pickFor(s.id);
            const taken = new Set(s.activations.map((a) => a.episodeId));
            const open = episodes.filter((v) => !taken.has(v.value));
            const card = cardFor(s.tier);
            return (
              <div key={s.id} className="hm-panel" style={{ padding: "16px 20px" }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
                  <b style={{ fontWeight: 700 }}>{s.name}</b>
                  <span className="ls-mono-data" style={{ color: "var(--text-3)", textTransform: "uppercase" }}>
                    {s.tierLabel}
                    {s.active ? "" : " · RETIRED"}
                  </span>
                </div>

                {card && card.assets.length > 0 ? (
                  <p className="hm-body" style={{ marginTop: 6, color: "var(--text-3)" }}>
                    Owed on activation: {card.assets.join(" · ")}
                  </p>
                ) : null}

                {s.activations.length > 0 ? (
                  <div style={{ marginTop: 10, display: "grid", gap: 12 }}>
                    {s.activations.map((a) => {
                      const owed = card?.assets ?? [];
                      const delivered = a.assetsDelivered.filter((x) => owed.includes(x)).length;
                      const key = compKey(a.episodeId, s.id);
                      const pickedMember = compPicks[key] ?? "";
                      return (
                        <div
                          key={a.episodeId}
                          className="hm-item"
                          style={{ borderTop: "1px solid var(--line)", paddingTop: 10 }}
                        >
                          <div className="hm-item__head">
                            <span className="hm-body">
                              {a.label}
                              {a.placement ? (
                                <span style={{ color: "var(--text-3)" }}> · {a.placement}</span>
                              ) : null}
                            </span>
                            {owed.length > 0 ? (
                              <Badge tone={delivered === owed.length ? "positive" : "outline"}>
                                {delivered === owed.length
                                  ? "All delivered"
                                  : `${delivered} of ${owed.length} delivered`}
                              </Badge>
                            ) : null}
                            <span className="hm-item__acts">
                              <Button
                                size="sm"
                                variant="danger"
                                disabled={pending}
                                onClick={() => setDetaching({ sponsor: s, act: a })}
                              >
                                Take it off
                              </Button>
                            </span>
                          </div>

                          {owed.length > 0 ? (
                            <div style={{ marginTop: 8 }}>
                              <span className="hm-mono">ASSETS DELIVERED</span>
                              <div className="ls-choices">
                                {owed.map((asset) => (
                                  <Checkbox
                                    key={asset}
                                    label={asset}
                                    checked={a.assetsDelivered.includes(asset)}
                                    disabled={pending}
                                    onChange={(e) => toggleAsset(s, a, asset, e.target.checked)}
                                  />
                                ))}
                              </div>
                            </div>
                          ) : (
                            <p className="hm-body" style={{ marginTop: 8, color: "var(--text-3)" }}>
                              This tier lists no assets, so there is nothing to tick off.
                            </p>
                          )}

                          <div style={{ marginTop: 10 }}>
                            <span className="hm-mono">
                              {a.comps.length === 0
                                ? "NO PASSES COMPED ON THIS ACCOUNT"
                                : `${a.comps.length} COMPED ON THIS ACCOUNT`}
                            </span>
                            {a.comps.length > 0 ? (
                              <p className="hm-body" style={{ marginTop: 4 }}>
                                {a.comps.map((c, i) => (
                                  <span key={c.id}>
                                    {i > 0 ? ", " : ""}
                                    {c.name}
                                    {c.status !== "aboard" && c.status !== "confirmed" ? (
                                      <span style={{ color: "var(--text-3)" }}>
                                        {" "}({c.status.replace(/_/g, " ")})
                                      </span>
                                    ) : null}
                                  </span>
                                ))}
                              </p>
                            ) : null}
                          </div>

                          {s.active && a.open ? (
                            <div
                              style={{
                                marginTop: 10,
                                display: "flex",
                                gap: 10,
                                alignItems: "flex-end",
                                flexWrap: "wrap",
                              }}
                            >
                              <Select
                                label="Comp a pass"
                                hint="A member in standing boards on the sponsor's account."
                                value={pickedMember}
                                onChange={(e) =>
                                  setCompPicks((p) => ({ ...p, [key]: e.target.value }))
                                }
                                style={{ minWidth: 260 }}
                                options={[
                                  {
                                    value: "",
                                    label: members.length ? "Pick the member" : "Nobody in standing to comp",
                                  },
                                  ...members,
                                ]}
                              />
                              <Button
                                variant="outline"
                                size="sm"
                                disabled={pending || !pickedMember}
                                onClick={() => comp(s, a)}
                              >
                                Comp a pass
                              </Button>
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="hm-body" style={{ marginTop: 10, color: "var(--text-3)" }}>
                    On no episode yet.
                  </p>
                )}

                {s.active ? (
                  <div
                    style={{
                      marginTop: 12,
                      display: "flex",
                      gap: 10,
                      alignItems: "flex-end",
                      flexWrap: "wrap",
                    }}
                  >
                    <Select
                      label="Episode"
                      value={pick.episode}
                      onChange={(e) => setPick(s.id, { episode: e.target.value })}
                      style={{ minWidth: 260 }}
                      options={[
                        {
                          value: "",
                          label: open.length ? "Pick the episode" : "Nothing open to place it on",
                        },
                        ...open,
                      ]}
                    />
                    <Input
                      label="Placement"
                      hint="Optional — where the asset sits."
                      value={pick.placement}
                      onChange={(e) => setPick(s.id, { placement: e.target.value })}
                      style={{ minWidth: 220 }}
                    />
                    <Button
                      variant="outline"
                      disabled={pending || !pick.episode}
                      onClick={() =>
                        startTransition(async () => {
                          const res = await attachSponsor(pick.episode, s.id, pick.placement);
                          if (res.error) {
                            show({ msg: res.error, tone: "danger" });
                            return;
                          }
                          setPick(s.id, { episode: "", placement: "" });
                          show({ msg: "Placed. The credit rides with the episode.", meta: s.name.toUpperCase() });
                        })
                      }
                    >
                      Place it
                    </Button>
                  </div>
                ) : null}
              </div>
            );
          })}
        </section>
      ) : null}

      <Dialog
        open={!!detaching}
        onClose={() => setDetaching(null)}
        width={420}
        eyebrow={detaching ? detaching.sponsor.name : ""}
        title="Take it off this episode?"
        footer={
          detaching ? (
            <>
              <Button variant="ghost" onClick={() => setDetaching(null)}>
                Leave it on
              </Button>
              <Button
                variant="danger"
                disabled={pending}
                onClick={() => detach(detaching.sponsor, detaching.act)}
              >
                Take it off
              </Button>
            </>
          ) : null
        }
      >
        <p className="hm-body">
          The credit line comes off {detaching?.act.label} at once — the public page stops naming
          them. What has been ticked as delivered goes with the activation, and placing them again
          starts the checklist over.
          {detaching?.act.comps.length
            ? ` ${detaching.act.comps.length} comped ${detaching.act.comps.length === 1 ? "pass stays" : "passes stay"} on the manifest.`
            : ""}
        </p>
      </Dialog>

      <Dialog
        open={signing}
        onClose={() => setSigning(false)}
        eyebrow="THE BRIDGE · SIGN A SPONSOR"
        title="Sign a sponsor"
        footer={
          <>
            <Button variant="ghost" onClick={() => setSigning(false)}>
              Not now
            </Button>
            <Button
              variant="gold"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const res = await createSponsor({
                    name,
                    tier,
                    monthlyCents: Math.round((Number(retainer) || 0) * 100),
                    contactEmail: email,
                    startsOn,
                    endsOn,
                    notes,
                  });
                  if (res.error) {
                    show({ msg: res.error, tone: "danger" });
                    return;
                  }
                  setSigning(false);
                  setName("");
                  setTier(firstTier?.slug ?? "");
                  setRetainer(String((firstTier?.rateCents ?? 0) / 100));
                  setEmail("");
                  setStartsOn("");
                  setEndsOn("");
                  setNotes("");
                  show({ msg: "Signed.", meta: "ON THE BOOK · PLACE IT ON AN EPISODE" });
                })
              }
            >
              Sign them
            </Button>
          </>
        }
      >
        <div style={{ display: "grid", gap: 14 }}>
          <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} />
          <Select
            label="Tier"
            hint="Picking a tier fills the rate-card figure below."
            value={tier}
            onChange={(e) => {
              const t = e.target.value;
              setTier(t);
              /* The card is the default, not the deal — the operator can
                 override the figure after picking. */
              setRetainer(String((cardFor(t)?.rateCents ?? 0) / 100));
            }}
          >
            {tiers.map((t) => (
              <option key={t.slug} value={t.slug}>
                {t.label}
              </option>
            ))}
          </Select>
          {cardFor(tier)?.assets.length ? (
            <p className="hm-body" style={{ marginTop: -6, color: "var(--text-3)" }}>
              This tier carries: {cardFor(tier)!.assets.join(" · ")}
            </p>
          ) : null}
          <Input
            label="Monthly retainer"
            hint="Dollars a month, as agreed."
            type="number"
            min={0}
            value={retainer}
            onChange={(e) => setRetainer(e.target.value)}
          />
          <Input
            label="Contact email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <Input
            label="Term begins"
            type="date"
            value={startsOn}
            onChange={(e) => setStartsOn(e.target.value)}
          />
          <Input
            label="Term ends"
            hint="Left blank, the term runs open."
            type="date"
            value={endsOn}
            onChange={(e) => setEndsOn(e.target.value)}
          />
          <Input
            label="Notes"
            hint="Bridge reading only."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>
      </Dialog>

      {toast ? (
        <Toast fixed message={toast.msg} meta={toast.meta} tone={toast.tone} onDismiss={clear} />
      ) : null}
    </>
  );
}
