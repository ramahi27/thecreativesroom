import { useEffect, useState } from "react";
import { ArrowUp } from "lucide-react";

export function BackToTop() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > 600);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  if (!visible) return null;

  return (
    <button
      type="button"
      onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
      aria-label="Back to top"
      className="fixed bottom-6 right-6 z-50 group flex items-center gap-2 border hairline bg-background/95 backdrop-blur-xl px-4 py-3 font-mono text-[10px] uppercase tracking-[0.25em] text-foreground shadow-lg hover:bg-secondary transition-colors animate-fade-in"
    >
      <ArrowUp className="h-3.5 w-3.5" strokeWidth={1.5} />
      Back to top
    </button>
  );
}
