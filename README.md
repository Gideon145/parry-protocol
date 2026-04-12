# Parry Protocol

**Delta-Neutral Impermanent Loss Protection for Uniswap V3 LPs on X Layer**

> "Don't just earn fees. Keep them."

Parry Protocol is the first autonomous IL (Impermanent Loss) protection agent on X Layer. It monitors Uniswap V3 LP positions in real time, computes delta exposure using concentrated liquidity math, and executes volatility-adjusted hedge swaps to keep LP positions delta-neutral — automatically, on-chain, 24/7.

---

## The Problem

Uniswap V3 LPs lose an estimated **$1–2B/year** to Impermanent Loss. A concentrated liquidity position between ticks $[p_a, p_b]$ is mathematically equivalent to a short straddle options position — the LP unknowingly writes options on every trade. No protocol on X Layer hedges this.

## The Solution

Parry Protocol's autonomous agent:

1. **Reads** your LP position every 15 seconds via Onchain OS wallet skills
2. **Computes** delta exposure: `Δ = L × (1/√S - 1/√p_b)` where L = liquidity, S = current price
3. **Prices** a volatility-adjusted premium using realized vol from on-chain TWAP data
4. **Executes** offsetting hedge swaps via Uniswap skills on X Layer
5. **Records** every action on-chain via `ParryVault.recordHedge()` and `updateVolatility()`
6. **Mints** a transferable Protection Certificate NFT for every active policy

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     PARRY AGENT (Node.js)                   │
│                                                             │
│  ┌──────────────┐  ┌────────────────┐  ┌────────────────┐  │
│  │VolatilityEng │  │ DeltaCalc      │  │ FeeCompounder  │  │
│  │CoinGecko API │  │ Tick math      │  │ Auto-reinvest  │  │
│  │Realized vol  │  │ IL % + hedgeΔ  │  │ fees → LP      │  │
│  └──────┬───────┘  └───────┬────────┘  └────────────────┘  │
│         │                  │                                 │
│  ┌──────▼──────────────────▼────────────────────────────┐   │
│  │              HedgeExecutor                           │   │
│  │  recordHedge()  •  updateVolatility()  •  killSwitch │   │
│  └──────────────────────────┬───────────────────────────┘   │
│                             │ ethers v6 (RPC)                │
└─────────────────────────────┼───────────────────────────────┘
                              │
              ┌───────────────▼────────────────┐
              │        X Layer Testnet          │
              │                                 │
              │  ┌─────────────────────────┐   │
              │  │   ParryVault.sol        │   │
              │  │   • activateProtection  │   │
              │  │   • recordHedge         │   │
              │  │   • updateVolatility    │   │
              │  │   • claimProtection     │   │
              │  │   • killSwitch          │   │
              │  └─────────────────────────┘   │
              │  ┌─────────────────────────┐   │
              │  │   ProtectionCert.sol    │   │
              │  │   ERC-721 NFT cert      │   │
              │  │   On-chain SVG metadata │   │
              │  └─────────────────────────┘   │
              └─────────────────────────────────┘
                              │
              ┌───────────────▼────────────────┐
              │     MCP Server (stdio)          │
              │  Tools: get_status, activate,   │
              │  get_vault_stats, get_il_quote  │
              └─────────────────────────────────┘
                              │
              ┌───────────────▼────────────────┐
              │     x402 Payment Server         │
              │  HTTP micropayment for premium  │
              │  per-block IL insurance pricing │
              └─────────────────────────────────┘
```

---

## Onchain OS & Uniswap Skills Used

| Skill | Usage |
|---|---|
| `onchainos market price` | Real-time ETH/USDC price for delta calc |
| `onchainos market kline` | OHLCV data for realized volatility computation |
| `onchainos wallet balance` | Read LP position state and coverage status |
| `onchainos defi depth-price-chart` | Optimal tick range calculation |
| `onchainos swap quote` | Hedge swap sizing before execution |
| `onchainos swap execute` | Execute delta-neutralizing hedge swap on X Layer |
| `onchainos defi collect --reward-type V3_FEE` | Auto-compound LP fees back into position |
| **Uniswap V3 Position Manager** | Read tick range, liquidity, and fee accrual |
| **Uniswap V3 Router** | Swap router for hedge execution |

---

## Deployment Addresses (X Layer Testnet — chainId 1952)

| Contract | Address |
|---|---|
| **ParryVault** | [`0x57C7f2F3051928E2cc7C871Bac590bF1d4BF4c8e`](https://www.oklink.com/xlayer-test/address/0x57C7f2F3051928E2cc7C871Bac590bF1d4BF4c8e) |
| **ProtectionCert (ERC-721)** | [`0x87E3D9fcfA4eff229A65d045A7C741E49b581187`](https://www.oklink.com/xlayer-test/address/0x87E3D9fcfA4eff229A65d045A7C741E49b581187) |
| **Deployer / Agent Wallet** | `0x94A4365E6B7E79791258A3Fa071824BC2b75a394` |
| **Deployed at** | 2026-04-12T07:20:22Z |

---

## Working Mechanics

### 1. Volatility-Adjusted Premium Pricing

Premium is computed from realized annualized volatility:

```
σ_realized = sqrt(Σ(ln(Pₜ/Pₜ₋₁))² / n) × sqrt(annualization_factor)
```

- Low vol (< 30%): 0.5 bps/block
- Medium vol (30–60%): 1.5 bps/block
- High vol (60–90%): 3.0 bps/block
- Extreme vol (> 90%): 5.0 bps/block

### 2. Delta Calculation

For a Uniswap V3 concentrated LP with liquidity L, current price S, upper tick p_b:

```
Δ = L × (1/√S - 1/√p_b)
hedge_amount_USD = |Δ| × S × hedge_ratio × LP_value_USD
```

Hedge ratio scales adaptively: 50% at low vol → 100% at extreme vol.

### 3. Optimal Tick Placement

Before opening an LP, Parry computes the statistically optimal tick range:

```
σ_daily = σ_realized × √(1/365)
price_range = [S × e^(-z × σ_daily × √T), S × e^(+z × σ_daily × √T)]
```
where z = 1.96 (95% confidence), T = coverage days.

### 4. Kill Switch

If single-block IL exceeds the policy threshold, the agent calls `killSwitch()` on-chain, exits the LP, and pays out the payout automatically — no manual intervention required.

### 5. Protection Certificate NFT

On `activateProtection()`, a soulbound-style ERC-721 NFT is minted with on-chain SVG metadata showing:
- Policy ID, tick range, coverage status
- Real-time status: ACTIVE → AT_RISK → SETTLED / EXPIRED
- Fully transferable — LPs can sell their hedge mid-flight

### 6. Fee Auto-Compounding

Every N blocks, the agent calls `onchainos defi collect --reward-type V3_FEE` to collect accrued swap fees and re-invests them back into the position, closing the earn-pay-earn loop.

### 7. MCP Integration

The agent exposes a full MCP (Model Context Protocol) server for AI assistant integration:

```json
Tools available:
- parry_get_status        → current agent state, IL exposure, hedge ratio
- parry_activate_policy   → activate IL protection for a position
- parry_get_vault_stats   → vault TVL, active policies, total hedges
- parry_get_il_quote      → get IL exposure and premium quote for a position
```

### 8. x402 HTTP Micropayments

Premium payments use the x402 HTTP micropayment protocol:

```
POST /activate  →  402 Payment Required
                   X-Payment-Required: <payment-details>
                   X-Payment-Amount: <bps × blocks × coverage>
                → On payment: activates protection on ParryVault
```

---

## X Layer Ecosystem Positioning

Parry Protocol is purpose-built for X Layer's DeFi ecosystem:

- **Fills a critical gap**: No IL protection product exists on X Layer
- **Drives Uniswap V3 TVL**: LPs protected by Parry are more likely to provide deeper liquidity
- **Generates on-chain activity**: Every hedge = 2 txns on X Layer (recordHedge + updateVolatility)
- **Composable**: Protection Cert NFTs are transferable and can be used as collateral
- **AI-native**: MCP server makes Parry controllable by any AI assistant through Claude/ChatGPT

---

## Running Locally

### Prerequisites

```bash
Node.js 18+
```

### 1. Deploy Contracts

```bash
cd contracts
npm install
cp .env.example .env  # add PRIVATE_KEY
npx hardhat compile
npx tsx scripts/deploy.ts
```

### 2. Start Agent

```bash
cd agent
npm install
cp .env.example .env  # add deployed addresses + API keys
npm run dev           # or: DEMO_MODE=true npm run dev
```

### 3. Start Frontend

```bash
cd frontend
npm install
npm run dev
# open http://localhost:3000
```

### 4. Start MCP Server

```bash
cd mcp-server
npm install
npm run dev
```

### 5. Start x402 Server

```bash
cd x402-server
npm install
npm run dev
```

---

## Team

| Name | Role |
|---|---|
| Gideon | Full-stack + Smart Contracts + Agent |

---

## License

MIT
