import type { Metadata } from "next";
import { moduleTables } from "@/lib/module-tables";
import { getOperator } from "../../data";
import { must } from "../../staff";
import { LettersClient, type LetterRow } from "./letters-client";

export const metadata: Metadata = { title: "Letters" };

/* Every letter the club writes, with a way to see it before a member does.
   Broadcast had a self-test and documents a preview; the cron-fired letters
   (gangway details, the digest, win-back, dunning, farewell) had neither, and
   the test suite declared them untested by design — operators met them when
   members did. "Send to me" queues the letter to the operator's own address
   with a sample payload; the sender renders it as it would for anyone. */
export default async function LettersPage() {
  const { supabase } = await getOperator();
  const since = new Date(new Date().getTime() - 30 * 86400_000).toISOString();
  const [templatesRes, recentRes] = await Promise.all([
    moduleTables(supabase).from("email_templates").select("code, description, active, rule_can_send").order("code"),
    supabase.from("email_outbox").select("template, status").gte("created_at", since).limit(5000),
  ]);
  /* Legacy keys (dispatch-digest, episode-digest, salon-invite) still render
     rows queued before a rename and are not offered here — an operator picks
     the live code. lore-digest is the Log's own key and reads as such. */
  const LEGACY = new Set(["dispatch-digest", "episode-digest", "salon-invite"]);
  const templates = must(templatesRes as { data: Array<{ code: string; description: string; active: boolean; rule_can_send: boolean }> | null; error: null })
    .filter((t) => !LEGACY.has(t.code));
  const recent = must(recentRes);
  const tally = (code: string, status: string) => recent.filter((r) => r.template === code && r.status === status).length;
  const rows: LetterRow[] = templates.map((t) => ({
    code: t.code,
    label: t.code === "lore-digest" ? "the-log-digest" : t.code,
    description: t.description,
    active: t.active,
    ruleCanSend: t.rule_can_send,
    sent: tally(t.code, "sent"),
    pending: tally(t.code, "pending"),
    skipped: tally(t.code, "skipped"),
  }));

  return (
    <div>
      <span className="hm-eyebrow">Letters</span>
      <h1 className="hm-h1">Every letter the club writes, seen first by you.</h1>
      <p className="hm-lede">
        The registry the automations and the clock read. Send any of them to your own
        address with sample details and read it as a member would; the counts are the last
        thirty days of the outbox.
      </p>
      <LettersClient rows={rows} />
    </div>
  );
}
