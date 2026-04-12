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
const FALLBACK_AGENT_URL = "https://parry-protocol-production.up.railway.app";
const FALLBACK_WALLET = "0x94A4365E6B7E79791258A3Fa071824BC2b75a394";
const FALLBACK_VAULT = "0x57C7f2F3051928E2cc7C871Bac590bF1d4BF4c8e";
const OKLINK_BASE = "https://oklink.com/x-layer-testnet";

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
  const [lastUpdated, setLastUpdated] = useState<string>("--");

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch(`${AGENT_URL}/status?t=${Date.now()}`, {
        signal: AbortSignal.timeout(5000),
        cache: "no-store",
      });
      if (res.ok) {
        const data = await res.json();
        setStatus(data);
        setConnected(true);
        setLastUpdated(new Date().toLocaleTimeString());
      } else {
        setConnected(false);
      }
    } catch {
      setConnected(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 2000);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  useEffect(() => {
    if (connected) return;
    const demoInterval = setInterval(() => {
      setStatus((prev) => {
        const drift = (Math.random() - 0.5) * 2.2;
        const nextPrice = Number((prev.currentPrice + drift).toFixed(2));
        const nextIl = Math.max(0, Number((prev.ilPercent + (Math.random() - 0.5) * 0.12).toFixed(3)));
        const nextDelta = Math.max(0, Math.min(1, Number((prev.deltaExposure + (Math.random() - 0.5) * 0.02).toFixed(4))));
        const nextHedgeUsd = Math.max(0, Number((nextDelta * 2000 + Math.random() * 120).toFixed(2)));

        const liveLog = `[${new Date().toLocaleTimeString()}] DEMO FEED | Price: $${nextPrice} | IL: ${nextIl}% | Δ: ${nextDelta} | Hedge: $${nextHedgeUsd}`;

        return {
          ...prev,
          iteration: prev.iteration + 1,
          currentPrice: nextPrice,
          ilPercent: nextIl,
          deltaExposure: nextDelta,
          hedgeAmountUSD: nextHedgeUsd,
          lastActivity: `Demo refresh @ $${nextPrice}`,
          logs: [liveLog, ...prev.logs].slice(0, 8),
        };
      });
      setLastUpdated(new Date().toLocaleTimeString());
    }, 2000);

    return () => clearInterval(demoInterval);
  }, [connected]);

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
  const validAddress = (value: string) => /^0x[a-fA-F0-9]{40}$/.test(value);
  const validTxHash = (value: string) => /^0x[a-fA-F0-9]{64}$/.test(value);
  const walletAddress = validAddress(status.agentWallet) ? status.agentWallet : FALLBACK_WALLET;
  const vaultAddress = validAddress(status.vaultAddress) ? status.vaultAddress : FALLBACK_VAULT;
  const txHash = validTxHash(status.lastHedgeTx) ? status.lastHedgeTx : "";
  const statusApiUrl = AGENT_URL.startsWith("http") ? AGENT_URL : FALLBACK_AGENT_URL;

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
          height: 46,
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
            fontSize: 15,
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
            X LAYER TESTNET (1952)
          </span>
          <span style={{ color: "var(--text-faint)" }}>ONCHAIN OS POWERED</span>
          <span style={{ color: "var(--text-faint)" }}>
            UNISWAP V3 LP PROTECTION
          </span>
        </div>
      </div>

      <div className="max-w-screen-2xl mx-auto px-4 py-8">
        {/* ── HERO INTRO SECTION ──────────────────────────────────── */}
        <div
          className="animate-in"
          style={{
            background: "linear-gradient(135deg, rgba(0,255,136,0.08) 0%, rgba(102,0,204,0.06) 100%)",
            border: "1px solid rgba(0,255,136,0.2)",
            borderRadius: 4,
            padding: "24px 28px",
            marginBottom: 28,
            backdropFilter: "blur(8px)",
          }}
        >
          <div
            style={{
              fontSize: 34,
              fontWeight: 600,
              color: "var(--cyan)",
              letterSpacing: "0.08em",
              marginBottom: 8,
            }}
          >
            WHAT IS PARRY PROTOCOL?
          </div>
          <div
            style={{
              fontSize: 21,
              lineHeight: 1.6,
              color: "var(--text-bright)",
              marginBottom: 12,
            }}
          >
            Parry is the first <strong>autonomous delta-neutral impermanent loss protection</strong> service for Uniswap V3 LPs on X Layer. Our agent runs 24/7 to:
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 16,
              fontSize: 18,
              color: "var(--text-dim)",
              lineHeight: 1.5,
            }}
          >
            <div>
              <span style={{ color: "var(--green)" }}>MONITOR</span> ETH/USDC price volatility in real-time<br/>
              <span style={{ color: "var(--green)" }}>COMPUTE</span> delta exposure using Uniswap V3 math<br/>
              <span style={{ color: "var(--green)" }}>HEDGE</span> positions via autonomous swaps
            </div>
            <div>
              <span style={{ color: "var(--green)" }}>COLLECT</span> trading fees & reinvest them (earn-on-earn)<br/>
              <span style={{ color: "var(--green)" }}>RECORD</span> all transactions on-chain (100% verifiable)<br/>
              <span style={{ color: "var(--green)" }}>PROTECT</span> LPs with IL insurance certificates
            </div>
          </div>
        </div>

        {/* ── Header ─────────────────────────────────────────────────── */}
        <header
          className="animate-in"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 32,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
            <ParryHUD size={72} orbState={orbState} />
            <div>
              <h1
                style={{
                  fontFamily: "var(--font-orbitron), sans-serif",
                  fontSize: 44,
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
                  fontSize: 15,
                  color: "var(--text-dim)",
                  letterSpacing: "0.2em",
                  marginTop: 4,
                }}
              >
                AUTONOMOUS LP PROTECTION ENGINE
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
                  fontSize: 14,
                  color: connected ? "var(--green)" : "var(--red)",
                  fontFamily: "var(--font-hud), monospace",
                  letterSpacing: "0.1em",
                }}
              >
                LIVE DEMO TEST
              </span>
            </div>
            <div
              style={{
                fontSize: 13,
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
              <div style={{ color: "var(--cyan)", marginTop: 4, fontSize: 12 }}>
                LAST SYNC: {lastUpdated}
              </div>
            </div>
          </div>
        </header>

        {/* ── Row 1: Core metrics ────────────────────────────────────── */}
        <div
          className="animate-in"
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
            tooltip="Current ETH/USDC exchange rate. Price moves above entry = potential IL gains."
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
            tooltip="Impermanent Loss: the gap between holding and LP'ing. We hedge to offset this."
          />
          <MetricCard
            label="DELTA EXPOSURE"
            value={`${status.deltaExposure.toFixed(4)}`}
            subvalue={`≈ $${status.hedgeAmountUSD.toFixed(2)} to hedge`}
            color="var(--purple)"
            unit="ETH-eq"
            tooltip="Unhedged directional risk. Δ=1 means fully long ETH. Our agent swaps to keep Δ≈0."
          />
          <MetricCard
            label="HEDGES EXECUTED"
            value={`${status.totalHedgesTx}`}
            subvalue={`${status.totalFeesCompounded} fee compounds`}
            color="var(--green)"
            unit="TXS"
            tooltip="Total hedge transactions + fee compounding events executed by the autonomous agent."
          />
        </div>

        {/* ── Row 2: Main panels ─────────────────────────────────────── */}
        <div
          className="animate-in"
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr 280px",
            gap: 16,
            marginBottom: 16,
          }}
        >
          {/* Position status */}
          <div className="card-hud hover-card p-5 corner-brackets">
            <div
              style={{
                fontSize: 12,
                color: "var(--text-dim)",
                letterSpacing: "0.15em",
                marginBottom: 18,
              }}
            >
              POSITION STATUS
            </div>
            <div
              style={{ display: "flex", alignItems: "center", gap: 28, marginBottom: 28 }}
            >
              <PositionOrb state={orbState} size={96} />
              <div>
                <div
                  style={{
                    fontFamily: "var(--font-orbitron), sans-serif",
                    fontSize: 24,
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
                  style={{ fontSize: 12, color: "var(--text-dim)", marginTop: 6 }}
                >
                  {status.inRange
                    ? "In range - fees accruing"
                    : "Out of range - no fees"}
                </div>
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {[
                {
                  label: "HEDGE RATIO",
                  value: `${hedgePct}%`,
                  color: "var(--cyan)",
                  tooltip: "How much of delta exposure is currently hedged (0-100%)",
                },
                {
                  label: "IN RANGE",
                  value: status.inRange ? "YES" : "NO",
                  color: status.inRange ? "var(--green)" : "var(--amber)",
                  tooltip: "Whether position is within tick bounds and generating trading fees",
                },
                {
                  label: "ITERATION",
                  value: `#${status.iteration}`,
                  color: "var(--text-bright)",
                  tooltip: "Agent loop cycle count (one per 15 seconds)",
                },
                {
                  label: "LAST HEDGE TX",
                  value: status.lastHedgeTx
                    ? `${status.lastHedgeTx.slice(0, 18)}...`
                    : "—",
                  color: "var(--cyan)",
                  tooltip: "Most recent hedge transaction hash on-chain",
                },
              ].map(({ label, value, color }) => (
                <div key={label} className="data-row">
                  <span className="data-label" style={{ fontSize: 11 }}>{label}</span>
                  <span
                    className="data-value"
                    style={{ color, fontSize: label === "LAST HEDGE TX" ? 10 : 12 }}
                  >
                    {value}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Delta + Volatility gauges */}
          <div
            className="card-hud hover-card p-5"
            style={{ display: "flex", flexDirection: "column", gap: 24 }}
          >
            <div
              style={{
                fontSize: 12,
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
          <div className="card-hud hover-card p-5">
            <div
              style={{
                fontSize: 12,
                color: "var(--text-dim)",
                letterSpacing: "0.15em",
                marginBottom: 14,
              }}
            >
              ONCHAIN OS SKILLS
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {[
                { name: "okx-dex-market", status: "ACTIVE", color: "var(--green)", tooltip: "Real-time price feeds" },
                { name: "okx-dex-swap", status: "READY", color: "var(--cyan)", tooltip: "Execute swaps on DEX" },
                { name: "okx-defi-invest", status: "ACTIVE", color: "var(--green)", tooltip: "LP position management" },
                { name: "okx-agentic-wallet", status: "ACTIVE", color: "var(--green)", tooltip: "TEE-signed transactions" },
                { name: "okx-security", status: "ACTIVE", color: "var(--green)", tooltip: "Signature verification" },
                { name: "okx-x402-payment", status: "ACTIVE", color: "var(--green)", tooltip: "HTTP micropayments" },
                { name: "okx-audit-log", status: "ACTIVE", color: "var(--green)", tooltip: "Immutable audit trail" },
              ].map((mod) => (
                <div
                  key={mod.name}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "6px 10px",
                    background: "rgba(255,255,255,0.02)",
                    borderRadius: 2,
                    border: "1px solid var(--border)",
                  }}
                >
                  <span
                    style={{
                      fontSize: 12,
                      color: "var(--text-dim)",
                      fontFamily: "var(--font-hud), monospace",
                    }}
                  >
                    {mod.name}
                  </span>
                  <span
                    style={{
                      fontSize: 12,
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
                  fontSize: 12,
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
                    fontSize: 12,
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

        {/* ── Evidence Links ───────────────────────────────────────── */}
        <div className="card-hud hover-card p-5 animate-in" style={{ marginBottom: 16 }}>
          <div
            style={{
              fontSize: 15,
              color: "var(--text-dim)",
              letterSpacing: "0.15em",
              marginBottom: 14,
            }}
          >
            DEMO EVIDENCE LINKS
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 12 }}>
            {[
              {
                label: "Last Hedge TX",
                href: txHash
                  ? `${OKLINK_BASE}/tx/${txHash}`
                  : `${OKLINK_BASE}/address/${walletAddress}`,
              },
              {
                label: "Agent Wallet Explorer",
                href: `${OKLINK_BASE}/address/${walletAddress}`,
              },
              {
                label: "Vault Contract",
                href: `${OKLINK_BASE}/address/${vaultAddress}`,
              },
              {
                label: "Agent Status API",
                href: `${statusApiUrl}/status`,
              },
              {
                label: "MCP Health",
                href: "https://ample-wisdom-production-f4c9.up.railway.app/health",
              },
              {
                label: "x402 Payment Info",
                href: "https://radiant-recreation-production-f473.up.railway.app/payment-info",
              },
            ].map((item) => (
              <a
                key={item.label}
                href={item.href}
                className="evidence-btn"
              >
                {item.label}
              </a>
            ))}
          </div>
        </div>

        {/* ── Row 3: Terminal + Cycle ────────────────────────────────── */}
        <div
          className="animate-in"
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 16,
            marginBottom: 16,
          }}
        >
          <div className="card-hud hover-card terminal-panel p-5">
            <div
              style={{
                fontSize: 14,
                color: "var(--text-dim)",
                letterSpacing: "0.15em",
                marginBottom: 12,
                display: "flex",
                justifyContent: "space-between",
              }}
            >
              <span>AGENT TERMINAL</span>
              <span
                className="cursor-blink"
                style={{ color: "var(--green)", fontSize: 13 }}
              >
                RUNNING
              </span>
            </div>
            <div className="terminal-watch">
              Watching live price feed, IL drift, delta risk, hedge sizing, and fee compounding signals every 2 seconds.
            </div>
            <TerminalLog logs={status.logs} />
          </div>

          {/* Earn-pay-earn cycle */}
          <div className="card-hud hover-card p-5">
            <div
              style={{
                fontSize: 12,
                color: "var(--text-dim)",
                letterSpacing: "0.15em",
                marginBottom: 16,
              }}
            >
              EARN-PAY-EARN CYCLE
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
              {[
                {
                  step: "01",
                  label: "LP OPENS POSITION",
                  sub: "onchainos defi invest → Uniswap V3 on X Layer",
                  color: "var(--cyan)",
                  tooltip: "LP creates concentrated liquidity position",
                },
                {
                  step: "02",
                  label: "FEES ACCRUE",
                  sub: "V3 trading fees → LP balance",
                  color: "var(--cyan)",
                  tooltip: "Trading fees accumulate as swaps happen",
                },
                {
                  step: "03",
                  label: "DELTA COMPUTED",
                  sub: "ΔV/ΔS = L/√S − L/√Pb | adaptive σ regime",
                  color: "var(--purple)",
                  tooltip: "Agent calculates delta using Uniswap V3 formula",
                },
                {
                  step: "04",
                  label: "HEDGE EXECUTED",
                  sub: "onchainos swap execute ETH→USDC",
                  color: "var(--purple)",
                  tooltip: "Agent swaps to offset directional risk",
                },
                {
                  step: "05",
                  label: "FEES COMPOUNDED",
                  sub: "onchainos defi collect V3_FEE → reinvest",
                  color: "var(--green)",
                  tooltip: "Collected fees reinvested into LP position",
                },
                {
                  step: "06",
                  label: "PREMIUM PAID",
                  sub: "x402 HTTP payment → ParryVault.sol",
                  color: "var(--green)",
                  tooltip: "Protection premium deducted via x402",
                },
                {
                  step: "07",
                  label: "IL CLAIM (if triggered)",
                  sub: "agent sig → vault payout → NFT burned",
                  color: "var(--amber)",
                  tooltip: "If IL > threshold, LP can claim insurance payout",
                },
              ].map(({ step, label, sub, color }, i) => (
                <div
                  key={step}
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 10,
                    padding: "8px 0",
                    borderBottom:
                      i < 6 ? "1px solid var(--border)" : "none",
                  }}
                >
                  <span
                    style={{
                      fontSize: 10,
                      color: "var(--text-faint)",
                      minWidth: 20,
                      fontFamily: "var(--font-hud), monospace",
                    }}
                  >
                    {step}
                  </span>
                  <div style={{ flex: 1 }}>
                    <div
                      style={{
                        fontSize: 13,
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
                        fontSize: 12,
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
                        fontSize: 13,
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
          className="animate-in"
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
