import "dotenv/config";
import { ethers } from "ethers";
import * as http from "http";
import { OnchainOSClient } from "./onchainos";
import { VolatilityEngine } from "./volatility";
import { HedgeExecutor } from "./hedge";
import { FeeCompounder } from "./compounder";
import { computeDelta, computeOptimalTicks } from "./delta";
import { logger } from "./logger";

// ─────────────────────────────────────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────────────────────────────────────

const CONFIG = {
  rpcUrl: process.env.RPC_URL || "https://testrpc.xlayer.tech",
  chainId: parseInt(process.env.CHAIN_ID || "1952"),
  privateKey: process.env.SIGNER_KEY || process.env.PRIVATE_KEY || "",
  vaultAddress: process.env.VAULT_ADDRESS || "0x57C7f2F3051928E2cc7C871Bac590bF1d4BF4c8e",
  agentWallet: process.env.AGENT_WALLET || "0x94A4365E6B7E79791258A3Fa071824BC2b75a394",

  // Policy ID for on-chain recordHedge (set by seed-policy script)
  policyId: process.env.POLICY_ID || "0x3639c395f0d2f5d2b6227192e08298df7778e1a540315791d48ad53d08601f5a",

  // Symbols (X Layer token symbols for onchainos market)
  baseSymbol: process.env.BASE_SYMBOL || "ETH",
  stableSymbol: process.env.STABLE_SYMBOL || "USDC",
  baseToken: process.env.BASE_TOKEN || "0x5A77f1443D16ee5761d310e38b62f77f726bC71c",   // WETH on X Layer testnet
  stableToken: process.env.STABLE_TOKEN || "0x74b7F16337b8972027F6196A17a631aC6dE26d22", // USDC on X Layer testnet

  // Agent loop timing
  loopIntervalMs: parseInt(process.env.LOOP_INTERVAL_MS || "15000"), // 15s
  premiumCollectEveryN: parseInt(process.env.PREMIUM_COLLECT_EVERY_N || "20"),

  // Status server port (for frontend)
  statusPort: parseInt(process.env.STATUS_PORT || "3001"),

  // Demo mode — runs without real onchainos binary (paper trading)
  demoMode: process.env.DEMO_MODE === "true",
};

// ─────────────────────────────────────────────────────────────────────────────
// Mock data for demo mode
// ─────────────────────────────────────────────────────────────────────────────

function mockPrice(base = 2000): number {
  // Simulate price drift with random walk
  const drift = (Math.random() - 0.49) * 0.02;
  return base * (1 + drift);
}

let _demoPrice = 2000;
let _demoIteration = 0;

// ─────────────────────────────────────────────────────────────────────────────
// Agent State (broadcast to frontend via HTTP)
// ─────────────────────────────────────────────────────────────────────────────

interface AgentStatus {
  running: boolean;
  iteration: number;
  currentPrice: number;
  entryPrice: number;
  volBps: number;
  volRegime: string;
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
  demoMode: boolean;
  chainId: number;
  signerLoaded: boolean;
  logs: string[];
}

const state: AgentStatus = {
  running: false,
  iteration: 0,
  currentPrice: 0,
  entryPrice: 2000,
  volBps: 5000,
  volRegime: "MEDIUM",
  hedgeRatio: 0.7,
  deltaExposure: 0,
  ilPercent: 0,
  hedgeAmountUSD: 0,
  inRange: true,
  tickLower: -600,
  tickUpper: 600,
  totalHedgesTx: 0,
  totalFeesCompounded: 0,
  lastHedgeTx: "",
  lastActivity: "",
  policies: [],
  vaultAddress: CONFIG.vaultAddress,
  agentWallet: CONFIG.agentWallet,
  demoMode: CONFIG.demoMode,
  chainId: CONFIG.chainId,
  signerLoaded: CONFIG.privateKey.length > 10,
  logs: [],
};

function addLog(msg: string): void {
  const entry = `[${new Date().toISOString().slice(11, 23)}] ${msg}`;
  state.logs.unshift(entry);
  if (state.logs.length > 100) state.logs.pop();
}

// ─────────────────────────────────────────────────────────────────────────────
// HTTP Status Server (frontend polls this)
// ─────────────────────────────────────────────────────────────────────────────

function startStatusServer(): void {
  const server = http.createServer((req, res) => {
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    if (req.url === "/status") {
      res.writeHead(200);
      res.end(JSON.stringify(state));
      return;
    }

    if (req.url === "/health") {
      res.writeHead(200);
      res.end(JSON.stringify({ ok: true }));
      return;
    }

    res.writeHead(404);
    res.end(JSON.stringify({ error: "not found" }));
  });

  server.listen(CONFIG.statusPort, () => {
    logger.success(`Status server running at http://localhost:${CONFIG.statusPort}/status`);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Agent Loop
// ─────────────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  logger.banner();
  logger.PARRY("Starting Parry agent...");
  logger.info(`Mode: ${CONFIG.demoMode ? "DEMO (paper trading)" : "LIVE"}`);
  logger.info(`Chain ID: ${CONFIG.chainId}`);
  logger.info(`Vault: ${CONFIG.vaultAddress || "(not deployed yet)"}`);
  logger.info(`Agent Wallet: ${CONFIG.agentWallet || "(not set)"}`);

  startStatusServer();

  const client = new OnchainOSClient();
  const volEngine = new VolatilityEngine(client);
  const compounder = new FeeCompounder(client, CONFIG.agentWallet);

  let hedgeExecutor: HedgeExecutor | null = null;
  if (!CONFIG.demoMode && CONFIG.privateKey && CONFIG.vaultAddress) {
    hedgeExecutor = new HedgeExecutor(
      client,
      CONFIG.vaultAddress,
      CONFIG.rpcUrl,
      CONFIG.privateKey
    );
  }

  // Demo position state
  const demoPolicy = {
    policyId: CONFIG.policyId,   // use real on-chain policyId if available
    pool: "0x5A77f1443D16ee5761d310e38b62f77f726bC71c",  // WETH on X Layer
    tokenId: "1",
    investmentId: "demo-pool-001",
    tickLower: -600,
    tickUpper: 600,
    liquidity: BigInt("1000000000000000000"), // 1e18
    entryPrice: _demoPrice,
  };

  state.entryPrice = demoPolicy.entryPrice;
  state.tickLower = demoPolicy.tickLower;
  state.tickUpper = demoPolicy.tickUpper;
  state.running = true;

  logger.PARRY("Agent loop started.");

  let iteration = 0;

  while (true) {
    iteration++;
    _demoIteration = iteration;
    state.iteration = iteration;

    try {
      // ── Step 1: Get current price ──────────────────────────────────────────
      let currentPrice: number;

      if (CONFIG.demoMode) {
        _demoPrice = mockPrice(_demoPrice);
        currentPrice = _demoPrice;
      } else {
        const price = await client.getPrice(CONFIG.baseSymbol);
        currentPrice = price || _demoPrice;
      }

      state.currentPrice = currentPrice;

      // ── Step 2: Get volatility state ───────────────────────────────────────
      const volState = CONFIG.demoMode
        ? {
            realizedVolBps: 5000 + Math.round(Math.random() * 3000 - 1500),
            hedgeRatio: 0.7,
            regime: "MEDIUM" as const,
            lastUpdated: Date.now(),
            sampleCount: 144,
          }
        : await volEngine.getVolatility(CONFIG.baseSymbol);

      state.volBps = volState.realizedVolBps;
      state.volRegime = volState.regime;
      state.hedgeRatio = volState.hedgeRatio;

      // ── Step 3: Compute optimal ticks (every 50 iterations) ────────────────
      if (iteration % 50 === 1) {
        const optTicks = computeOptimalTicks(
          currentPrice,
          volState.realizedVolBps,
          7, // 7-day coverage
          1.96
        );
        logger.PARRY(
          `Optimal ticks recomputed: [${optTicks.tickLower}, ${optTicks.tickUpper}] ` +
          `price range: $${optTicks.priceLower.toFixed(0)}-$${optTicks.priceUpper.toFixed(0)}`
        );
        addLog(`Optimal ticks: [${optTicks.tickLower}, ${optTicks.tickUpper}] @ vol=${voltStr(volState.realizedVolBps)}`);

        // Update state for frontend
        state.tickLower = demoPolicy.tickLower;
        state.tickUpper = demoPolicy.tickUpper;
      }

      // ── Step 4: Compute delta ──────────────────────────────────────────────
      const deltaResult = computeDelta(
        currentPrice,
        demoPolicy.entryPrice,
        demoPolicy.tickLower,
        demoPolicy.tickUpper,
        demoPolicy.liquidity,
        volState.hedgeRatio
      );

      state.deltaExposure = deltaResult.delta;
      state.ilPercent = deltaResult.ilPercent;
      state.hedgeAmountUSD = deltaResult.hedgeAmountUSD;
      state.inRange = deltaResult.inRange;

      addLog(
        `Price: $${currentPrice.toFixed(2)} | IL: ${deltaResult.ilPercent.toFixed(2)}% | ` +
        `Δ: ${deltaResult.delta.toFixed(4)} | Hedge: $${deltaResult.hedgeAmountUSD.toFixed(2)}`
      );

      // ── Step 5: Execute hedge if needed ────────────────────────────────────
      if (deltaResult.hedgeAmountUSD >= 1.0) {
        if (CONFIG.demoMode) {
          // Paper trade
          state.totalHedgesTx++;
          state.lastHedgeTx = `0x${Date.now().toString(16)}${"0".repeat(24)}`;
          state.lastActivity = `Hedge executed: $${deltaResult.hedgeAmountUSD.toFixed(2)} at $${currentPrice.toFixed(2)}`;
          addLog(`[HEDGE] ✓ Swapped $${deltaResult.hedgeAmountUSD.toFixed(2)} ETH→USDC (paper)`);
          logger.success(`Hedge executed (paper): $${deltaResult.hedgeAmountUSD.toFixed(2)}`);
        } else if (hedgeExecutor) {
          const result = await hedgeExecutor.executeHedge(
            demoPolicy.policyId,
            deltaResult,
            CONFIG.baseToken,
            CONFIG.stableToken,
            volState.realizedVolBps
          );

          if (result.success) {
            state.totalHedgesTx++;
            state.lastHedgeTx = result.txHash || "";
            state.lastActivity = `Hedge: $${result.hedgeAmountUSD.toFixed(2)} tx=${result.txHash?.slice(0, 10)}`;
            addLog(`[HEDGE] tx=${result.txHash}`);
            logger.success(`Hedge tx: ${result.txHash}`);
          }
        }
      }

      // ── Step 5b: Update on-chain volatility (no policy required) ──────────
      // Called every iteration in live mode — generates a real X Layer txn.
      if (!CONFIG.demoMode && hedgeExecutor) {
        const volTxHash = await hedgeExecutor.updateVolatilityDirect(
          CONFIG.baseToken,          // use WETH address as pool key
          volState.realizedVolBps
        );
        if (volTxHash && !state.lastHedgeTx) {
          state.lastHedgeTx = volTxHash;
        }
        if (volTxHash) {
          state.totalHedgesTx++;
          addLog(`[VOL-UPDATE] vol=${voltStr(volState.realizedVolBps)} tx=${volTxHash.slice(0, 12)}`);
        }
      }

      // ── Step 6: Fee compounding ────────────────────────────────────────────
      if (iteration % 20 === 0) {
        if (CONFIG.demoMode) {
          const demoFees = (Math.random() * 0.5).toFixed(4);
          state.totalFeesCompounded++;
          addLog(`[COMPOUND] Collected ${demoFees} USDC fees, reinvested (paper)`);
          logger.info(`Fee compound (paper): ${demoFees} USDC`);
        } else {
          const provider = new ethers.JsonRpcProvider(CONFIG.rpcUrl);
          const currentBlock = await provider.getBlockNumber();
          const result = await compounder.maybeCompound(
            demoPolicy.investmentId,
            demoPolicy.tokenId,
            demoPolicy.tickLower,
            demoPolicy.tickUpper,
            currentBlock
          );
          if (result.compounded) {
            state.totalFeesCompounded++;
            addLog(`[COMPOUND] Fees collected: ${result.feesCollected}`);
          }
        }
      }

      // ── Step 7: Volatility log ─────────────────────────────────────────────
      if (iteration % 10 === 0) {
        logger.info(
          `[Vol] ${voltStr(volState.realizedVolBps)} | regime=${volState.regime} | ` +
          `hedge=${(volState.hedgeRatio * 100).toFixed(0)}%`
        );
      }

    } catch (err) {
      logger.error(`Agent loop error: ${err}`);
      addLog(`[ERROR] ${err}`);
    }

    await sleep(CONFIG.loopIntervalMs);
  }
}

function voltStr(bps: number): string {
  return `${(bps / 100).toFixed(1)}% σ`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

main().catch((err) => {
  logger.error(`Fatal: ${err}`);
  process.exit(1);
});
