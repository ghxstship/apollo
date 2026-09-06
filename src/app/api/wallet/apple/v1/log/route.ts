import { clientKey, overLimit, tooMany } from "@/lib/rate-limit";
import { readBounded } from "@/lib/request-guards";
import { appleConfig, NOT_ISSUED_HERE, voiceJson } from "@/lib/wallet/env";

/* POST log — a phone reporting what went wrong with a pass.

   Body is { logs: [string] }. The lines go to the server log under a prefix an
   operator can search for, and the answer is 200: this is the device telling
   us about a fault, and a fault in receiving that report is not the device's
   problem.

   Apple's spec makes this route unauthenticated. It does not make it
   unbounded, and it was: no credential of any kind, no pacing, and every
   character a caller sent went into the host log verbatim. Three bounds now.

   THE RATE. Ten reports a minute from one address. A phone with a broken pass
   sends a handful; anything past that is not a phone.

   THE CHARACTERS. A log line is one line. Newlines, carriage returns and the
   rest of the C0/C1 control set are replaced with a space before anything is
   written, because a caller who can put a newline into the log can put a
   forged entry after it — indistinguishable from one the server wrote, in the
   file an operator reads to work out what happened. Deleted characters are
   not silently dropped: an operator seeing an odd run of spaces is seeing the
   truth about what arrived.

   THE VOLUME. Per line, per request, and per body — the body cap is the one
   that matters, because fifty lines of two thousand characters was already
   bounded and a hundred megabytes of JSON was not. */

export const dynamic = "force-dynamic";

const MAX_LINES = 50;
const MAX_LINE = 2000;
const MAX_BODY = 8 * 1024;
const MAX_TOTAL = 8 * 1024;

/* C0, DEL and C1, replaced one for one with a space. Written as a character
   walk rather than a regex: a regex over this range is exactly what
   no-control-regex exists to catch, and a rule silenced beside the code it was
   written for is a rule that stops working. A space, not a deletion — an
   operator seeing an odd run of spaces is seeing the truth about what
   arrived. */
function oneLine(line: string): string {
  let out = "";
  for (const ch of line.slice(0, MAX_LINE)) {
    const code = ch.codePointAt(0) ?? 0;
    out += code < 0x20 || (code >= 0x7f && code <= 0x9f) ? " " : ch;
  }
  return out;
}

export async function POST(request: Request) {
  if (!appleConfig()) return voiceJson(NOT_ISSUED_HERE, 501);

  if (overLimit(`wallet-log:${clientKey(request)}`, 10, 60_000)) {
    /* The one place this route does not answer 200. A throttle is a decision,
       not a fault, and 429 is what says so. */
    return tooMany({ error: "That is more reports than the club reads at once." }, 60);
  }

  const raw = await readBounded(request, MAX_BODY);
  if (raw === null) return new Response(null, { status: 413 });

  try {
    const body = JSON.parse(raw) as { logs?: unknown };
    const logs = Array.isArray(body.logs) ? body.logs : [];
    let spent = 0;
    for (const line of logs.slice(0, MAX_LINES)) {
      if (typeof line !== "string") continue;
      const clean = oneLine(line);
      if (spent + clean.length > MAX_TOTAL) break;
      spent += clean.length;
      console.warn("[un] wallet device log:", clean);
    }
  } catch {
    /* Not JSON. Still a 200 — see above. */
  }
  return new Response(null, { status: 200 });
}
