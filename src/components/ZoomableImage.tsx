import { useRef, useState, useCallback } from "react";

interface Props {
  src: string;
  alt: string;
  className?: string;
  scale?: number;
}

/**
 * Click to zoom into the cursor position; click again to zoom out.
 * Smooth transform-based animation, premium feel.
 */
export function ZoomableImage({ src, alt, className, scale = 2.25 }: Props) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [zoomed, setZoomed] = useState(false);
  const [origin, setOrigin] = useState("50% 50%");

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const el = wrapperRef.current;
      if (!el) return;
      if (zoomed) {
        setZoomed(false);
        return;
      }
      const rect = el.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 100;
      const y = ((e.clientY - rect.top) / rect.height) * 100;
      setOrigin(`${x}% ${y}%`);
      setZoomed(true);
    },
    [zoomed],
  );

  const handleMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!zoomed) return;
      const el = wrapperRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 100;
      const y = ((e.clientY - rect.top) / rect.height) * 100;
      setOrigin(`${x}% ${y}%`);
    },
    [zoomed],
  );

  return (
    <div
      ref={wrapperRef}
      onClick={handleClick}
      onMouseMove={handleMove}
      onMouseLeave={() => zoomed && setZoomed(false)}
      className={`relative overflow-hidden ${className ?? ""}`}
      style={{ cursor: zoomed ? "zoom-out" : "zoom-in" }}
    >
      <img
        src={src}
        alt={alt}
        draggable={false}
        className="w-full bg-black object-contain max-h-[calc(95vh-16rem)] mx-auto select-none"
        style={{
          objectFit: "contain",
          transform: zoomed ? `scale(${scale})` : "scale(1)",
          transformOrigin: origin,
          transition: "transform 260ms cubic-bezier(0.22, 1, 0.36, 1)",
          willChange: "transform",
        }}
      />
    </div>
  );
}
