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

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return new Response("Unauthorized", { status: 401, headers: cors });

  const token = authHeader.replace("Bearer ", "");
  const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
  if (authErr || !user) return new Response("Unauthorized", { status: 401, headers: cors });

  const { interval } = await req.json();
  const priceId = interval === "yearly"
    ? Deno.env.get("STRIPE_PRICE_YEARLY")
    : Deno.env.get("STRIPE_PRICE_MONTHLY");

  if (!priceId) {
    return Response.json({ error: "Price not configured." }, { status: 500, headers: cors });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("username")
    .eq("user_id", user.id)
    .single();

  const { data: billing } = await supabase
    .from("billing_customers")
    .select("stripe_customer_id")
    .eq("user_id", user.id)
    .maybeSingle();

  let customerId = (billing as any)?.stripe_customer_id as string | undefined;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email,
      name: profile?.username,
      metadata: { supabase_user_id: user.id },
    });
    customerId = customer.id;
    await supabase
      .from("billing_customers")
      .upsert({ user_id: user.id, stripe_customer_id: customerId } as any, { onConflict: "user_id" });
  }

  const origin = req.headers.get("origin") || "https://thecreativesroom.com";
  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: "subscription",
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${origin}/account/edit?checkout=success`,
    cancel_url: `${origin}/pricing`,
    metadata: { supabase_user_id: user.id },
    allow_promotion_codes: true,
  });

  return Response.json({ url: session.url }, { headers: cors });
});
