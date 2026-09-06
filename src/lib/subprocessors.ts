/* Who else touches a member's data, named once.

   Seven third parties process personal data for the club and none of them was
   disclosed anywhere — a repository-wide grep for "subprocessor" or "DPA"
   returned nothing at all before 2026-09-06. This list is the disclosure, and
   it lives in code rather than in a document because a list that is not beside
   the dependency it describes goes stale the first time somebody adds one.

   THIS IS NOT THE DPA. It is the factual list a member is owed under GDPR
   Art. 13(1)(e) and CPRA §1798.100(a). The agreements themselves, and the
   transfer mechanism for each, are counsel's and are not written here.

   Adding a service that touches member data means adding a line here. The list
   is rendered at /you/data, so an omission is visible to the people best
   placed to notice it. */

export type Subprocessor = {
  name: string;
  does: string;
  /* Where the processing happens, as far as the club has established it.
     Deliberately plain rather than a legal term of art — "the United States"
     is what a member wants to know, and the transfer mechanism that makes it
     lawful is counsel's to state. */
  where: string;
};

export const SUBPROCESSORS: readonly Subprocessor[] = [
  { name: "Supabase", does: "Holds the club's database, sign-ins and files. Everything else on this list receives a subset of what Supabase holds.", where: "United States (AWS)" },
  { name: "Vercel", does: "Runs the club's website and its server code.", where: "United States, with edge locations worldwide" },
  { name: "Cloudflare", does: "Sits in front of the site — routes requests, absorbs attacks, and is what sees a visitor's address first.", where: "Worldwide" },
  { name: "Stripe", does: "Takes payments and holds card details. The club never sees a card number.", where: "United States and Ireland" },
  { name: "Resend", does: "Delivers the club's letters. Receives the address a letter goes to and what it says.", where: "United States" },
  { name: "sent.dm", does: "Delivers texts. Receives the number and the message.", where: "United States" },
  { name: "Anthropic", does: "Answers questions put to the Producer. Receives the question asked and the context the club sends with it — not the roster, and not anybody's contact details.", where: "United States" },
] as const;
