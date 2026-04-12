"use client";

interface Props {
  label: string;
  value: string;
  subvalue?: string;
  color?: string;
  unit?: string;
  trend?: "up" | "down";
  tooltip?: string;
}

export function MetricCard({ label, value, subvalue, color = "var(--cyan)", unit, trend, tooltip }: Props) {
  return (
    <div
      className="card-hud hover-card p-5"
      style={{ 
        display: "flex", 
        flexDirection: "column", 
        gap: 10,
        cursor: tooltip ? "help" : "default",
      }}
      title={tooltip}
    >
      <div
        style={{
          fontSize: 13,
          color: "var(--text-dim)",
          letterSpacing: "0.15em",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <span>{label}</span>
        {unit && (
          <span style={{ color: "var(--text-faint)", fontSize: 11 }}>{unit}</span>
        )}
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          gap: 8,
        }}
      >
        <span
          style={{
            fontSize: 36,
            fontWeight: 800,
            color,
            fontFamily: "var(--font-hud), monospace",
            letterSpacing: "-0.02em",
            lineHeight: 1,
            textShadow: `0 0 12px ${color}66`,
            animation: "pulse 2s ease-in-out infinite",
          }}
        >
          {value}
        </span>
        {trend && (
          <span
            style={{
              fontSize: 18,
              color: trend === "up" ? "var(--green)" : "var(--red)",
            }}
          >
            {trend === "up" ? "▲" : "▼"}
          </span>
        )}
      </div>
      {subvalue && (
        <div
          style={{
            fontSize: 13,
            color: "var(--text-dim)",
            fontFamily: "var(--font-hud), monospace",
          }}
        >
          {subvalue}
        </div>
      )}
    </div>
  );
}
