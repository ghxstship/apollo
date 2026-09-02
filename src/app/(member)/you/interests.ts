/* What a member turns up for — the directory filters and searches on these.

   These are option labels, not a schema: profiles.interests is free text and
   stored rows are not migrated when a label changes. A member who saved the
   retired wording keeps it until they next save their page, at which point the
   allow-list in actions.ts drops what the UI no longer offers. */
export const INTERESTS = [
  "Sailings",
  "Shore nights",
  "Crossings",
  "Regattas",
  "Navigation",
  "Long tables",
  "The galley",
] as const;

export const BIO_MAX = 400;
