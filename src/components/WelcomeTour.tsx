import { useState, useEffect } from "react";
import { X, ArrowRight, ArrowLeft } from "lucide-react";

const STORAGE_KEY = "tcr_tour_seen_v1";

const STEPS = [
  {
    title: "Welcome to The Creatives Room.",
    body: "A curated archive of ad films, campaigns, and photography references — built for creatives who care about craft.",
    emoji: "⏵",
  },
  {
    title: "Match your brief instantly.",
    body: "Describe what you're making — 'bold car commercial, cinematic' — and the AI surfaces the most relevant references from the entire archive in seconds.",
    emoji: "✦",
  },
  {
    title: "Browse and filter.",
    body: "Filter by type (video, image, campaign), category, or sort by newest. Every card links directly to the original source.",
    emoji: "◈",
  },
  {
    title: "Dive into the detail.",
    body: "Click any card to open the full reference — watch the video in-page, read the creative notes, and explore related work.",
    emoji: "▣",
  },
  {
    title: "Save what inspires you.",
    body: "Bookmark references and organise them into folders. Build mood boards for your next pitch, campaign, or presentation.",
    emoji: "◎",
  },
];

export function WelcomeTour() {
  const [step, setStep] = useState(0);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!localStorage.getItem(STORAGE_KEY)) {
      // Short delay so page paints first
      const t = setTimeout(() => setVisible(true), 800);
      return () => clearTimeout(t);
    }
  }, []);

  function dismiss() {
    localStorage.setItem(STORAGE_KEY, "1");
    setVisible(false);
  }

  function next() {
    if (step < STEPS.length - 1) setStep((s) => s + 1);
    else dismiss();
  }

  function prev() {
    setStep((s) => Math.max(0, s - 1));
  }

  if (!visible) return null;

  const s = STEPS[step];
  const isLast = step === STEPS.length - 1;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[90] bg-black/40 backdrop-blur-[2px]"
        onClick={dismiss}
      />

      {/* Card */}
      <div
        className="fixed z-[91] bottom-6 right-6 w-[calc(100vw-3rem)] max-w-sm"
        style={{ animation: "cardIn 0.35s cubic-bezier(0.22,1,0.36,1) both" }}
      >
        <div className="bg-card border hairline rounded-2xl shadow-2xl shadow-black/60 p-6 space-y-5">
          {/* Header */}
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <span className="font-mono text-base text-primary leading-none">{s.emoji}</span>
              <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
                {step + 1} / {STEPS.length}
              </span>
            </div>
            <button
              onClick={dismiss}
              className="text-muted-foreground hover:text-foreground transition-colors -mt-0.5 -mr-1 p-1"
              aria-label="Skip tour"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Progress bar */}
          <div className="h-0.5 bg-secondary rounded-full overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all duration-300"
              style={{ width: `${((step + 1) / STEPS.length) * 100}%` }}
            />
          </div>

          {/* Content */}
          <div className="space-y-2" key={step} style={{ animation: "fadeUp 0.25s ease both" }}>
            <h3 className="font-display text-xl font-black tracking-tighter leading-tight">
              {s.title}
            </h3>
            <p className="font-body text-sm text-muted-foreground leading-relaxed">
              {s.body}
            </p>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between pt-1">
            <button
              onClick={dismiss}
              className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground/50 hover:text-muted-foreground transition-colors"
            >
              Skip
            </button>
            <div className="flex items-center gap-2">
              {step > 0 && (
                <button
                  onClick={prev}
                  className="flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-widest text-muted-foreground hover:text-foreground transition-colors px-3 py-1.5 border hairline rounded-lg"
                >
                  <ArrowLeft className="h-3 w-3" />
                  Back
                </button>
              )}
              <button
                onClick={next}
                className="flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-widest bg-primary text-primary-foreground hover:opacity-90 transition-opacity px-4 py-1.5 rounded-lg"
              >
                {isLast ? "Let's go" : "Next"}
                {!isLast && <ArrowRight className="h-3 w-3" />}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
