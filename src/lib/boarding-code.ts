/* One definition of what a scanned code means.

   Boarding codes have been minted under three prefixes: LS- in the Lyre era,
   SYR- after the first rebrand, UN- now. The records were rewritten to UN- but
   MEMBERS STILL HOLD THE PRINTED CARDS, so every path that resolves a scanned
   value has to map the retired prefixes onto the current one or turn those
   people away at the dock.

   It lives here because there are FOUR such paths and they were not agreeing:
   the server action mapped, while the offline roster match and the online
   row-highlight compared raw strings — so a legacy card past the breakwater
   returned "unsure" and, unlike every other branch, queued NOTHING. No record
   that a person walked aboard, which is the one thing the offline path exists
   to protect.

   Retired prefixes are LISTED rather than pattern-matched. This runs on a
   scanned value and turns it into a person walking aboard; a rule loose enough
   to be clever here is a rule that boards the wrong person. */
export const RETIRED_CODE_PREFIXES = ["SYR-", "LS-", "LYR-"] as const;
export const CODE_PREFIX = "UN-";

export function literalCode(raw: string): string {
  const code = raw.trim().toUpperCase();
  const retired = RETIRED_CODE_PREFIXES.find((p) => code.startsWith(p));
  return retired ? CODE_PREFIX + code.slice(retired.length) : code;
}
