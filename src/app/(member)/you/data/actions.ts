"use server";

import { revalidatePath } from "next/cache";
import { voiceWith } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";
import { REQUEST_KINDS } from "./kinds";

export type AskResult = { error?: string; done?: boolean };


export async function askAboutMyData(kind: string, detail: string): Promise<AskResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sign in first." };

  if (!(REQUEST_KINDS as readonly string[]).includes(kind)) {
    return { error: "Pick one of the things the club knows how to be asked." };
  }

  const { error } = await supabase.rpc("ask_about_my_data", {
    p_kind: kind,
    p_detail: detail.trim().slice(0, 2000) || null,
  });
  /* 23505 is the one-open-request-of-a-kind rule, and it is not an error the
     member did anything wrong to earn — it is the club already owing them an
     answer. voiceWith would call it a duplicate; this says what it means. */
  if (error) {
    if (error.code === "23505") {
      return { error: "That request is already open — the club owes you an answer on it before another." };
    }
    return { error: await voiceWith(supabase, error) };
  }

  revalidatePath("/you/data");
  return { done: true };
}
