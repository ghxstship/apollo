"use client";

import React from "react";
import { CLUB_ZONE } from "@/lib/brand";
import { Badge, Button, Checkbox, Dialog, Input, ListToolbar, Stat, StateBlock, Switch, Table, Toast } from "@/components/ds";
import { logDateTime } from "@/lib/format";
import { useToast } from "../../ui";
import { createApiKey, createWebhook, revokeApiKey, setWebhookActive } from "./actions";
import { HOOK_EVENTS, SCOPES } from "./scopes";

export type KeyRow = {
  id: string;
  label: string;
  prefix: string;
  scopes: string[];
  revoked: boolean;
  lastUsedAt: string | null;
  createdAt: string;
  [key: string]: unknown;
};

export type HookRow = {
  id: string;
  url: string;
  events: string[];
  active: boolean;
  createdAt: string;
  deliveries: Array<{
    id: string;
    event: string;
    status: number | null;
    error: string | null;
    createdAt: string;
  }>;
};

export function KeysClient({ keys, hooks }: { keys: KeyRow[]; hooks: HookRow[] }) {
  const [pending, startTransition] = React.useTransition();
  const { toast, show, clear } = useToast();

  const [cuttingKey, setCuttingKey] = React.useState(false);
  const [label, setLabel] = React.useState("");
  const [scopes, setScopes] = React.useState<string[]>(["read:episodes"]);
  const [minted, setMinted] = React.useState<string | null>(null);
  const [revoking, setRevoking] = React.useState<KeyRow | null>(null);

  const [addingHook, setAddingHook] = React.useState(false);
  const [url, setUrl] = React.useState("");
  const [events, setEvents] = React.useState<string[]>([]);

  const toggle = (list: string[], value: string) =>
    list.includes(value) ? list.filter((v) => v !== value) : [...list, value];

  const copyKey = async () => {
    if (!minted) return;
    try {
      await navigator.clipboard.writeText(minted);
      show({ msg: "Copied. Put it somewhere safe.", meta: "SHOWN ONCE" });
    } catch {
      show({ msg: "Copy it by hand — the clipboard refused.", tone: "caution" });
    }
  };

  const keyColumns = [
    {
      key: "label",
      label: "Key",
      render: (k: KeyRow) => (
        <span>
          <b style={{ fontWeight: 700 }}>{k.label}</b>
          <span className="hm-mono" style={{ display: "block", marginTop: 2 }}>
            {k.prefix}…
          </span>
        </span>
      ),
    },
    {
      key: "scopes",
      label: "Scope",
      render: (k: KeyRow) => (
        <span className="hm-mono">{k.scopes.join(" · ").toUpperCase() || "—"}</span>
      ),
    },
    {
      key: "lastUsedAt",
      label: "Last used",
      width: 130,
      mono: true,
      render: (k: KeyRow) => (k.lastUsedAt ? logDateTime(k.lastUsedAt, CLUB_ZONE) : "NEVER"),
    },
    {
      key: "state",
      label: "State",
      width: 100,
      render: (k: KeyRow) =>
        k.revoked ? <Badge tone="caution">Revoked</Badge> : <Badge tone="positive">Live</Badge>,
    },
    {
      key: "acts",
      label: "",
      width: 90,
      render: (k: KeyRow) =>
        k.revoked ? null : (
          <Button variant="danger" size="sm" disabled={pending} onClick={() => setRevoking(k)}>
            Revoke
          </Button>
        ),
    },
  ];

  /* This console said how many keys and hooks exist nowhere at all — the only
     way to learn what was still open through the hull was to count rows. */
  const live = keys.filter((k) => !k.revoked).length;
  const liveHooks = hooks.filter((h) => h.active).length;

  return (
    <>
      <div className="hm-row">
        <Stat size="sm" label="Keys live" value={live} sub={`${keys.length} CUT IN ALL`} />
        <Stat size="sm" label="Hooks live" value={liveHooks} sub={`${hooks.length} SET IN ALL`} />
      </div>

      <section className="hm-sec">
        <div className="hm-head">
          <div>
            <h2>API keys.</h2>
            <p className="hm-note">
              Shown once at the moment it is cut. We keep a hash and the first eight characters —
              lose the key and you cut a new one.
            </p>
          </div>
          <Button variant="gold" size="sm" onClick={() => setCuttingKey(true)}>
            New key
          </Button>
        </div>
        {keys.length ? (
          <>
            <ListToolbar resultCount={keys.length} resultNoun="key" countSuffix={` · ${live} live`} />
            <div className="hm-panel">
              <Table tall rowKey={(k: KeyRow) => k.id} columns={keyColumns} rows={keys} />
            </div>
          </>
        ) : (
          <div style={{ marginTop: 20 }}>
            <StateBlock
              status="empty"
              title="No keys cut."
              detail="Nothing outside the club can read it. That is the safe default."
            />
          </div>
        )}
      </section>

      <section className="hm-sec">
        <div className="hm-head">
          <div>
            <h2>Webhooks.</h2>
            <p className="hm-note">
              Recorded, not yet delivered — nothing posts these hooks today. When
              delivery is wired, the event goes to your https URL signed with the
              hook&apos;s secret and the last ten attempts sit under each one.
            </p>
          </div>
          <Button variant="gold" size="sm" onClick={() => setAddingHook(true)}>
            New hook
          </Button>
        </div>

        {hooks.length ? (
          <>
          <ListToolbar resultCount={hooks.length} resultNoun="hook" countSuffix={` · ${liveHooks} live`} />
          {hooks.map((h) => (
            <div className="hm-item" key={h.id}>
              <div className="hm-item__head">
                <b style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-sm)", wordBreak: "break-all" }}>
                  {h.url}
                </b>
                {h.active ? <Badge tone="positive">Live</Badge> : <Badge tone="outline">Held</Badge>}
                <div className="hm-item__acts">
                  <Switch
                    label={h.active ? "Live" : "Held"}
                    checked={h.active}
                    disabled={pending}
                    onChange={(e) => {
                      const next = e.target.checked;
                      startTransition(async () => {
                        const res = await setWebhookActive(h.id, next);
                        if (res.error) show({ msg: res.error, tone: "danger" });
                        else
                          show({
                            msg: next ? "Hook is live." : "Hook held.",
                            meta: next ? "SENDING" : "NOTHING SENT",
                          });
                      });
                    }}
                  />
                </div>
              </div>
              <div className="hm-item__meta">
                <span>{h.events.join(" · ").toUpperCase()}</span>
                <span>·</span>
                <span>ADDED {logDateTime(h.createdAt, CLUB_ZONE).toUpperCase()}</span>
              </div>
              <div className="hm-item__body">
                {h.deliveries.length ? (
                  <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                    {h.deliveries.map((d) => (
                      <li
                        key={d.id}
                        className="hm-mono"
                        style={{ display: "flex", gap: 10, padding: "2px 0" }}
                      >
                        <span style={{ minWidth: 108 }}>{logDateTime(d.createdAt, CLUB_ZONE)}</span>
                        <span style={{ flex: 1 }}>{d.event.toUpperCase()}</span>
                        {/* Three outcomes told by a hand-patched text colour on
                            a 10px mono line, with no shape to it — a delivery
                            that failed looked like one that succeeded. */}
                        <Badge
                          tone={
                            d.status && d.status < 300
                              ? "positive"
                              : d.error
                                ? "danger"
                                : "caution"
                          }
                        >
                          {d.status ?? (d.error ? "Failed" : "Pending")}
                        </Badge>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <span className="hm-mono">NOTHING SENT YET</span>
                )}
              </div>
            </div>
          ))}
          </>
        ) : (
          <div style={{ marginTop: 20 }}>
            <StateBlock
              status="empty"
              title="No hooks set."
              detail="Add one when another system needs to hear what happened at an episode."
            />
          </div>
        )}
      </section>

      <Dialog
        open={cuttingKey}
        onClose={() => setCuttingKey(false)}
        width={460}
        eyebrow="New key"
        title="Cut an API key."
        footer={
          <>
            <Button variant="ghost" onClick={() => setCuttingKey(false)}>
              Not yet
            </Button>
            <Button
              variant="gold"
              disabled={pending}
              onClick={() => {
                const name = label;
                const picked = scopes;
                startTransition(async () => {
                  const res = await createApiKey(name, picked);
                  if (res.error) show({ msg: res.error, tone: "danger" });
                  else {
                    setCuttingKey(false);
                    setLabel("");
                    setMinted(res.key ?? null);
                  }
                });
              }}
            >
              Cut the key
            </Button>
          </>
        }
      >
        <div className="hm-form">
          <Input
            label="Label"
            placeholder="Season site — read only"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
          />
          <div>
            <span className="hm-mono">SCOPE</span>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
              {SCOPES.map((s) => (
                <Checkbox
                  key={s}
                  label={s}
                  checked={scopes.includes(s)}
                  onChange={() => setScopes((prev) => toggle(prev, s))}
                />
              ))}
            </div>
          </div>
        </div>
      </Dialog>

      <Dialog
        open={!!minted}
        onClose={() => setMinted(null)}
        width={480}
        eyebrow="Shown once"
        title="Copy it now."
        footer={
          <>
            <Button variant="outline" onClick={copyKey}>
              Copy key
            </Button>
            <Button variant="gold" onClick={() => setMinted(null)}>
              I have it
            </Button>
          </>
        }
      >
        <div className="hm-form">
          <p className="hm-body">
            This is the only time the key is readable. Close this and all that is left is the hash
            and the first eight characters.
          </p>
          <code className="hm-secret">{minted}</code>
        </div>
      </Dialog>

      <Dialog
        open={!!revoking}
        onClose={() => setRevoking(null)}
        width={420}
        eyebrow={revoking ? revoking.prefix + "…" : ""}
        title="Revoke this key?"
        footer={
          revoking ? (
            <>
              <Button variant="ghost" onClick={() => setRevoking(null)}>
                Leave it live
              </Button>
              <Button
                variant="danger"
                disabled={pending}
                onClick={() => {
                  const target = revoking;
                  setRevoking(null);
                  startTransition(async () => {
                    const res = await revokeApiKey(target.id);
                    if (res.error) show({ msg: res.error, tone: "danger" });
                    else
                      show({
                        msg: "Key revoked.",
                        meta: `${target.prefix}… · SHUT OUT`,
                        tone: "caution",
                      });
                  });
                }}
              >
                Revoke
              </Button>
            </>
          ) : null
        }
      >
        <p className="hm-body">
          Anything using it stops working the moment you do this, and it cannot be turned back on.
        </p>
      </Dialog>

      <Dialog
        open={addingHook}
        onClose={() => setAddingHook(false)}
        width={480}
        eyebrow="New hook"
        title="Send events somewhere."
        footer={
          <>
            <Button variant="ghost" onClick={() => setAddingHook(false)}>
              Not yet
            </Button>
            <Button
              variant="gold"
              disabled={pending}
              onClick={() => {
                const target = url;
                const picked = events;
                startTransition(async () => {
                  const res = await createWebhook(target, picked);
                  if (res.error) show({ msg: res.error, tone: "danger" });
                  else {
                    setAddingHook(false);
                    setUrl("");
                    setEvents([]);
                    show({ msg: "Hook set.", meta: "SECRET GENERATED · LIVE" });
                  }
                });
              }}
            >
              Set the hook
            </Button>
          </>
        }
      >
        <div className="hm-form">
          <Input
            label="Destination URL"
            placeholder="https://example.com/hook"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
          <div>
            <span className="hm-mono">EVENTS</span>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
              {HOOK_EVENTS.map((ev) => (
                <Checkbox
                  key={ev}
                  label={ev}
                  checked={events.includes(ev)}
                  onChange={() => setEvents((prev) => toggle(prev, ev))}
                />
              ))}
            </div>
          </div>
          <p className="hm-mono">A SIGNING SECRET IS GENERATED WITH THE HOOK.</p>
        </div>
      </Dialog>

      {toast ? (
        <Toast fixed message={toast.msg} meta={toast.meta} tone={toast.tone} onDismiss={clear} />
      ) : null}
    </>
  );
}
