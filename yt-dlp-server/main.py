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

        # Use iOS + Android player clients — these bypass YouTube's bot
        # detection on datacenter IPs because they mimic official mobile apps.
        cmd = [
            "yt-dlp",
            "--no-playlist",
            "--merge-output-format", "mp4",
            "-f", "bestvideo[height<=1080]+bestaudio/bestvideo+bestaudio/best",
            "--extractor-args", "youtube:player_client=ios,android,web",
            "--user-agent", "com.google.ios.youtube/19.29.1 (iPhone16,2; U; CPU iOS 17_5_1 like Mac OS X)",
            "--add-header", "X-Youtube-Client-Name:5",
            "--add-header", "X-Youtube-Client-Version:19.29.1",
            "-o", out_path,
            url,
        ]

        try:
            result = subprocess.run(cmd, timeout=120, capture_output=True, text=True)
        except subprocess.TimeoutExpired:
            print("yt-dlp timed out", flush=True)
            return jsonify(error="Download timed out"), 502

        # Always log stderr so Railway logs show what went wrong
        if result.stderr.strip():
            print(f"yt-dlp stderr:\n{result.stderr.strip()}", flush=True)
        if result.stdout.strip():
            print(f"yt-dlp stdout:\n{result.stdout.strip()}", flush=True)

        if result.returncode != 0 or not os.path.exists(out_path):
            lines = result.stderr.strip().splitlines()
            err = lines[-1] if lines else "yt-dlp failed with no output"
            print(f"yt-dlp failed (exit {result.returncode}): {err}", flush=True)
            return jsonify(error=err), 502

        file_size = os.path.getsize(out_path)
        print(f"Download OK: {file_size} bytes", flush=True)

        def generate():
            with open(out_path, "rb") as f:
                while chunk := f.read(1024 * 256):
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
