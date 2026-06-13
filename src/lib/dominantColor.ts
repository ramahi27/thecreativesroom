// Best-effort dominant-color extraction for reference thumbnails.
//
// Loads the image with crossOrigin so its pixels can be read off a canvas,
// downsamples it, and returns the average of the most *vibrant* pixels (so the
// glow reflects the work's real colour, not a muddy grey average). Results are
// cached per-URL. If the CDN doesn't send CORS headers the canvas read throws —
// we swallow it and return null, and the caller simply keeps the default accent.

type RGB = [number, number, number];

const cache = new Map<string, RGB | null>();
const inflight = new Map<string, Promise<RGB | null>>();

export function getDominantColor(url: string): Promise<RGB | null> {
  if (cache.has(url)) return Promise.resolve(cache.get(url)!);
  const existing = inflight.get(url);
  if (existing) return existing;

  const p = new Promise<RGB | null>((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.referrerPolicy = "no-referrer";

    img.onload = () => {
      try {
        const size = 24;
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (!ctx) return resolve(finish(url, null));
        ctx.drawImage(img, 0, 0, size, size);
        const { data } = ctx.getImageData(0, 0, size, size);

        let vr = 0, vg = 0, vb = 0, vc = 0; // vibrant pixels
        let ar = 0, ag = 0, ab = 0, ac = 0; // all opaque pixels
        for (let i = 0; i < data.length; i += 4) {
          const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
          if (a < 125) continue;
          ar += r; ag += g; ab += b; ac++;
          const max = Math.max(r, g, b), min = Math.min(r, g, b);
          const sat = max === 0 ? 0 : (max - min) / max;
          const lum = (r + g + b) / 3;
          if (sat > 0.35 && lum > 30 && lum < 235) {
            vr += r; vg += g; vb += b; vc++;
          }
        }

        let rgb: RGB | null = null;
        if (vc > 0) rgb = [Math.round(vr / vc), Math.round(vg / vc), Math.round(vb / vc)];
        else if (ac > 0) rgb = [Math.round(ar / ac), Math.round(ag / ac), Math.round(ab / ac)];
        resolve(finish(url, rgb));
      } catch {
        resolve(finish(url, null)); // tainted canvas (no CORS) — give up quietly
      }
    };
    img.onerror = () => resolve(finish(url, null));
    img.src = url;
  });

  inflight.set(url, p);
  return p;
}

function finish(url: string, rgb: RGB | null): RGB | null {
  cache.set(url, rgb);
  inflight.delete(url);
  return rgb;
}
