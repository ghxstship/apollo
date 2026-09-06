"use client";

import React from "react";
import { CLUB_ZONE } from "@/lib/brand";
import { Badge, Button, Checkbox, Dialog, Input, ListToolbar, Notice, Radio, Stat, StateBlock, Switch, Table, TextButton, Toast } from "@/components/ds";
import { logDate, logDateTime } from "@/lib/format";
import { useToast } from "../../ui";
import { createApiKey, createWebhook, revokeApiKey, setApiKeyEnd, setWebhookActive } from "./actions";
import { HOOK_EVENTS, KEY_DAYS, KEY_DAYS_FALLBACK, NO_END_REASON_MAX, SCOPES } from "./scopes";

/* When the console starts counting down in the table. It is the first rung of
   the warning ladder the club sends (club_settings.api_key_warn_days, 14), and
   it is written here rather than read from the setting on purpose: this is a
   colour on a badge, not the decision about when to tell somebody. The
   decision is warn_of_expiring_keys(), which reads the dial. */
const WARN_DAYS = 14;

export type KeyRow = {
  id: string;
  label: string;
  prefix: string;
  scopes: string[];
  revoked: boolean;
  lastUsedAt: string | null;
  createdAt: string;
  /** When the key stops opening anything. Null is a key with no end. */
  expiresAt: string | null;
  /** Why it has no end, on the keys cut since the rule. Null on the older ones. */
  noEndReason: string | null;
  /** Counted on the server at the request, so the two clocks cannot disagree. */
  ageDays: number;
  /** Days until it stops; negative once it has. Null when it never does. */
  endsInDays: number | null;
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

export function KeysClient({
  keys,
  hooks,
  defaultDays,
  staleDays,
}: {
  keys: KeyRow[];
  hooks: HookRow[];
  /** club_settings.api_key_days — the length the dialog opens on. */
  defaultDays: number;
  /** club_settings.api_key_stale_days — how old a key with no end may be
      before the console says so. Nothing is revoked by it; the flag is the
      whole control, because the keys that predate the date column are held by
      integrations nobody has inventoried and an overnight cut-off would be a
      self-inflicted incident. */
  staleDays: number;
}) {
  const [pending, startTransition] = React.useTransition();
  const { toast, toastOpen, show, clear } = useToast();

  /* The dial, snapped to a length the console actually offers — a setting
     turned to 45 by hand must not open a dialog with nothing selected. */
  const preset = (KEY_DAYS as readonly number[]).includes(defaultDays) ? defaultDays : KEY_DAYS_FALLBACK;

  const [cuttingKey, setCuttingKey] = React.useState(false);
  const [label, setLabel] = React.useState("");
  const [scopes, setScopes] = React.useState<string[]>(["read:episodes"]);
  const [days, setDays] = React.useState<number | null>(preset);
  const [why, setWhy] = React.useState("");
  const [minted, setMinted] = React.useState<string | null>(null);
  const [revoking, setRevoking] = React.useState<KeyRow | null>(null);
  const [ending, setEnding] = React.useState<KeyRow | null>(null);
  const [endDays, setEndDays] = React.useState<number | null>(preset);
  const [endWhy, setEndWhy] = React.useState("");

  const [addingHook, setAddingHook] = React.useState(false);
  const [url, setUrl] = React.useState("");
  const [events, setEvents] = React.useState<string[]>([]);

  const toggle = (list: string[], value: string) =>
    list.includes(value) ? list.filter((v) => v !== value) : [...list, value];

  /* One chooser, used to cut a key and to give one that already exists a new
     date. Four lengths and a fifth choice that is not a length: "no end" is
     still on offer, because a partner integration that must not break is a
     real thing to want, but it now costs a sentence — and the database refuses
     the row without one, so this is a courtesy rather than the guard. */
  const chooseLength = (
    name: string,
    value: number | null,
    onPick: (d: number | null) => void,
    reason: string,
    onReason: (v: string) => void
  ) => (
    <>
      <div>
        <span className="hm-mono">HOW LONG IT RUNS</span>
        <div className="ls-choices ls-choices--col">
          {KEY_DAYS.map((d) => (
            <Radio
              key={d}
              name={name}
              label={`${d} days`}
              checked={value === d}
              onChange={() => onPick(d)}
            />
          ))}
          <Radio
            name={name}
            label="No end"
            checked={value === null}
            onChange={() => onPick(null)}
          />
        </div>
      </div>
      {value === null ? (
        <Input
          label="Why it never stops"
          placeholder="The season site reads it nightly — ask Shoreside before cutting it off"
          maxLength={NO_END_REASON_MAX}
          value={reason}
          onChange={(e) => onReason(e.target.value)}
          hint="Kept on the key. The next operator to read this list is the one it is for."
        />
      ) : null}
    </>
  );

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
        <span className="hm-who">
          <b>{k.label}</b>
          <span className="hm-mono">
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
    /* How old the key is, in plain days. The column exists because the answer
       used to be a created_at nobody rendered: a key cut in July and a key cut
       this morning read identically, and "how long has that been open" was a
       question the console could not answer at all. */
    {
      key: "age",
      label: "Age",
      width: 90,
      mono: true,
      render: (k: KeyRow) => `${k.ageDays} D`,
    },
    /* And when it stops. A date, a countdown once it is close, and — for a key
       with no end — either the reason it was given or, on the ones that
       predate the rule, how long it has been running unbounded. */
    {
      key: "ends",
      label: "Ends",
      width: 190,
      render: (k: KeyRow) => {
        if (k.expiresAt === null) {
          return k.ageDays > staleDays ? (
            <Badge tone="caution" title={k.noEndReason ?? undefined}>
              No end · {k.ageDays} days old
            </Badge>
          ) : (
            <Badge tone="outline" title={k.noEndReason ?? undefined}>No end</Badge>
          );
        }
        const left = k.endsInDays ?? 0;
        const on = logDate(k.expiresAt, CLUB_ZONE);
        if (left < 0) return <Badge tone="danger">Ended {on}</Badge>;
        if (left <= WARN_DAYS) {
          return (
            <Badge tone="caution">
              {on} · {left} {left === 1 ? "day" : "days"} left
            </Badge>
          );
        }
        return <span className="hm-mono">{on}</span>;
      },
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
      /* Three states, not two. A key past its date is not revoked and is not
         live: verifyKey refuses it, and a console that badges it Live sends an
         operator hunting for a fault in the partner's config. */
      render: (k: KeyRow) =>
        k.revoked ? (
          <Badge tone="caution">Revoked</Badge>
        ) : k.endsInDays !== null && k.endsInDays < 0 ? (
          <Badge tone="danger">Ended</Badge>
        ) : (
          <Badge tone="positive">Live</Badge>
        ),
    },
    {
      key: "acts",
      label: "",
      width: 160,
      render: (k: KeyRow) =>
        k.revoked ? null : (
          <span className="ls-acts">
            <TextButton
              size="sm"
              disabled={pending}
              onClick={() => {
                setEnding(k);
                setEndDays(k.expiresAt === null ? null : preset);
                setEndWhy(k.noEndReason ?? "");
              }}
            >
              Set an end
            </TextButton>
            <Button variant="danger" size="sm" disabled={pending} onClick={() => setRevoking(k)}>
              Revoke
            </Button>
          </span>
        ),
    },
  ];

  /* This console said how many keys and hooks exist nowhere at all — the only
     way to learn what was still open through the hull was to count rows. */
  const live = keys.filter((k) => !k.revoked).length;
  const liveHooks = hooks.filter((h) => h.active).length;

  /* The keys the club is carrying without a decision behind them: live, no
     end, and older than the dial. Counted for the header and named in a notice
     above the table, because a badge in row nine of a scrolling table is not
     how anybody learns something. */
  const unbounded = keys.filter((k) => !k.revoked && k.expiresAt === null && k.ageDays > staleDays);
  const stopping = keys.filter(
    (k) => !k.revoked && k.endsInDays !== null && k.endsInDays >= 0 && k.endsInDays <= WARN_DAYS
  );

  return (
    <>
      <div className="hm-row">
        <Stat size="sm" label="Keys live" value={live} sub={`${keys.length} CUT IN ALL`} />
        <Stat size="sm" label="No end" value={unbounded.length} sub={`OVER ${staleDays} DAYS OLD`} />
        <Stat size="sm" label="Stopping soon" value={stopping.length} sub={`WITHIN ${WARN_DAYS} DAYS`} />
        <Stat size="sm" label="Hooks live" value={liveHooks} sub={`${hooks.length} SET IN ALL`} />
      </div>

      <section className="hm-sec">
        <div className="hm-head">
          <div>
            <h2>API keys.</h2>
            <p className="hm-note">
              Shown once at the moment it is cut. We keep a hash and the first eight characters —
              lose the key and you cut a new one. A new key runs {preset} days unless you choose
              otherwise, and a key with no end has to say why.
            </p>
          </div>
          <Button variant="gold" size="sm" onClick={() => setCuttingKey(true)}>
            New key
          </Button>
        </div>
        {unbounded.length ? (
          <Notice tone="warn" title="Keys that were cut before a key had an end.">
            {unbounded.length === 1 ? "One key runs" : `${unbounded.length} keys run`} with no end and
            {unbounded.length === 1 ? " has" : " have"} been open longer than {staleDays} days. Nothing
            has been dated for them and nothing will be: something may be holding each one, and a date
            applied by a sweep is an integration going dark on a Tuesday morning. Read the list, find
            who holds each key, then give it an end or cut it off — one at a time, on purpose.
          </Notice>
        ) : null}
        {keys.length ? (
          <>
            <ListToolbar resultCount={keys.length} resultNoun="key" countSuffix={` · ${live} live`} />
            <div className="hm-panel">
              <Table tall rowKey={(k: KeyRow) => k.id} columns={keyColumns} rows={keys} />
            </div>
          </>
        ) : (
          <div className="hm-block">
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
                <b className="hm-url">
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
                  <ul className="hm-kv">
                    {h.deliveries.map((d) => (
                      <li key={d.id} className="hm-mono">
                        <span className="hm-kv__k">{logDateTime(d.createdAt, CLUB_ZONE)}</span>
                        <span className="hm-kv__v">{d.event.toUpperCase()}</span>
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
          <div className="hm-block">
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
              pending={pending}
              pendingLabel="Cutting…"
              onClick={() => {
                const name = label;
                const picked = scopes;
                const runs = days;
                const reason = why;
                startTransition(async () => {
                  const res = await createApiKey(name, picked, runs, reason);
                  if (res.error) show({ msg: res.error, tone: "danger" });
                  else {
                    setCuttingKey(false);
                    setLabel("");
                    setDays(preset);
                    setWhy("");
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
            <div className="ls-choices ls-choices--col">
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
          {chooseLength("new-key-length", days, setDays, why, setWhy)}
        </div>
      </Dialog>

      <Dialog
        open={!!ending}
        onClose={() => setEnding(null)}
        width={460}
        eyebrow={ending ? ending.prefix + "…" : ""}
        title="When does this key stop?"
        footer={
          ending ? (
            <>
              <Button variant="ghost" onClick={() => setEnding(null)}>
                Leave it
              </Button>
              <Button
                variant="gold"
                pending={pending}
                pendingLabel="Setting…"
                onClick={() => {
                  const target = ending;
                  const runs = endDays;
                  const reason = endWhy;
                  startTransition(async () => {
                    const res = await setApiKeyEnd(target.id, runs, reason);
                    if (res.error) show({ msg: res.error, tone: "danger" });
                    else {
                      setEnding(null);
                      show({
                        msg: runs === null ? "That key runs on, and says why." : `That key stops in ${runs} days.`,
                        meta: `${target.prefix}… · ${runs === null ? "NO END" : "COUNTED FROM TODAY"}`,
                      });
                    }
                  });
                }}
              >
                Set it
              </Button>
            </>
          ) : null
        }
      >
        <div className="hm-form">
          <p className="hm-body">
            Counted from today, not from the day it was cut — {ending?.label} has been open{" "}
            {ending?.ageDays} days. Whatever is holding it goes quiet the moment the date passes, so
            hand over a replacement first.
          </p>
          {ending
            ? chooseLength("set-key-length", endDays, setEndDays, endWhy, setEndWhy)
            : null}
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
                pending={pending}
                pendingLabel="Revoking…"
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
              pending={pending}
              pendingLabel="Setting…"
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
            <div className="ls-choices ls-choices--col">
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
        <Toast fixed open={toastOpen} message={toast.msg} meta={toast.meta} tone={toast.tone} onClose={clear} />
      ) : null}
    </>
  );
}
