"use client";

interface Props {
  label: string;
  value: string;
  subvalue?: string;
  color?: string;
  unit?: string;
  trend?: "up" | "down";
}

export function MetricCard({ label, value, subvalue, color = "var(--cyan)", unit, trend }: Props) {
  return (
    <div
      className="card-hud p-4"
      style={{ display: "flex", flexDirection: "column", gap: 6 }}
    >
      <div
        style={{
          fontSize: 9,
          color: "var(--text-dim)",
          letterSpacing: "0.15em",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <span>{label}</span>
        {unit && (
          <span style={{ color: "var(--text-faint)", fontSize: 8 }}>{unit}</span>
        )}
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          gap: 6,
        }}
      >
        <span
          style={{
            fontSize: 22,
            fontWeight: 800,
            color,
            fontFamily: "var(--font-hud), monospace",
            letterSpacing: "-0.02em",
            lineHeight: 1,
            textShadow: `0 0 12px ${color}66`,
          }}
        >
          {value}
        </span>
        {trend && (
          <span
            style={{
              fontSize: 12,
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
            fontSize: 9,
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
