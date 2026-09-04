/* Bounds on what a signature may carry, shared by the member and guest
   signing actions. A plain module rather than part of actions.ts: a
   "use server" file may export only async functions, and this is a check,
   not an action. */

/* A drawn signature arrives as a PNG data URL off a 520×140 canvas — tens of
   kilobytes, never hundreds. The ceiling is generous for that and nothing
   else; a typed one is a name. */
const DRAWN_MAX = 200_000;
const TYPED_MAX = 120;

export type BoundedSignature = {
  kind: "typed" | "drawn";
  data: string;
  name: string;
  consentText: string;
  userAgent: string;
};

export function boundSignature(input: {
  kind: string;
  data: string;
  name: string;
  consentText: string;
  userAgent: string;
}): BoundedSignature | null {
  const kind = input.kind === "drawn" ? "drawn" : input.kind === "typed" ? "typed" : null;
  if (!kind) return null;
  const data = String(input.data ?? "");
  if (kind === "typed" && data.length > TYPED_MAX) return null;
  if (kind === "drawn" && (data.length > DRAWN_MAX || !data.startsWith("data:image/png;base64,"))) return null;
  return {
    kind,
    data,
    name: String(input.name ?? "").trim().slice(0, TYPED_MAX),
    consentText: String(input.consentText ?? "").slice(0, 500),
    userAgent: String(input.userAgent ?? "").slice(0, 512),
  };
}
