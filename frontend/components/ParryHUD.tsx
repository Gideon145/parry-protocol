"use client";

interface Props {
  size?: number;
  orbState: "active" | "warn" | "danger" | "idle";
}

export function ParryHUD({ size = 56, orbState }: Props) {
  const color =
    orbState === "active"
      ? "#00ff88"
      : orbState === "warn"
      ? "#ff9500"
      : orbState === "danger"
      ? "#ff3366"
      : "#4a4a6a";

  const glowId = `PARRY-glow-${orbState}`;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 56 56"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ flexShrink: 0 }}
    >
      <defs>
        <filter id={glowId} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <linearGradient id="PARRY-grad" x1="28" y1="4" x2="28" y2="52" gradientUnits="userSpaceOnUse">
          <stop stopColor={color} stopOpacity="0.4" />
          <stop offset="1" stopColor={color} stopOpacity="0.05" />
        </linearGradient>
      </defs>

      {/* PARRY body */}
      <path
        d="M28 4 L50 14 L50 28 C50 40 40 50 28 52 C16 50 6 40 6 28 L6 14 Z"
        fill="url(#PARRY-grad)"
        stroke={color}
        strokeWidth="1.5"
        filter={`url(#${glowId})`}
      />

      {/* Inner hexagon accent */}
      <path
        d="M28 16 L38 21.5 L38 32.5 L28 38 L18 32.5 L18 21.5 Z"
        fill="none"
        stroke={color}
        strokeWidth="0.8"
        strokeOpacity="0.5"
      />

      {/* Center cross / delta symbol */}
      <text
        x="28"
        y="31"
        textAnchor="middle"
        fontSize="14"
        fontWeight="800"
        fill={color}
        fontFamily="monospace"
        style={{ filter: `drop-shadow(0 0 4px ${color})` }}
      >
        Δ
      </text>

      {/* Corner brackets */}
      <line x1="4" y1="4" x2="10" y2="4" stroke={color} strokeWidth="1" strokeOpacity="0.4" />
      <line x1="4" y1="4" x2="4" y2="10" stroke={color} strokeWidth="1" strokeOpacity="0.4" />
      <line x1="52" y1="4" x2="46" y2="4" stroke={color} strokeWidth="1" strokeOpacity="0.4" />
      <line x1="52" y1="4" x2="52" y2="10" stroke={color} strokeWidth="1" strokeOpacity="0.4" />
      <line x1="4" y1="52" x2="10" y2="52" stroke={color} strokeWidth="1" strokeOpacity="0.4" />
      <line x1="4" y1="52" x2="4" y2="46" stroke={color} strokeWidth="1" strokeOpacity="0.4" />
      <line x1="52" y1="52" x2="46" y2="52" stroke={color} strokeWidth="1" strokeOpacity="0.4" />
      <line x1="52" y1="52" x2="52" y2="46" stroke={color} strokeWidth="1" strokeOpacity="0.4" />
    </svg>
  );
}
