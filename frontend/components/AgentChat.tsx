"use client";
import { useState } from "react";

const MCP_URL = "https://ample-wisdom-production-f4c9.up.railway.app";

const PRESETS = [
  {
    label: "What is the current IL exposure?",
    tool: "get_il_exposure",
    args: { symbol: "ETH" },
  },
  {
    label: "Show delta exposure",
    tool: "get_delta_exposure",
    args: { symbol: "ETH" },
  },
  {
    label: "What are the optimal tick ranges?",
    tool: "compute_optimal_ticks",
    args: { symbol: "ETH", days: 7 },
  },
  {
    label: "Get live agent status",
    tool: "get_agent_status",
    args: {},
  },
  {
    label: "Check ETH volatility regime",
    tool: "get_volatility",
    args: { symbol: "ETH" },
  },
];

export function AgentChat() {
  const [result, setResult] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeLabel, setActiveLabel] = useState<string | null>(null);
  const [activeTool, setActiveTool] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const callTool = async (
    tool: string,
    args: Record<string, unknown>,
    label: string
  ) => {
    setLoading(true);
    setActiveLabel(label);
    setActiveTool(tool);
    setError(null);
    setResult(null);
    try {
      const res = await fetch(`${MCP_URL}/call/${tool}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(args),
        signal: AbortSignal.timeout(12000),
      });
      const data = await res.json();
      setResult(JSON.stringify(data, null, 2));
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="card-hud hover-card p-5">
      {/* Header */}
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 6 }}>
        <div
          style={{
            fontSize: 13,
            color: "var(--cyan)",
            letterSpacing: "0.15em",
            fontWeight: 700,
          }}
        >
          ASK THE PARRY AGENT
        </div>
        <div
          style={{
            fontSize: 11,
            color: "var(--text-faint)",
            fontFamily: "var(--font-hud), monospace",
            letterSpacing: "0.08em",
          }}
        >
          POWERED BY MCP · {MCP_URL.replace("https://", "")}
        </div>
      </div>
      <div
        style={{
          fontSize: 12,
          color: "var(--text-dim)",
          marginBottom: 18,
          lineHeight: 1.5,
        }}
      >
        Click any question to invoke the live MCP tool endpoint in real-time.
        Each call goes directly to the running agent — no mock data.
      </div>

      {/* Preset buttons */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 18 }}>
        {PRESETS.map((p) => {
          const isActive = activeLabel === p.label;
          return (
            <button
              key={p.tool}
              onClick={() => callTool(p.tool, p.args, p.label)}
              disabled={loading}
              style={{
                padding: "9px 16px",
                fontSize: 12,
                fontFamily: "var(--font-hud), monospace",
                letterSpacing: "0.05em",
                border: `1px solid ${isActive ? "var(--cyan)" : "var(--border-glow)"}`,
                background: isActive
                  ? "rgba(0,212,255,0.12)"
                  : "rgba(255,255,255,0.03)",
                color: isActive ? "var(--cyan)" : "var(--text-primary)",
                borderRadius: 3,
                cursor: loading ? "wait" : "pointer",
                transition: "all 0.2s",
                outline: "none",
              }}
            >
              ▸ {p.label}
            </button>
          );
        })}
      </div>

      {/* Loading state */}
      {loading && (
        <div
          style={{
            padding: "14px 16px",
            color: "var(--cyan)",
            fontFamily: "var(--font-hud), monospace",
            fontSize: 13,
            background: "rgba(0,212,255,0.05)",
            borderRadius: 3,
            border: "1px solid rgba(0,212,255,0.2)",
          }}
        >
          <span className="cursor-blink">▶</span>{" "}
          Calling <span style={{ color: "var(--text-bright)" }}>{activeTool}</span> via MCP…
        </div>
      )}

      {/* Error state */}
      {error && !loading && (
        <div
          style={{
            padding: "12px 14px",
            color: "var(--red, #ff4444)",
            fontFamily: "var(--font-hud), monospace",
            fontSize: 12,
            background: "rgba(255,68,68,0.07)",
            borderRadius: 3,
            border: "1px solid rgba(255,68,68,0.25)",
          }}
        >
          ✗ MCP ERROR — {error}
        </div>
      )}

      {/* Result */}
      {result && !loading && (
        <div
          style={{
            background: "rgba(0,0,0,0.55)",
            border: "1px solid var(--border)",
            borderRadius: 3,
            padding: "14px 16px",
          }}
        >
          <div
            style={{
              fontSize: 11,
              color: "var(--green)",
              letterSpacing: "0.15em",
              marginBottom: 10,
              fontWeight: 700,
            }}
          >
            ✓ MCP RESPONSE — {activeTool}
          </div>
          <pre
            style={{
              fontSize: 12,
              color: "var(--text-primary)",
              fontFamily: "var(--font-hud), monospace",
              margin: 0,
              overflowX: "auto",
              whiteSpace: "pre-wrap",
              lineHeight: 1.65,
            }}
          >
            {result}
          </pre>
        </div>
      )}
    </div>
  );
}
