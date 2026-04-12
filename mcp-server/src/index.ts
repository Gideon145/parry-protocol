import "dotenv/config";
import * as http from "http";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  ErrorCode,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";
import axios from "axios";

const AGENT_STATUS_URL = process.env.AGENT_STATUS_URL || "http://localhost:3001";
const PORT = parseInt(process.env.PORT || "3003", 10);

// ─────────────────────────────────────────────────────────────────────────────
// MCP Server — Parry Protocol Tools
// Exposes PARRY's agent capabilities as MCP tools for Claude/ChatGPT.
// ─────────────────────────────────────────────────────────────────────────────

const server = new Server(
  { name: "PARRY-protocol", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

// ── Tool Definitions ──────────────────────────────────────────────────────────

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "get_agent_status",
      description: "Get the current Parry agent status including price, IL%, delta exposure, hedge ratio, and recent activity log.",
      inputSchema: { type: "object", properties: {}, required: [] },
    },
    {
      name: "get_il_exposure",
      description: "Compute the current Impermanent Loss % for a Uniswap V3 LP position given price parameters.",
      inputSchema: {
        type: "object",
        properties: {
          entryPrice: { type: "number", description: "Price when position was opened (USD)" },
          currentPrice: { type: "number", description: "Current pool price (USD)" },
          tickLower: { type: "number", description: "Position lower tick" },
          tickUpper: { type: "number", description: "Position upper tick" },
        },
        required: ["entryPrice", "currentPrice", "tickLower", "tickUpper"],
      },
    },
    {
      name: "get_delta_exposure",
      description: "Compute the delta exposure (ETH-equivalent) for a Uniswap V3 LP position and the USD amount to hedge.",
      inputSchema: {
        type: "object",
        properties: {
          currentPrice: { type: "number", description: "Current pool price (USD)" },
          entryPrice: { type: "number", description: "Price when position was opened (USD)" },
          tickLower: { type: "number", description: "Position lower tick" },
          tickUpper: { type: "number", description: "Position upper tick" },
          liquidityE18: { type: "string", description: "Liquidity units (L) as integer with 18 decimals, e.g. '1000000000000000000'" },
          hedgeRatio: { type: "number", description: "Hedge ratio 0.0-1.0 (default 0.7)" },
        },
        required: ["currentPrice", "entryPrice", "tickLower", "tickUpper"],
      },
    },
    {
      name: "compute_optimal_ticks",
      description: "Compute the statistically optimal Uniswap V3 tick range given current price, realized volatility, and desired coverage horizon.",
      inputSchema: {
        type: "object",
        properties: {
          currentPrice: { type: "number", description: "Current pool price (USD)" },
          annualizedVolBps: { type: "number", description: "Realized annualized volatility in bps (e.g. 8000 = 80%)" },
          coverageHorizonDays: { type: "number", description: "Days of coverage (e.g. 7 for 1 week)" },
          confidenceLevel: { type: "number", description: "Z-score for confidence interval (1.96 = 95%, 2.576 = 99%)" },
        },
        required: ["currentPrice", "annualizedVolBps", "coverageHorizonDays"],
      },
    },
    {
      name: "activate_protection",
      description: "Activate PARRY IL protection for a Uniswap V3 LP position by sending premium to the ParryVault contract.",
      inputSchema: {
        type: "object",
        properties: {
          poolAddress: { type: "string", description: "Uniswap V3 pool contract address" },
          tokenId: { type: "number", description: "LP position NFT token ID" },
          tickLower: { type: "number", description: "Position lower tick" },
          tickUpper: { type: "number", description: "Position upper tick" },
          liquidity: { type: "string", description: "Position liquidity (as integer string)" },
          thresholdBps: { type: "number", description: "IL threshold in bps before payout (e.g. 200 = 2%)" },
          durationDays: { type: "number", description: "Protection duration in days" },
          premiumOKB: { type: "number", description: "Premium to pay in OKB" },
        },
        required: ["poolAddress", "tokenId", "tickLower", "tickUpper", "liquidity", "thresholdBps", "durationDays", "premiumOKB"],
      },
    },
    {
      name: "check_premium_cost",
      description: "Estimate the premium cost in OKB for a given IL protection policy based on current volatility and position size.",
      inputSchema: {
        type: "object",
        properties: {
          coverageAmountUSD: { type: "number", description: "Maximum IL coverage desired in USD" },
          durationDays: { type: "number", description: "Protection duration in days" },
          annualizedVolBps: { type: "number", description: "Realized vol in bps (optional, fetched from agent if omitted)" },
        },
        required: ["coverageAmountUSD", "durationDays"],
      },
    },
    {
      name: "get_vault_stats",
      description: "Get PARRY ParryVault statistics: total capital, premiums collected, claims paid.",
      inputSchema: { type: "object", properties: {}, required: [] },
    },
  ],
}));

// ── Tool Implementations ──────────────────────────────────────────────────────

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {

      case "get_agent_status": {
        try {
          const r = await axios.get(`${AGENT_STATUS_URL}/status`, { timeout: 3000 });
          const s = r.data;
          return {
            content: [{
              type: "text",
              text: JSON.stringify({
                running: s.running,
                iteration: s.iteration,
                currentPrice: `$${s.currentPrice?.toFixed(2)}`,
                entryPrice: `$${s.entryPrice?.toFixed(2)}`,
                ilPercent: `${s.ilPercent?.toFixed(3)}%`,
                deltaExposure: `${s.deltaExposure?.toFixed(6)} ETH-equivalent`,
                hedgeAmountUSD: `$${s.hedgeAmountUSD?.toFixed(2)}`,
                volatility: `${((s.volBps || 0) / 100).toFixed(1)}% annualized [${s.volRegime}]`,
                hedgeRatio: `${((s.hedgeRatio || 0) * 100).toFixed(0)}%`,
                inRange: s.inRange,
                tickRange: `[${s.tickLower}, ${s.tickUpper}]`,
                totalHedgesTx: s.totalHedgesTx,
                totalFeesCompounded: s.totalFeesCompounded,
                lastHedgeTx: s.lastHedgeTx,
                recentLogs: s.logs?.slice(0, 5),
              }, null, 2),
            }],
          };
        } catch {
          return { content: [{ type: "text", text: "Agent status unavailable (is the agent running?)" }] };
        }
      }

      case "get_il_exposure": {
        const { entryPrice, currentPrice, tickLower, tickUpper } = args as Record<string, number>;
        const il = computeILPercent(entryPrice, currentPrice, tickLower, tickUpper);
        const priceRatio = currentPrice / entryPrice;
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              ilPercent: `${il.toFixed(4)}%`,
              priceRatio: priceRatio.toFixed(4),
              entryPrice: `$${entryPrice}`,
              currentPrice: `$${currentPrice}`,
              direction: currentPrice > entryPrice ? "price increased" : "price decreased",
              summary: `Your LP position has experienced ${il.toFixed(2)}% impermanent loss. ${
                il < 2 ? "Low IL — within normal range." :
                il < 5 ? "Moderate IL — consider activating PARRY protection." :
                "Significant IL — PARRY protection strongly recommended."
              }`,
            }, null, 2),
          }],
        };
      }

      case "get_delta_exposure": {
        const a = args as Record<string, unknown>;
        const liquidity = BigInt(String(a.liquidityE18 || "1000000000000000000"));
        const result = computeDelta(
          Number(a.currentPrice),
          Number(a.entryPrice),
          Number(a.tickLower),
          Number(a.tickUpper),
          liquidity,
          Number(a.hedgeRatio || 0.7)
        );
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              deltaExposure: `${result.delta.toFixed(6)} ETH-equivalent`,
              hedgeAmountUSD: `$${result.hedgeAmountUSD.toFixed(2)}`,
              ilPercent: `${result.ilPercent.toFixed(3)}%`,
              inRange: result.inRange,
              priceRange: `$${result.priceLower.toFixed(2)} - $${result.priceUpper.toFixed(2)}`,
              action: result.hedgeAmountUSD > 1
                ? `Sell $${result.hedgeAmountUSD.toFixed(2)} of the risky asset to achieve delta neutrality`
                : "No hedge needed (exposure below minimum threshold)",
            }, null, 2),
          }],
        };
      }

      case "compute_optimal_ticks": {
        const a = args as Record<string, number>;
        const result = computeOptimalTicks(
          a.currentPrice,
          a.annualizedVolBps,
          a.coverageHorizonDays,
          a.confidenceLevel || 1.96
        );
        const priceRangeWidth = ((result.priceUpper / result.priceLower - 1) * 100).toFixed(1);
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              tickLower: result.tickLower,
              tickUpper: result.tickUpper,
              priceLower: `$${result.priceLower.toFixed(2)}`,
              priceUpper: `$${result.priceUpper.toFixed(2)}`,
              priceRangeWidth: `±${(parseFloat(priceRangeWidth)/2).toFixed(1)}%`,
              interpretation: `At ${(a.annualizedVolBps/100).toFixed(0)}% annualized vol, this range covers ${
                ((a.confidenceLevel || 1.96) === 1.96 ? "95" : "99")
              }% of expected price moves over ${a.coverageHorizonDays} days.`,
            }, null, 2),
          }],
        };
      }

      case "check_premium_cost": {
        const a = args as Record<string, number>;
        const agentVol = await getAgentVol();
        const vol = (a.annualizedVolBps || agentVol || 5000) / 10000;

        // Premium model: base_rate * vol * sqrt(T) where T = duration in years
        const T = a.durationDays / 365;
        const baseRate = 0.001; // 0.1% per unit vol
        const premiumFraction = baseRate * vol * Math.sqrt(T);
        const premiumUSD = a.coverageAmountUSD * premiumFraction / 20; // /20 for coverage multiplier
        const OKB_PRICE = 45; // approximate
        const premiumOKB = premiumUSD / OKB_PRICE;

        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              premiumUSD: `$${premiumUSD.toFixed(4)}`,
              premiumOKB: `${premiumOKB.toFixed(6)} OKB`,
              coverageAmountUSD: `$${a.coverageAmountUSD}`,
              coverageAmountOKB: `${(a.coverageAmountUSD / OKB_PRICE).toFixed(4)} OKB`,
              durationDays: a.durationDays,
              volUsed: `${(vol * 100).toFixed(1)}% annualized`,
              coverageMultiplier: "20x (premium × 20 = max payout)",
              summary: `For $${a.coverageAmountUSD} coverage over ${a.durationDays} days, PARRY charges approximately ${premiumOKB.toFixed(6)} OKB`,
            }, null, 2),
          }],
        };
      }

      case "activate_protection": {
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              status: "ready",
              message: "To activate protection, call ParryVault.activateProtection() with the provided parameters and send the premium in OKB as msg.value. The Parry agent will begin monitoring your position immediately after activation.",
              contractAddress: process.env.VAULT_ADDRESS || "Deploy contracts first",
              method: "activateProtection(address pool, uint256 tokenId, int24 tickLower, int24 tickUpper, uint128 liquidity, uint256 entryPrice, uint256 threshold, uint256 durationBlocks)",
            }, null, 2),
          }],
        };
      }

      case "get_vault_stats": {
        try {
          const r = await axios.get(`${AGENT_STATUS_URL}/status`, { timeout: 3000 });
          const s = r.data;
          return {
            content: [{
              type: "text",
              text: JSON.stringify({
                vaultAddress: s.vaultAddress || process.env.VAULT_ADDRESS,
                agentWallet: s.agentWallet,
                totalHedgesExecuted: s.totalHedgesTx,
                totalFeesCompounded: s.totalFeesCompounded,
                lastHedgeTx: s.lastHedgeTx,
                network: "X Layer Testnet (Chain ID 1952)",
              }, null, 2),
            }],
          };
        } catch {
          return { content: [{ type: "text", text: "Vault stats unavailable" }] };
        }
      }

      default:
        throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
    }
  } catch (err) {
    if (err instanceof McpError) throw err;
    throw new McpError(ErrorCode.InternalError, String(err));
  }
});

async function getAgentVol(): Promise<number> {
  try {
    const r = await axios.get(`${AGENT_STATUS_URL}/status`, { timeout: 2000 });
    return r.data?.volBps || 5000;
  } catch {
    return 5000;
  }
}

// Re-export delta functions needed by tools
function computeILPercent(entryPrice: number, currentPrice: number, tickLower: number, tickUpper: number): number {
  const pa = Math.pow(1.0001, tickLower);
  const pb = Math.pow(1.0001, tickUpper);
  const s0 = entryPrice;
  const s = currentPrice;
  const r = s / s0;

  let il: number;
  if (s >= pa && s <= pb) {
    il = Math.abs(2 * Math.sqrt(r) / (1 + r) - 1);
  } else if (s < pa) {
    const kEntry = Math.max(0, Math.min(1, (Math.sqrt(s0) - Math.sqrt(pa)) / (Math.sqrt(pb) - Math.sqrt(pa))));
    il = Math.abs(2 * Math.sqrt(r) / (1 + r) - 1) * kEntry;
  } else {
    const kEntry = Math.max(0, Math.min(1, (Math.sqrt(s0) - Math.sqrt(pa)) / (Math.sqrt(pb) - Math.sqrt(pa))));
    il = Math.abs(2 * Math.sqrt(r) / (1 + r) - 1) * (1 - kEntry);
  }
  return il * 100;
}

function computeDelta(currentPrice: number, entryPrice: number, tickLower: number, tickUpper: number, liquidity: bigint, hedgeRatio = 0.7) {
  const pa = Math.pow(1.0001, tickLower);
  const pb = Math.pow(1.0001, tickUpper);
  const s = currentPrice;
  const L = Number(liquidity) / 1e18;

  let delta = 0;
  let inRange = false;

  if (s >= pa && s <= pb) {
    delta = L / Math.sqrt(s) - L / Math.sqrt(pb);
    inRange = true;
  } else if (s > pb) {
    delta = L * (1 / Math.sqrt(pa) - 1 / Math.sqrt(pb));
  }

  const effectiveDelta = delta * hedgeRatio;
  return {
    delta: effectiveDelta,
    inRange,
    currentPrice: s,
    tickLower,
    tickUpper,
    liquidity,
    priceLower: pa,
    priceUpper: pb,
    ilPercent: computeILPercent(entryPrice, s, tickLower, tickUpper),
    hedgeAmountUSD: effectiveDelta * s,
  };
}

function computeOptimalTicks(currentPrice: number, annualizedVolBps: number, coverageHorizonDays: number, confidenceLevel = 1.96) {
  const sigma = annualizedVolBps / 10000;
  const T = coverageHorizonDays / 365;
  const halfWidth = sigma * Math.sqrt(T) * confidenceLevel;
  const priceLower = currentPrice * Math.exp(-halfWidth);
  const priceUpper = currentPrice * Math.exp(halfWidth);
  const TICK_SPACING = 60;
  const tickLower = Math.floor(Math.floor(Math.log(priceLower) / Math.log(1.0001)) / TICK_SPACING) * TICK_SPACING;
  const tickUpper = Math.ceil(Math.ceil(Math.log(priceUpper) / Math.log(1.0001)) / TICK_SPACING) * TICK_SPACING;
  return { tickLower, tickUpper, priceLower, priceUpper };
}

// Start
const transport = new StdioServerTransport();
server.connect(transport).then(() => {
  console.error("PARRY MCP Server running (stdio)");
});

const candidatePorts = Array.from(
  new Set([
    PORT,
    3003,
    8080,
  ])
);

for (const p of candidatePorts) {
  try {
    const s = http.createServer((req, res) => {
      if (req.url === "/health") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true, service: "PARRY-mcp-server", port: p }));
        return;
      }

      if (req.url === "/") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          ok: true,
          service: "PARRY-mcp-server",
          transport: "stdio",
          port: p,
        }));
        return;
      }

      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "not found" }));
    }).listen(p, () => {
      console.error(`PARRY MCP health server listening on :${p}`);
    });
    s.on("error", () => {
      // Ignore bind collisions and keep trying other ports.
    });
  } catch {
    // Try next candidate port.
  }
}
