import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Icon } from "@/components/ds";
import { getMember } from "../../data";
import { SignPanel } from "./sign-panel";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ code: string }>;
}): Promise<Metadata> {
  const { code } = await params;
  const { supabase } = await getMember();
  const { data } = await supabase
    .from("documents")
    .select("title")
    .eq("code", code)
    .maybeSingle();
  return { title: data?.title ?? "Agreement" };
}

/* A member waiver assembles differently for the water than for the shore, so the
   member reads both. Signing once covers both — the rendered text that gets
   hashed is the fuller of the two, which is the one that binds. */
export default async function AgreementPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const { supabase } = await getMember();

  const { data: doc } = await supabase
    .from("documents")
    .select("*")
    .eq("code", code)
    .eq("active", true)
    .maybeSingle();
  if (!doc || doc.audience !== "member") notFound();

  const { data: versionId } = await supabase.rpc("published_version", {
    p_document_code: code,
  });
  if (!versionId) notFound();

  /* Afloat pulls the clauses ashore does not, so the fuller rendering is what
     a member signs. The condition set is the same one the RPC will use. */
  const { data: body } = await supabase.rpc("render_document", {
    p_document_version_id: versionId,
    p_context: { class: "sea" },
  });
  if (!body) notFound();

  return (
    <div className="ls-fade">
      <Link href="/agreements" className="mbr-mono mbr-plain">
        <Icon name="ArrowUpRight" size={12} /> ALL AGREEMENTS
      </Link>

      <span className="mbr-eyebrow" style={{ display: "block", marginTop: 18 }}>
        {doc.kind === "waiver" ? "Waiver" : doc.kind === "contract" ? "Agreement" : "Policy"}
        {doc.validity_months ? ` · renews every ${doc.validity_months} months` : ""}
      </span>
      <h1 className="mbr-h1">{doc.title}</h1>

      <div style={{ marginTop: 22 }}>
        <SignPanel documentCode={code} documentTitle={doc.title} body={body} />
      </div>
    </div>
  );
}
