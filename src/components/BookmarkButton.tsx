import { Bookmark } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { useBookmarks } from "@/hooks/useBookmarks";
import { cn } from "@/lib/utils";

interface Props {
  referenceId: string;
  variant?: "card" | "detail";
  className?: string;
}

export function BookmarkButton({ referenceId, variant = "card", className }: Props) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { isBookmarked, toggle } = useBookmarks();
  const active = isBookmarked(referenceId);

  async function handleClick(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!user) {
      toast.message("Sign in to save", {
        description: "Save your favorite references to your collection.",
        action: { label: "Sign in", onClick: () => navigate("/auth") },
      });
      return;
    }
    const wasActive = active;
    const { error } = await toggle(referenceId);
    if (error) toast.error(error);
    else toast.success(wasActive ? "Removed from your collection" : "Saved to your collection");
  }

  if (variant === "detail") {
    return (
      <button
        onClick={handleClick}
        className={cn(
          "inline-flex items-center gap-2 px-4 py-2 border hairline font-mono text-[11px] uppercase tracking-widest transition-colors",
          active
            ? "bg-primary text-primary-foreground border-primary"
            : "hover:bg-secondary",
          className,
        )}
        aria-pressed={active}
        aria-label={active ? "Remove from collection" : "Add to collection"}
      >
        <Bookmark className={cn("h-3.5 w-3.5", active && "fill-current")} strokeWidth={1.75} />
        {active ? "Saved" : "Add to My Collection"}
      </button>
    );
  }

  return (
    <button
      onClick={handleClick}
      aria-pressed={active}
      aria-label={active ? "Remove from collection" : "Add to collection"}
      className={cn(
        "absolute z-10 h-8 w-8 flex items-center justify-center rounded-full backdrop-blur-md transition-all",
        "top-12 left-3 opacity-100",
        "md:top-3 md:right-3 md:left-auto md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100",
        active
          ? "opacity-100 bg-primary text-primary-foreground"
          : "bg-background/80 text-foreground hover:bg-background",
        className,
      )}
    >
      <Bookmark className={cn("h-4 w-4", active && "fill-current")} strokeWidth={1.75} />
    </button>
  );
}
