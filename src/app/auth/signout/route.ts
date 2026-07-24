import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  /* 303 so the redirect after POST lands as a GET. */
  return NextResponse.redirect(new URL("/", request.url), 303);
}
