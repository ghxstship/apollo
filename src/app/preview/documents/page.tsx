import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MAILBOX } from "@/lib/brand";
import "@/components/site/site.css";
import "./preview.css";
import { readLibrary, type Clause, type PreviewDocument } from "./data";

export const metadata: Metadata = {
  title: "Document preview",
  robots: { index: false, follow: false },
};

/* The signing library is not reachable without a session, which makes the copy
   that actually binds people the hardest copy in the product to proofread.
   This route exists to be read, never to be signed — and never in production. */

export const dynamic = "force-dynamic";

const KIND_LABEL: Record<string, string> = {
  waiver: "Waiver",
  contract: "Agreement",
  policy: "Policy",
};

const CLASS_LABEL: Record<string, string> = {
  sea: "Sea Day — aboard",
  shore: "Port Day — ashore",
};

export default async function DocumentPreviewPage() {
  if (process.env.NODE_ENV === "production") notFound();

  const { documents, live, generatedAt } = await readLibrary();

  return (
    <div className="lg-wrap">
      <span className="ls-eyebrow" style={{ color: "var(--brass-deep)", display: "block", marginBottom: 16 }}>
        Development only
      </span>
      <h1>Everything a person can be asked to sign.</h1>
      <p style={{ color: "var(--text-2)", marginTop: 14, maxWidth: "56ch" }}>
        The published version of every active document, assembled from the clause
        library exactly as the signing pages assemble it. Reading, not signing —
        there is no form here. Wording questions go to{" "}
        <a href={`mailto:${MAILBOX.shore}`}>{MAILBOX.shore}</a>.
      </p>

      <div className="pv-flag">
        <span>{live ? "Live · read from the database" : `Snapshot · ${generatedAt}`}</span>
        <span>·</span>
        <span>
          {live
            ? "render_document() over published versions"
            : "set SUPABASE_SERVICE_ROLE_KEY to read live"}
        </span>
      </div>

      <nav className="lg-anchors" aria-label="Documents">
        {documents.map((d) => (
          <a key={d.code} href={`#${d.code}`}>
            {d.title}
          </a>
        ))}
        <a href="#public">Public pages</a>
      </nav>

      {documents.map((doc) => (
        <DocumentSection key={doc.code} doc={doc} />
      ))}

      <section className="lg-sec" id="public">
        <h2>The public pages.</h2>
        <p>
          These are hand-written prose, not assembled from the clause library —
          they say what the club is like, while the documents above say what it
          holds you to. The two are maintained separately.
        </p>
        <ul>
          <li>
            <Link href="/legal">/legal</Link> — code of conduct, terms of passage, privacy
          </li>
          <li>
            <Link href="/support">/support</Link> — Shoreside, refunds, holds, knots
          </li>
          <li>
            <Link href="/membership">/membership</Link> — dues and pass terms
          </li>
          <li>
            <Link href="/brand">/brand</Link> — press and partner boilerplate
          </li>
        </ul>
        <p className="lg-mono" style={{ marginTop: 24 }}>
          Signing lives at /agreements/[code] and /sign/[token] · both need a session
        </p>
      </section>
    </div>
  );
}

function DocumentSection({ doc }: { doc: PreviewDocument }) {
  return (
    <section className="lg-sec" id={doc.code}>
      <h2>{doc.title}.</h2>
      <div className="pv-meta">
        <span>{KIND_LABEL[doc.kind] ?? doc.kind}</span>
        <span>
          Audience <b>{doc.audience}</b>
        </span>
        <span>
          Version <b>{doc.version}</b>
        </span>
        <span>
          Renews{" "}
          <b>{doc.validity_months ? `every ${doc.validity_months} months` : "never"}</b>
        </span>
        {doc.gates.length > 0 ? (
          <span>
            Gates <b>{doc.gates.join(" · ")}</b>
          </span>
        ) : null}
        <span>
          Code <b>{doc.code}</b>
        </span>
      </div>

      {doc.renderings.map((r) => (
        <div className="pv-render" key={r.class}>
          <h3>{CLASS_LABEL[r.class] ?? r.class}</h3>
          <ul className="pv-manifest">
            {r.clauses.map((c) => (
              <li key={`${c.clause_code}-${c.position}`}>
                <span>{String(c.position).padStart(2, "0")}</span>
                <span>{c.title}</span>
                <span>{c.category}</span>
                <span>
                  {c.clause_code} v{c.version}
                </span>
              </li>
            ))}
          </ul>
          {paragraphs(r.body, r.clauses).map((p, i) => (
            <div className="pv-clause" key={i}>
              {p.heading ? <h4>{p.heading}</h4> : null}
              <p>{p.text}</p>
            </div>
          ))}
        </div>
      ))}
    </section>
  );
}

/* Each clause body opens with its own title as a sentence. Lifting that into a
   heading is presentation only — the text below is byte-for-byte what
   render_document() returned, because a preview that edits the wording is
   worse than no preview. Falls back to plain paragraphs if the manifest and
   the rendering disagree about how many clauses there are. */
function paragraphs(body: string, clauses: Clause[]) {
  const parts = body.split("\n\n");
  if (parts.length !== clauses.length) {
    return parts.map((text) => ({ heading: null as string | null, text }));
  }
  return parts.map((text, i) => {
    const lead = `${clauses[i].title}. `;
    return text.startsWith(lead)
      ? { heading: clauses[i].title, text: text.slice(lead.length) }
      : { heading: null as string | null, text };
  });
}
