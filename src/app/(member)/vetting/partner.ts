/* The couple pass's second head — shared between the gate panel and the seat
   action. A "use server" file may only export async functions, so the bounds
   live here.

   Two to eighty characters, matching what the manifest prints on a stub. Bounded
   on both sides so the member is told by the form rather than by a constraint
   violation the error voice has to guess at. */
export const PARTNER_NAME_MIN = 2;
export const PARTNER_NAME_MAX = 80;

export function isPartnerName(value: string): boolean {
  const n = value.trim().length;
  return n >= PARTNER_NAME_MIN && n <= PARTNER_NAME_MAX;
}
