/* What the dispatcher (run_automations, SQL) puts in the letter an email rule
   sends: the member's name and the episode's title, under the new key and the
   old. Nothing else is known at fire time. A letter that REQUIRES anything
   more — a boarding code, an amount, a season, an operator's title and body —
   cannot be sent by a rule: the registry admits it, the row is queued, and the
   sender refuses it at drain time with `failed` in the outbox, which the
   Bridge sees a day late and the member never sees at all. That is how a
   member once got a boarding pass with no code on it.

   Those letters are named here so the picker never offers them and
   createAutomation refuses them by name. The letter gate
   (scripts/lib/letters.mjs) holds this list equal to the sender's REQUIRES
   map and holds AUTOMATION_LETTER_KEYS equal to what the live run_automations
   body writes, so a new required key cannot land without this file moving.

   Not a "use server" module on purpose: a server-actions file may export only
   async functions, and both the action and the page read these. */
export const AUTOMATION_LETTER_KEYS = ["name", "episode", "voyage"] as const;

export const LETTERS_A_RULE_CANNOT_FILL: Record<string, string> = {
  "boarding-pass": "code",
  "gangway-details": "code",
  "refund-posted": "amount",
  "season-card": "season",
  "bridge-word": "title, body",
};

/* The payload keys the dispatcher writes for a text rule before the rule's
   own title and body. sms_templates.parameter_map names, per template, which
   payload key fills each of the carrier's variables; a template whose map
   reads a key outside this set (plus title/body when the rule supplies them)
   would reach the carrier with that variable empty. */
export const AUTOMATION_TEXT_KEYS = ["name", "episode", "voyage", "sailing", "link"] as const;

/* The distinct payload keys a parameter_map reads. */
export function textTemplateNeeds(map: unknown): string[] {
  if (!map || typeof map !== "object" || Array.isArray(map)) return [];
  const out = new Set<string>();
  for (const v of Object.values(map as Record<string, unknown>)) if (typeof v === "string" && v) out.add(v);
  return [...out].sort();
}
