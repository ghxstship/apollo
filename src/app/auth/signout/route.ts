import { NextResponse, type NextRequest } from "next/server";
import { crossSiteRefusal } from "@/lib/request-guards";
import { createClient } from "@/lib/supabase/server";

/* Signing a member out from another site is a nuisance rather than a breach —
   and with SameSite=Lax cookies a cross-site POST carries no session to sign
   out of. Refused anyway, because it costs one header read and the answer to
   "should another site be able to do this" is no. */
export async function POST(request: NextRequest) {
  const crossSite = crossSiteRefusal(request);
  if (crossSite) return crossSite;

  const supabase = await createClient();
  await supabase.auth.signOut();
  /* 303 so the redirect after POST lands as a GET. */
  return NextResponse.redirect(new URL("/", request.url), 303);
}
