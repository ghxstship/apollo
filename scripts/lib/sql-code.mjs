/* Reduce a migration to just its CODE: comments removed, statement terminators
   normalised, everything else — including whitespace — left exactly as written.

   Both halves of that matter and they pull in opposite directions.

   Comments must be ignored because the ledger is not a faithful copy of the
   file: `statements` as recorded drops comment text, so 59 of our files
   legitimately carry prose the database never stored. Reconciling files to the
   ledger byte-for-byte would delete the explanations, which are the most
   valuable thing in the corpus.

   Whitespace inside code must NOT be ignored, because nineteen migrations patch
   earlier functions by string-replacing against `pg_get_functiondef` output. A
   reflowed line is not cosmetic there — it is the difference between the patch
   landing and the rebuild dying. That is exactly how
   20260823151135 broke: a closing paren moved up one line, and the corpus could
   no longer rebuild its own database.

   A regex cannot do this. `--` appears inside dollar-quoted function bodies and
   inside string literals, so the scanner has to know where it is. */
export function sqlCode(text) {
  let out = "";
  for (let i = 0; i < text.length; ) {
    const two = text.slice(i, i + 2);
    if (two === "--") { while (i < text.length && text[i] !== "\n") i++; continue; }
    if (two === "/*") {
      let depth = 1; i += 2;
      while (i < text.length && depth > 0) {
        if (text.slice(i, i + 2) === "/*") { depth++; i += 2; }
        else if (text.slice(i, i + 2) === "*/") { depth--; i += 2; }
        else i++;
      }
      continue;
    }
    if (text[i] === "'") {                       // string literal, '' escapes
      out += text[i++];
      while (i < text.length) {
        if (text[i] === "'" && text[i + 1] === "'") { out += "''"; i += 2; continue; }
        if (text[i] === "'") { out += text[i++]; break; }
        out += text[i++];
      }
      continue;
    }
    const dollar = /^\$[A-Za-z_]*\$/.exec(text.slice(i));
    if (dollar) {                                // $$ or $function$ … verbatim
      const tag = dollar[0];
      const end = text.indexOf(tag, i + tag.length);
      const stop = end === -1 ? text.length : end + tag.length;
      out += text.slice(i, stop); i = stop; continue;
    }
    out += text[i++];
  }
  // The mirror joins statements with ";" onto text that already ends in ";",
  // so half the corpus carries ";;". An empty statement is not a code change.
  return out.replace(/;(\s*;)+/g, ";").trim();
}
