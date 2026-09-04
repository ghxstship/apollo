import type { Metadata } from "next";
import { getOperator } from "../../data";
import { must } from "../../staff";
import { QuestionsClient, type QuestionRow } from "./questions-client";

export const metadata: Metadata = { title: "Questions" };

/* What the application asks. The door reads the live rows in position
   order; the Bridge keeps them here. */
export default async function QuestionsPage() {
  const { supabase } = await getOperator();
  const res = await supabase.from("application_questions").select("*").order("position", { ascending: true });

  const rows: QuestionRow[] = must(res).map((q) => ({
    key: q.key,
    prompt: q.prompt,
    kind: q.kind,
    options: Array.isArray(q.options) ? q.options.map((o) => String(o)) : [],
    required: q.required,
    active: q.active,
    position: q.position,
  }));

  return (
    <div>
      <span className="hm-eyebrow">Questions</span>
      <h1 className="hm-h1">What the application asks.</h1>
      <p className="hm-lede">
        The door asks these, in this order, of everyone who applies. Answers file under the
        question&apos;s key and read back in Vetting under its prompt — so a question is switched
        off rather than deleted, and its key never changes once anyone has answered it.
      </p>
      <QuestionsClient rows={rows} />
    </div>
  );
}
