import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  InviteStanding,
  inviteAllowanceLine,
  inviteCountLine,
  seasonDate,
  type InviteAllowance,
} from "../invite-allowance";
import { BANNED_TERMS } from "@/lib/brand";

/* The sentence a member reads when the Mint button is not there is the whole
   of decision 7, so it is tested like a rule and not like a string: every
   branch says WHY and says WHEN, and none of them says a retired word. */

const base: InviteAllowance = {
  seasonTitle: "Season I",
  seasonEndsOn: "2027-08-29",
  league: 1,
  cap: 1,
  minted: 1,
  liveCode: null,
  liveExpiresAt: null,
  mayMint: false,
};

const lexiconClean = (text: string) => {
  const lower = text.toLowerCase();
  return BANNED_TERMS.filter((t) => lower.includes(t.toLowerCase()));
};

describe("inviteAllowanceLine", () => {
  it("says nothing when the member may mint — the button speaks instead", () => {
    expect(inviteAllowanceLine({ ...base, minted: 0, mayMint: true })).toBeNull();
  });

  it("names the count, the season and the day the next one opens", () => {
    const line = inviteAllowanceLine(base);
    expect(line).toContain("your one invite");
    expect(line).toContain("Season I");
    expect(line).toContain("AUG 29 · 2027");
  });

  it("counts two and three in words, and drops the promise at the last league", () => {
    expect(inviteAllowanceLine({ ...base, cap: 2, minted: 2, league: 3 })).toContain("both of your invites");
    expect(inviteAllowanceLine({ ...base, cap: 3, minted: 3, league: 5 })).toContain("all three of your invites");
    /* Below the deepest league the allowance still has somewhere to go. */
    expect(inviteAllowanceLine({ ...base, cap: 2, minted: 2, league: 4 })).toContain("Leagues only deepen");
    /* At it, promising more would be a lie. */
    expect(inviteAllowanceLine({ ...base, cap: 3, minted: 3, league: 5 })).not.toContain("Leagues only deepen");
  });

  it("tells a member holding a live code what the next one waits on", () => {
    const line = inviteAllowanceLine({ ...base, minted: 1, liveCode: "UN-ABCD-EFGH" });
    expect(line).toContain("One at a time");
    expect(line).toContain("ninety days");
  });

  it("does not invent a window when no season is open", () => {
    const line = inviteAllowanceLine({ ...base, seasonTitle: null, seasonEndsOn: null });
    expect(line).toContain("between seasons");
    expect(line).toContain("new season");
  });

  it("reads standing before the count, and names the way back", () => {
    expect(inviteAllowanceLine(base, { standing: "paused" })).toContain("paused");
    expect(inviteAllowanceLine(base, { standing: "departed" })).toContain("Come back");
    /* A departed member is not told they are paused. */
    expect(inviteAllowanceLine(base, { standing: "departed" })).not.toContain("paused");
  });

  it("says nothing banned, in any branch", () => {
    const lines = [
      inviteAllowanceLine(base),
      inviteAllowanceLine({ ...base, cap: 3, minted: 3, league: 5 }),
      inviteAllowanceLine({ ...base, liveCode: "UN-ABCD-EFGH" }),
      inviteAllowanceLine({ ...base, seasonTitle: null, seasonEndsOn: null }),
      inviteAllowanceLine(base, { standing: "paused" }),
      inviteAllowanceLine(base, { standing: "departed" }),
      inviteCountLine(base),
    ].filter((l): l is string => !!l);
    expect(lines).toHaveLength(7);
    for (const line of lines) expect(lexiconClean(line)).toEqual([]);
  });
});

describe("seasonDate", () => {
  /* Through a Date this would land a day early on any host behind the season's
     own clock, which is every host west of the city. Parts only. */
  it("reads a bare date as parts", () => {
    expect(seasonDate("2027-08-29")).toBe("AUG 29 · 2027");
    expect(seasonDate("2027-01-01")).toBe("JAN 01 · 2027");
  });
});

describe("InviteStanding", () => {
  it("renders the refusal and the count together", () => {
    render(<InviteStanding allowance={base} />);
    expect(screen.getByText(/your one invite/)).toBeInTheDocument();
    expect(screen.getByText("1 OF 1 MINTED · SEASON I")).toBeInTheDocument();
  });

  it("shows only the count when the mint is open", () => {
    render(<InviteStanding allowance={{ ...base, minted: 0, mayMint: true }} />);
    expect(screen.getByText("0 OF 1 MINTED · SEASON I")).toBeInTheDocument();
    expect(screen.queryByRole("status")).toBeNull();
  });
});
