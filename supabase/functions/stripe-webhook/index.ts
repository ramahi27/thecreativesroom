import Stripe from "https://esm.sh/stripe@14?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
  apiVersion: "2023-10-16",
  httpClient: Stripe.createFetchHttpClient(),
});

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: { "Access-Control-Allow-Origin": "*" } });
  }

  const signature = req.headers.get("stripe-signature");
  if (!signature) return new Response("Missing signature", { status: 400 });

  const body = await req.text();
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(
      body,
      signature,
      Deno.env.get("STRIPE_WEBHOOK_SECRET")!,
    );
  } catch (err) {
    console.error("Webhook signature verification failed:", err);
    return new Response("Invalid signature", { status: 400 });
  }

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.mode !== "subscription") break;
      const userId = session.metadata?.supabase_user_id;
      if (!userId) break;
      await supabase
        .from("profiles")
        .update({ plan: "paid" } as any)
        .eq("user_id", userId);
      await supabase
        .from("billing_customers")
        .upsert({
          user_id: userId,
          stripe_customer_id: session.customer as string,
          stripe_subscription_id: session.subscription as string,
        } as any, { onConflict: "user_id" });
      break;
    }

    case "customer.subscription.updated": {
      const sub = event.data.object as Stripe.Subscription;
      const isActive = ["active", "trialing"].includes(sub.status);
      const { data: billing } = await supabase
        .from("billing_customers")
        .select("user_id")
        .eq("stripe_customer_id", sub.customer as string)
        .maybeSingle();
      if (!billing) break;
      await supabase
        .from("billing_customers")
        .update({ stripe_subscription_id: sub.id } as any)
        .eq("user_id", (billing as any).user_id);
      await supabase
        .from("profiles")
        .update({ plan: isActive ? "paid" : "free" } as any)
        .eq("user_id", (billing as any).user_id);
      break;
    }

    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      const { data: billing } = await supabase
        .from("billing_customers")
        .select("user_id")
        .eq("stripe_customer_id", sub.customer as string)
        .maybeSingle();
      if (!billing) break;
      await supabase
        .from("billing_customers")
        .update({ stripe_subscription_id: null } as any)
        .eq("user_id", (billing as any).user_id);
      await supabase
        .from("profiles")
        .update({ plan: "free" } as any)
        .eq("user_id", (billing as any).user_id);
      break;
    }
  }

  return new Response(JSON.stringify({ received: true }), {
    headers: { "Content-Type": "application/json" },
  });
});
