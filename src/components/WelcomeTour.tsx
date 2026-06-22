import { useState, useEffect } from "react";
import { X } from "lucide-react";

const STORAGE_KEY = "tcr_tour_seen_v1";

export function WelcomeTour() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!localStorage.getItem(STORAGE_KEY)) {
      const t = setTimeout(() => setVisible(true), 600);
      return () => clearTimeout(t);
    }
  }, []);

  function dismiss() {
    localStorage.setItem(STORAGE_KEY, "1");
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <>
      <div className="fixed inset-0 z-[90] bg-black/60 backdrop-blur-sm" onClick={dismiss} />
      <div
        className="fixed z-[91] inset-0 flex items-center justify-center p-6 pointer-events-none"
      >
        <div
          className="pointer-events-auto w-full max-w-md bg-card border hairline rounded-2xl shadow-2xl shadow-black/80 p-8 space-y-5"
          style={{ animation: "fadeUp 0.4s cubic-bezier(0.22,1,0.36,1) both" }}
        >
          <button
            onClick={dismiss}
            className="absolute top-5 right-5 text-muted-foreground hover:text-foreground transition-colors p-1"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>

          <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-primary">⏵ The Creatives Room</p>

          <h2 className="font-display text-3xl font-black tracking-tighter leading-tight">
            Welcome to the archive.
          </h2>

          <p className="font-body text-sm text-muted-foreground leading-relaxed">
            A curated library of ad films, campaigns, and photography references for creatives.
            Search by brief, filter by category, save what inspires you.
          </p>

          <button
            onClick={dismiss}
            className="w-full font-mono text-xs uppercase tracking-widest bg-primary text-primary-foreground hover:opacity-90 transition-opacity py-3 rounded-xl"
          >
            Explore the archive
          </button>
        </div>
      </div>
    </>
  );
}
