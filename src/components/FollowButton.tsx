import { Heart } from "lucide-react";
import { useMyFollows } from "@/hooks/useFollows";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

interface Props {
  folderId: string;
  ownerUserId?: string;
  size?: "sm" | "md";
  className?: string;
}

export function FollowButton({ folderId, ownerUserId, size = "md", className }: Props) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { isFollowing, follow, unfollow } = useMyFollows();

  if (user && ownerUserId && user.id === ownerUserId) return null;

  const following = isFollowing(folderId);
  const sizeClass = size === "sm" ? "px-2 py-1 text-[9px]" : "px-3 py-1.5 text-[10px]";

  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!user) {
          toast.error("Sign in to follow collections.");
          navigate("/auth");
          return;
        }
        if (following) unfollow(folderId);
        else {
          follow(folderId);
          toast.success("Following");
        }
      }}
      className={`inline-flex items-center gap-1.5 border hairline font-mono uppercase tracking-widest transition-colors ${sizeClass} ${
        following
          ? "bg-foreground text-background border-foreground"
          : "bg-background hover:bg-secondary"
      } ${className || ""}`}
    >
      <Heart
        className={size === "sm" ? "h-2.5 w-2.5" : "h-3 w-3"}
        strokeWidth={1.8}
        fill={following ? "currentColor" : "none"}
      />
      {following ? "Following" : "Follow"}
    </button>
  );
}
