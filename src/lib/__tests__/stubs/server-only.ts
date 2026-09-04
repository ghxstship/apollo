/* `server-only` throws on import anywhere but a React Server Component
   bundle, which is the point of it in the app and an obstacle in vitest.
   Aliased here (vitest.config.ts) so the pure helpers that live beside
   server code — duesNote() in dues.ts — can be tested without a Next runtime. */
export {};
