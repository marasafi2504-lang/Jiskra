// Jiskra – Stripe webhook (Supabase Edge Function)
// Po zaplacení předplatného zapíše tarif do tabulky public.subscriptions.
//
// Nasazení (v počítači s nainstalovaným Supabase CLI):
//   supabase functions deploy stripe-webhook --no-verify-jwt
//   supabase secrets set STRIPE_SECRET_KEY=sk_live_... STRIPE_WEBHOOK_SECRET=whsec_... \
//     PRICE_PLUS=price_...,price_... PRICE_GOLD=price_...,price_... PRICE_PLATINUM=price_...,price_...
// (u každého tarifu můžeš zadat víc cen oddělených čárkou – 1, 6 a 12 měsíců)
//
// Ve Stripe: Developers → Webhooks → Add endpoint
//   URL: https://<tvuj-projekt>.supabase.co/functions/v1/stripe-webhook
//   Události: checkout.session.completed, customer.subscription.updated, customer.subscription.deleted

import Stripe from "npm:stripe@17";
import { createClient } from "npm:@supabase/supabase-js@2";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!);
const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET")!;
const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

function planForPrice(priceId: string): string | null {
  const map: Record<string, string> = {};
  for (const [plan, env] of [["plus", "PRICE_PLUS"], ["gold", "PRICE_GOLD"], ["platinum", "PRICE_PLATINUM"]]) {
    for (const id of (Deno.env.get(env) ?? "").split(",")) {
      if (id.trim()) map[id.trim()] = plan;
    }
  }
  return map[priceId] ?? null;
}

async function saveSubscription(sub: Stripe.Subscription, userId?: string | null) {
  const priceId = sub.items.data[0]?.price.id;
  const plan = priceId ? planForPrice(priceId) : null;
  if (!plan) {
    console.error("Neznámá cena", priceId);
    return;
  }
  const periodEnd = (sub as any).current_period_end ?? sub.items.data[0]?.current_period_end;
  const active = ["active", "trialing", "past_due"].includes(sub.status);
  const validUntil = new Date((active ? periodEnd : Math.floor(Date.now() / 1000)) * 1000).toISOString();
  const customer = typeof sub.customer === "string" ? sub.customer : sub.customer.id;

  if (userId) {
    const { error } = await supabase.from("subscriptions").upsert({
      user_id: userId,
      plan,
      valid_until: validUntil,
      stripe_customer: customer,
      stripe_sub: sub.id,
      updated_at: new Date().toISOString(),
    });
    if (error) throw error;
  } else {
    const { error } = await supabase.from("subscriptions")
      .update({ plan, valid_until: validUntil, stripe_sub: sub.id, updated_at: new Date().toISOString() })
      .eq("stripe_customer", customer);
    if (error) throw error;
  }
}

Deno.serve(async (req) => {
  const signature = req.headers.get("stripe-signature");
  if (!signature) return new Response("Chybí podpis", { status: 400 });

  let event: Stripe.Event;
  try {
    const body = await req.text();
    event = await stripe.webhooks.constructEventAsync(body, signature, webhookSecret);
  } catch (err) {
    console.error("Neplatný podpis", err);
    return new Response("Neplatný podpis", { status: 400 });
  }

  try {
    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      const userId = session.client_reference_id;
      if (session.mode === "subscription" && session.subscription && userId) {
        const sub = await stripe.subscriptions.retrieve(session.subscription as string);
        await saveSubscription(sub, userId);
      }
    } else if (
      event.type === "customer.subscription.updated" ||
      event.type === "customer.subscription.deleted"
    ) {
      await saveSubscription(event.data.object as Stripe.Subscription, null);
    }
  } catch (err) {
    console.error(err);
    return new Response("Chyba serveru", { status: 500 });
  }

  return new Response(JSON.stringify({ received: true }), {
    headers: { "Content-Type": "application/json" },
  });
});
