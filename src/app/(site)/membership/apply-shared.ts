/* Shared between the server action and the client form — a "use server" file
   may only export async functions, so constants and types live here. */

export const CITIES = ["Miami", "Los Angeles", "Chicago", "New York", "Elsewhere"] as const;

export interface ApplyValues {
  full_name: string;
  email: string;
  city: string;
  referral: string;
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
  values: { full_name: "", email: "", city: "", referral: "", note: "" },
};
