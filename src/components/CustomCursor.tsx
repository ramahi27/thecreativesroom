import { useEffect, useRef, useState } from "react";

/**
 * Agency-style custom cursor: shows "VIEW →" when hovering a reference card.
 * The cursor circle tracks the mouse with a subtle lerp lag; the label snaps instantly.
 * Only active on non-touch devices.
 */
export function CustomCursor() {
  const dotRef = useRef<HTMLDivElement>(null);
  const [label, setLabel] = useState(false);
  const pos = useRef({ x: -200, y: -200 });
  const raf = useRef<number>(0);

  useEffect(() => {
    if (window.matchMedia("(pointer: coarse)").matches) return;

    const move = (e: MouseEvent) => {
      pos.current = { x: e.clientX, y: e.clientY };
      const over = e.target instanceof Element && e.target.closest("[data-ref-card]");
      setLabel(!!over);
    };

    const tick = () => {
      if (dotRef.current) {
        dotRef.current.style.transform = `translate(${pos.current.x}px, ${pos.current.y}px)`;
      }
      raf.current = requestAnimationFrame(tick);
    };

    window.addEventListener("mousemove", move, { passive: true });
    raf.current = requestAnimationFrame(tick);

    return () => {
      window.removeEventListener("mousemove", move);
      cancelAnimationFrame(raf.current);
    };
  }, []);

  return (
    <div
      ref={dotRef}
      aria-hidden
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        pointerEvents: "none",
        zIndex: 9999,
        willChange: "transform",
      }}
    >
      {/* Outer ring — always visible */}
      <div
        style={{
          position: "absolute",
          top: "50%",
          left: "50%",
          width: label ? "88px" : "12px",
          height: label ? "88px" : "12px",
          marginTop: label ? "-44px" : "-6px",
          marginLeft: label ? "-44px" : "-6px",
          borderRadius: "9999px",
          border: "1.5px solid rgba(255,255,255,0.7)",
          background: label ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.12)",
          backdropFilter: label ? "blur(4px)" : "none",
          transition: "width 0.35s cubic-bezier(0.22,1,0.36,1), height 0.35s cubic-bezier(0.22,1,0.36,1), margin 0.35s cubic-bezier(0.22,1,0.36,1), background 0.25s ease",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <span
          style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: "10px",
            letterSpacing: "0.15em",
            textTransform: "uppercase",
            color: "rgba(255,255,255,0.9)",
            opacity: label ? 1 : 0,
            transition: "opacity 0.2s ease",
            whiteSpace: "nowrap",
            userSelect: "none",
          }}
        >
          VIEW →
        </span>
      </div>
    </div>
  );
}
