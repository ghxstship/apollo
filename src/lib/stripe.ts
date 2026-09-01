import "server-only";
import Stripe from "stripe";

/* Card settlement is optional infrastructure — every surface that touches
   Stripe checks stripeEnabled() first and degrades to the house-account
   copy when the keys are absent. */

let client: Stripe | null = null;

export function stripeEnabled(): boolean {
  return Boolean(
    process.env.STRIPE_SECRET_KEY &&
      process.env.STRIPE_WEBHOOK_SECRET &&
      process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

export function getStripe(): Stripe {
  if (!client) {
    /* The SDK's default is an 80-second wait and no retries; a webhook route
       that hangs that long is a lost event. */
    client = new Stripe(process.env.STRIPE_SECRET_KEY!, { timeout: 10_000, maxNetworkRetries: 2 });
  }
  return client;
}
