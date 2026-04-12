"use client";

interface Props {
  deltaExposure: number;   // 0.0 – 1.0
  hedgeAmountUSD: number;
}

const R = 60;
const CX = 90;
const CY = 90;

function describeArc(cx: number, cy: number, r: number, startDeg: number, endDeg: number) {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const x1 = cx + r * Math.cos(toRad(startDeg));
  const y1 = cy + r * Math.sin(toRad(startDeg));
  const x2 = cx + r * Math.cos(toRad(endDeg));
  const y2 = cy + r * Math.sin(toRad(endDeg));
  const large = endDeg - startDeg > 180 ? 1 : 0;
  return `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2}`;
}

export function DeltaGauge({ deltaExposure, hedgeAmountUSD }: Props) {
  const pct = Math.min(Math.max(deltaExposure, 0), 1);
  const startAngle = 140;
  const totalSweep = 260;
  const fillAngle = startAngle + totalSweep * pct;

  const color =
    pct < 0.3
      ? "#00ff88"
      : pct < 0.6
      ? "#00d4ff"
      : pct < 0.85
      ? "#ff9500"
      : "#ff3366";

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
      <svg width={180} height={120} viewBox="0 0 180 120">
        <defs>
          <filter id="gauge-glow">
            <feGaussianBlur stdDeviation="2.5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Track */}
        <path
          d={describeArc(CX, CY + 10, R, 140, 400)}
          fill="none"
          stroke="rgba(255,255,255,0.06)"
          strokeWidth={8}
          strokeLinecap="round"
        />

        {/* Fill */}
        <path
          d={describeArc(CX, CY + 10, R, startAngle, fillAngle)}
          fill="none"
          stroke={color}
          strokeWidth={8}
          strokeLinecap="round"
          filter="url(#gauge-glow)"
          style={{ transition: "stroke 0.5s" }}
        />

        {/* Tick marks */}
        {[0, 0.25, 0.5, 0.75, 1].map((v) => {
          const angle = ((startAngle + totalSweep * v) * Math.PI) / 180;
          const r1 = R - 12;
          const r2 = R - 6;
          return (
            <line
              key={v}
              x1={CX + r1 * Math.cos(angle)}
              y1={CY + 10 + r1 * Math.sin(angle)}
              x2={CX + r2 * Math.cos(angle)}
              y2={CY + 10 + r2 * Math.sin(angle)}
              stroke="rgba(255,255,255,0.2)"
              strokeWidth="1"
            />
          );
        })}

        {/* Value */}
        <text
          x={CX}
          y={CY + 10}
          textAnchor="middle"
          fontSize="18"
          fontWeight="800"
          fill={color}
          fontFamily="monospace"
          style={{ filter: `drop-shadow(0 0 6px ${color})` }}
        >
          {pct.toFixed(3)}
        </text>
        <text
          x={CX}
          y={CY + 26}
          textAnchor="middle"
          fontSize="8"
          fill="rgba(255,255,255,0.3)"
          fontFamily="monospace"
          letterSpacing="0.1em"
        >
          DELTA EXPOSURE
        </text>

        {/* Min / Max labels */}
        <text x="22" y="115" fontSize="8" fill="rgba(255,255,255,0.2)" fontFamily="monospace">0</text>
        <text x="150" y="115" fontSize="8" fill="rgba(255,255,255,0.2)" fontFamily="monospace">1.0</text>
      </svg>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div>
          <div style={{ fontSize: 9, color: "var(--text-dim)", letterSpacing: "0.1em", marginBottom: 2 }}>HEDGE REQUIRED</div>
          <div style={{ fontSize: 16, fontWeight: 800, color, fontFamily: "var(--font-hud), monospace" }}>
            ${hedgeAmountUSD.toFixed(2)}
          </div>
        </div>
        <div>
          <div style={{ fontSize: 9, color: "var(--text-dim)", letterSpacing: "0.1em", marginBottom: 2 }}>RISK LEVEL</div>
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: "0.15em",
              color,
              fontFamily: "var(--font-orbitron), sans-serif",
            }}
          >
            {pct < 0.3 ? "LOW" : pct < 0.6 ? "MODERATE" : pct < 0.85 ? "HIGH" : "CRITICAL"}
          </div>
        </div>
      </div>
    </div>
  );
}
