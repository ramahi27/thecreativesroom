// Fully client-side YouTube download.
// Modern YouTube serves video and audio as SEPARATE adaptive streams, so we:
//   1. Pull the best mp4 video-only + m4a audio-only tracks from Piped (CORS-enabled)
//   2. Merge them in-browser with ffmpeg.wasm (-c copy, no re-encode = fast)
//   3. Return a finished MP4 blob to download.
// No server, API key, or account required.

const PIPED_APIS = [
  "https://pipedapi.kavin.rocks",
  "https://pipedapi.adminforge.de",
  "https://api.piped.yt",
  "https://pipedapi.reallyaboring.stream",
  "https://pipedapi.leptons.xyz",
  "https://pipedapi.r4fo.com",
];

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

interface Tracks {
  videoUrl: string;
  audioUrl: string;
  combinedUrl: string | null; // some old videos still have a muxed stream
}

async function getTracks(ytId: string): Promise<Tracks> {
  for (const api of PIPED_APIS) {
    try {
      const res = await fetch(`${api}/streams/${ytId}`, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) continue;
      const data = await res.json();

      const videoStreams: any[] = data.videoStreams || [];
      const audioStreams: any[] = data.audioStreams || [];

      // Legacy muxed stream (video+audio together), if present
      const combined = videoStreams
        .filter((s) => s.videoOnly === false && (s.mimeType || "").includes("mp4"))
        .sort((a, b) => (parseInt(b.quality) || 0) - (parseInt(a.quality) || 0))[0];

      // Best mp4 (AVC) video-only track — copies cleanly into an mp4 container
      const video = videoStreams
        .filter((s) => s.videoOnly === true && (s.mimeType || "").includes("mp4"))
        .sort((a, b) => (parseInt(b.quality) || 0) - (parseInt(a.quality) || 0))[0];

      // Best m4a/aac audio-only track
      const audio = audioStreams
        .filter((s) => (s.mimeType || "").includes("mp4") || (s.mimeType || "").includes("m4a"))
        .sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0))[0]
        || audioStreams.sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0))[0];

      if (combined?.url) {
        return { videoUrl: video?.url || "", audioUrl: audio?.url || "", combinedUrl: combined.url };
      }
      if (video?.url && audio?.url) {
        return { videoUrl: video.url, audioUrl: audio.url, combinedUrl: null };
      }
    } catch {
      continue;
    }
  }
  throw new Error("All video mirrors are unavailable right now.");
}

let ffmpegPromise: Promise<any> | null = null;

async function loadFFmpeg(onStatus: (s: string) => void): Promise<any> {
  if (ffmpegPromise) return ffmpegPromise;
  ffmpegPromise = (async () => {
    onStatus("Loading converter…");
    const { FFmpeg } = await import(/* @vite-ignore */ "https://esm.sh/@ffmpeg/ffmpeg@0.12.15");
    const { toBlobURL } = await import(/* @vite-ignore */ "https://esm.sh/@ffmpeg/util@0.12.2");
    const ffmpeg = new FFmpeg();
    const base = "https://unpkg.com/@ffmpeg/core@0.12.10/dist/umd";
    await ffmpeg.load({
      coreURL: await toBlobURL(`${base}/ffmpeg-core.js`, "text/javascript"),
      wasmURL: await toBlobURL(`${base}/ffmpeg-core.wasm`, "application/wasm"),
    });
    return ffmpeg;
  })();
  return ffmpegPromise;
}

async function fetchBytes(url: string, onStatus: (s: string) => void, label: string): Promise<Uint8Array> {
  onStatus(`Downloading ${label}…`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not fetch ${label}.`);
  const buf = await res.arrayBuffer();
  return new Uint8Array(buf);
}

/** Downloads a YouTube video as a finished MP4 blob, entirely in the browser. */
export async function downloadYouTubeVideo(
  ytId: string,
  onStatus: (s: string) => void = () => {},
): Promise<Blob> {
  const tracks = await getTracks(ytId);

  // Fast path: a real muxed stream exists — just fetch it, no merge needed.
  if (tracks.combinedUrl) {
    const bytes = await fetchBytes(tracks.combinedUrl, onStatus, "video");
    return new Blob([bytes], { type: "video/mp4" });
  }

  // Otherwise merge separate tracks with ffmpeg.wasm.
  const ffmpeg = await loadFFmpeg(onStatus);
  const [videoBytes, audioBytes] = await Promise.all([
    fetchBytes(tracks.videoUrl, onStatus, "video"),
    fetchBytes(tracks.audioUrl, onStatus, "audio"),
  ]);

  onStatus("Merging audio + video…");
  await ffmpeg.writeFile("v.mp4", videoBytes);
  await ffmpeg.writeFile("a.m4a", audioBytes);
  await ffmpeg.exec(["-i", "v.mp4", "-i", "a.m4a", "-c", "copy", "out.mp4"]);
  const data = await ffmpeg.readFile("out.mp4");

  // Clean up FS
  try { await ffmpeg.deleteFile("v.mp4"); } catch { /* ignore */ }
  try { await ffmpeg.deleteFile("a.m4a"); } catch { /* ignore */ }
  try { await ffmpeg.deleteFile("out.mp4"); } catch { /* ignore */ }

  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data as ArrayBuffer);
  return new Blob([bytes], { type: "video/mp4" });
}
