import { cn } from "@/lib/utils";

const EXAMPLE = "e.g. A playful soda brand ad with bright colors and fast cuts";

export function CyclingPlaceholder({
  active,
  className,
}: {
  active: boolean;
  className?: string;
}) {
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
        <div>{EXAMPLE}</div>
      </div>
    </div>
  );
}
