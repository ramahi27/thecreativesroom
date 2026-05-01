import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";

const STORAGE_KEY = "tcr-cookie-consent";

export function CookieConsent() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      if (!localStorage.getItem(STORAGE_KEY)) {
        setVisible(true);
      }
    } catch {
      setVisible(true);
    }
  }, []);

  const decide = (value: "accepted" | "declined") => {
    try {
      localStorage.setItem(STORAGE_KEY, value);
    } catch {
      // ignore
    }
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div
      role="dialog"
      aria-live="polite"
      aria-label="Cookie consent"
      className="fixed inset-x-0 bottom-0 z-50 px-4 pb-4 md:px-6 md:pb-6"
    >
      <div className="mx-auto max-w-4xl rounded-md border border-border bg-background/95 backdrop-blur-md shadow-lg p-5 md:p-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="space-y-1.5 max-w-2xl">
          <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-primary">
            ⏵ Cookies
          </p>
          <p className="font-mono text-[12px] leading-relaxed text-muted-foreground">
            We use essential cookies to keep you signed in and a small amount
            of anonymous analytics to understand which references resonate.
            See our{" "}
            <Link to="/privacy" className="underline hover:text-foreground">
              Privacy Policy
            </Link>{" "}
            for details.
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <Button
            variant="outline"
            onClick={() => decide("declined")}
            className="font-mono text-[11px] uppercase tracking-widest h-10"
          >
            Decline
          </Button>
          <Button
            onClick={() => decide("accepted")}
            className="font-mono text-[11px] uppercase tracking-widest h-10"
          >
            Accept
          </Button>
        </div>
      </div>
    </div>
  );
}
