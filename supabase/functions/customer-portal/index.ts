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
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return new Response("Unauthorized", { status: 401, headers: cors });

  const { data: billing } = await supabase
    .from("billing_customers")
    .select("stripe_customer_id")
    .eq("user_id", user.id)
    .maybeSingle();

  const customerId = (billing as any)?.stripe_customer_id as string | undefined;
  if (!customerId) {
    return Response.json({ error: "No billing account found." }, { status: 404, headers: cors });
  }

  const { returnUrl } = await req.json().catch(() => ({}));
  const ALLOWED_ORIGINS = [
    "https://thecreativesroom.com",
    "https://www.thecreativesroom.com",
    "https://thecreativesroom.lovable.app",
  ];
  const isSafeReturnUrl = typeof returnUrl === "string"
    && ALLOWED_ORIGINS.some((origin) => returnUrl === origin || returnUrl.startsWith(origin + "/"));
  const safeReturnUrl = isSafeReturnUrl ? returnUrl : "https://thecreativesroom.com/account/edit";

  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: safeReturnUrl,
  });

  return Response.json({ url: session.url }, { headers: cors });
});
