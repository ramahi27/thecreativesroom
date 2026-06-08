import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useSubscription } from "@/hooks/useSubscription";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { PageMeta } from "@/components/PageMeta";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Check, Zap } from "lucide-react";

const FREE_FEATURES = [
  "Browse the full archive",
  "Save unlimited references",
  "3 AI brief matches per day",
  "Up to 5 folders",
];

const PRO_FEATURES = [
  "Everything in Free",
  "50 AI brief matches per day",
  "Unlimited folders",
  "Early access to new features",
];

const Pricing = () => {
  const { user } = useAuth();
  const { isPro } = useSubscription();
  const navigate = useNavigate();
  const [interval, setInterval] = useState<"monthly" | "yearly">("monthly");
  const [loading, setLoading] = useState(false);

  async function handleUpgrade() {
    if (!user) {
      navigate("/auth?next=/pricing");
      return;
    }
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-checkout-session`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session?.access_token}`,
          },
          body: JSON.stringify({ interval }),
        },
      );
      const json = await res.json();
      if (!res.ok || !json.url) throw new Error(json.error || "Could not start checkout.");
      window.location.href = json.url;
    } catch (err: any) {
      toast.error(err.message);
      setLoading(false);
    }
  }

  const monthlyPrice = 7.99;
  const yearlyPrice = 69.42;
  const yearlySaving = Math.round(100 - (yearlyPrice / (monthlyPrice * 12)) * 100);

  return (
    <div className="min-h-screen grain flex flex-col">
      <PageMeta
        title="Pricing — The Creatives Room"
        description="Upgrade to Pro and unlock 50 AI brief matches per day plus unlimited folders."
      />
      <SiteHeader />

      <main className="container flex-1 py-16 md:py-24 max-w-4xl">
        {/* Header */}
        <div className="text-center mb-12">
          <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-primary mb-3">⏵ Pricing</p>
          <h1 className="font-display text-5xl md:text-6xl font-black tracking-tighter mb-4">
            Simple pricing
          </h1>
          <p className="text-muted-foreground font-body max-w-md mx-auto">
            Free forever for browsing. Upgrade when you need the full creative toolkit.
          </p>
        </div>

        {/* Interval toggle */}
        <div className="flex items-center justify-center gap-2 mb-10">
          <button
            type="button"
            onClick={() => setInterval("monthly")}
            className={`font-mono text-[10px] uppercase tracking-[0.3em] px-4 py-2 rounded-full border transition-colors ${
              interval === "monthly"
                ? "border-primary text-primary bg-primary/5"
                : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/30"
            }`}
          >
            Monthly
          </button>
          <button
            type="button"
            onClick={() => setInterval("yearly")}
            className={`font-mono text-[10px] uppercase tracking-[0.3em] px-4 py-2 rounded-full border transition-colors relative ${
              interval === "yearly"
                ? "border-primary text-primary bg-primary/5"
                : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/30"
            }`}
          >
            Yearly
            <span className="absolute -top-2.5 -right-2 font-mono text-[8px] bg-primary text-primary-foreground px-1.5 py-0.5 rounded-full uppercase tracking-wider">
              -{yearlySaving}%
            </span>
          </button>
        </div>

        {/* Cards */}
        <div className="grid md:grid-cols-2 gap-5">
          {/* Free */}
          <div className="rounded-2xl border hairline p-8">
            <p className="font-mono text-[9px] uppercase tracking-[0.3em] text-muted-foreground mb-1">Free</p>
            <p className="font-display text-4xl font-black tracking-tighter mb-1">$0</p>
            <p className="font-body text-sm text-muted-foreground mb-8">For browsing and saving references.</p>

            <ul className="space-y-3 mb-8">
              {FREE_FEATURES.map((f) => (
                <li key={f} className="flex items-start gap-3">
                  <Check className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                  <span className="font-body text-sm text-muted-foreground">{f}</span>
                </li>
              ))}
            </ul>

            <Button
              variant="outline"
              className="w-full rounded-full font-mono text-[10px] uppercase tracking-widest"
              disabled
            >
              {isPro ? "Previous plan" : "Current plan"}
            </Button>
          </div>

          {/* Pro */}
          <div className="rounded-2xl border border-primary/50 p-8 bg-primary/[0.03] relative overflow-hidden">
            <div className="absolute top-4 right-4 flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-widest text-primary bg-primary/10 px-2.5 py-1 rounded-full">
              <Zap className="h-2.5 w-2.5" strokeWidth={2} /> Pro
            </div>
            <p className="font-mono text-[9px] uppercase tracking-[0.3em] text-primary mb-1">Pro</p>
            <div className="mb-1">
              <span className="font-display text-4xl font-black tracking-tighter">
                ${interval === "monthly" ? monthlyPrice.toFixed(2) : (yearlyPrice / 12).toFixed(2)}
              </span>
              <span className="font-mono text-xs text-muted-foreground ml-2">/mo</span>
            </div>
            {interval === "yearly" ? (
              <p className="font-body text-sm text-muted-foreground mb-8">
                Billed ${yearlyPrice.toFixed(2)}/year — save {yearlySaving}%.
              </p>
            ) : (
              <p className="font-body text-sm text-muted-foreground mb-8">For the full creative toolkit.</p>
            )}

            <ul className="space-y-3 mb-8">
              {PRO_FEATURES.map((f) => (
                <li key={f} className="flex items-start gap-3">
                  <Check className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                  <span className="font-body text-sm">{f}</span>
                </li>
              ))}
            </ul>

            {isPro ? (
              <Button
                variant="outline"
                className="w-full rounded-full font-mono text-[10px] uppercase tracking-widest border-primary/40"
                disabled
              >
                Current plan
              </Button>
            ) : (
              <Button
                onClick={handleUpgrade}
                disabled={loading}
                className="w-full rounded-full font-mono text-[10px] uppercase tracking-widest"
              >
                {loading ? "Redirecting…" : "Upgrade to Pro"}
              </Button>
            )}
          </div>
        </div>

        <p className="text-center font-mono text-[9px] uppercase tracking-widest text-muted-foreground/60 mt-8">
          Payments processed securely by Stripe · Cancel anytime
        </p>
      </main>

      <SiteFooter />
    </div>
  );
};

export default Pricing;
