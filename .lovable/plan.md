## Goal
Make the YouTube download button return a real **1080p MP4 with audio**, instead of the current 720p combined stream (or 360p fallback).

## Why it doesn't work today
- `yt-dlp-server/main.py` uses `-f "22/18/best[height<=720]"`. Itag 22 = 720p combined, itag 18 = 360p combined. YouTube never serves 1080p as a combined stream, so 1080p is impossible with this format string.
- The Cloudflare Worker's RapidAPI fallback (`cloudflare-worker/worker.js`) also explicitly prefers itag 22 (720p) and picks the first single MP4 URL — RapidAPI's `yt-api` returns adaptive video-only streams for 1080p, so the resulting file would have no audio.

## Changes

### 1. `yt-dlp-server/main.py` — switch to merged 1080p
Replace the format selector and let yt-dlp merge with ffmpeg (already in the Docker image):

- Format: `bv*[height<=1080][ext=mp4]+ba[ext=m4a]/b[height<=1080][ext=mp4]/b[height<=1080]`
  - Picks best mp4 video up to 1080p + best m4a audio, falls back to any best ≤1080p.
- Add `--merge-output-format mp4` so the merged file is a clean MP4.
- Keep timeout headroom: bump `subprocess.run` timeout from 60s to 120s (merging takes longer than a single combined download).
- Keep the iOS/Android/web extractor args — they're needed to bypass YouTube's anti-bot.

### 2. `cloudflare-worker/worker.js` — fix the RapidAPI fallback (or drop it)
RapidAPI cannot return a merged 1080p file. Two options, recommend **A**:

**A. Keep RapidAPI as a 720p-with-audio fallback only.** Change the sort to only consider formats whose `mimeType` indicates both video AND audio (e.g. `mimeType.includes("video/mp4") && mimeType.includes("audio")` — yt-api marks combined streams this way), and prefer itag 22 then itag 18. This guarantees audio when yt-dlp is unreachable, accepting 720p as the fallback ceiling.

**B.** Remove the RapidAPI branch entirely and rely solely on the yt-dlp server.

I'll go with **A** unless you say otherwise.

### 3. Redeploy
- yt-dlp server: needs a redeploy on whatever host runs the Docker image (Fly / Render / etc.) — I'll flag this; you'll need to push the new image since the sandbox can't deploy your external server.
- Cloudflare Worker: paste the updated `worker.js` into the Cloudflare dashboard (same manual step described in `cloudflare-worker/README.md`).

No changes needed in `src/lib/youtubeDownload.ts` or the Supabase edge function — they just proxy the resulting MP4 through.

## Out of scope
- Vimeo downloads (current `download-video` edge function only returns the Vimeo page URL — separate issue, let me know if you want that fixed too).
- Quality picker UI (always returns best ≤1080p; ask if you want 720/1080 toggle).