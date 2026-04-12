"use client";

import { useEffect, useState, useCallback } from "react";
import { ParryHUD } from "@/components/ParryHUD";
import { DeltaGauge } from "@/components/DeltaGauge";
import { PositionOrb } from "@/components/PositionOrb";
import { TerminalLog } from "@/components/TerminalLog";
import { MetricCard } from "@/components/MetricCard";
import { VolatilityBar } from "@/components/VolatilityBar";
import { TickRangeVisual } from "@/components/TickRangeVisual";

export interface AgentStatus {
  running: boolean;
  iteration: number;
  currentPrice: number;
  entryPrice: number;
  volBps: number;
  volRegime: "LOW" | "MEDIUM" | "HIGH" | "EXTREME";
  hedgeRatio: number;
  deltaExposure: number;
  ilPercent: number;
  hedgeAmountUSD: number;
  inRange: boolean;
  tickLower: number;
  tickUpper: number;
  totalHedgesTx: number;
  totalFeesCompounded: number;
  lastHedgeTx: string;
  lastActivity: string;
  policies: string[];
  vaultAddress: string;
  agentWallet: string;
  logs: string[];
}

const AGENT_URL = process.env.NEXT_PUBLIC_AGENT_URL || "http://localhost:3001";

const MOCK_STATUS: AgentStatus = {
  running: true,
  iteration: 42,
  currentPrice: 2034.18,
  entryPrice: 2000.0,
  volBps: 6200,
  volRegime: "HIGH",
  hedgeRatio: 0.9,
  deltaExposure: 0.4823,
  ilPercent: 0.87,
  hedgeAmountUSD: 981.42,
  inRange: true,
  tickLower: -600,
  tickUpper: 600,
  totalHedgesTx: 18,
  totalFeesCompounded: 3,
  lastHedgeTx: "0x4a9f2c1e8d3b7902",
  lastActivity: "Hedge: $981.42 ETH→USDC @ $2034.18",
  policies: ["0xaa...bb"],
  vaultAddress: "0xVault...",
  agentWallet: "0xAgent...",
  logs: [
    "[12:34:01.234] Price: $2034.18 | IL: 0.87% | Δ: 0.4823 | Hedge: $981.42",
    "[12:33:46.112] [HEDGE] ✓ Swapped $981.42 ETH→USDC (paper)",
    "[12:33:31.001] Vol 62.0% σ | regime=HIGH | hedge=90%",
    "[12:33:16.887] Optimal ticks: [-600, 600] @ vol=62.0%",
    "[12:33:01.431] [COMPOUND] Collected 0.3241 USDC fees, reinvested (paper)",
    "[12:32:46.220] Price: $2031.05 | IL: 0.77% | Δ: 0.4741 | Hedge: $963.11",
    "[12:32:31.009] [HEDGE] ✓ Swapped $963.11 ETH→USDC (paper)",
  ],
};

export default function Home() {
  const [status, setStatus] = useState<AgentStatus>(MOCK_STATUS);
  const [connected, setConnected] = useState(false);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch(`${AGENT_URL}/status`, {
        signal: AbortSignal.timeout(2000),
      });
      if (res.ok) {
        const data = await res.json();
        setStatus(data);
        setConnected(true);
      }
    } catch {
      setConnected(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 3000);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  const ilColor =
    status.ilPercent < 2
      ? "var(--green)"
      : status.ilPercent < 5
      ? "var(--amber)"
      : "var(--red)";

  const orbState =
    !status.running
      ? "idle"
      : status.ilPercent >= 10
      ? "danger"
      : status.ilPercent >= 3
      ? "warn"
      : "active";

  const vol = (status.volBps / 100).toFixed(1);
  const hedgePct = (status.hedgeRatio * 100).toFixed(0);

  return (
    <main
      className="min-h-screen hud-grid scanlines"
      style={{ background: "var(--bg-void)" }}
    >
      {/* ── Ticker bar ─────────────────────────────────────────────── */}
      <div
        style={{
          background: "var(--bg-deep)",
          borderBottom: "1px solid var(--border)",
          height: 32,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 48,
            height: "100%",
            paddingLeft: 16,
            fontSize: 11,
            color: "var(--text-dim)",
            fontFamily: "var(--font-hud), monospace",
            whiteSpace: "nowrap",
          }}
        >
          <span>
            ETH/USDC{" "}
            <span style={{ color: "var(--cyan)" }}>
              ${status.currentPrice.toFixed(2)}
            </span>
          </span>
          <span>
            IL{" "}
            <span style={{ color: ilColor }}>
              {status.ilPercent.toFixed(3)}%
            </span>
          </span>
          <span>
            σ{" "}
            <span style={{ color: "var(--purple)" }}>
              {vol}% [{status.volRegime}]
            </span>
          </span>
          <span>
            Δ{" "}
            <span style={{ color: "var(--cyan)" }}>
              {status.deltaExposure.toFixed(4)}
            </span>
          </span>
          <span>
            HEDGE{" "}
            <span style={{ color: "var(--green)" }}>{hedgePct}%</span>
          </span>
          <span>
            TXS{" "}
            <span style={{ color: "var(--amber)" }}>
              {status.totalHedgesTx}
            </span>
          </span>
          <span style={{ color: "var(--text-faint)" }}>
            X LAYER TESTNET (195)
          </span>
          <span style={{ color: "var(--text-faint)" }}>ONCHAIN OS POWERED</span>
          <span style={{ color: "var(--text-faint)" }}>
            UNISWAP V3 LP PROTECTION
          </span>
        </div>
      </div>

      <div className="max-w-screen-2xl mx-auto px-4 py-6">
        {/* ── Header ─────────────────────────────────────────────────── */}
        <header
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 32,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <ParryHUD size={56} orbState={orbState} />
            <div>
              <h1
                style={{
                  fontFamily: "var(--font-orbitron), sans-serif",
                  fontSize: 28,
                  fontWeight: 800,
                  letterSpacing: "0.1em",
                  color: "var(--cyan)",
                }}
                className="text-glow-cyan"
              >
                PARRY
              </h1>
              <p
                style={{
                  fontSize: 10,
                  color: "var(--text-dim)",
                  letterSpacing: "0.2em",
                  marginTop: 2,
                }}
              >
                DELTA-NEUTRAL LP PROTECTION PROTOCOL
              </p>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: connected ? "var(--green)" : "var(--red)",
                  boxShadow: connected
                    ? "0 0 8px var(--green)"
                    : "0 0 8px var(--red)",
                }}
              />
              <span
                style={{
                  fontSize: 11,
                  color: connected ? "var(--green)" : "var(--red)",
                  fontFamily: "var(--font-hud), monospace",
                  letterSpacing: "0.1em",
                }}
              >
                {connected ? "AGENT LIVE" : "DEMO MODE"}
              </span>
            </div>
            <div
              style={{
                fontSize: 10,
                color: "var(--text-dim)",
                fontFamily: "var(--font-hud), monospace",
                textAlign: "right",
              }}
            >
              <div>X LAYER TESTNET</div>
              <div style={{ color: "var(--text-faint)", marginTop: 2 }}>
                {status.vaultAddress !== "0xVault..."
                  ? `${status.vaultAddress.slice(0, 10)}...`
                  : "Deploy vault first"}
              </div>
            </div>
          </div>
        </header>

        {/* ── Row 1: Core metrics ────────────────────────────────────── */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            gap: 16,
            marginBottom: 16,
          }}
        >
          <MetricCard
            label="ETH PRICE"
            value={`$${status.currentPrice.toFixed(2)}`}
            subvalue={`Entry: $${status.entryPrice.toFixed(2)}`}
            color="var(--cyan)"
            trend={status.currentPrice > status.entryPrice ? "up" : "down"}
          />
          <MetricCard
            label="IL EXPOSURE"
            value={`${status.ilPercent.toFixed(3)}%`}
            subvalue={
              status.ilPercent < 2
                ? "LOW RISK"
                : status.ilPercent < 5
                ? "MODERATE"
                : "HIGH RISK"
            }
            color={ilColor}
          />
          <MetricCard
            label="DELTA EXPOSURE"
            value={`${status.deltaExposure.toFixed(4)}`}
            subvalue={`≈ $${status.hedgeAmountUSD.toFixed(2)} to hedge`}
            color="var(--purple)"
            unit="ETH-eq"
          />
          <MetricCard
            label="HEDGES EXECUTED"
            value={`${status.totalHedgesTx}`}
            subvalue={`${status.totalFeesCompounded} fee compounds`}
            color="var(--green)"
            unit="TXS"
          />
        </div>

        {/* ── Row 2: Main panels ─────────────────────────────────────── */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr 280px",
            gap: 16,
            marginBottom: 16,
          }}
        >
          {/* Position status */}
          <div className="card-hud p-5 corner-brackets">
            <div
              style={{
                fontSize: 10,
                color: "var(--text-dim)",
                letterSpacing: "0.15em",
                marginBottom: 16,
              }}
            >
              POSITION STATUS
            </div>
            <div
              style={{ display: "flex", alignItems: "center", gap: 24, marginBottom: 24 }}
            >
              <PositionOrb state={orbState} size={80} />
              <div>
                <div
                  style={{
                    fontFamily: "var(--font-orbitron), sans-serif",
                    fontSize: 20,
                    fontWeight: 700,
                    color:
                      orbState === "active"
                        ? "var(--green)"
                        : orbState === "warn"
                        ? "var(--amber)"
                        : "var(--red)",
                    letterSpacing: "0.1em",
                  }}
                >
                  {orbState === "active"
                    ? "PROTECTED"
                    : orbState === "warn"
                    ? "CAUTION"
                    : orbState === "danger"
                    ? "CRITICAL"
                    : "INACTIVE"}
                </div>
                <div
                  style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 4 }}
                >
                  {status.inRange
                    ? "▶ In range — fees accruing"
                    : "⚠ Out of range — no fees"}
                </div>
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {[
                {
                  label: "HEDGE RATIO",
                  value: `${hedgePct}%`,
                  color: "var(--cyan)",
                },
                {
                  label: "IN RANGE",
                  value: status.inRange ? "YES" : "NO",
                  color: status.inRange ? "var(--green)" : "var(--amber)",
                },
                {
                  label: "ITERATION",
                  value: `#${status.iteration}`,
                  color: "var(--text-bright)",
                },
                {
                  label: "LAST HEDGE TX",
                  value: status.lastHedgeTx
                    ? `${status.lastHedgeTx.slice(0, 18)}...`
                    : "—",
                  color: "var(--cyan)",
                },
              ].map(({ label, value, color }) => (
                <div key={label} className="data-row">
                  <span className="data-label">{label}</span>
                  <span
                    className="data-value"
                    style={{ color, fontSize: label === "LAST HEDGE TX" ? 9 : undefined }}
                  >
                    {value}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Delta + Volatility gauges */}
          <div
            className="card-hud p-5"
            style={{ display: "flex", flexDirection: "column", gap: 20 }}
          >
            <div
              style={{
                fontSize: 10,
                color: "var(--text-dim)",
                letterSpacing: "0.15em",
              }}
            >
              DELTA & VOLATILITY MODEL
            </div>
            <DeltaGauge
              deltaExposure={status.deltaExposure}
              hedgeAmountUSD={status.hedgeAmountUSD}
            />
            <VolatilityBar
              volBps={status.volBps}
              regime={status.volRegime}
              hedgeRatio={status.hedgeRatio}
            />
            <TickRangeVisual
              currentPrice={status.currentPrice}
              entryPrice={status.entryPrice}
              tickLower={status.tickLower}
              tickUpper={status.tickUpper}
            />
          </div>

          {/* OnchainOS modules */}
          <div className="card-hud p-4">
            <div
              style={{
                fontSize: 10,
                color: "var(--text-dim)",
                letterSpacing: "0.15em",
                marginBottom: 12,
              }}
            >
              ONCHAIN OS MODULES
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {[
                { name: "okx-dex-market", status: "ACTIVE", color: "var(--green)" },
                { name: "okx-dex-swap", status: "READY", color: "var(--cyan)" },
                { name: "okx-defi-invest", status: "ACTIVE", color: "var(--green)" },
                { name: "okx-agentic-wallet", status: "ACTIVE", color: "var(--green)" },
                { name: "okx-security", status: "ACTIVE", color: "var(--green)" },
                { name: "okx-x402-payment", status: "ACTIVE", color: "var(--green)" },
                { name: "okx-audit-log", status: "ACTIVE", color: "var(--green)" },
              ].map((mod) => (
                <div
                  key={mod.name}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "4px 8px",
                    background: "rgba(255,255,255,0.02)",
                    borderRadius: 2,
                    border: "1px solid var(--border)",
                  }}
                >
                  <span
                    style={{
                      fontSize: 9,
                      color: "var(--text-dim)",
                      fontFamily: "var(--font-hud), monospace",
                    }}
                  >
                    {mod.name}
                  </span>
                  <span
                    style={{
                      fontSize: 9,
                      color: mod.color,
                      letterSpacing: "0.1em",
                    }}
                  >
                    {mod.status}
                  </span>
                </div>
              ))}
            </div>
            <div
              style={{
                marginTop: 16,
                padding: 8,
                background: "rgba(0,0,0,0.4)",
                borderRadius: 2,
                border: "1px solid var(--border)",
              }}
            >
              <div
                style={{
                  fontSize: 9,
                  color: "var(--text-dim)",
                  marginBottom: 6,
                  letterSpacing: "0.1em",
                }}
              >
                MCP TOOLS EXPOSED
              </div>
              {[
                "get_il_exposure",
                "get_delta_exposure",
                "compute_optimal_ticks",
                "activate_protection",
              ].map((tool) => (
                <div
                  key={tool}
                  style={{
                    fontSize: 9,
                    color: "var(--cyan)",
                    lineHeight: 1.9,
                    fontFamily: "var(--font-hud), monospace",
                  }}
                >
                  ▸ {tool}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── Row 3: Terminal + Cycle ────────────────────────────────── */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 16,
            marginBottom: 16,
          }}
        >
          <div className="card-hud p-4">
            <div
              style={{
                fontSize: 10,
                color: "var(--text-dim)",
                letterSpacing: "0.15em",
                marginBottom: 10,
                display: "flex",
                justifyContent: "space-between",
              }}
            >
              <span>AGENT TERMINAL</span>
              <span
                className="cursor-blink"
                style={{ color: "var(--green)", fontSize: 10 }}
              >
                RUNNING
              </span>
            </div>
            <TerminalLog logs={status.logs} />
          </div>

          {/* Earn-pay-earn cycle */}
          <div className="card-hud p-4">
            <div
              style={{
                fontSize: 10,
                color: "var(--text-dim)",
                letterSpacing: "0.15em",
                marginBottom: 14,
              }}
            >
              EARN-PAY-EARN CYCLE
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              {[
                {
                  step: "01",
                  label: "LP OPENS POSITION",
                  sub: "onchainos defi invest → Uniswap V3 on X Layer",
                  color: "var(--cyan)",
                },
                {
                  step: "02",
                  label: "FEES ACCRUE",
                  sub: "V3 trading fees → LP balance",
                  color: "var(--cyan)",
                },
                {
                  step: "03",
                  label: "DELTA COMPUTED",
                  sub: "ΔV/ΔS = L/√S − L/√Pb | adaptive σ regime",
                  color: "var(--purple)",
                },
                {
                  step: "04",
                  label: "HEDGE EXECUTED",
                  sub: "onchainos swap execute ETH→USDC",
                  color: "var(--purple)",
                },
                {
                  step: "05",
                  label: "FEES COMPOUNDED",
                  sub: "onchainos defi collect V3_FEE → reinvest",
                  color: "var(--green)",
                },
                {
                  step: "06",
                  label: "PREMIUM PAID",
                  sub: "x402 HTTP payment → ParryVault.sol",
                  color: "var(--green)",
                },
                {
                  step: "07",
                  label: "IL CLAIM (if triggered)",
                  sub: "agent sig → vault payout → NFT burned",
                  color: "var(--amber)",
                },
              ].map(({ step, label, sub, color }, i) => (
                <div
                  key={step}
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 10,
                    padding: "7px 0",
                    borderBottom:
                      i < 6 ? "1px solid var(--border)" : "none",
                  }}
                >
                  <span
                    style={{
                      fontSize: 9,
                      color: "var(--text-faint)",
                      minWidth: 18,
                      fontFamily: "var(--font-hud), monospace",
                    }}
                  >
                    {step}
                  </span>
                  <div style={{ flex: 1 }}>
                    <div
                      style={{
                        fontSize: 10,
                        color,
                        letterSpacing: "0.05em",
                        fontFamily: "var(--font-orbitron), sans-serif",
                        fontWeight: 600,
                      }}
                    >
                      {label}
                    </div>
                    <div
                      style={{
                        fontSize: 9,
                        color: "var(--text-dim)",
                        marginTop: 2,
                      }}
                    >
                      {sub}
                    </div>
                  </div>
                  {i < 6 && (
                    <div
                      style={{
                        color: "var(--text-faint)",
                        fontSize: 12,
                        alignSelf: "center",
                      }}
                    >
                      ↓
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── Footer ─────────────────────────────────────────────────── */}
        <footer
          style={{
            borderTop: "1px solid var(--border)",
            paddingTop: 16,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div
            style={{
              fontSize: 10,
              color: "var(--text-dim)",
              fontFamily: "var(--font-hud), monospace",
            }}
          >
            Parry Protocol © 2026 — BUILT BY{" "}
            <a
              href="https://github.com/Gideon145"
              target="_blank"
              rel="noreferrer"
              style={{ color: "var(--cyan)" }}
            >
              GIDEON145
            </a>{" "}
            FOR OKX BUILD-X HACKATHON
          </div>
          <div
            style={{
              fontSize: 9,
              color: "var(--text-faint)",
              fontFamily: "var(--font-hud), monospace",
              letterSpacing: "0.1em",
            }}
          >
            X LAYER TESTNET · ONCHAIN OS · UNISWAP V3 · EIP-712
          </div>
        </footer>
      </div>
    </main>
  );
}
