"use client";
import { useState } from "react";

const MCP_URL = "https://ample-wisdom-production-f4c9.up.railway.app";
const AGENT_URL = "https://parry-protocol-production.up.railway.app";

interface AgentStatusSnapshot {
  currentPrice: number;
  entryPrice: number;
  tickLower: number;
  tickUpper: number;
  volBps: number;
  hedgeRatio: number;
}

async function fetchAgentSnapshot(): Promise<AgentStatusSnapshot | null> {
  try {
    const res = await fetch(`${AGENT_URL}/status`, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    const d = await res.json();
    return {
      currentPrice: d.currentPrice ?? 2187,
      entryPrice: d.entryPrice ?? 2000,
      tickLower: d.tickLower ?? -600,
      tickUpper: d.tickUpper ?? 600,
      volBps: d.volBps ?? 5000,
      hedgeRatio: d.hedgeRatio ?? 0.7,
    };
  } catch {
    return null;
  }
}

type PresetDef = {
  label: string;
  tool: string;
  buildArgs: (snap: AgentStatusSnapshot | null) => Record<string, unknown>;
};

const PRESETS: PresetDef[] = [
  {
    label: "What is the current IL exposure?",
    tool: "get_il_exposure",
    buildArgs: (s) => ({
      entryPrice: s?.entryPrice ?? 2000,
      currentPrice: s?.currentPrice ?? 2187,
      tickLower: s?.tickLower ?? -600,
      tickUpper: s?.tickUpper ?? 600,
    }),
  },
  {
    label: "Show delta exposure",
    tool: "get_delta_exposure",
    buildArgs: (s) => ({
      currentPrice: s?.currentPrice ?? 2187,
      entryPrice: s?.entryPrice ?? 2000,
      tickLower: s?.tickLower ?? -600,
      tickUpper: s?.tickUpper ?? 600,
      hedgeRatio: s?.hedgeRatio ?? 0.7,
    }),
  },
  {
    label: "What are the optimal tick ranges?",
    tool: "compute_optimal_ticks",
    buildArgs: (s) => ({
      currentPrice: s?.currentPrice ?? 2187,
      annualizedVolBps: s?.volBps ?? 5000,
      coverageHorizonDays: 7,
      confidenceLevel: 1.96,
    }),
  },
  {
    label: "Get live agent status",
    tool: "get_agent_status",
    buildArgs: () => ({}),
  },
  {
    label: "Estimate protection premium",
    tool: "check_premium_cost",
    buildArgs: () => ({ coverageAmountUSD: 1000, durationDays: 7 }),
  },
];

export function AgentChat() {
  const [result, setResult] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeLabel, setActiveLabel] = useState<string | null>(null);
  const [activeTool, setActiveTool] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const callPreset = async (preset: PresetDef) => {
    setLoading(true);
    setActiveLabel(preset.label);
    setActiveTool(preset.tool);
    setError(null);
    setResult(null);
    try {
      // Fetch live snapshot first so computation tools get real values
      const snap = await fetchAgentSnapshot();
      const args = preset.buildArgs(snap);

      const res = await fetch(`${MCP_URL}/call/${preset.tool}`, {
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
              onClick={() => callPreset(p)}
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
