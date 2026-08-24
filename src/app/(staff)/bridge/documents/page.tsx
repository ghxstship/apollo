import type { Metadata } from "next";
import { getOperator } from "../../data";
import { DocumentsClient, type ClauseRow, type DocRow, type SignatureRow } from "./documents-client";
import { must, mustValue } from "../../staff";

export const metadata: Metadata = { title: "Documents" };

export default async function DocumentsPage() {
  const { supabase } = await getOperator();

  const [clausesRes, versionsRes, docsRes, docVersionsRes, docClausesRes, sigsRes, reqRes, tallyRes, counterRes] =
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
      /* Counted in the database — the signatures fetch above is capped, and
         "how many have signed" must not stop climbing at the cap. */
      supabase.rpc("signature_tally"),
      supabase.from("counter_signatures").select("*"),
    ]);

  const tally = new Map(
    mustValue<Array<{ document_version_id: string; n: number }>>(
      tallyRes as { data: Array<{ document_version_id: string; n: number }> | null; error?: { message?: string } | null },
      []
    ).map(
      (row) => [row.document_version_id, Number(row.n)]
    )
  );
  const signedFor = (versionId: string) => tally.get(versionId) ?? 0;

  const versions = must(versionsRes);
  const latestByClause = new Map<string, (typeof versions)[number]>();
  for (const v of versions) {
    if (!latestByClause.has(v.clause_code)) latestByClause.set(v.clause_code, v);
  }

  const clauses: ClauseRow[] = (must(clausesRes)).map((c) => {
    const latest = latestByClause.get(c.code);
    return {
      code: c.code,
      title: c.title,
      category: c.category,
      active: c.active,
      versions: versions.filter((v) => v.clause_code === c.code).length,
      latestVersion: latest?.version ?? 0,
      latestVersionId: latest?.id ?? "",
      body: latest?.body ?? "",
      publishedAt: latest?.published_at ?? null,
    };
  });

  const docVersions = must(docVersionsRes);
  const docClauses = must(docClausesRes);
  const signatures = must(sigsRes);
  const gates = must(reqRes);

  const docs: DocRow[] = (must(docsRes)).map((d) => {
    const mine = docVersions.filter((v) => v.document_code === d.code);
    const published = mine.find((v) => v.status === "published") ?? null;
    const draft = mine.find((v) => v.status === "draft") ?? null;
    const countFor = (id: string | undefined) =>
      id ? docClauses.filter((c) => c.document_version_id === id).length : 0;
    return {
      code: d.code,
      title: d.title,
      kind: d.kind,
      active: d.active,
      audience: d.audience,
      validityMonths: d.validity_months,
      gates: gates.filter((g) => g.document_code === d.code).map((g) => g.gate),
      publishedVersion: published?.version ?? null,
      publishedVersionId: published?.id ?? null,
      publishedClauses: countFor(published?.id),
      draftVersion: draft?.version ?? null,
      draftVersionId: draft?.id ?? null,
      draftClauses: countFor(draft?.id),
      signedCount: published ? signedFor(published.id) : 0,
      draftComposition: draft
        ? docClauses
            .filter((c) => c.document_version_id === draft.id)
            .map((c) => ({
              clauseVersionId: c.clause_version_id,
              /* The clause this composed version belongs to. Without it the
                 dialog can only recognise a clause composed at its LATEST
                 version, so revising a clause while a draft holds the old one
                 made that clause look untouched. */
              clauseCode:
                versions.find((v) => v.id === c.clause_version_id)?.clause_code ?? "",
              position: c.position,
              condition: (c.condition ?? {}) as Record<string, string>,
            }))
        : [],
    };
  });

  const versionLabel = new Map(
    docVersions.map((v) => [v.id, `${v.document_code} v${v.version}`] as const)
  );
  const kindByVersion = new Map(
    docVersions.map((v) => [
      v.id,
      (must(docsRes)).find((d) => d.code === v.document_code)?.kind ?? "waiver",
    ] as const)
  );
  const counterBySig = new Map(
    (must(counterRes)).map((c) => [c.signature_id, c] as const)
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
    isContract: kindByVersion.get(s.document_version_id) === "contract",
    counterSignedBy: counterBySig.get(s.id)?.signer_name ?? null,
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
