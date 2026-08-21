import type { Metadata } from "next";
import { getOperator } from "../../data";
import { DocumentsClient, type ClauseRow, type DocRow, type SignatureRow } from "./documents-client";

export const metadata: Metadata = { title: "Documents" };

export default async function DocumentsPage() {
  const { supabase } = await getOperator();

  const [clausesRes, versionsRes, docsRes, docVersionsRes, docClausesRes, sigsRes, reqRes] =
    await Promise.all([
      supabase.from("clauses").select("*").order("position", { ascending: true }),
      supabase.from("clause_versions").select("*").order("version", { ascending: false }),
      supabase.from("documents").select("*").order("code", { ascending: true }),
      supabase.from("document_versions").select("*").order("version", { ascending: false }),
      supabase.from("document_clauses").select("*"),
      supabase
        .from("signatures")
        .select("*")
        .order("signed_at", { ascending: false })
        .limit(200),
      supabase.from("document_requirements").select("*"),
    ]);

  const versions = versionsRes.data ?? [];
  const latestByClause = new Map<string, (typeof versions)[number]>();
  for (const v of versions) {
    if (!latestByClause.has(v.clause_code)) latestByClause.set(v.clause_code, v);
  }

  const clauses: ClauseRow[] = (clausesRes.data ?? []).map((c) => {
    const latest = latestByClause.get(c.code);
    return {
      code: c.code,
      title: c.title,
      category: c.category,
      versions: versions.filter((v) => v.clause_code === c.code).length,
      latestVersion: latest?.version ?? 0,
      latestVersionId: latest?.id ?? "",
      body: latest?.body ?? "",
      publishedAt: latest?.published_at ?? null,
    };
  });

  const docVersions = docVersionsRes.data ?? [];
  const docClauses = docClausesRes.data ?? [];
  const signatures = sigsRes.data ?? [];
  const gates = reqRes.data ?? [];

  const docs: DocRow[] = (docsRes.data ?? []).map((d) => {
    const mine = docVersions.filter((v) => v.document_code === d.code);
    const published = mine.find((v) => v.status === "published") ?? null;
    const draft = mine.find((v) => v.status === "draft") ?? null;
    const countFor = (id: string | undefined) =>
      id ? docClauses.filter((c) => c.document_version_id === id).length : 0;
    return {
      code: d.code,
      title: d.title,
      kind: d.kind,
      audience: d.audience,
      validityMonths: d.validity_months,
      gates: gates.filter((g) => g.document_code === d.code).map((g) => g.gate),
      publishedVersion: published?.version ?? null,
      publishedVersionId: published?.id ?? null,
      publishedClauses: countFor(published?.id),
      draftVersion: draft?.version ?? null,
      draftVersionId: draft?.id ?? null,
      draftClauses: countFor(draft?.id),
      signedCount: published
        ? signatures.filter((s) => s.document_version_id === published.id).length
        : 0,
      draftComposition: draft
        ? docClauses
            .filter((c) => c.document_version_id === draft.id)
            .map((c) => ({
              clauseVersionId: c.clause_version_id,
              position: c.position,
              condition: (c.condition ?? {}) as Record<string, string>,
            }))
        : [],
    };
  });

  const versionLabel = new Map(
    docVersions.map((v) => [v.id, `${v.document_code} v${v.version}`] as const)
  );

  const register: SignatureRow[] = signatures.map((s) => ({
    id: s.id,
    document: versionLabel.get(s.document_version_id) ?? "—",
    signer: s.redacted_at ? "— redacted —" : (s.signer_name ?? s.signer_email ?? "A guest"),
    kind: s.signature_kind,
    hash: s.rendered_hash,
    signedAt: s.signed_at,
    isGuest: Boolean(s.guest_id),
    redacted: Boolean(s.redacted_at),
  }));

  return (
    <div>
      <span className="hm-eyebrow">Documents</span>
      <h1 className="hm-h1">Clauses, documents, signatures.</h1>
      <p className="hm-lede">
        A clause is written once and versioned forever — rewording it publishes
        the next version rather than changing the last. A document is a
        composition of clause versions, assembled per context, and a signature
        binds to a hash of the words that were actually rendered. Nothing here
        can be edited after the fact; that is the point of it.
      </p>
      <DocumentsClient clauses={clauses} docs={docs} register={register} />
    </div>
  );
}
