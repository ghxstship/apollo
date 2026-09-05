/* Shared between the server action and the client island — a "use server"
   module may only export async functions, so the shapes live here. */

export type ApplicationStage = "received" | "review" | "invited" | "aboard" | "declined";

export type StatusState = {
  state: "idle" | "found" | "unknown" | "error";
  status?: ApplicationStage;
  email?: string;
  error?: string;
};

export const STATUS_INITIAL: StatusState = { state: "idle" };

/* The four stages the funnel promised, with the promise each one carries.
   Stage 3 used to read "Signatures — two members vouch", a gate no table
   backs; it now names the vouching the database actually records — an invite
   code redeemed onto the application. */
export const STAGES: Array<{ title: string; note: string }> = [
  { title: "Applied", note: "Received and read by a person, not a model." },
  { title: "Invitation ashore", note: "Come ashore once, as our guest." },
  { title: "Vouched for", note: "A member's code on your file — if one sent you." },
  { title: "Aboard", note: "Card in hand, manifest open." },
];

/* How far the ladder has been climbed, by the status the database keeps.
   Vouching is a property of the application (its invite_code), not a status
   an application waits in — so no status maps to 3, and "aboard" clears the
   whole ladder whether or not a code came with the file. */
export const REACHED: Record<ApplicationStage, number> = {
  received: 1,
  review: 1,
  invited: 2,
  aboard: 4,
  declined: 0,
};

/* The next step, by stage — "received" was a dead end for weeks with nothing
   to do and no idea whether doing nothing was right. */
export const NEXT_STEP: Record<ApplicationStage, string> = {
  received: "Nothing to do. If a fortnight passes with no word, hail Shoreside and a person will look.",
  review: "Nothing to do. The word arrives at the address you applied with.",
  invited: "Your invitation letter names the shore nights open to you — pick one within the month and come as our guest.",
  aboard: "Sign in at the gangway with the address you applied with; your member card is on the other side.",
  declined: "Apply again next season. A member's code on your file carries weight when you do.",
};

export const STAGE_LINE: Record<ApplicationStage, string> = {
  received: "Received. A person reads it — not a filter.",
  review: "In front of a person now. A word follows within the week.",
  invited: "Invited ashore. Pick a shore night and come as our guest.",
  aboard: "Aboard. Your member card is waiting behind the gangway.",
  declined: "Not this season.",
};
