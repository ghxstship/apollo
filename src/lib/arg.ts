/* What a server action actually receives.

   A server action's parameter is typed, and the type is a promise the CALLER
   makes. The caller here is whatever posts to the action's endpoint, and an
   attacker's caller promises nothing: the argument arrives as whatever they
   serialised. So `body: string` followed by `body.trim()` is a 500 the moment
   somebody sends a number, and three actions were exactly that — a crash and
   an error digest on an attacker-controlled path, found by fuzzing the action
   surface with the wrong types.

   The framework does not coerce for us and should not. This does, at the one
   place it matters: the boundary. A non-string is not an error worth naming to
   a member — no real form can produce one — so it becomes the empty string and
   meets the same "say something first" the empty case already met. */
export function asText(v: unknown): string {
  return typeof v === "string" ? v : "";
}
