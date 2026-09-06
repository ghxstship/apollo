import "server-only";
import type { SupabaseClient, User } from "@supabase/supabase-js";

/* The second step, for a server action.

   step-up.ts closes the seam between pages and route handlers. This closes the
   one under it, which the first file's own comment predicted without naming:
   "the second step was protecting the windows and not the door."

   A server action is neither a page nor a route handler. It is dispatched by a
   Next-Action id to WHATEVER ROUTE THE CLIENT HAPPENS TO BE ON, and the proxy's
   gate is a list of path prefixes. So a POST carrying an action id to a path
   that is not on PROTECTED — "/", "/series", a log entry — is never redirected,
   and the action runs at the first assurance level no matter which screen its
   form was rendered on. Nothing in the database can catch it either: no policy
   and no definer function consults an assurance level.

   The actions that sat on that seam are the ones worth having: setPassword,
   which takes no current password; departClub, which ends a membership;
   the manifest and camera consents, which are the two privacy switches a
   member has; and the calendar-token rotation, which mints a credential.

   Why this is a separate file from step-up.ts rather than a second export
   there. That one returns a Response, because a fetch() can read a 401 and a
   redirect to HTML is not an answer it can use. An action returns a value its
   own form renders, and the shapes differ per action. So this returns a plain
   sentence or null, and each caller puts it in whatever field it already uses
   to say no — which means no caller changes shape to adopt the guard, and a
   guard nothing has to be restructured for is a guard that gets adopted. */

export type StepUpNeeded = { error: string; next: "/gangway/verify" };

/* The sentence, once. Three actions would otherwise each invent one, and
   drifting copies of a refusal are how two surfaces end up saying different
   things about the same door. */
const PROVE_IT = "Prove the code first — this one needs your second step.";

export async function actionStepUp(
  supabase: SupabaseClient,
  user: User | null,
): Promise<StepUpNeeded | null> {
  /* Not signed in at all is the caller's own refusal, not this one's business.
     Every action here has already said "Sign in first." by the time it asks. */
  if (!user) return null;

  const enrolled = (user.factors ?? []).some((f) => f.status === "verified");
  if (!enrolled) return null;

  const { data: aal, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  /* Fail closed, for the same reason step-up.ts does: the safe answer for a
     surface that changes a password or ends a membership is no. */
  if (error || !aal) return { error: PROVE_IT, next: "/gangway/verify" };
  if (aal.currentLevel === aal.nextLevel) return null;
  return { error: PROVE_IT, next: "/gangway/verify" };
}
