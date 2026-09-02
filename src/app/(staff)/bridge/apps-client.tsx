"use client";

import React from "react";
import { Badge, Button, Dialog, Table, Tag, Toast } from "@/components/ds";
import { useToast } from "../ui";
import {
  acceptApplication,
  declineApplication,
  moveToReview,
  salonInvite,
} from "./actions";

export type AppRow = {
  id: string;
  name: string;
  email: string;
  city: string;
  tier: string;
  interests: string[];
  inviteCode: string;
  created: string;
  status: "received" | "review" | "invited" | "aboard" | "declined";
  [key: string]: unknown;
};

const STATUS_TONE: Record<AppRow["status"], "gold" | "ink" | "positive" | "caution" | "outline"> = {
  received: "outline",
  review: "ink",
  invited: "gold",
  aboard: "positive",
  declined: "caution",
};

const STATUS_LABEL: Record<AppRow["status"], string> = {
  received: "Received",
  review: "In review",
  invited: "Invited ashore",
  aboard: "Aboard",
  declined: "Declined",
};

type Confirm = { app: AppRow; mode: "accept" | "decline" } | null;

export function AppsClient({ apps }: { apps: AppRow[] }) {
  const [pending, startTransition] = React.useTransition();
  const [confirm, setConfirm] = React.useState<Confirm>(null);
  const { toast, show, clear } = useToast();

  const run = (fn: () => Promise<{ error?: string }>, ok: () => void) => {
    startTransition(async () => {
      const res = await fn();
      if (res.error) show({ msg: res.error, tone: "danger" });
      else ok();
    });
  };

  const columns = [
    {
      key: "name",
      label: "Applicant",
      render: (a: AppRow) => (
        <span>
          <b style={{ fontWeight: 600 }}>{a.name}</b>
          <span className="hm-mono" style={{ display: "block", marginTop: 2 }}>
            {a.email.toUpperCase()}
          </span>
        </span>
      ),
    },
    { key: "city", label: "City", render: (a: AppRow) => a.city || "—" },
    { key: "tier", label: "Tier", render: (a: AppRow) => a.tier },
    {
      key: "interests",
      label: "The water",
      render: (a: AppRow) =>
        a.interests.length ? (
          <span style={{ display: "inline-flex", gap: 6, flexWrap: "wrap" as const }}>
            {a.interests.map((t) => (
              <Tag key={t}>{t}</Tag>
            ))}
          </span>
        ) : (
          "—"
        ),
    },
    { key: "inviteCode", label: "Invite", mono: true, render: (a: AppRow) => a.inviteCode || "—" },
    { key: "created", label: "Applied", mono: true, width: 110 },
    {
      key: "status",
      label: "Status",
      render: (a: AppRow) => <Badge tone={STATUS_TONE[a.status]}>{STATUS_LABEL[a.status]}</Badge>,
    },
    {
      key: "act",
      label: "",
      render: (a: AppRow) => (
        <span className="hm-acts" style={{ justifyContent: "flex-end" }}>
          {a.status === "received" ? (
            <Button
              variant="outline"
              size="sm"
              disabled={pending}
              onClick={() =>
                run(
                  () => moveToReview(a.id),
                  () => show({ msg: "Moved to review.", meta: a.email.toUpperCase() })
                )
              }
            >
              Move to review
            </Button>
          ) : null}
          {a.status === "review" ? (
            <Button
              variant="outline"
              size="sm"
              disabled={pending}
              onClick={() =>
                run(
                  () => salonInvite(a.id),
                  () => show({ msg: "Invited ashore.", meta: a.email.toUpperCase() })
                )
              }
            >
              Invite ashore
            </Button>
          ) : null}
          {a.status === "invited" ? (
            <>
              <Button
                variant="gold"
                size="sm"
                disabled={pending}
                onClick={() => setConfirm({ app: a, mode: "accept" })}
              >
                Accept aboard
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={pending}
                onClick={() => setConfirm({ app: a, mode: "decline" })}
              >
                Decline
              </Button>
            </>
          ) : null}
        </span>
      ),
    },
  ];

  return (
    <>
      <div className="hm-panel">
        <Table rowKey={(a: AppRow) => a.id} columns={columns} rows={apps} />
        {apps.length === 0 ? (
          <p style={{ padding: "20px 4px", color: "var(--text-3)", fontSize: 13 }}>
            No applications on the desk. The tide brings more.
          </p>
        ) : null}
      </div>

      <Dialog
        open={confirm?.mode === "accept"}
        onClose={() => setConfirm(null)}
        width={400}
        eyebrow={confirm ? confirm.app.email : ""}
        title="Card in hand, manifest open."
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirm(null)}>
              Not yet
            </Button>
            <Button
              variant="gold"
              disabled={pending}
              onClick={() => {
                const a = confirm!.app;
                setConfirm(null);
                run(
                  () => acceptApplication(a.id),
                  () =>
                    show({
                      msg: `${a.name} aboard.`,
                      meta: "MEMBER ROLL · WELCOME EMAIL QUEUED",
                      tone: "positive",
                    })
                );
              }}
            >
              Accept aboard
            </Button>
          </>
        }
      >
        {confirm
          ? `Accepting ${confirm.app.name} writes them into the member roll and queues the welcome email. Their pass is ready the moment they sign in.`
          : ""}
      </Dialog>

      <Dialog
        open={confirm?.mode === "decline"}
        onClose={() => setConfirm(null)}
        width={400}
        eyebrow={confirm ? confirm.app.email : ""}
        title={confirm ? `Decline ${confirm.app.name}?` : ""}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirm(null)}>
              Not yet
            </Button>
            <Button
              variant="outline"
              disabled={pending}
              onClick={() => {
                const a = confirm!.app;
                setConfirm(null);
                run(
                  () => declineApplication(a.id),
                  () => show({ msg: "Declined.", meta: a.email.toUpperCase(), tone: "caution" })
                );
              }}
            >
              Decline
            </Button>
          </>
        }
      >
        The application stays on file. No email goes out from here.
      </Dialog>

      {toast ? (
        <Toast fixed message={toast.msg} meta={toast.meta} tone={toast.tone} onDismiss={clear} />
      ) : null}
    </>
  );
}
