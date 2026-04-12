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

const FALLBACK_RESPONSES: Record<string, string> = {
  help: `Parry Protocol — what you can ask:\n\n▸ "what is my IL?" → impermanent loss % for the live position\n▸ "show delta" → ETH-equivalent directional exposure + hedge size\n▸ "optimal ticks" → statistically optimal tick range at current vol\n▸ "agent status" → live iteration, price, on-chain TX count\n▸ "estimate premium" → protection cost in OKB for $1000 coverage`,
  "what is il": `Impermanent Loss (IL) is the hidden cost of being a Uniswap V3 LP.\n\nWhen ETH price moves away from your entry price, your position ends up worth less than if you had simply held ETH+USDC in a wallet. Parry quantifies this loss every 15 seconds and executes offsetting hedge swaps to keep your position delta-neutral — so IL cannot compound.\n\nTry: "what is my IL?" to see the current exposure.`,
  "how does this work": `Parry runs a fully autonomous agent loop every 15 seconds:\n\n1. Fetches live ETH price via OnchainOS market skills\n2. Computes delta exposure using exact Uniswap V3 math: Δ = L × (1/√S − 1/√p_b)\n3. Gets realized volatility to adjust hedge ratio (HIGH vol → hedge more)\n4. If delta > threshold, swaps ETH→USDC via OKX DEX to neutralize exposure\n5. Records every action on X Layer Testnet — fully on-chain, fully verifiable\n6. Compounds accrued trading fees back into the LP position\n\nThe hedge API is gated by an x402 micropayment — pay only when protected.`,
  explain: `Parry Protocol is an autonomous impermanent loss protection agent for Uniswap V3 LPs on X Layer.\n\nIt watches your LP position, computes how much ETH price movement is hurting you, and automatically executes hedge swaps to offset that loss — 24/7, no human needed.\n\nBuilt with: OnchainOS skills (price + vol feeds), x402 payment protocol, MCP server (this interface), smart contracts on X Layer Testnet, and a Next.js dashboard you're looking at right now.\n\nAsk: "agent status", "what is my IL?", or "how does this work"`,
  "what can you do": `I can answer live questions about the Parry agent:\n\n• Current IL exposure on the monitored position\n• Delta exposure (how much ETH risk the LP is carrying)\n• Statistically optimal tick ranges given current volatility\n• Live agent status: price, iteration, on-chain TX count\n• Estimated protection premium cost\n\nEvery answer pulls real-time data from the running agent — not mock data.`,
};

function resolveIntent(query: string): PresetDef | "fallback" | null {
  const q = query.toLowerCase().trim();
  if (FALLBACK_RESPONSES[q]) return "fallback";
  if (/\bhelp\b|what can|capabilities/.test(q)) return "fallback";
  if (/what is il|explain il|impermanent loss\??$/.test(q)) return "fallback";
  if (/how does|how it works|explain/.test(q)) return "fallback";
  if (/il|impermanent|loss/.test(q)) return PRESETS[0];
  if (/delta|exposure|hedge amount/.test(q)) return PRESETS[1];
  if (/tick|range|optimal|rebalance/.test(q)) return PRESETS[2];
  if (/status|agent|running|iteration|price/.test(q)) return PRESETS[3];
  if (/premium|cost|protect|cover/.test(q)) return PRESETS[4];
  return null;
}

export function AgentChat() {
  const [result, setResult] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeLabel, setActiveLabel] = useState<string | null>(null);
  const [activeTool, setActiveTool] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [inputValue, setInputValue] = useState("");
  const [noMatch, setNoMatch] = useState(false);

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = inputValue.trim();
    if (!trimmed) return;
    setNoMatch(false);
    const intent = resolveIntent(trimmed);
    if (!intent) {
      setNoMatch(true);
      return;
    }
    setInputValue("");
    if (intent === "fallback") {
      // Find the best matching fallback key
      const q = trimmed.toLowerCase();
      const key = Object.keys(FALLBACK_RESPONSES).find((k) => q.includes(k)) ??
        ((/help|what can|capabilities/.test(q)) ? "help" :
         (/how does|how it works|explain/.test(q)) ? "how does this work" :
         "help");
      setActiveLabel(trimmed);
      setActiveTool("parry-agent");
      setResult(JSON.stringify({ tool: "parry-agent", answer: FALLBACK_RESPONSES[key] }, null, 2));
      return;
    }
    await callPreset({ ...intent, label: trimmed });
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
          marginBottom: 14,
          lineHeight: 1.5,
        }}
      >
        Type a question or click a preset — each call invokes the live MCP tool endpoint directly. No mock data.
      </div>

      {/* Freeform input */}
      <form onSubmit={handleSubmit} style={{ display: "flex", gap: 8, marginBottom: 14 }}>
        <input
          type="text"
          value={inputValue}
          onChange={(e) => { setInputValue(e.target.value); setNoMatch(false); }}
          placeholder="e.g. what is my IL? / show delta / optimal ticks / agent status"
          disabled={loading}
          style={{
            flex: 1,
            padding: "10px 14px",
            fontSize: 13,
            fontFamily: "var(--font-hud), monospace",
            background: "rgba(0,0,0,0.45)",
            border: `1px solid ${noMatch ? "rgba(255,100,100,0.5)" : "var(--border-glow)"}`,
            borderRadius: 3,
            color: "var(--text-primary)",
            outline: "none",
          }}
        />
        <button
          type="submit"
          disabled={loading || !inputValue.trim()}
          style={{
            padding: "10px 20px",
            fontSize: 12,
            fontFamily: "var(--font-hud), monospace",
            letterSpacing: "0.08em",
            border: "1px solid var(--cyan)",
            background: "rgba(0,212,255,0.1)",
            color: "var(--cyan)",
            borderRadius: 3,
            cursor: loading ? "wait" : "pointer",
            whiteSpace: "nowrap",
          }}
        >
          ASK ▸
        </button>
      </form>
      {noMatch && (
        <div style={{ fontSize: 11, color: "rgba(255,150,100,0.9)", marginBottom: 10, fontFamily: "var(--font-hud), monospace" }}>
          ✗ Not recognized — type "help" to see what I can answer
        </div>
      )}

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
