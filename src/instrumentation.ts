/* Next's server-error hook. There is no tracker wired yet — that needs a DSN
   the owner holds — so every server error is written as one structured line
   the platform's log drain can index, with the deployment id for correlation.
   When a tracker lands, this is the one function that forwards to it. */
export async function register() {}

export async function onRequestError(
  err: unknown,
  request: { path: string; method: string },
  context: { routerKind: string; routePath: string; routeType: string }
) {
  const e = err as { message?: string; digest?: string; name?: string };
  console.error(
    JSON.stringify({
      level: "error",
      at: new Date().toISOString(),
      deployment: process.env.VERCEL_DEPLOYMENT_ID ?? null,
      name: e?.name ?? "Error",
      message: e?.message ?? String(err),
      digest: e?.digest ?? null,
      method: request.method,
      path: request.path,
      route: context.routePath,
      kind: `${context.routerKind}/${context.routeType}`,
    })
  );
}
