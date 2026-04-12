"use client";

import { useEffect, useRef } from "react";

interface Props {
  state: "active" | "warn" | "danger" | "idle";
  size?: number;
}

const STATE_COLORS: Record<string, { primary: string; secondary: string }> = {
  active:  { primary: "#00ff88", secondary: "#00d4ff" },
  warn:    { primary: "#ff9500", secondary: "#ffcc00" },
  danger:  { primary: "#ff3366", secondary: "#ff6644" },
  idle:    { primary: "#4a4a6a", secondary: "#2a2a4a" },
};

export function PositionOrb({ state, size = 80 }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const t = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const { primary, secondary } = STATE_COLORS[state];

    function draw() {
      if (!canvas || !ctx) return;
      ctx.clearRect(0, 0, size, size);
      const cx = size / 2;
      const cy = size / 2;
      const r = size * 0.32;
      const pulse = state === "idle" ? 0 : Math.sin(t.current * 0.04) * 0.08;

      // Outer glow ring
      if (state !== "idle") {
        const outerGlow = ctx.createRadialGradient(cx, cy, r * 0.8, cx, cy, r * 1.6);
        outerGlow.addColorStop(0, `${primary}30`);
        outerGlow.addColorStop(1, "transparent");
        ctx.beginPath();
        ctx.arc(cx, cy, r * (1.6 + pulse), 0, Math.PI * 2);
        ctx.fillStyle = outerGlow;
        ctx.fill();
      }

      // Core orb
      const grad = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.3, 0, cx, cy, r);
      grad.addColorStop(0, `${secondary}cc`);
      grad.addColorStop(0.5, `${primary}88`);
      grad.addColorStop(1, `${primary}22`);
      ctx.beginPath();
      ctx.arc(cx, cy, r * (1 + pulse), 0, Math.PI * 2);
      ctx.fillStyle = grad;
      ctx.fill();

      // Inner highlight
      const highlight = ctx.createRadialGradient(cx - r * 0.25, cy - r * 0.25, 0, cx, cy, r * 0.6);
      highlight.addColorStop(0, "rgba(255,255,255,0.35)");
      highlight.addColorStop(1, "transparent");
      ctx.beginPath();
      ctx.arc(cx, cy, r * (1 + pulse), 0, Math.PI * 2);
      ctx.fillStyle = highlight;
      ctx.fill();

      // Scan-line ring (for active/warn)
      if (state !== "idle") {
        ctx.beginPath();
        ctx.arc(cx, cy, r * 1.15, 0, Math.PI * 2);
        ctx.strokeStyle = `${primary}40`;
        ctx.lineWidth = 0.5;
        ctx.stroke();
      }

      t.current++;
      animRef.current = requestAnimationFrame(draw);
    }

    animRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animRef.current);
  }, [state, size]);

  return (
    <canvas
      ref={canvasRef}
      width={size}
      height={size}
      style={{ display: "block", flexShrink: 0 }}
    />
  );
}
