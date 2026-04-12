"use client";

interface Props {
  volBps: number;
  regime: "LOW" | "MEDIUM" | "HIGH" | "EXTREME";
  hedgeRatio: number;
}

const REGIME_COLOR: Record<string, string> = {
  LOW:     "#00ff88",
  MEDIUM:  "#00d4ff",
  HIGH:    "#ff9500",
  EXTREME: "#ff3366",
};

const REGIME_MAX_BPS = 30000; // 300% annualised σ shown as full bar

export function VolatilityBar({ volBps, regime, hedgeRatio }: Props) {
  const color = REGIME_COLOR[regime];
  const pct = Math.min((volBps / REGIME_MAX_BPS) * 100, 100);
  const hedgePct = hedgeRatio * 100;
  const volAnn = (volBps / 100).toFixed(1);

  return (
    <div style={{ width: "100%" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 6,
        }}
      >
        <span
          style={{
            fontSize: 9,
            color: "var(--text-dim)",
            letterSpacing: "0.1em",
          }}
        >
          VOLATILITY (σ ann.)
        </span>
        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            color,
            fontFamily: "var(--font-hud), monospace",
          }}
        >
          {volAnn}%{" "}
          <span
            style={{
              fontSize: 9,
              letterSpacing: "0.12em",
              fontFamily: "var(--font-orbitron), sans-serif",
            }}
          >
            [{regime}]
          </span>
        </span>
      </div>

      {/* Track */}
      <div
        style={{
          height: 6,
          background: "rgba(255,255,255,0.05)",
          borderRadius: 3,
          overflow: "hidden",
          position: "relative",
          marginBottom: 8,
        }}
      >
        <div
          style={{
            height: "100%",
            width: `${pct}%`,
            background: `linear-gradient(90deg, ${color}88 0%, ${color} 100%)`,
            boxShadow: `0 0 8px ${color}`,
            borderRadius: 3,
            transition: "width 0.6s ease, background 0.4s",
          }}
        />
        {/* Regime thresholds */}
        {[10, 20, 33].map((thresh) => {
          const pos = Math.min((thresh * 100) / (REGIME_MAX_BPS / 100), 100);
          return (
            <div
              key={thresh}
              style={{
                position: "absolute",
                top: 0,
                left: `${pos}%`,
                width: 1,
                height: "100%",
                background: "rgba(255,255,255,0.15)",
              }}
            />
          );
        })}
      </div>

      {/* Hedge ratio bar */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 4,
        }}
      >
        <span style={{ fontSize: 9, color: "var(--text-dim)", letterSpacing: "0.1em" }}>
          HEDGE RATIO
        </span>
        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: "var(--cyan)",
            fontFamily: "var(--font-hud), monospace",
          }}
        >
          {hedgePct.toFixed(0)}%
        </span>
      </div>
      <div
        style={{
          height: 4,
          background: "rgba(255,255,255,0.05)",
          borderRadius: 2,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            height: "100%",
            width: `${hedgePct}%`,
            background: "linear-gradient(90deg, var(--cyan)66 0%, var(--cyan) 100%)",
            boxShadow: "0 0 6px var(--cyan)",
            borderRadius: 2,
            transition: "width 0.6s ease",
          }}
        />
      </div>
    </div>
  );
}
