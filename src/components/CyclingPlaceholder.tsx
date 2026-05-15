import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";

const EXAMPLES = [
  "e.g. I'm looking for a luxury fragrance commercial with a dark, cinematic, intimate tone",
  "e.g. A playful soda brand ad with bright colors and fast cuts",
  "e.g. Minimalist skincare photography with soft natural light",
  "e.g. An emotional car commercial with a father-daughter story",
  "e.g. High-energy sports ad with urban street culture vibes",
];

export function CyclingPlaceholder({
  active,
  className,
}: {
  active: boolean;
  className?: string;
}) {
  const [index, setIndex] = useState(0);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    if (!active) return;
    const interval = setInterval(() => {
      setVisible(false);
      const timeout = setTimeout(() => {
        setIndex((i) => (i + 1) % EXAMPLES.length);
        setVisible(true);
      }, 400);
      return () => clearTimeout(timeout);
    }, 3500);
    return () => clearInterval(interval);
  }, [active]);

  if (!active) return null;

  return (
    <div
      className={cn(
        "pointer-events-none absolute inset-0 z-10 flex items-start overflow-hidden",
        className
      )}
    >
      <div className="px-3 py-3 pr-9 font-mono text-sm leading-snug text-muted-foreground/60 select-none">
        <div>What do you need references for?</div>
        <div className={cn("transition-opacity duration-500", visible ? "opacity-100" : "opacity-0")}>
          {EXAMPLES[index]}
        </div>
      </div>
    </div>
  );
}
