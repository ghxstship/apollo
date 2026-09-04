/* Shared between the server action and the client form — a "use server" file
   may only export async functions, so constants and types live here. */

import type { Json } from "@/lib/supabase/types";

export const CITIES = ["Miami", "Los Angeles", "Chicago", "New York", "Elsewhere"] as const;

/* Shape only — whether the code is live is apply_with_invite's verdict, not
   ours. Minted codes are UN-XXXX-XXXX, but the prefix is checked loosely so a
   reissue under another mark doesn't strand the form. */
export const INVITE_CODE_RE = /^[A-Z]{2,4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/;

/* Bounds on what an applicant may write. An answer is a paragraph, not an
   essay; the proposer is a name. The action enforces both — the form's
   maxLength is a courtesy, not the gate. */
export const ANSWER_MAX = 1000;
export const PROPOSER_MAX = 120;

/* One row of application_questions, as the form and the action both read it.
   The form element is chosen by kind; options feed a choice's select. */
export interface ApplyQuestion {
  key: string;
  prompt: string;
  kind: "text" | "long" | "choice";
  options: Json | null;
  required: boolean;
  position: number;
}

/* A choice's options may be stored as strings or as {value,label} pairs;
   either shape reads to the same list, and anything else reads to none. */
export function questionOptions(options: Json | null): Array<{ value: string; label: string }> {
  if (!Array.isArray(options)) return [];
  return options.flatMap((o) => {
    if (typeof o === "string") return o ? [{ value: o, label: o }] : [];
    if (o && typeof o === "object" && !Array.isArray(o)) {
      const value = typeof o.value === "string" ? o.value : null;
      const label = typeof o.label === "string" ? o.label : value;
      return value ? [{ value, label: label ?? value }] : [];
    }
    return [];
  });
}

/* The field name a question's answer travels under. Prefixed so a question
   keyed "email" can never collide with the form's own fields. */
export function answerField(key: string): string {
  return `q_${key}`;
}

export interface ApplyValues {
  full_name: string;
  email: string;
  city: string;
  referral: string;
  invite: string;
  note: string;
  proposer: string;
  /* Keyed by application_questions.key. */
  answers: Record<string, string>;
}

export interface ApplyState {
  ok: boolean;
  /* Field errors; a question's error sits under answerField(key). */
  errors: Partial<Record<Exclude<keyof ApplyValues, "answers"> | "conduct" | "form", string>> &
    Record<string, string | undefined>;
  values: ApplyValues;
  meta?: string;
}

export const APPLY_INITIAL: ApplyState = {
  ok: false,
  errors: {},
  values: {
    full_name: "",
    email: "",
    city: "",
    referral: "",
    invite: "",
    note: "",
    proposer: "",
    answers: {},
  },
};
