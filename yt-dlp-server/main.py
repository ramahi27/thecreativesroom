import os, re, subprocess, tempfile, threading
from flask import Flask, request, Response, jsonify

app = Flask(__name__)

# Simple token check — set YTD_SECRET in Railway env vars and match it
# in your Cloudflare Worker's YTDLP_SECRET variable.
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
    # Auth check
    if SECRET and request.headers.get("X-Secret") != SECRET:
        return jsonify(error="Unauthorized"), 401

    body = request.get_json(silent=True) or {}
    url = body.get("url", "")
    if not url or not valid_yt_url(url):
        return jsonify(error="Invalid YouTube URL"), 400

    # Download to a temp file then stream it back.
    # yt-dlp merges 1080p video + audio automatically via ffmpeg.
    with tempfile.TemporaryDirectory() as tmpdir:
        out_path = os.path.join(tmpdir, "video.mp4")
        cmd = [
            "yt-dlp",
            "--no-playlist",
            "--merge-output-format", "mp4",
            # Best video up to 1080p + best audio, merged into mp4
            "-f", "bestvideo[height<=1080][ext=mp4]+bestaudio[ext=m4a]/bestvideo[height<=1080]+bestaudio/best[height<=1080]/best",
            "--no-warnings",
            "--quiet",
            "-o", out_path,
            url,
        ]
        try:
            result = subprocess.run(cmd, timeout=120, capture_output=True, text=True)
        except subprocess.TimeoutExpired:
            return jsonify(error="Download timed out"), 502

        if result.returncode != 0 or not os.path.exists(out_path):
            err = result.stderr.strip().splitlines()[-1] if result.stderr.strip() else "yt-dlp failed"
            return jsonify(error=err), 502

        file_size = os.path.getsize(out_path)

        def generate():
            with open(out_path, "rb") as f:
                while chunk := f.read(1024 * 256):  # 256 KB chunks
                    yield chunk

        return Response(
            generate(),
            status=200,
            headers={
                "Content-Type": "video/mp4",
                "Content-Disposition": "attachment; filename=\"video.mp4\"",
                "Content-Length": str(file_size),
                "Cache-Control": "no-store",
            },
        )

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8080))
    app.run(host="0.0.0.0", port=port)
