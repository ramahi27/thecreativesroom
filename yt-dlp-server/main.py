import os, re, subprocess, tempfile
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

    with tempfile.TemporaryDirectory() as tmpdir:
        out_path = os.path.join(tmpdir, "video.mp4")

        # Use combined audio+video formats only (no ffmpeg merge needed).
        # itag 22 = 720p H.264+AAC, itag 18 = 360p H.264+AAC.
        # Combined formats download as a single valid MP4 — fast and reliable.
        cmd = [
            "yt-dlp",
            "--no-playlist",
            "-f", "22/18/best[height<=720]",
            "--extractor-args", "youtube:player_client=ios,android,web",
            "--user-agent", "com.google.ios.youtube/19.29.1 (iPhone16,2; U; CPU iOS 17_5_1 like Mac OS X)",
            "--no-part",
            "--no-warnings",
            "-o", out_path,
            url,
        ]

        try:
            result = subprocess.run(cmd, timeout=60, capture_output=True, text=True)
        except subprocess.TimeoutExpired:
            print("yt-dlp timed out", flush=True)
            return jsonify(error="Download timed out"), 502

        if result.stderr.strip():
            print(f"yt-dlp stderr: {result.stderr.strip()}", flush=True)

        if result.returncode != 0 or not os.path.exists(out_path):
            lines = result.stderr.strip().splitlines()
            err = lines[-1] if lines else "yt-dlp failed"
            print(f"yt-dlp failed ({result.returncode}): {err}", flush=True)
            return jsonify(error=err), 502

        file_size = os.path.getsize(out_path)
        print(f"Download OK: {file_size} bytes", flush=True)

        def generate():
            with open(out_path, "rb") as f:
                while chunk := f.read(256 * 1024):
                    yield chunk

        return Response(
            generate(),
            status=200,
            headers={
                "Content-Type": "video/mp4",
                "Content-Disposition": 'attachment; filename="video.mp4"',
                "Content-Length": str(file_size),
                "Cache-Control": "no-store",
            },
        )

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8080))
    app.run(host="0.0.0.0", port=port)
