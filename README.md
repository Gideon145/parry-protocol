# Parry Protocol

**Autonomous Delta-Neutral Impermanent Loss Protection for Uniswap V3 LPs on X Layer**

> *"Don't just earn fees. Keep them."*

[![Live Demo](https://img.shields.io/badge/Live%20Demo-parry--frontend.vercel.app-cyan)](https://parry-frontend.vercel.app)
[![Agent Status](https://img.shields.io/badge/Agent%20API-parry--protocol--production.up.railway.app-green)](https://parry-protocol-production.up.railway.app/status)
[![MCP Server](https://img.shields.io/badge/MCP%20Server-ample--wisdom--production-purple)](https://ample-wisdom-production-f4c9.up.railway.app/tools)
[![x402 Server](https://img.shields.io/badge/x402%20Server-radiant--recreation--production-orange)](https://radiant-recreation-production-f473.up.railway.app/payment-info)
[![X Layer Mainnet](https://img.shields.io/badge/Chain-X%20Layer%20Mainnet%20196-brightgreen)](https://www.oklink.com/xlayer/address/0x94A4365E6B7E79791258A3Fa071824BC2b75a394)
[![Audited](https://img.shields.io/badge/Audited-ChainGPT_AI-00c853)](https://app.chaingpt.org/smart-contract-auditor)
[![OKX AI](https://img.shields.io/badge/OKX_AI-Listed_%235062-black?style=flat)](https://www.okx.ai/agents/5062)

---

## What Is Parry Protocol?

Parry Protocol is the **first autonomous impermanent loss (IL) protection agent on X Layer**. It monitors Uniswap V3 LP positions in real time, computes exact delta exposure using concentrated liquidity mathematics, and executes volatility-adjusted hedge swaps — automatically, on-chain, 24/7, without any human intervention.

The system is built entirely on the **OKX Build-X hackathon stack**: OnchainOS skills for live market data, the x402 HTTP payment protocol for micropayment-gated protection, an MCP server for AI-accessible tooling, and smart contracts deployed on **X Layer Mainnet (Chain ID 196)**.

---

## The Problem Parry Solves

Uniswap V3 LPs lose an estimated **$1–2B/year** to Impermanent Loss. Here's why:

A concentrated liquidity position between price ticks [p_a, p_b] is mathematically equivalent to a **short straddle options position**. As the underlying asset price moves away from the LP's entry price, the position's value diverges from a simple hold. The LP has unknowingly sold optionality to every trader who uses the pool.

**No protocol on X Layer hedges this.** LPs either accept the loss or manually rebalance — neither is sustainable.

---

## The Solution

Parry runs an autonomous agent loop every **15 seconds** that:

1. **Fetches** live ETH/USDC price via `okx-dex-market:getPrice` OnchainOS skill
2. **Measures** realized volatility via `okx-dex-market:getVolatility` OnchainOS skill
3. **Classifies** volatility regime: `LOW (<3%)`, `MEDIUM (3-6%)`, `HIGH (6-10%)`, `EXTREME (>10%)`
4. **Computes** exact Uniswap V3 delta: `delta = L * (1/sqrt(S) - 1/sqrt(p_b))` with tick bounds
5. **Computes** impermanent loss: `IL% = 2*sqrt(k)/(1+k) - 1` where `k = currentPrice/entryPrice`
6. **Sizes** the hedge: `hedgeAmountUSD = |delta| * currentPrice * hedgeRatio(volRegime)`
7. **Executes** the hedge swap via OKX DEX and records it on-chain via `ParryVault.recordHedge()`
8. **Updates** on-chain volatility via `ParryVault.updateVolatility()` — every single loop iteration
9. **Compounds** accrued LP fees via `okx-defi-invest:compound` skill, reinvesting them into the position
10. **Issues** a transferable Protection Certificate NFT via `ProtectionCert.sol` for each active policy
11. **Gates** the hedge API with the **x402 HTTP micropayment protocol** — LPs pay only while protected

---

## Live Deployment (Verified)

| Service | URL | Status |
|---|---|---|
| Frontend | https://parry-frontend.vercel.app | Live |
| Agent API | https://parry-protocol-production.up.railway.app/status | Live |
| OnchainOS Proof | https://parry-protocol-production.up.railway.app/onchainos-proof | Live |
| MCP Server | https://ample-wisdom-production-f4c9.up.railway.app/tools | Live |
| x402 Server | https://radiant-recreation-production-f473.up.railway.app/payment-info | Live |
| Agent Wallet — Testnet history | https://oklink.com/x-layer-testnet/address/0x94A4365E6B7E79791258A3Fa071824BC2b75a394 | **30,000+ TXs** on X Layer Testnet |
| Agent Wallet — **Mainnet LIVE** | https://www.oklink.com/xlayer/address/0x94A4365E6B7E79791258A3Fa071824BC2b75a394 | **86,461 TXs** (19,104 iterations) on X Layer Mainnet (Chain 196) |
| ParryVault Contract | https://www.oklink.com/xlayer/address/0x57C7f2F3051928E2cc7C871Bac590bF1d4BF4c8e | **Mainnet** (Chain 196) |
| ProtectionCert NFT | https://www.oklink.com/xlayer/address/0x87E3D9fcfA4eff229A65d045A7C741E49b581187 | **Mainnet** (Chain 196) |
| Demo Video | https://youtu.be/HAIuoL-LiIA | Submitted |

### Live Verification Commands

```bash
# Agent running in LIVE mode (not demo)
curl https://parry-protocol-production.up.railway.app/status | jq '.demoMode, .signerLoaded, .onChainTxCount, .chainId'
# -> false, true, 30000+, 196

# OnchainOS skill calls in last 50 iterations
curl https://parry-protocol-production.up.railway.app/onchainos-proof | jq '.totalCalls, .calls[0]'

# All 6 MCP tools
curl https://ample-wisdom-production-f4c9.up.railway.app/tools | jq '.tools'

# x402 payment requirements
curl https://radiant-recreation-production-f473.up.railway.app/payment-info

# Demo-activate an IL protection policy (no real payment required)
curl -X POST https://radiant-recreation-production-f473.up.railway.app/protect/demo \
  -H "Content-Type: application/json" \
  -d '{"lp":"0x94A4365E6B7E79791258A3Fa071824BC2b75a394","poolAddress":"0x5A77f1443D16ee5761d310e38b62f77f726bC71c","durationDays":1}'
```

### About the On-Chain TX Count

`onChainTxCount` in `/status` is the **lifetime wallet nonce** of the Agentic Wallet (`0x94A4365...`) on X Layer Mainnet (Chain ID 196). This counter:
- Is read directly from the chain via `provider.getTransactionCount(agentWallet)`
- **Does not reset on Railway restarts** — it accumulates across all agent runs since first deployment on April 12, 2026
- Currently **30,000+ confirmed transactions** on testnet + **5,000+ on X Layer Mainnet (Chain 196)**

`totalHedgesTx` and `iteration` reset on each Railway container restart. These are in-process counters, not on-chain state. The wallet nonce is the authoritative on-chain proof.

---

## Architecture

```
+---------------------------------------------------------------------------------+
|                          PARRY PROTOCOL STACK                                   |
+----------------------+----------------------+------------------------------------+
|   FRONTEND           |   AGENT (Node.js)    |   INFRASTRUCTURE                  |
|   Next.js 14         |   Railway            |                                   |
|   Vercel             |   15s loop           |   Railway (Agent, MCP, x402)      |
|                      |                      |   Vercel (Frontend)               |
|  +----------------+  |  +----------------+  |   X Layer Mainnet (Chain 196)     |
|  | HUD Dashboard  |  |  |VolatilityEngine|  |                                   |
|  | Live metrics   |<-+--| OnchainOS mkt  |  |  +--------------------------+     |
|  | AgentChat MCP  |  |  | TWAP + regime  |  |  | ParryVault.sol           |     |
|  | x402 Demo UI   |  |  +----------------+  |  | recordHedge()            |     |
|  | Terminal feed  |  |  | DeltaCalc      |  |  | updateVolatility()       |     |
|  +----------------+  |  | V3 tick math   |  |  | issuePolicy()            |     |
|                      |  | IL + hedgeDelta|  |  | killSwitch (emergency)   |     |
|   MCP SERVER         |  +----------------+  |  +--------------------------+     |
|   6 AI tools         |  | HedgeExecutor  |  |  | ProtectionCert.sol       |     |
|   HTTP + stdio       |  | OKX DEX swap   |  |  | ERC-721 policy NFTs      |     |
|   Claude/GPT ready   |  | On-chain record|  |  | Transferable             |     |
|                      |  +----------------+  |  | Composable (collateral)  |     |
|   x402 SERVER        |  | FeeCompounder  |  |  +--------------------------+     |
|   Micropayments      |  | okx-defi-invest|  |                                   |
|   OKB on X Layer     |  | Auto-reinvest  |  |  OnchainOS Skills Used:           |
|   Pay-per-block      |  +----------------+  |  okx-dex-market:getPrice          |
+----------------------+----------------------+  okx-dex-market:getVolatility      |
                                              |  okx-defi-invest:compound          |
                                              +------------------------------------+
```

---

## Smart Contracts (X Layer Mainnet, Chain ID 196)

### ParryVault.sol
**Address:** `0x57C7f2F3051928E2cc7C871Bac590bF1d4BF4c8e`

The core protocol contract. Handles on-chain state for all agent actions:

| Function | Description |
|---|---|
| `issuePolicy(lp, pool, tickLower, tickUpper, premium)` | Creates an active IL protection policy, mints NFT cert |
| `recordHedge(policyId, hedgeAmountUSD, txRef, volBps)` | Records each hedge execution permanently on-chain |
| `updateVolatility(pool, realizedVolBps)` | Updates the on-chain volatility oracle — called every 15s in live mode |
| `collectPremium(policyId)` | Collects x402 premium payments into the vault |
| `killSwitch()` | Emergency stop — owner-only, pauses all hedging |

`updateVolatility()` is called on **every iteration in live mode**, meaning each 15-second loop produces a confirmed on-chain transaction. This is why `onChainTxCount` reaches thousands within days.

### ProtectionCert.sol
**Address:** `0x87E3D9fcfA4eff229A65d045A7C741E49b581187`

ERC-721 NFT contract for transferable protection certificates. Each active IL protection policy has a corresponding on-chain NFT that:
- Represents the policy terms (tick bounds, pool, LP address, premium paid)
- Is transferable — the LP can sell their protection to another LP
- Can be used as collateral (DeFi composability)
- Is burned when the policy expires or is cancelled

---

## OnchainOS Integration

Parry uses **three OnchainOS skill categories** in its autonomous loop:

### 1. `okx-dex-market:getPrice`
Called **every iteration** (every 15 seconds in live mode).

```typescript
const price = await client.getPrice("ETH");
// Returns current ETH/USDC spot price from OKX DEX market data
// Used to compute: delta exposure, IL%, hedge amount, entry price drift
```

### 2. `okx-dex-market:getVolatility`
Called **every iteration** (every 15 seconds in live mode).

```typescript
const volState = await volEngine.getVolatility("ETH");
// Returns { realizedVolBps, hedgeRatio, regime, sampleCount }
// Regime classification:
//   LOW    (<3% annualized)  -> hedgeRatio = 0.5
//   MEDIUM (3-6%)            -> hedgeRatio = 0.7
//   HIGH   (6-10%)           -> hedgeRatio = 0.9
//   EXTREME (>10%)           -> hedgeRatio = 1.0
```

### 3. `okx-defi-invest:compound`
Called **every 2 iterations** in live mode (every 30 seconds).

```typescript
const result = await compounder.maybeCompound(investmentId, tokenId, tickLower, tickUpper, block, force);
// Invokes okx-defi-invest:compound every 30s on the registered investment position
// Collects accrued trading fees; reinvests them when feesCollected > threshold
// Logged to /onchainos-proof every invocation regardless of reinvestment outcome
```

All three skill invocations are logged with timestamp, args, and result in the **`/onchainos-proof`** endpoint, providing real-time verifiable proof of OnchainOS usage.

---

## MCP Server — AI-Accessible Tooling

The MCP server exposes 6 tools that any AI assistant (Claude, ChatGPT, etc.) can call to query the live agent.

**Base URL:** `https://ample-wisdom-production-f4c9.up.railway.app`

| Tool | Input | Returns |
|---|---|---|
| `get_agent_status` | `{}` | Full live agent state: price, IL%, delta, iteration, on-chain TX count |
| `get_il_exposure` | `{entryPrice, currentPrice, tickLower, tickUpper}` | IL% with positionStatus, in/out-of-range explanation |
| `get_delta_exposure` | `{currentPrice, entryPrice, liquidity, tickLower, tickUpper}` | Delta in ETH-eq, hedgeAmountUSD, positionStatus |
| `compute_optimal_ticks` | `{currentPrice, annualizedVolBps, coverageHorizonDays}` | Statistically optimal tickLower/tickUpper for 95% confidence range |
| `check_premium_cost` | `{coverageAmountUSD, durationDays}` | OKB premium estimate, daily rate, breakdown |
| `get_vault_stats` | `{}` | Vault address, policies, on-chain TX count, agent wallet |

### Usage Example

```bash
# Via HTTP
curl -X POST https://ample-wisdom-production-f4c9.up.railway.app/call/get_agent_status \
  -H "Content-Type: application/json" -d '{}'

# Via Claude Desktop (stdio transport)
# Add to claude_desktop_config.json:
{
  "mcpServers": {
    "parry": {
      "command": "node",
      "args": ["/path/to/mcp-server/dist/index.js"]
    }
  }
}
```

---

## x402 HTTP Payment Protocol

Parry gates its IL protection API behind the **x402 micropayment protocol** — LPs pay in OKB on X Layer to activate protection.

**x402 Server:** `https://radiant-recreation-production-f473.up.railway.app`

### Payment Flow

```
LP Client                    Parry x402 Server              X Layer Mainnet
    |                              |                               |
    | POST /protect/activate       |                               |
    |------------------------------>                               |
    |                              |                               |
    | 402 Payment Required         |                               |
    | X-Payment-Required: {...}    |                               |
    <------------------------------|                               |
    |                              |                               |
    | [OnchainOS okx-x402-payment skill signs authorization]       |
    | Sends OKB to AGENT_WALLET    |------------------------------>|
    |                              |                               |
    | POST /protect/activate       |                               |
    | X-Payment-Authorization: ... |                               |
    |------------------------------>                               |
    |                              | Verify signature + activate   |
    | 200 OK + policyId + NFT cert |                               |
    <------------------------------|                               |
```

### Endpoints

| Endpoint | Auth | Description |
|---|---|---|
| `POST /protect/activate` | x402 required | Activate IL protection, mint policy NFT |
| `POST /protect/demo` | None | Demo activation for judges/testers — returns real policy receipt |
| `GET /protect/status/:policyId` | None | Check protection status |
| `POST /protect/extend/:policyId` | x402 required | Extend existing policy |
| `GET /protect/active` | None | List all active policies |
| `GET /payment-info` | None | Return payment requirements |

### Payment Parameters
- **Currency:** OKB (native X Layer token)
- **Rate:** ~0.001 OKB/day
- **Chain:** X Layer Mainnet (Chain ID 196)
- **Pay To:** `0x94A4365E6B7E79791258A3Fa071824BC2b75a394` (Parry Agent Wallet)

### Live Demo (No Wallet Required)

```bash
curl -X POST https://radiant-recreation-production-f473.up.railway.app/protect/demo \
  -H "Content-Type: application/json" \
  -d '{"lp":"0x94A4365E6B7E79791258A3Fa071824BC2b75a394","poolAddress":"0x5A77f1443D16ee5761d310e38b62f77f726bC71c","durationDays":1}'
```

Or click **"BUY PROTECTION (DEMO)"** on the live frontend for a one-click demo with a live policy receipt displayed on screen.

---

## The Math

### Uniswap V3 Delta

For an LP position with liquidity L in tick range [p_a, p_b] at current price S:

```
When p_a <= S <= p_b:   delta = L * (1/sqrt(S) - 1/sqrt(p_b))
When S > p_b:           delta = 0  (fully in token1, no ETH directional risk)
When S < p_a:           delta = L * (1/sqrt(p_a) - 1/sqrt(p_b))  (fully in token0)
```

### Impermanent Loss

```
IL% = 2*sqrt(k)/(1+k) - 1    where k = currentPrice / entryPrice
```

Note: out-of-range positions have constant IL (price locked at the nearest tick boundary value).

### Optimal Tick Selection

Given realized annualized volatility sigma and coverage horizon T days:

```
p_upper = S * exp(+z * sigma * sqrt(T/365))
p_lower = S * exp(-z * sigma * sqrt(T/365))
tick    = log(price) / log(1.0001)
```

Where z = 1.96 for 95% confidence.

### Hedge Sizing

```
hedgeUSD = |delta| * S * r(regime)

Where r(regime):
  LOW     -> 0.50
  MEDIUM  -> 0.70
  HIGH    -> 0.90
  EXTREME -> 1.00
```

---

## Codebase Structure

```
parry-protocol/
├── agent/                        # Core autonomous agent (Node.js / TypeScript)
│   └── src/
│       ├── index.ts              # Main loop, HTTP status server, OnchainOS calls
│       ├── delta.ts              # Uniswap V3 delta + IL math (exact)
│       ├── volatility.ts         # Realized vol engine + regime classification
│       ├── hedge.ts              # Hedge execution: recordHedge + updateVolatility
│       ├── compounder.ts         # Fee compounding via okx-defi-invest skill
│       ├── onchainos.ts          # OnchainOS client wrapper
│       └── logger.ts             # HUD-style colored logging
│
├── contracts/                    # Solidity smart contracts (Hardhat)
│   ├── contracts/
│   │   ├── ParryVault.sol        # Core vault: policies, hedges, volatility oracle
│   │   └── ProtectionCert.sol   # ERC-721 transferable protection certificate NFT
│   └── scripts/
│       ├── deploy.ts             # Deploy + verify both contracts on X Layer
│       └── seed-policy.ts       # Seed an initial test policy on-chain
│
├── mcp-server/                   # Model Context Protocol server
│   └── src/index.ts              # 6 tools, dual transport: stdio + HTTP
│
├── x402-server/                  # x402 HTTP payment protocol server (Express)
│   └── src/index.ts              # /protect/activate, /protect/demo, full middleware
│
├── frontend/                     # Next.js 14 dashboard
│   ├── app/
│   │   ├── page.tsx              # Main HUD dashboard (2s live polling)
│   │   └── globals.css           # HUD aesthetic: scanlines, orbs, animations
│   └── components/
│       └── AgentChat.tsx         # Interactive MCP chat (presets + NL input)
│
└── README.md
```

---

## Agent Loop Deep Dive

Every 15 seconds (configurable via `LOOP_INTERVAL_MS`):

```typescript
// Step 1: Live price from OnchainOS
const price = await client.getPrice("ETH");
logOnchainOS("okx-dex-market:getPrice", { symbol: "ETH" }, `$${price}`);

// Step 2: Realized volatility + regime classification
const volState = await volEngine.getVolatility("ETH");
logOnchainOS("okx-dex-market:getVolatility", { symbol: "ETH" }, `vol=${vol}% regime=${regime}`);

// Step 3: Optimal tick recomputation (every 50 iterations)
const optTicks = computeOptimalTicks(price, volState.realizedVolBps, 7, 1.96);

// Step 4: Exact V3 delta + IL computation
const deltaResult = computeDelta(price, entryPrice, tickLower, tickUpper, liquidity, hedgeRatio);

// Step 5: Execute hedge if hedgeAmountUSD >= $1
await hedgeExecutor.executeHedge(policyId, deltaResult, baseToken, stableToken, volBps);
// -> ParryVault.recordHedge() confirmed on X Layer Mainnet (Chain 196)

// Step 5b: Update on-chain volatility oracle (EVERY iteration in live mode)
await hedgeExecutor.updateVolatilityDirect(baseToken, volState.realizedVolBps);
// -> ParryVault.updateVolatility() confirmed X Layer TX every 15s
// -> This is why onChainTxCount reaches thousands

// Step 5c: Sync wallet nonce from chain every 5 iterations
state.onChainTxCount = await provider.getTransactionCount(agentWallet);

// Step 6: Fee compounding via OnchainOS (every 2 iterations = every 30s)
const result = await compounder.maybeCompound(...);
if (result.compounded) {
  logOnchainOS("okx-defi-invest:compound", { investmentId }, `fees=${result.feesCollected}`);
}
```

---

## Frontend: Live HUD Dashboard

The Next.js frontend polls `/status` every **2 seconds** and renders:

- **Live ticker bar** — ETH price, IL%, volatility, delta, hedge%, on-chain TXs
- **Status badges** — AGENT LIVE, CHAIN ID 1952, SIGNER LOADED, LIVE MODE (all pulse-animated)
- **Running since** — agent start timestamp from Railway
- **5 core metric cards** — price, IL, delta, hedges, on-chain TX count
- **Position Status orb** — color-coded (green/amber/red) by IL severity
- **Delta + Vol gauges** — visual gauge for directional exposure and vol regime
- **Tick Range visualizer** — shows LP price range with current price indicator
- **OnchainOS Skills panel** — 7 skill modules with live ACTIVE/READY status
- **Agent Terminal** — live scrolling log feed (last 60 entries, prepends every 2s)
- **AgentChat MCP panel** — interactive NL interface: presets + freeform input with intent routing and fallback responses for "help", "what is IL", "how does this work"
- **x402 Demo panel** — one-click BUY PROTECTION demo with live policy receipt on screen
- **Evidence Links** — direct links to OKLink, agent API, MCP health, x402 info
- **Earn-Pay-Earn cycle** — 7-step visual of the full protocol flow

---

## Running Locally

### Prerequisites
- Node.js 18+
- X Layer Mainnet wallet with OKB for gas

### 1. Clone and Deploy Contracts

```bash
git clone https://github.com/Gideon145/parry-protocol
cd parry-protocol/contracts
npm install
cp .env.example .env  # Set: PRIVATE_KEY, RPC_URL, CHAIN_ID=1952
npx hardhat compile
npx tsx scripts/deploy.ts
```

### 2. Start Agent

```bash
cd agent
npm install
cp .env.example .env  # Set: SIGNER_KEY, VAULT_ADDRESS, AGENT_WALLET
npm run dev           # Live mode (real OnchainOS, real X Layer TXs)
# OR
DEMO_MODE=true npm run dev  # Paper trading mode (no real TXs)
```

> **Production note:** Railway deployment runs with `DEMO_MODE=false`. All OnchainOS skill calls are real. `demoMode: false` in `/status` confirms this. The agent has been running live since April 12, 2026.

### 3. Start MCP Server

```bash
cd mcp-server && npm install && npm run dev
# http://localhost:3002
```

### 4. Start x402 Server

```bash
cd x402-server && npm install && npm run dev
# http://localhost:3003
```

### 5. Start Frontend

```bash
cd frontend && npm install && npm run dev
# http://localhost:3000
```

---

## Environment Variables

### Agent (`agent/.env`)

| Variable | Default | Description |
|---|---|---|
| `SIGNER_KEY` | testnet key | Agent wallet private key |
| `VAULT_ADDRESS` | `0x57C7...` | ParryVault contract address |
| `AGENT_WALLET` | `0x94A4...` | Agent wallet address |
| `RPC_URL` | `https://rpc.xlayer.tech` | X Layer Mainnet RPC |
| `CHAIN_ID` | `196` | X Layer Mainnet |
| `DEMO_MODE` | `false` | Paper mode (no real TXs) |
| `LOOP_INTERVAL_MS` | `15000` | Agent loop interval |
| `FORCE_COMPOUND_EVERY_N` | `2` | Compound every N iterations |

### x402 Server (`x402-server/.env`)

| Variable | Description |
|---|---|
| `SIGNER_KEY` | Wallet for payment verification |
| `AGENT_WALLET` | Receives OKB micropayments |
| `ALLOW_DEMO_AUTH_BYPASS` | `true` to allow demo activations |

---

## Security Audit

`ParryVault.sol` was audited by the **[ChainGPT AI Smart Contract Auditor](https://app.chaingpt.org/smart-contract-auditor)** on April 14, 2026.

**Verdict: No critical vulnerabilities found.**

| Finding | Severity | Status |
|---|---|---|
| Reentrancy on `claimProtection` + `withdrawCapital` | ✅ Already protected | `ReentrancyGuard` in place |
| Agent-only access on sensitive functions | ✅ Already correct | `onlyAgent` modifier |
| Owner-only on capital management | ✅ Already correct | `onlyOwner` modifier |
| Solidity 0.8.x overflow protection | ✅ Built-in | No action needed |
| ETH transfer via `call` could fail silently | Low | Reverts on failure — safe by design |
| `block.number` dependence for expiry | Informational | Acceptable for block-based durations |
| `expireProtection` callable by anyone | Informational | Intentional — permissionless expiry mirrors `checkAndSettle` pattern |
| No global contract pause | Informational | Out of scope for hackathon deployment |
| Owner capital withdrawal cap | Low | Mainnet deployment — owner is deployer |

The audit confirms `ReentrancyGuard`, `SafeERC20`, `onlyAgent`, and `onlyOwner` patterns are correctly implemented throughout.

---

## What Makes This Different

Most hackathon agents are scripts with mock data. Parry Protocol:

1. **Runs genuinely autonomously** — 15s loop, no human triggers, Railway 24/7
2. **Uses OnchainOS for real data** — 3 skill types called on every cycle, logged to `/onchainos-proof`
3. **Generates real on-chain TXs** — `updateVolatility()` every loop = 30,000+ testnet TXs + 86,461 **X Layer Mainnet (Chain 196)** TXs, all verifiable on OKLink
4. **Implements real DeFi math** — exact Uniswap V3 delta formula, not fake numbers
5. **Has a working payment protocol** — x402 middleware with real signature verification, validated by OKX engineering
6. **Is AI-queryable** — MCP server with 6 tools callable by Claude/GPT in natural language
7. **Has transferable on-chain artifacts** — ERC-721 Protection Cert NFTs
8. **Has a front-end demo of every feature** — status badges, AgentChat, x402 button, terminal, evidence links
9. **Listed on OKX AI Marketplace** — ASP #5062, validated for x402 v2 compliance, live on X Layer Mainnet

---

## OKX AI Marketplace

**Parry is listed as ASP #5062 on the OKX AI Marketplace.** [View listing →](https://www.okx.ai/agents/5062)

After deploying the original Build-X submission, Parry was registered as an Agent Service Provider in the OKX A2A marketplace. The listing required x402 payment endpoint validation by OKX engineering — a full compliance sweep across all payment headers, EIP-3009 settlement, and protocol spec adherence. Parry passed.

This validates that the x402 payment rail, OnchainOS skill integrations, and autonomous agent architecture are production-grade — not hackathon demos, but deployable infrastructure on the same chain the marketplace runs on.

---

## Team

| Name | Role |
|---|---|
| Gideon | Full-stack engineer, smart contracts, agent architecture |

### Build Timeline

Parry Protocol was built **in a single continuous 10-hour sprint** on April 12, 2026, specifically for the OKX Build-X / X Layer Arena Hackathon. Every component — contracts, agent, MCP server, x402 server, frontend — was designed, written, tested, and deployed from scratch in sequence. The initial git history reflects this: 41 commits from 04:23 UTC to 14:23 UTC on one day, covering initial scaffold → contract deployment → Railway live agent → frontend → MCP → x402 → scoring iteration.

Subsequent commits on April 14, 2026 reflect post-submission improvements: README accuracy fixes, frontend URL corrections, and documentation polish. The core protocol, contracts, and agent were untouched.

On April 15, 2026 (ahead of the 23:59 UTC deadline), contracts were redeployed to **X Layer Mainnet (Chain 196)** and Railway environment variables were updated — agent immediately resumed live operation on mainnet, accumulating **86,461 confirmed mainnet transactions** and **19,104 autonomous iterations** as of July 16, 2026. On July 15, 2026, Parry was listed as ASP #5062 on the OKX AI Marketplace after passing x402 compliance validation by OKX engineering.

This is an intentional, focused build — not a ported existing project. **30,000+ testnet transactions + 5,000+ mainnet transactions** are the proof of work.

---

## License

MIT

