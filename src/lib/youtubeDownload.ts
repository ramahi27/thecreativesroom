// YouTube download via our Cloudflare Worker proxy.
// The Worker fetches the video server-side (no CORS/merge problems) and streams
// a finished MP4 back with Content-Disposition: attachment.

const DOWNLOAD_PROXY = "https://tcr-download.r-laith27.workers.dev/";

export function extractYouTubeId(url: string): string | null {
  for (const p of [
    /[?&]v=([a-zA-Z0-9_-]{11})/,
    /youtu\.be\/([a-zA-Z0-9_-]{11})/,
    /embed\/([a-zA-Z0-9_-]{11})/,
    /shorts\/([a-zA-Z0-9_-]{11})/,
  ]) {
    const m = url.match(p);
    if (m) return m[1];
  }
  return null;
}

/** Downloads a YouTube video as an MP4 blob via the Worker proxy. */
export async function downloadYouTubeVideo(
  sourceUrl: string,
  onStatus: (s: string) => void = () => {},
): Promise<Blob> {
  onStatus("Fetching video…");
  const res = await fetch(DOWNLOAD_PROXY, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url: sourceUrl }),
  });

  if (!res.ok) {
    let msg = "Video unavailable.";
    try {
      const data = await res.json();
      if (data?.error) msg = data.error;
    } catch { /* ignore */ }
    throw new Error(msg);
  }

  onStatus("Downloading…");
  return await res.blob();
}
