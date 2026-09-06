import { Badge, Notice } from "@/components/ds";

/* — The invite allowance, in words —

   One live code at a time, a count per season, and a cap that deepens with the
   league. The database decides all three (mint_invite / invite_allowance); this
   file owns the SENTENCE, because a member who cannot mint has to be told why
   and when they next can, and that sentence has to pass the lexicon gate and be
   testable without a database.

   Every branch here answers both halves. "No" on its own is what the You page
   said before: it offered Mint when the read came back empty and nothing at all
   when it did not, so a member whose code had been signed saw a spent code for
   ever and no explanation anywhere. */

export type MemberStanding = "active" | "paused" | "departed";

export type InviteAllowance = {
  /* Null when no season's days contain today — the club between seasons. */
  seasonTitle: string | null;
  /* The season's last day, as the bare date the column holds. */
  seasonEndsOn: string | null;
  league: number;
  cap: number;
  minted: number;
  liveCode: string | null;
  liveExpiresAt: string | null;
  mayMint: boolean;
};

/* The deepest league. Below it the allowance still has somewhere to go, and
   the line says so; at it, promising more would be a lie. */
const LAST_LEAGUE = 5;

/* A bare yyyy-mm-dd, read as parts. Putting it through a Date would let the
   render machine's zone move a season's last day by one — always backwards,
   since every city here sits behind UTC. Same reason, same shape, as the
   proposal card's own date. */
const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
export function seasonDate(yyyyMmDd: string): string {
  const [y, m, d] = yyyyMmDd.split("-").map(Number);
  return `${MONTHS[(m ?? 1) - 1] ?? "—"} ${String(d ?? 1).padStart(2, "0")} · ${y}`;
}

/* "your one", "both of your", "all three of your" — and a plain number past
   three, which no league carries today but a dial could set tomorrow. */
function howMany(cap: number): string {
  if (cap <= 1) return "your one invite";
  if (cap === 2) return "both of your invites";
  if (cap === 3) return "all three of your invites";
  return `all ${cap} of your invites`;
}

/* Why the Mint button is not there, and when it will be. Null means it IS
   there — the member is entitled and the page shows the control instead. */
export function inviteAllowanceLine(
  a: InviteAllowance,
  { standing = "active" }: { standing?: MemberStanding } = {}
): string | null {
  if (a.mayMint) return null;

  /* Standing is read before the count, because it is true whatever the count
     says. A paused membership is refused at the door by is_active(), and it is
     the one refusal the member can lift themselves — so it names the way out.
     A departed one is told the plain thing rather than a pause it is not. */
  if (standing === "paused") {
    return "Minting waits while your membership is paused. Resume it below and it opens back up.";
  }
  if (standing === "departed") {
    return "The mint closed when you left. Come back and it opens with you.";
  }

  /* An allowance is counted per season, and between seasons there is no season
     to count in. Nothing is invented to stand in for one. */
  if (!a.seasonTitle) {
    return "The club is between seasons, so there is nothing to count an invite against. Your next one opens with the new season.";
  }

  if (a.liveCode) {
    return "One at a time. The next opens once this one is signed, or once it runs out its ninety days.";
  }

  const turns = a.seasonEndsOn
    ? `The next opens when the season turns — ${seasonDate(a.seasonEndsOn)}.`
    : "The next opens when the season turns.";
  const deepens =
    a.league < LAST_LEAGUE ? " Leagues only deepen, and so does the allowance." : "";
  return `That is ${howMany(a.cap)} for ${a.seasonTitle}. ${turns}${deepens}`;
}

/* The mono line that sits under the code or the button: what a member has
   spent of the allowance, and which season it is counted in. */
export function inviteCountLine(a: InviteAllowance): string | null {
  if (!a.seasonTitle) return null;
  return `${a.minted} OF ${a.cap} MINTED · ${a.seasonTitle.toUpperCase()}`;
}

/* The refusal, rendered. Quiet rather than alarming: nothing has gone wrong,
   the member is simply between invites. */
export function InviteStanding({
  allowance,
  standing = "active",
}: {
  allowance: InviteAllowance;
  standing?: MemberStanding;
}) {
  const line = inviteAllowanceLine(allowance, { standing });
  const count = inviteCountLine(allowance);
  return (
    <>
      {line ? (
        <Notice tone="info" compact>
          {line}
        </Notice>
      ) : null}
      {count ? <p className="mbr-mono mbr-sub--sm">{count}</p> : null}
    </>
  );
}

/* How long the code in hand has left. Its own element rather than a clause in
   the count line, because a code with days on it is a different fact from an
   allowance with room in it. */
export function InviteExpiry({ label }: { label: string }) {
  return <Badge tone="outline">Good until {label}</Badge>;
}
