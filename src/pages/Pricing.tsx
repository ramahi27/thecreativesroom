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
import { Check, Zap, Lock, RefreshCw, HelpCircle } from "lucide-react";

const FREE_FEATURES = [
  "Browse the full reference archive",
  "Save unlimited references",
  "3 AI brief matches per day",
  "Up to 5 folders",
];

const PRO_FEATURES = [
  { label: "Everything in Free" },
  { label: "Unlimited AI brief matches", note: true },
  { label: "Unlimited folders" },
  { label: "Download images & videos (coming soon)" },
  { label: "Invite collaborators to folders" },
  { label: "Early access to new features" },
];

const FAQ = [
  {
    icon: RefreshCw,
    q: "Cancel anytime?",
    a: "Yes. No lock-in - cancel from your account settings and you keep Pro until the period ends.",
  },
  {
    icon: Lock,
    q: "Is payment secure?",
    a: "All payments are processed by Stripe. We never store your card details.",
  },
  {
    icon: HelpCircle,
    q: "What's the fair use limit?",
    a: "Unlimited means we don't count - but to keep the service fast for everyone, we apply a soft cap of 50 AI brief matches per day. If you need more, reach out and we're happy to give you extra credits at no cost.",
  },
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
  const displayPrice = interval === "monthly" ? monthlyPrice.toFixed(2) : (yearlyPrice / 12).toFixed(2);

  return (
    <div className="min-h-screen grain flex flex-col">
      <PageMeta
        title="Pricing — The Creatives Room"
        description="Upgrade to Pro and unlock unlimited AI brief matches plus unlimited folders."
      />
      <SiteHeader />

      <main className="flex-1">
        {/* Hero */}
        <section className="container max-w-3xl py-20 md:py-28 text-center">
          <p className="font-mono text-[10px] uppercase tracking-[0.35em] text-primary mb-5">⏵ Pricing</p>
          <h1 className="font-display text-5xl md:text-7xl font-black tracking-tighter mb-5 leading-none">
            Simple pricing.
            <br />
            <span className="text-muted-foreground/50">No surprises.</span>
          </h1>
          <p className="font-body text-base text-muted-foreground max-w-sm mx-auto leading-relaxed">
            Free forever for browsing. Upgrade when the archive becomes part of your workflow.
          </p>
        </section>

        {/* Billing toggle */}
        <div className="flex items-center justify-center gap-2 mb-12">
          <div className="flex items-center gap-1 p-1 rounded-full bg-secondary border hairline">
            <button
              type="button"
              onClick={() => setInterval("monthly")}
              className={`font-mono text-[10px] uppercase tracking-[0.25em] px-4 py-1.5 rounded-full transition-all ${
                interval === "monthly"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Monthly
            </button>
            <button
              type="button"
              onClick={() => setInterval("yearly")}
              className={`font-mono text-[10px] uppercase tracking-[0.25em] px-4 py-1.5 rounded-full transition-all relative ${
                interval === "yearly"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Yearly
              <span className="absolute -top-2.5 -right-1 font-mono text-[8px] bg-primary text-primary-foreground px-1.5 py-0.5 rounded-full uppercase tracking-wider leading-none">
                -{yearlySaving}%
              </span>
            </button>
          </div>
        </div>

        {/* Cards */}
        <div className="container max-w-3xl">
          <div className="grid md:grid-cols-2 gap-4">

            {/* Free */}
            <div className="rounded-3xl border hairline p-8 flex flex-col">
              <div className="mb-8">
                <p className="font-mono text-[9px] uppercase tracking-[0.35em] text-muted-foreground mb-4">Free</p>
                <div className="flex items-end gap-2 mb-2">
                  <span className="font-display text-5xl font-black tracking-tighter">$0</span>
                </div>
                <p className="font-body text-sm text-muted-foreground">For casual browsing and saving.</p>
              </div>

              <ul className="space-y-3.5 mb-8 flex-1">
                {FREE_FEATURES.map((f) => (
                  <li key={f} className="flex items-start gap-3">
                    <Check className="h-4 w-4 text-muted-foreground/60 shrink-0 mt-0.5" strokeWidth={2.5} />
                    <span className="font-body text-sm text-muted-foreground">{f}</span>
                  </li>
                ))}
              </ul>

              <Button
                variant="outline"
                className="w-full rounded-full font-mono text-[10px] uppercase tracking-widest h-11"
                disabled
              >
                {isPro ? "Previous plan" : "Current plan"}
              </Button>
            </div>

            {/* Pro */}
            <div className="rounded-3xl border border-primary/30 p-8 flex flex-col relative overflow-hidden bg-gradient-to-br from-primary/[0.07] via-transparent to-transparent shadow-[0_0_80px_-20px] shadow-primary/25">
              {/* Glow blob */}
              <div className="pointer-events-none absolute -top-12 -right-12 h-40 w-40 rounded-full bg-primary/20 blur-3xl" />

              <div className="mb-8 relative">
                <div className="flex items-center justify-between mb-4">
                  <p className="font-mono text-[9px] uppercase tracking-[0.35em] text-primary">Pro</p>
                  <span className="flex items-center gap-1 font-mono text-[9px] uppercase tracking-widest text-primary bg-primary/15 px-2.5 py-1 rounded-full">
                    <Zap className="h-2.5 w-2.5" strokeWidth={2.5} fill="currentColor" />
                    Best value
                  </span>
                </div>
                <div className="flex items-end gap-2 mb-2">
                  <span className="font-display text-5xl font-black tracking-tighter">${displayPrice}</span>
                  <span className="font-mono text-xs text-muted-foreground mb-1.5">/mo</span>
                </div>
                {interval === "yearly" ? (
                  <p className="font-body text-sm text-muted-foreground">
                    Billed ${yearlyPrice.toFixed(2)}/year - {yearlySaving}% off.
                  </p>
                ) : (
                  <p className="font-body text-sm text-muted-foreground">For power users and professionals.</p>
                )}
              </div>

              <ul className="space-y-3.5 mb-8 flex-1 relative">
                {PRO_FEATURES.map(({ label, note }) => (
                  <li key={label} className="flex items-start gap-3">
                    <Check className="h-4 w-4 text-primary shrink-0 mt-0.5" strokeWidth={2.5} />
                    <span className="font-body text-sm">
                      {label}
                      {note && <sup className="font-mono text-[8px] ml-0.5 text-muted-foreground">*</sup>}
                    </span>
                  </li>
                ))}
              </ul>

              {isPro ? (
                <Button
                  variant="outline"
                  className="w-full rounded-full font-mono text-[10px] uppercase tracking-widest border-primary/30 h-11"
                  disabled
                >
                  Current plan
                </Button>
              ) : (
                <Button
                  onClick={handleUpgrade}
                  disabled={loading}
                  className="w-full rounded-full font-mono text-[10px] uppercase tracking-widest h-11"
                >
                  {loading ? "Redirecting…" : user ? "Upgrade to Pro" : "Get started"}
                </Button>
              )}
            </div>
          </div>

        </div>

        {/* FAQ */}
        <div className="container max-w-5xl mt-20 mb-4">
          <div className="grid md:grid-cols-3 gap-px bg-border rounded-3xl overflow-hidden border hairline">
            {FAQ.map(({ icon: Icon, q, a }) => (
              <div key={q} className="bg-background p-7">
                <Icon className="h-4 w-4 text-muted-foreground mb-4" strokeWidth={1.5} />
                <p className="font-body text-sm font-semibold mb-2">{q}</p>
                <p className="font-body text-sm text-muted-foreground leading-relaxed">{a}</p>
              </div>
            ))}
          </div>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
};

export default Pricing;
