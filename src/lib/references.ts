export type RefType = "image" | "video" | "link";

export interface Reference {
  id: string;
  title: string;
  type: RefType;
  media_url: string | null;
  source_url: string | null;
  thumbnail_url: string | null;
  brand: string | null;
  agency: string | null;
  year: number | null;
  tags: string[];
  notes: string | null;
  created_at: string;
}

/** Extract a thumbnail URL from common video platform links */
export function deriveThumbnail(url: string): string | null {
  try {
    const u = new URL(url);
    // YouTube
    if (u.hostname.includes("youtube.com")) {
      const id = u.searchParams.get("v");
      if (id) return `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
    }
    if (u.hostname === "youtu.be") {
      const id = u.pathname.slice(1);
      if (id) return `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
    }
    // Vimeo - needs API; skip for now
    return null;
  } catch {
    return null;
  }
}

export function detectPlatform(url: string | null): string | null {
  if (!url) return null;
  try {
    const h = new URL(url).hostname.replace("www.", "");
    if (h.includes("youtube") || h === "youtu.be") return "YouTube";
    if (h.includes("vimeo")) return "Vimeo";
    if (h.includes("instagram")) return "Instagram";
    if (h.includes("tiktok")) return "TikTok";
    return h;
  } catch {
    return null;
  }
}
