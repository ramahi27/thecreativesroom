# YouTube Download Worker

A Cloudflare Worker that powers the in-site video download button.
It receives a YouTube URL, fetches the video server-side (via cobalt
community instances, with an Invidious fallback), and streams a finished
MP4 back to the browser with `Content-Disposition: attachment`.

## Deploy
1. Cloudflare dashboard → Workers & Pages → create a Worker
2. Paste the contents of `worker.js`, deploy
3. Copy the deployed URL and set it as `DOWNLOAD_PROXY` in
   `src/lib/youtubeDownload.ts`

## Test
```js
fetch("https://<your-worker>.workers.dev/", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" })
}).then(r => console.log(r.status, r.headers.get("content-type")));
```
A `200` with `video/mp4` means it works.
