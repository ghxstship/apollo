"use server";

import { createClient } from "@/lib/supabase/server";
import { voiceWith } from "@/lib/errors";

/* — Export my data. The definer assembles the member's whole record as one
     jsonb — profile, passes, both ledgers, the word, proposals, the preference
     sheet, agreements — and leaves out what is the club's rather than theirs
     (boarding codes, the calendar token, the processor id). The action only
     serialises what comes back; the client turns it into a file. — */

export type ExportResult = { json?: string; error?: string };

export async function exportMyData(): Promise<ExportResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sign in first." };

  const { data, error } = await supabase.rpc("export_my_data");
  if (error) return { error: await voiceWith(supabase, error) };
  if (data == null) return { error: "Nothing came back. Try again, or hail Shoreside." };
  return { json: JSON.stringify(data, null, 2) };
}
