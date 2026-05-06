import { useRef, useState, useCallback } from "react";

interface Props {
  src: string;
  alt: string;
  className?: string;
  scale?: number;
}

/**
 * Click to zoom into the cursor position; click again to zoom out.
 * On touch devices: tap to zoom in centered on the tap, then drag to pan.
 */
export function ZoomableImage({ src, alt, className, scale = 2.25 }: Props) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [zoomed, setZoomed] = useState(false);
  const [origin, setOrigin] = useState("50% 50%");
  const isTouchRef = useRef(false);
  const lastTapRef = useRef<{ time: number; x: number; y: number } | null>(null);
  const panRef = useRef<{
    startX: number;
    startY: number;
    startOx: number;
    startOy: number;
    moved: boolean;
  } | null>(null);

  const setOriginFromPoint = useCallback((clientX: number, clientY: number) => {
    const el = wrapperRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * 100;
    const y = ((clientY - rect.top) / rect.height) * 100;
    setOrigin(`${clamp(x)}% ${clamp(y)}%`);
  }, []);

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      // Touch already handled in touch handlers; ignore the synthesized click.
      if (isTouchRef.current) {
        isTouchRef.current = false;
        return;
      }
      if (zoomed) {
        setZoomed(false);
        return;
      }
      setOriginFromPoint(e.clientX, e.clientY);
      setZoomed(true);
    },
    [zoomed, setOriginFromPoint],
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!zoomed || isTouchRef.current) return;
      setOriginFromPoint(e.clientX, e.clientY);
    },
    [zoomed, setOriginFromPoint],
  );

  // ---- Touch handlers ----
  const handleTouchStart = useCallback(
    (e: React.TouchEvent<HTMLDivElement>) => {
      isTouchRef.current = true;
      const t = e.touches[0];
      if (!t) return;
      if (zoomed) {
        const [ox, oy] = parseOrigin(origin);
        panRef.current = {
          startX: t.clientX,
          startY: t.clientY,
          startOx: ox,
          startOy: oy,
          moved: false,
        };
      }
    },
    [zoomed, origin],
  );

  const handleTouchMove = useCallback(
    (e: React.TouchEvent<HTMLDivElement>) => {
      if (!zoomed || !panRef.current) return;
      const t = e.touches[0];
      if (!t) return;
      const el = wrapperRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const dx = t.clientX - panRef.current.startX;
      const dy = t.clientY - panRef.current.startY;
      if (Math.abs(dx) + Math.abs(dy) > 4) panRef.current.moved = true;
      // Move origin opposite to drag direction so the image follows the finger.
      // Convert pixel delta into origin-percentage delta, scaled by zoom factor.
      const deltaOx = -(dx / rect.width) * 100 / scale;
      const deltaOy = -(dy / rect.height) * 100 / scale;
      const nx = clamp(panRef.current.startOx + deltaOx);
      const ny = clamp(panRef.current.startOy + deltaOy);
      setOrigin(`${nx}% ${ny}%`);
      e.preventDefault();
    },
    [zoomed, scale],
  );

  const handleTouchEnd = useCallback(
    (e: React.TouchEvent<HTMLDivElement>) => {
      const pan = panRef.current;
      panRef.current = null;
      const t = e.changedTouches[0];
      if (!t) return;
      // If user was actively panning, don't treat as tap.
      if (pan && pan.moved) return;

      const now = Date.now();
      const last = lastTapRef.current;
      const isDoubleTap =
        !!last &&
        now - last.time < 300 &&
        Math.abs(t.clientX - last.x) < 30 &&
        Math.abs(t.clientY - last.y) < 30;

      if (isDoubleTap) {
        lastTapRef.current = null;
        if (zoomed) {
          setZoomed(false);
        } else {
          setOriginFromPoint(t.clientX, t.clientY);
          setZoomed(true);
        }
      } else {
        lastTapRef.current = { time: now, x: t.clientX, y: t.clientY };
      }
    },
    [zoomed, setOriginFromPoint],
  );

  return (
    <div
      ref={wrapperRef}
      onClick={handleClick}
      onMouseMove={handleMouseMove}
      onMouseLeave={() => {
        if (zoomed && !isTouchRef.current) setZoomed(false);
      }}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      className={`relative overflow-hidden ${className ?? ""}`}
      style={{
        cursor: zoomed ? "zoom-out" : "zoom-in",
        touchAction: zoomed ? "none" : "auto",
      }}
    >
      <img
        src={src}
        alt={alt}
        draggable={false}
        className="w-full bg-black object-contain max-h-[70vh] md:max-h-[calc(95vh-16rem)] mx-auto select-none"
        style={{
          objectFit: "contain",
          transform: zoomed ? `scale(${scale})` : "scale(1)",
          transformOrigin: origin,
          transition: panRef.current
            ? "none"
            : "transform 260ms cubic-bezier(0.22, 1, 0.36, 1)",
          willChange: "transform",
        }}
      />
    </div>
  );
}

function clamp(v: number) {
  return Math.max(0, Math.min(100, v));
}

function parseOrigin(o: string): [number, number] {
  const m = o.match(/([\d.]+)%\s+([\d.]+)%/);
  if (!m) return [50, 50];
  return [parseFloat(m[1]), parseFloat(m[2])];
}
