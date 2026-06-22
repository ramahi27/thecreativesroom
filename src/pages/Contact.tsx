import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { PageMeta } from "@/components/PageMeta";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { MessageSquare, Lightbulb, Bug, CheckCircle2 } from "lucide-react";

const TYPES = [
  { value: "question",   label: "Question",   icon: MessageSquare },
  { value: "suggestion", label: "Suggestion", icon: Lightbulb },
  { value: "bug",        label: "Bug report",  icon: Bug },
] as const;

type FeedbackType = typeof TYPES[number]["value"];

const Contact = () => {
  const { user } = useAuth();
  const [type, setType]       = useState<FeedbackType>("suggestion");
  const [message, setMessage] = useState("");
  const [email, setEmail]     = useState(user?.email ?? "");
  useEffect(() => { if (user?.email) setEmail(user.email); }, [user?.email]);
  const [loading, setLoading] = useState(false);
  const [sent, setSent]       = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!message.trim()) return;
    setLoading(true);
    // RLS: logged-in users may only store their own auth email; anonymous
    // submissions store no email — the reply-to address rides in the message.
    const replyTo = email.trim();
    const { error } = await supabase.from("feedback").insert(
      user
        ? {
            type,
            message: message.trim(),
            email: user.email ?? null,
            user_id: user.id,
          }
        : {
            type,
            message: replyTo
              ? `${message.trim()}\n\n[Reply-to: ${replyTo}]`
              : message.trim(),
            email: null,
            user_id: null,
          }
    );
    setLoading(false);
    if (error) {
      toast.error("Something went wrong. Please try again.");
      return;
    }
    setSent(true);
  }

  return (
    <div className="min-h-screen grain flex flex-col">
      <PageMeta
        title="Contact - The Creatives Room"
        description="Send us a question, suggestion, or bug report."
        path="/contact"
      />
      <SiteHeader />

      <main className="flex-1 container max-w-xl py-20 md:py-28">
        <p className="font-mono text-[10px] uppercase tracking-[0.35em] text-primary mb-5">⏵ Contact</p>
        <h1 className="font-display text-5xl md:text-6xl font-black tracking-tighter mb-4 leading-none">
          Say hello.
        </h1>
        <p className="font-body text-base text-muted-foreground mb-12 leading-relaxed">
          Questions, suggestions, something broken? We read every message.
        </p>

        {sent ? (
          <div className="flex flex-col items-start gap-4 py-10">
            <CheckCircle2 className="h-8 w-8 text-primary" strokeWidth={1.5} />
            <p className="font-display text-2xl font-bold tracking-tight">Got it, thanks.</p>
            <p className="font-body text-base text-muted-foreground">
              We'll be in touch if needed.
            </p>
            <Button
              variant="outline"
              className="mt-2 rounded-full font-mono text-[10px] uppercase tracking-widest h-10"
              onClick={() => { setSent(false); setMessage(""); }}
            >
              Send another
            </Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Type selector */}
            <div className="flex gap-2">
              {TYPES.map(({ value, label, icon: Icon }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setType(value)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-full border font-mono text-[10px] uppercase tracking-widest transition-all ${
                    type === value
                      ? "bg-primary text-primary-foreground border-primary"
                      : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/30"
                  }`}
                >
                  <Icon className="h-3 w-3" strokeWidth={2} />
                  {label}
                </button>
              ))}
            </div>

            {/* Message */}
            <div className="space-y-2">
              <label className="font-mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
                Message
              </label>
              <Textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="What's on your mind?"
                required
                rows={6}
                className="resize-none rounded-2xl font-body text-base"
              />
            </div>

            {/* Email */}
            <div className="space-y-2">
              <label className="font-mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
                Email {!user && <span className="normal-case tracking-normal">(optional)</span>}
              </label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="rounded-2xl font-body text-base"
              />
              {!user && (
                <p className="font-mono text-[10px] text-muted-foreground/60">
                  Only needed if you'd like a reply.
                </p>
              )}
            </div>

            <Button
              type="submit"
              disabled={loading || !message.trim()}
              className="w-full rounded-full font-mono text-[10px] uppercase tracking-widest h-11"
            >
              {loading ? "Sending…" : "Send message"}
            </Button>
          </form>
        )}
      </main>

      <SiteFooter />
    </div>
  );
};

export default Contact;
