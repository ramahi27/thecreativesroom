import { Globe, Lock, Share2 } from "lucide-react";
import { toast } from "sonner";
import { folderShareUrl } from "@/lib/username";

interface Props {
  isPublic: boolean;
  onToggle: () => void;
  username?: string | null;
  folderId: string;
  size?: "sm" | "md";
}

export function FolderVisibilityToggle({ isPublic, onToggle, username, folderId, size = "sm" }: Props) {
  const px = size === "sm" ? "px-2 py-1" : "px-2.5 py-1.5";
  const handleShare = async (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (!username) {
      toast.error("Set a username in your account first.");
      return;
    }
    if (!isPublic) {
      toast.error("Make this folder public to share it.");
      return;
    }
    const url = folderShareUrl(username, folderId);
    try {
      if (navigator.share) {
        await navigator.share({ url, title: "Collection — The Creatives Room" });
        return;
      }
    } catch {}
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Share link copied");
    } catch {
      toast.error("Could not copy link");
    }
  };

  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          onToggle();
        }}
        title={isPublic ? "Public — click to make private" : "Private — click to make public"}
        className={`inline-flex items-center gap-1.5 ${px} border hairline font-mono text-[10px] uppercase tracking-widest transition-colors ${
          isPublic
            ? "bg-primary/10 text-primary border-primary/30 hover:bg-primary/20"
            : "bg-secondary text-muted-foreground hover:text-foreground"
        }`}
      >
        {isPublic ? <Globe className="h-3 w-3" strokeWidth={1.8} /> : <Lock className="h-3 w-3" strokeWidth={1.8} />}
        {isPublic ? "Public" : "Private"}
      </button>
      <button
        type="button"
        onClick={handleShare}
        disabled={!isPublic}
        title="Copy share link"
        className={`inline-flex items-center justify-center h-[26px] w-[26px] border hairline transition-colors ${
          isPublic ? "hover:bg-secondary text-foreground" : "opacity-40 cursor-not-allowed text-muted-foreground"
        }`}
      >
        <Share2 className="h-3 w-3" strokeWidth={1.8} />
      </button>
    </div>
  );
}
