/* The six things a member may ask about their own data, shared by the form and
   the action that opens the request.

   NOT in actions.ts, for the reason prefs.ts states beside its own vocabulary:
   a "use server" module may export only async functions. Exporting an array
   from one type-checks, builds, and then arrives at the client as something
   that is not an array — the failure is a TypeError at render, on a page that
   had passed every gate. This file is the second time that trap has been laid
   in this codebase and the second time it caught somebody.

   The words are the database's — ask_about_my_data refuses anything else — and
   they are repeated here rather than derived from the generated types because
   these are the options the FORM offers, and a form that silently gained a
   seventh because somebody widened a CHECK constraint would be a surprise. */
export const REQUEST_KINDS = [
  "access",
  "portability",
  "rectification",
  "erasure",
  "restriction",
  "objection",
] as const;

export type RequestKind = (typeof REQUEST_KINDS)[number];
