/* Next's server-error hook. Every server error is written as one structured
   line for the platform's log drain AND into public.app_errors, which the
   Bridge reads on /bridge/reports. When an external tracker is chosen, this is
   the one function that forwards to it. The insert uses the service role and
   never throws — an error reporter that can fail the request is a second bug. */
export async function register() {}

export async function onRequestError(
  err: unknown,
  request: { path: string; method: string },
  context: { routerKind: string; routePath: string; routeType: string }
) {
  const e = err as { message?: string; digest?: string; name?: string };
  const row = {
    deployment: process.env.VERCEL_DEPLOYMENT_ID ?? null,
    name: e?.name ?? "Error",
    message: (e?.message ?? String(err)).slice(0, 2000),
    digest: e?.digest ?? null,
    method: request.method,
    path: request.path,
    route: context.routePath,
    kind: `${context.routerKind}/${context.routeType}`,
  };
  console.error(JSON.stringify({ level: "error", at: new Date().toISOString(), ...row }));

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return;
  try {
    await fetch(`${url}/rest/v1/app_errors`, {
      method: "POST",
      headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify(row),
      signal: AbortSignal.timeout(3000),
    });
  } catch {
    /* The line above already went to the drain. */
  }
}
