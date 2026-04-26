export type RefType = "image" | "video" | "link";

export interface MediaItem {
  url: string;
  kind: "image" | "video";
}

export interface Reference {
  id: string;
  title: string;
  type: RefType;
  media_url: string | null;
  media_items: MediaItem[];
  source_url: string | null;
  thumbnail_url: string | null;
  brand: string | null;
  agency: string | null;
  year: number | null;
  tags: string[];
  notes: string | null;
  created_at: string;
}

/** Returns true for video file extensions */
export function isVideoFile(url: string): boolean {
  return /\.(mp4|webm|mov|m4v|ogg)(\?|$)/i.test(url);
}

/** Build embed URL for YouTube/Vimeo links so we can play in-page */
export function getEmbedUrl(url: string | null): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    if (u.hostname.includes("youtube.com")) {
      const id = u.searchParams.get("v");
      if (id) return `https://www.youtube.com/embed/${id}`;
    }
    if (u.hostname === "youtu.be") {
      const id = u.pathname.slice(1);
      if (id) return `https://www.youtube.com/embed/${id}`;
    }
    if (u.hostname.includes("vimeo.com")) {
      const id = u.pathname.split("/").filter(Boolean).pop();
      if (id && /^\d+$/.test(id)) return `https://player.vimeo.com/video/${id}`;
    }
    return null;
  } catch {
    return null;
  }
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
