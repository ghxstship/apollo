/* Shared between the server action and the client form — a "use server" file
   may only export async functions, so constants and types live here. */

export const CITIES = ["Miami", "Los Angeles", "Chicago", "New York", "Elsewhere"] as const;

/* Shape only — whether the code is live is apply_with_invite's verdict, not
   ours. Minted codes are UN-XXXX-XXXX, but the prefix is checked loosely so a
   reissue under another mark doesn't strand the form. */
export const INVITE_CODE_RE = /^[A-Z]{2,4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/;

export interface ApplyValues {
  full_name: string;
  email: string;
  city: string;
  referral: string;
  invite: string;
  note: string;
}

export interface ApplyState {
  ok: boolean;
  errors: Partial<Record<keyof ApplyValues | "conduct" | "form", string>>;
  values: ApplyValues;
  meta?: string;
}

export const APPLY_INITIAL: ApplyState = {
  ok: false,
  errors: {},
  values: { full_name: "", email: "", city: "", referral: "", invite: "", note: "" },
};
