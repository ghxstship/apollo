import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import snapshot from "./snapshot.json";

/* Every document the club can ask someone to sign, rendered under each context
   that changes the assembly. The signing pages themselves live behind auth
   (/agreements/[code] for members, /sign/[token] for guests), which makes the
   copy unreviewable without a session — this is the reviewer's door.

   Live where a service-role key is present, and a snapshot otherwise: the
   anon role is deliberately revoked from render_document(), and a preview is
   not a good enough reason to hand it back. */

export type Clause = {
  clause_code: string;
  title: string;
  category: string;
  version: number;
  position: number;
  condition: Record<string, unknown>;
};

export type Rendering = { class: string; body: string; clauses: Clause[] };

export type PreviewDocument = {
  code: string;
  title: string;
  kind: string;
  audience: string;
  validity_months: number | null;
  version: number;
  effective_from: string;
  gates: string[];
  renderings: Rendering[];
};

export type Library = {
  documents: PreviewDocument[];
  live: boolean;
  /* Only meaningful when live is false. */
  generatedAt: string;
};

/* A Port Day assembles clauses a Sea Day does not, so a reviewer who reads one
   rendering has not read the document. Both are shown, always. */
const CONTEXTS = ["sea", "shore"] as const;

const FALLBACK: Library = {
  documents: snapshot.documents as PreviewDocument[],
  live: false,
  generatedAt: snapshot.generatedAt,
};

export async function readLibrary(): Promise<Library> {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return FALLBACK;

  try {
    const supabase = createAdminClient();

    const { data: docs, error } = await supabase
      .from("documents")
      .select("code, title, kind, audience, validity_months")
      .eq("active", true)
      .order("audience")
      .order("code");
    if (error || !docs) return FALLBACK;

    const documents: PreviewDocument[] = [];

    for (const doc of docs) {
      const { data: versionId } = await supabase.rpc("published_version", {
        p_document_code: doc.code,
      });
      if (!versionId) continue;

      const [{ data: version }, { data: reqs }] = await Promise.all([
        supabase
          .from("document_versions")
          .select("version, effective_from")
          .eq("id", versionId)
          .maybeSingle(),
        supabase
          .from("document_requirements")
          .select("gate")
          .eq("document_code", doc.code),
      ]);

      const renderings: Rendering[] = [];
      for (const cls of CONTEXTS) {
        const { data: body } = await supabase.rpc("render_document", {
          p_document_version_id: versionId,
          p_context: { class: cls },
        });
        if (!body) continue;
        /* Two contexts that assemble identically are one rendering, not two —
           the crew agreement carries no conditional clause at all. */
        if (renderings.some((r) => r.body === body)) continue;
        renderings.push({ class: cls, body, clauses: await readClauses(supabase, versionId, cls) });
      }
      if (renderings.length === 0) continue;

      documents.push({
        code: doc.code,
        title: doc.title,
        kind: doc.kind,
        audience: doc.audience,
        validity_months: doc.validity_months,
        version: version?.version ?? 0,
        effective_from: version?.effective_from ?? "",
        gates: (reqs ?? []).map((r) => r.gate),
        renderings,
      });
    }

    return documents.length > 0
      ? { documents, live: true, generatedAt: "" }
      : FALLBACK;
  } catch {
    return FALLBACK;
  }
}

type AdminClient = ReturnType<typeof createAdminClient>;

async function readClauses(
  supabase: AdminClient,
  versionId: string,
  cls: string
): Promise<Clause[]> {
  const { data } = await supabase
    .from("document_clauses")
    .select("position, condition, clause_versions(version, clause_code, clauses(title, category))")
    .eq("document_version_id", versionId)
    .order("position");

  return (data ?? [])
    .map((row) => {
      const cv = row.clause_versions as unknown as {
        version: number;
        clause_code: string;
        clauses: { title: string; category: string } | null;
      } | null;
      return {
        clause_code: cv?.clause_code ?? "",
        title: cv?.clauses?.title ?? "",
        category: cv?.clauses?.category ?? "",
        version: cv?.version ?? 0,
        position: row.position,
        condition: (row.condition ?? {}) as Record<string, unknown>,
      };
    })
    /* The same containment test the renderer runs, so the manifest lists the
       clauses this rendering actually holds rather than every candidate. */
    .filter((c) => {
      const keys = Object.keys(c.condition);
      if (keys.length === 0) return true;
      return keys.every((k) => (c.condition as Record<string, string>)[k] === (k === "class" ? cls : undefined));
    });
}
