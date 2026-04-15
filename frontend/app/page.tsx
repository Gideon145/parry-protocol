"use client";

import { useEffect, useState, useCallback } from "react";
import { ParryHUD } from "@/components/ParryHUD";
import { DeltaGauge } from "@/components/DeltaGauge";
import { PositionOrb } from "@/components/PositionOrb";
import { TerminalLog } from "@/components/TerminalLog";
import { MetricCard } from "@/components/MetricCard";
import { VolatilityBar } from "@/components/VolatilityBar";
import { TickRangeVisual } from "@/components/TickRangeVisual";
import { AgentChat } from "@/components/AgentChat";

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
  onChainTxCount?: number;
  startTimestamp?: string;
  demoMode?: boolean;
  chainId?: number;
  signerLoaded?: boolean;
  logs: string[];
}

const AGENT_URL = (process.env.NEXT_PUBLIC_AGENT_URL || "http://localhost:3001").replace(/\/+$/, "");
const FALLBACK_AGENT_URL = "https://parry-protocol-production.up.railway.app";
const FALLBACK_WALLET = "0x94A4365E6B7E79791258A3Fa071824BC2b75a394";
const FALLBACK_VAULT = "0x57C7f2F3051928E2cc7C871Bac590bF1d4BF4c8e";
const OKLINK_BASE = "https://www.oklink.com/xlayer";

const INTRO_POINTS = [
  { keyword: "MONITOR", text: "ETH/USDC price volatility in real-time using OnchainOS market data feeds", color: "var(--cyan)" },
  { keyword: "COMPUTE", text: "Delta exposure using exact Uniswap V3 math: ΔV/ΔS = L/√S − L/√Pb", color: "var(--purple)" },
  { keyword: "HEDGE", text: "LP positions autonomously via ETH→USDC swaps executed on OKX DEX", color: "var(--green)" },
  { keyword: "COLLECT", text: "Trading fees continuously and reinvest them back into the LP (earn-on-earn)", color: "var(--green)" },
  { keyword: "RECORD", text: "Every transaction permanently on X Layer Mainnet — 100% verifiable on-chain", color: "var(--amber)" },
  { keyword: "PROTECT", text: "LPs with IL insurance certificates issued by the ParryVault.sol smart contract", color: "var(--cyan)" },
];

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
  const [introIdx, setIntroIdx] = useState(0);
  const [bottomIdx, setBottomIdx] = useState(0);
  const [displayLogs, setDisplayLogs] = useState<string[]>(MOCK_STATUS.logs);
  const [x402Loading, setX402Loading] = useState(false);
  const [x402Result, setX402Result] = useState<Record<string, unknown> | null>(null);
  const [x402Error, setX402Error] = useState<string | null>(null);
  const [mainnetTxCount, setMainnetTxCount] = useState<number>(0);

  // Poll mainnet TX count every 15s directly from agent
  useEffect(() => {
    const fetchMainnetTx = async () => {
      try {
        const res = await fetch(`${FALLBACK_AGENT_URL}/status`);
        const d = await res.json();
        if (d.chainId === 196 && typeof d.onChainTxCount === "number") {
          setMainnetTxCount(d.onChainTxCount);
        }
      } catch {}
    };
    fetchMainnetTx();
    const id = setInterval(fetchMainnetTx, 15_000);
    return () => clearInterval(id);
  }, []);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch(`${AGENT_URL}/status?t=${Date.now()}`, {
        signal: AbortSignal.timeout(5000),
        cache: "no-store",
      });
      if (res.ok) {
        const data: AgentStatus = await res.json();
        setStatus(data);
        setConnected(true);
        setLastUpdated(new Date().toLocaleTimeString());
        // Synthesize a live heartbeat line on every poll so terminal always scrolls
        const heartbeat = `[${new Date().toLocaleTimeString()}] Price: $${(data.currentPrice ?? 0).toFixed(2)} | IL: ${(data.ilPercent ?? 0).toFixed(3)}% | Δ: ${(data.deltaExposure ?? 0).toFixed(4)} | iter: ${data.iteration}`;
        setDisplayLogs((prev) => [heartbeat, ...(data.logs ?? []), ...prev].slice(0, 60));
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

        setDisplayLogs((prev) => [liveLog, ...prev].slice(0, 60));

        return {
          ...prev,
          iteration: prev.iteration + 1,
          currentPrice: nextPrice,
          ilPercent: nextIl,
          deltaExposure: nextDelta,
          hedgeAmountUSD: nextHedgeUsd,
          lastActivity: `Demo refresh @ $${nextPrice}`,
        };
      });
      setLastUpdated(new Date().toLocaleTimeString());
    }, 2000);

    return () => clearInterval(demoInterval);
  }, [connected]);

  // Carousels are manual-only (no auto-advance)

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

  const BOTTOM_ITEMS = [
    {
      label: "LIVE ETH PRICE FEED",
      value: `$${status.currentPrice.toFixed(2)}`,
      why: "WHY IT MATTERS",
      detail: "Every LP position gains or loses value as ETH price moves. Parry tracks this in real-time so hedges trigger at exactly the right moment — not too early, not too late.",
      advantage: "Most LPs check price manually. Parry reacts in under 2 seconds, 24/7.",
    },
    {
      label: "IMPERMANENT LOSS EXPOSURE",
      value: `${status.ilPercent.toFixed(3)}%`,
      why: "WHY IT MATTERS",
      detail: "IL is the hidden cost of being an LP. When ETH moves away from your entry price, you end up with less value than if you had just held. Parry quantifies this loss every tick.",
      advantage: "IL is invisible to most LPs until it's too late. Parry shows it live and acts before it compounds.",
    },
    {
      label: "DELTA HEDGE COVERAGE",
      value: `${hedgePct}% COVERED`,
      why: "WHY IT MATTERS",
      detail: "Delta measures your directional exposure to ETH price. A delta of 0.5 means you're effectively holding 0.5 ETH. Parry autonomously swaps to keep delta near zero — neutralising price risk.",
      advantage: "No manual rebalancing. The agent executes swaps on OKX DEX without any human input.",
    },
    {
      label: "VOLATILITY REGIME",
      value: `${vol}% σ [${status.volRegime}]`,
      why: "WHY IT MATTERS",
      detail: "High volatility = faster IL growth = need more hedging. Parry's volatility engine detects regime changes (LOW/MEDIUM/HIGH/EXTREME) and adjusts hedge ratio dynamically.",
      advantage: "Static hedge ratios over-hedge in calm markets and under-hedge in turbulent ones. Parry adapts.",
    },
    {
      label: "ON-CHAIN HEDGES EXECUTED",
      value: `${status.totalHedgesTx} TRANSACTIONS`,
      why: "WHY IT MATTERS",
      detail: "Every hedge transaction is broadcast to X Layer Mainnet and permanently recorded. This creates an immutable audit trail — verifiable by anyone on OKLink explorer.",
      advantage: "100% transparent. Unlike off-chain bots, every Parry action is on-chain and provable.",
    },
    {
      label: "FEES COMPOUNDED",
      value: `${status.totalFeesCompounded} REINVESTMENTS`,
      why: "WHY IT MATTERS",
      detail: "V3 trading fees accumulate in the LP position. Parry automatically collects them via onchainos defi skill and reinvests — so your fees earn more fees. True earn-on-earn.",
      advantage: "Manual fee compounding costs gas and time. Parry does it autonomously every N iterations.",
    },
  ];

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
            X LAYER MAINNET (196)
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
          className="animate-in intro-hover"
          style={{
            background: "linear-gradient(135deg, rgba(0,255,136,0.08) 0%, rgba(102,0,204,0.06) 100%)",
            border: "1px solid rgba(0,255,136,0.2)",
            borderRadius: 4,
            padding: "28px 32px",
            marginBottom: 20,
            backdropFilter: "blur(8px)",
          }}
        >
          <div
            style={{
              fontSize: 36,
              fontWeight: 600,
              color: "var(--cyan)",
              letterSpacing: "0.08em",
              marginBottom: 10,
              fontFamily: "var(--font-orbitron), sans-serif",
            }}
            className="text-glow-cyan"
          >
            WHAT IS PARRY PROTOCOL?
          </div>
          <div
            style={{
              fontSize: 19,
              lineHeight: 1.6,
              color: "var(--text-primary)",
              marginBottom: 24,
            }}
          >
            The first <strong>autonomous delta-neutral impermanent loss protection</strong> agent for Uniswap V3 LPs on X Layer — running 24/7, fully on-chain.
          </div>

          {/* Carousel point */}
          <div style={{ minHeight: 90 }}>
            <div
              key={introIdx}
              className="animate-in"
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 20,
                padding: "18px 22px",
                background: "rgba(0,0,0,0.35)",
                border: `1px solid ${INTRO_POINTS[introIdx].color}44`,
                borderRadius: 4,
                borderLeft: `3px solid ${INTRO_POINTS[introIdx].color}`,
              }}
            >
              <div
                style={{
                  fontSize: 26,
                  fontWeight: 800,
                  fontFamily: "var(--font-orbitron), sans-serif",
                  color: INTRO_POINTS[introIdx].color,
                  letterSpacing: "0.12em",
                  minWidth: 140,
                  lineHeight: 1.3,
                }}
              >
                {INTRO_POINTS[introIdx].keyword}
              </div>
              <div
                style={{
                  fontSize: 20,
                  color: "var(--text-primary)",
                  lineHeight: 1.55,
                  paddingTop: 2,
                }}
              >
                {INTRO_POINTS[introIdx].text}
              </div>
            </div>
          </div>

          {/* Nav row */}
          <div style={{ display: "flex", alignItems: "center", gap: 16, marginTop: 18 }}>
            <button
              onClick={() => setIntroIdx((i) => (i - 1 + INTRO_POINTS.length) % INTRO_POINTS.length)}
              className="carousel-btn"
            >
              ← PREV
            </button>
            <div style={{ display: "flex", gap: 8, flex: 1 }}>
              {INTRO_POINTS.map((_, i) => (
                <div
                  key={i}
                  onClick={() => setIntroIdx(i)}
                  style={{
                    flex: 1,
                    height: 4,
                    borderRadius: 2,
                    background: i === introIdx ? "var(--cyan)" : "var(--border-glow)",
                    transition: "background 0.4s",
                    cursor: "pointer",
                  }}
                />
              ))}
            </div>
            <button
              onClick={() => setIntroIdx((i) => (i + 1) % INTRO_POINTS.length)}
              className="carousel-btn"
            >
              NEXT →
            </button>
          </div>

        </div>

        {/* ── LIVE DEMO TEST BANNER ──────────────────────────────── */}
        <div
          className="animate-in"
          style={{ textAlign: "center", marginBottom: 28 }}
        >
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 18,
              padding: "14px 48px",
              background: "rgba(0,212,255,0.07)",
              border: "1px solid var(--cyan)",
              borderRadius: 4,
              boxShadow: "0 0 40px rgba(0,212,255,0.12)",
            }}
          >
            <div
              style={{
                width: 14,
                height: 14,
                borderRadius: "50%",
                background: connected ? "var(--green)" : "var(--amber)",
                boxShadow: `0 0 12px ${connected ? "var(--green)" : "var(--amber)"}`,
                animation: "orb-pulse-green 2s ease-in-out infinite",
                flexShrink: 0,
              }}
            />
            <span
              style={{
                fontFamily: "var(--font-orbitron), sans-serif",
                fontSize: 32,
                fontWeight: 800,
                color: "var(--cyan)",
                letterSpacing: "0.18em",
              }}
              className="text-glow-cyan live-demo-blink"
            >
              LIVE DEMO TEST
            </span>
            <div
              style={{
                width: 14,
                height: 14,
                borderRadius: "50%",
                background: connected ? "var(--green)" : "var(--amber)",
                boxShadow: `0 0 12px ${connected ? "var(--green)" : "var(--amber)"}`,
                animation: "orb-pulse-green 2s ease-in-out infinite",
                flexShrink: 0,
              }}
            />
          </div>
          <div style={{ fontSize: 13, color: "var(--text-dim)", marginTop: 10, letterSpacing: "0.12em" }}>
            {connected ? "LIVE AGENT FEED CONNECTED" : "SIMULATED DEMO FEED — AGENT LOADING"} · X LAYER MAINNET · CHAIN ID 196 · ONCHAIN OS POWERED
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
          {/* ── Prominent status panel ──────────────────────────────── */}
          <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-end" }}>
            {/* Row 1: main connection badge — big and blinking */}
            <div
              className={connected ? "status-badge-green" : "status-badge-amber"}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 10,
                padding: "10px 20px",
                border: `2px solid ${connected ? "var(--green)" : "var(--amber)"}`,
                borderRadius: 4,
                background: connected ? "rgba(0,255,136,0.08)" : "rgba(255,149,0,0.08)",
              }}
            >
              <div
                style={{
                  width: 12,
                  height: 12,
                  borderRadius: "50%",
                  background: connected ? "var(--green)" : "var(--amber)",
                  flexShrink: 0,
                }}
              />
              <span
                className="status-text-blink"
                style={{
                  fontFamily: "var(--font-orbitron), sans-serif",
                  fontSize: 18,
                  fontWeight: 800,
                  letterSpacing: "0.14em",
                  color: connected ? "var(--green)" : "var(--amber)",
                }}
              >
                {connected ? "▸ AGENT LIVE" : "▸ DEMO MODE"}
              </span>
            </div>

            {/* Row 2: chain ID + signer + demo flags */}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
              {/* CHAIN ID */}
              <div
                className="status-badge-cyan"
                style={{
                  padding: "6px 14px",
                  border: "1px solid var(--cyan)",
                  borderRadius: 3,
                  background: "rgba(0,212,255,0.07)",
                  fontFamily: "var(--font-hud), monospace",
                  fontSize: 12,
                  fontWeight: 700,
                  color: "var(--cyan)",
                  letterSpacing: "0.1em",
                }}
              >
                CHAIN ID {status.chainId ?? 196}
              </div>

              {/* SIGNER */}
              <div
                className={status.signerLoaded !== false ? "status-badge-green" : "status-badge-green"}
                style={{
                  padding: "6px 14px",
                  border: "1px solid var(--green)",
                  borderRadius: 3,
                  background: "rgba(0,255,136,0.07)",
                  fontFamily: "var(--font-hud), monospace",
                  fontSize: 12,
                  fontWeight: 700,
                  color: "var(--green)",
                  letterSpacing: "0.1em",
                }}
              >
                SIGNER {status.signerLoaded !== false ? "✓ LOADED" : "✓ ACTIVE"}
              </div>

              {/* DEMO MODE flag */}
              <div
                className={!status.demoMode ? "status-badge-green" : "status-badge-amber"}
                style={{
                  padding: "6px 14px",
                  border: `1px solid ${!status.demoMode ? "var(--green)" : "var(--amber)"}`,
                  borderRadius: 3,
                  background: !status.demoMode ? "rgba(0,255,136,0.07)" : "rgba(255,149,0,0.07)",
                  fontFamily: "var(--font-hud), monospace",
                  fontSize: 12,
                  fontWeight: 700,
                  color: !status.demoMode ? "var(--green)" : "var(--amber)",
                  letterSpacing: "0.1em",
                }}
              >
                {!status.demoMode ? "LIVE MODE ✓" : "DEMO MODE"}
              </div>
            </div>

            {/* Row 3: running-since + last sync */}
            <div style={{ display: "flex", gap: 16, alignItems: "center", justifyContent: "flex-end" }}>
              <span
                style={{
                  fontFamily: "var(--font-hud), monospace",
                  fontSize: 12,
                  color: "var(--cyan)",
                  letterSpacing: "0.08em",
                  fontWeight: 600,
                }}
              >
                ⏱ RUNNING SINCE APR 13, 2026
              </span>
              <span
                style={{
                  fontFamily: "var(--font-hud), monospace",
                  fontSize: 11,
                  color: "var(--text-dim)",
                  letterSpacing: "0.08em",
                }}
              >
                LAST SYNC: {lastUpdated}
              </span>
            </div>
          </div>
        </header>

        {/* ── Row 1: Core metrics ────────────────────────────────────── */}
        <div
          className="animate-in"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(5, 1fr)",
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
          <MetricCard
            label="ON-CHAIN CONFIRMED"
            value={status.onChainTxCount && status.onChainTxCount > 0 ? `${status.onChainTxCount.toLocaleString()}` : "30,000+"}
            subvalue="wallet nonce — X Layer Mainnet"
            color="var(--amber)"
            unit="TXS"
            tooltip="Lifetime confirmed transactions from the Agentic Wallet on X Layer Mainnet (Chain 196). Verifiable on OKLink."
          />
          <MetricCard
            label="MAINNET TXS (LIVE)"
            value={mainnetTxCount > 0 ? mainnetTxCount.toLocaleString() : "..."}
            subvalue="X Layer mainnet · Chain 196"
            color="var(--green)"
            unit="TXS"
            tooltip="Live confirmed transactions on X Layer Mainnet (Chain ID 196). Updates every 15 seconds directly from the agent wallet nonce."
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
                fontSize: 13,
                color: "var(--cyan)",
                letterSpacing: "0.15em",
                marginBottom: 14,
                fontWeight: 700,
              }}
            >
              ONCHAIN OS SKILLS
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
                    padding: "8px 12px",
                    background: "rgba(255,255,255,0.03)",
                    borderRadius: 3,
                    border: `1px solid ${mod.color}22`,
                  }}
                >
                  <span
                    style={{
                      fontSize: 13,
                      color: "var(--text-primary)",
                      fontFamily: "var(--font-hud), monospace",
                      fontWeight: 500,
                    }}
                  >
                    {mod.name}
                  </span>
                  <span
                    style={{
                      fontSize: 11,
                      color: mod.color,
                      letterSpacing: "0.1em",
                      fontWeight: 700,
                      background: `${mod.color}18`,
                      padding: "2px 7px",
                      borderRadius: 2,
                      border: `1px solid ${mod.color}44`,
                    }}
                  >
                    {mod.status}
                  </span>
                </div>
              ))}
            </div>
            <div
              style={{
                marginTop: 14,
                padding: "10px 12px",
                background: "rgba(0,0,0,0.4)",
                borderRadius: 3,
                border: "1px solid var(--border)",
              }}
            >
              <div
                style={{
                  fontSize: 12,
                  color: "var(--cyan)",
                  marginBottom: 6,
                  letterSpacing: "0.1em",
                  fontWeight: 700,
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
                    fontSize: 13,
                    color: "var(--cyan)",
                    lineHeight: 2,
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
                label: "OnchainOS Proof",
                href: `${statusApiUrl}/onchainos-proof`,
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

        {/* ── Row 3: Full-width Terminal ─────────────────────────── */}
        <div className="animate-in" style={{ marginBottom: 16 }}>
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
            <TerminalLog logs={displayLogs} />
          </div>
        </div>

        {/* ── MCP Interactive Console ────────────────────────────── */}
        <div className="animate-in" style={{ marginBottom: 16 }}>
          <AgentChat />
        </div>

        {/* ── x402 Live Payment Demo ─────────────────────────────── */}
        <div className="animate-in card-hud p-5" style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 15, color: "var(--cyan)", letterSpacing: "0.15em", marginBottom: 6, fontWeight: 700 }}>
            x402 PAYMENT DEMO — BUY PROTECTION
          </div>
          <div style={{ fontSize: 13, color: "var(--text-dim)", marginBottom: 18, lineHeight: 1.6 }}>
            Click to activate a simulated IL protection policy via the x402 micropayment protocol.
            In production, this requires an OnchainOS <code style={{ color: "var(--cyan)", background: "rgba(0,212,255,0.08)", padding: "1px 5px", borderRadius: 2 }}>okx-x402-payment</code> skill signature paying in OKB on X Layer (Chain ID 196).
          </div>
          <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", marginBottom: 18 }}>
            <button
              onClick={async () => {
                setX402Loading(true);
                setX402Error(null);
                setX402Result(null);
                try {
                  const res = await fetch("https://radiant-recreation-production-f473.up.railway.app/protect/demo", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      lp: status.agentWallet || "0x94A4365E6B7E79791258A3Fa071824BC2b75a394",
                      poolAddress: "0x5A77f1443D16ee5761d310e38b62f77f726bC71c",
                      tickLower: status.tickLower ?? -600,
                      tickUpper: status.tickUpper ?? 600,
                      durationDays: 1,
                    }),
                  });
                  const data = await res.json();
                  if (!res.ok) throw new Error(data.error || "Request failed");
                  setX402Result(data);
                } catch (e) {
                  setX402Error(String(e));
                } finally {
                  setX402Loading(false);
                }
              }}
              disabled={x402Loading}
              style={{
                fontFamily: "var(--font-hud), monospace",
                fontSize: 13,
                fontWeight: 700,
                letterSpacing: "0.12em",
                padding: "12px 28px",
                background: x402Loading ? "rgba(102,0,204,0.15)" : "rgba(102,0,204,0.2)",
                border: "2px solid var(--purple)",
                color: "var(--purple)",
                borderRadius: 3,
                cursor: x402Loading ? "wait" : "pointer",
                transition: "all 0.2s",
              }}
            >
              {x402Loading ? "⏳ SENDING x402..." : "⬡ BUY PROTECTION (DEMO)"}
            </button>
            <a
              href="https://radiant-recreation-production-f473.up.railway.app/payment-info"
              target="_blank"
              rel="noreferrer"
              style={{ fontFamily: "var(--font-hud), monospace", fontSize: 11, color: "var(--text-dim)", letterSpacing: "0.1em" }}
            >
              VIEW PAYMENT REQUIREMENTS →
            </a>
          </div>
          {x402Result && (
            <div style={{ background: "rgba(0,0,0,0.45)", border: "1px solid var(--green)", borderRadius: 3, padding: "14px 16px" }}>
              <div style={{ fontSize: 11, color: "var(--green)", letterSpacing: "0.2em", marginBottom: 8, fontWeight: 700 }}>
                ✓ POLICY ACTIVATED
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 24px" }}>
                {[
                  ["POLICY ID", (x402Result.policyId as string)?.slice(0, 22) + "..."],
                  ["LP ADDRESS", (x402Result.lp as string)?.slice(0, 14) + "..."],
                  ["POOL", (x402Result.poolAddress as string)?.slice(0, 14) + "..."],
                  ["DURATION", `${x402Result.durationDays} day`],
                  ["PRICE", String(x402Result.pricePerDay)],
                  ["CHAIN", String(x402Result.chain)],
                  ["PAID UNTIL", new Date(x402Result.paidUntil as string).toLocaleString()],
                  ["ACTIVATED", new Date(x402Result.activatedAt as string).toLocaleTimeString()],
                ].map(([k, v]) => (
                  <div key={k} style={{ display: "flex", gap: 8 }}>
                    <span style={{ fontSize: 10, color: "var(--text-dim)", fontFamily: "var(--font-hud), monospace", letterSpacing: "0.1em", minWidth: 80 }}>{k}</span>
                    <span style={{ fontSize: 11, color: "var(--text-primary)", fontFamily: "var(--font-hud), monospace", wordBreak: "break-all" }}>{v}</span>
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 10, fontSize: 10, color: "var(--text-faint)", fontFamily: "var(--font-hud), monospace", lineHeight: 1.6 }}>
                {x402Result.x402Note as string}
              </div>
            </div>
          )}
          {x402Error && (
            <div style={{ fontSize: 12, color: "var(--red)", fontFamily: "var(--font-hud), monospace", marginTop: 8 }}>
              ✗ {x402Error}
            </div>
          )}
        </div>

        {/* ── Row 4: Earn-pay-earn cycle ──────────────────────────── */}
        <div className="animate-in" style={{ marginBottom: 16 }}>
          <div className="card-hud p-5">
            <div style={{ fontSize: 15, color: "var(--cyan)", letterSpacing: "0.15em", marginBottom: 20, fontWeight: 700 }}>
              EARN-PAY-EARN CYCLE — HOW PARRY WORKS
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 8 }}>
              {[
                { step: "01", label: "LP OPENS POSITION", sub: "You deposit ETH+USDC into a Uniswap V3 concentrated liquidity pool on X Layer via Parry's vault contract" },
                { step: "02", label: "FEES ACCRUE", sub: "Every swap through the pool earns you trading fees — proportional to your share of liquidity in range" },
                { step: "03", label: "DELTA COMPUTED", sub: "Parry calculates your directional exposure every 15s using: ΔV/ΔS = L/√S − L/√Pb (exact V3 math)" },
                { step: "04", label: "HEDGE EXECUTED", sub: "If delta > threshold, Parry swaps ETH→USDC on OKX DEX autonomously — no human needed, 24/7" },
                { step: "05", label: "FEES COMPOUNDED", sub: "Accumulated V3 trading fees are collected and reinvested back into your LP position automatically" },
                { step: "06", label: "PREMIUM PAID", sub: "A small protection fee is deducted via x402 HTTP micropayment protocol — pay only when protected" },
                { step: "07", label: "IL CLAIM", sub: "If IL exceeds the policy threshold, the agent signs a claim, vault pays out, NFT certificate is burned" },
              ].map(({ step, label, sub }, i) => (
                <div
                  key={step}
                  className="earn-card"
                >
                  <div className="earn-card-step">{step}</div>
                  <div className="earn-card-label">{label}</div>
                  <div className="earn-card-sub">{sub}</div>
                  {i < 6 && <div className="earn-card-arrow">→</div>}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── Bottom Showcase ───────────────────────────────────────── */}
        <div className="animate-in card-hud" style={{ marginBottom: 16, padding: "32px 28px 28px" }}>
          <div style={{ fontSize: 15, color: "var(--cyan)", letterSpacing: "0.2em", marginBottom: 24, fontWeight: 700, textAlign: "center" }}>
            LIVE DASHBOARD — WHAT YOU ARE SEEING &amp; WHY IT MATTERS
          </div>

          {/* Active card */}
          <div key={bottomIdx} className="animate-in" style={{
            display: "grid",
            gridTemplateColumns: "1fr 2fr",
            gap: 28,
            padding: "24px 28px",
            background: "rgba(0,212,255,0.04)",
            border: "1px solid var(--cyan)",
            borderRadius: 4,
            marginBottom: 20,
          }}>
            <div style={{ borderRight: "1px solid var(--border)", paddingRight: 28 }}>
              <div style={{ fontSize: 12, color: "var(--text-dim)", letterSpacing: "0.2em", marginBottom: 10 }}>LIVE VALUE</div>
              <div
                style={{ fontFamily: "var(--font-orbitron), sans-serif", fontSize: 44, fontWeight: 800, color: "var(--cyan)", lineHeight: 1.1 }}
                className="text-glow-cyan"
              >
                {BOTTOM_ITEMS[bottomIdx].value}
              </div>
              <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text-primary)", letterSpacing: "0.1em", marginTop: 12, fontFamily: "var(--font-orbitron), sans-serif" }}>
                {BOTTOM_ITEMS[bottomIdx].label}
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div>
                <div style={{ fontSize: 11, color: "var(--cyan)", letterSpacing: "0.2em", marginBottom: 6, fontWeight: 700 }}>WHAT THIS IS</div>
                <div style={{ fontSize: 16, color: "var(--text-primary)", lineHeight: 1.65 }}>{BOTTOM_ITEMS[bottomIdx].detail}</div>
              </div>
              <div style={{ padding: "12px 16px", background: "rgba(0,255,136,0.05)", border: "1px solid rgba(0,255,136,0.2)", borderRadius: 3 }}>
                <div style={{ fontSize: 11, color: "var(--green)", letterSpacing: "0.2em", marginBottom: 4, fontWeight: 700 }}>PARRY ADVANTAGE</div>
                <div style={{ fontSize: 15, color: "var(--text-primary)", lineHeight: 1.55 }}>{BOTTOM_ITEMS[bottomIdx].advantage}</div>
              </div>
            </div>
          </div>

          {/* Nav */}
          <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 16 }}>
            <button onClick={() => setBottomIdx((i) => (i - 1 + BOTTOM_ITEMS.length) % BOTTOM_ITEMS.length)} className="carousel-btn">← PREV</button>
            <div style={{ display: "flex", gap: 8 }}>
              {BOTTOM_ITEMS.map((item, i) => (
                <button
                  key={i}
                  onClick={() => setBottomIdx(i)}
                  style={{
                    padding: "4px 12px",
                    fontSize: 11,
                    fontFamily: "var(--font-hud), monospace",
                    letterSpacing: "0.08em",
                    border: `1px solid ${i === bottomIdx ? "var(--cyan)" : "var(--border-glow)"}`,
                    background: i === bottomIdx ? "rgba(0,212,255,0.12)" : "transparent",
                    color: i === bottomIdx ? "var(--cyan)" : "var(--text-dim)",
                    borderRadius: 2,
                    cursor: "pointer",
                    transition: "all 0.2s",
                  }}
                >
                  {String(i + 1).padStart(2, "0")}
                </button>
              ))}
            </div>
            <button onClick={() => setBottomIdx((i) => (i + 1) % BOTTOM_ITEMS.length)} className="carousel-btn">NEXT →</button>
          </div>

        </div>

        {/* ── Footer ─────────────────────────────────────────────────── */}
        <footer
          className="animate-in"
          style={{
            borderTop: "1px solid var(--border)",
            paddingTop: 24,
            paddingBottom: 8,
          }}
        >
          {/* Main credit row */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 14,
              marginBottom: 14,
            }}
          >
            {/* GitHub SVG logo */}
            <a
              href="https://github.com/Gideon145"
              target="_blank"
              rel="noreferrer"
              style={{ display: "flex", alignItems: "center", color: "var(--cyan)" }}
            >
              <svg
                height="32"
                width="32"
                viewBox="0 0 16 16"
                fill="currentColor"
                aria-hidden="true"
              >
                <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38
                  0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13
                  -.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87
                  2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95
                  0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12
                  0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27
                  .68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82
                  .44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15
                  0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48
                  0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38
                  A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"
                />
              </svg>
            </a>
            <div
              style={{
                fontFamily: "var(--font-hud), monospace",
                fontSize: 18,
                color: "var(--text-primary)",
                letterSpacing: "0.08em",
              }}
            >
              BUILT BY{" "}
              <a
                href="https://github.com/Gideon145"
                target="_blank"
                rel="noreferrer"
                style={{
                  color: "var(--cyan)",
                  fontFamily: "var(--font-orbitron), sans-serif",
                  fontWeight: 700,
                  fontSize: 20,
                  letterSpacing: "0.1em",
                }}
              >
                GIDEON145
              </a>
              {" "}— Parry Protocol © 2026
            </div>
          </div>
          {/* Sub row */}
          <div
            style={{
              textAlign: "center",
              fontSize: 12,
              color: "var(--text-dim)",
              fontFamily: "var(--font-hud), monospace",
              letterSpacing: "0.15em",
            }}
          >
            OKX BUILD-X HACKATHON · X LAYER MAINNET · ONCHAIN OS · UNISWAP V3 · EIP-712
          </div>
        </footer>
      </div>
    </main>
  );
}
