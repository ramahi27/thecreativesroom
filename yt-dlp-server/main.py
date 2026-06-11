import os, re, subprocess
from flask import Flask, request, Response, jsonify

app = Flask(__name__)

SECRET = os.environ.get("YTD_SECRET", "")

YT_PATTERN = re.compile(
    r"(youtu\.be/|youtube\.com/(watch\?.*v=|embed/|shorts/))[a-zA-Z0-9_-]{11}"
)

def valid_yt_url(url: str) -> bool:
    return bool(YT_PATTERN.search(url))

@app.route("/health")
def health():
    return "ok"

@app.route("/download", methods=["POST"])
def download():
    if SECRET and request.headers.get("X-Secret") != SECRET:
        return jsonify(error="Unauthorized"), 401

    body = request.get_json(silent=True) or {}
    url = body.get("url", "")
    if not url or not valid_yt_url(url):
        return jsonify(error="Invalid YouTube URL"), 400

    # Stream yt-dlp output directly to the HTTP response — no temp file,
    # no waiting for full download. First bytes flow immediately, which
    # keeps the Cloudflare Worker from timing out.
    #
    # Format priority:
    #   22   = 720p H.264 + AAC combined (best single-stream quality)
    #   18   = 360p H.264 + AAC combined (universal fallback)
    #   best = whatever combined stream yt-dlp can find
    #
    # Combined streams don't need merging so -o - (stdout) works perfectly.
    cmd = [
        "yt-dlp",
        "--no-playlist",
        "-f", "22/18/best",
        "--extractor-args", "youtube:player_client=ios,android,web",
        "--user-agent", "com.google.ios.youtube/19.29.1 (iPhone16,2; U; CPU iOS 17_5_1 like Mac OS X)",
        "--no-part",
        "--no-warnings",
        "-o", "-",   # write to stdout
        url,
    ]

    try:
        process = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
        )
    except Exception as e:
        return jsonify(error=str(e)), 502

    def generate():
        try:
            while True:
                chunk = process.stdout.read(256 * 1024)  # 256 KB chunks
                if not chunk:
                    break
                yield chunk
        finally:
            process.stdout.close()
            process.wait()
            if process.returncode and process.returncode != 0:
                err = process.stderr.read().decode(errors="replace").strip().splitlines()
                print(f"yt-dlp exit {process.returncode}: {err[-1] if err else 'no output'}", flush=True)
            process.stderr.close()

    return Response(
        generate(),
        status=200,
        headers={
            "Content-Type": "video/mp4",
            "Content-Disposition": "attachment; filename=\"video.mp4\"",
            "Cache-Control": "no-store",
            "X-Accel-Buffering": "no",
        },
    )

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8080))
    app.run(host="0.0.0.0", port=port)
