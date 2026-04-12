/**
 * PARRY Delta Calculator
 *
 * Implements Uniswap V3 concentrated liquidity delta math.
 *
 * For a position in range [P_a, P_b] with liquidity L:
 *
 * When P_a ≤ S ≤ P_b (in range):
 *   Value: V(S) = 2L√S - L·S/√P_b - L√P_a
 *   Delta: ∂V/∂S = L/√S - L/√P_b
 *
 * When S < P_a (out of range, all token1):
 *   Value: V = L(√P_b - √P_a)  [constant in token0]
 *   Delta: 0  →  position is fully hedged naturally
 *
 * When S > P_b (out of range, all token0):
 *   Value: V = L·P_b(1/√P_a - 1/√P_b)  [constant in token1]
 *   Delta: 0  →  position fully converted, no hedge needed
 *
 * The hedge target: short deltaAmount of the risky asset so net ∂V_total/∂S = 0
 */

export interface DeltaResult {
  delta: number;           // ETH-equivalent delta exposure
  inRange: boolean;
  currentPrice: number;
  tickLower: number;
  tickUpper: number;
  liquidity: bigint;
  priceLower: number;
  priceUpper: number;
  ilPercent: number;       // current IL % vs hold
  hedgeAmountUSD: number;  // value to short in USD
}

/** Convert a Uniswap V3 tick to a price */
export function tickToPrice(tick: number): number {
  return Math.pow(1.0001, tick);
}

/**
 * Compute IL% for a V3 position.
 * IL = V_hold(S) - V_LP(S) / V_hold(S0)
 * where V_hold = amount0·S + amount1 (hold strategy)
 *       V_LP   = current LP value
 */
export function computeILPercent(
  entryPrice: number,
  currentPrice: number,
  tickLower: number,
  tickUpper: number
): number {
  const pa = tickToPrice(tickLower);
  const pb = tickToPrice(tickUpper);
  const s0 = entryPrice;
  const s = currentPrice;

  // Normalized price ratio
  const r = s / s0;

  // IL formula for concentrated liquidity (Dv3):
  // IL = 2√r / (1+r) - 1  (standard V2)
  // For V3 we apply range adjustment factor k where:
  // k = (√s - √pa) / (√pb - √pa) clamped to [0,1]

  let ilStandard: number;

  if (s < pa) {
    // Price below range — all token1. IL relative to entry.
    const kEntry = Math.max(0, Math.min(1, (Math.sqrt(s0) - Math.sqrt(pa)) / (Math.sqrt(pb) - Math.sqrt(pa))));
    if (kEntry === 0) {
      // Entry was also below range
      ilStandard = 0;
    } else {
      // Value of position = constant token1 = L(√pb - √pa) in token1 terms
      // Value of hold at s = x0·s + y0
      // Approximation: use standard V2 IL formula scaled by range
      ilStandard = (2 * Math.sqrt(r) / (1 + r) - 1) * kEntry;
    }
  } else if (s > pb) {
    // Price above range — all token0
    const kEntry = Math.max(0, Math.min(1, (Math.sqrt(s0) - Math.sqrt(pa)) / (Math.sqrt(pb) - Math.sqrt(pa))));
    if (kEntry === 1) {
      ilStandard = 0;
    } else {
      ilStandard = (2 * Math.sqrt(r) / (1 + r) - 1) * (1 - kEntry);
    }
  } else {
    // Standard V2 IL formula (V3 in-range approximation)
    ilStandard = 2 * Math.sqrt(r) / (1 + r) - 1;
  }

  return Math.abs(ilStandard) * 100; // return as positive percentage
}

/**
 * Compute the delta exposure of a V3 LP position.
 * Returns the amount of the risky asset that needs to be hedged.
 *
 * @param currentPrice  Current spot price S (risky/stable, e.g. ETH/USDC)
 * @param entryPrice    Price at which position was entered (for IL calc)
 * @param tickLower     Lower tick of position
 * @param tickUpper     Upper tick of position
 * @param liquidity     Liquidity units (L) of position — use 1e18 as normalized unit
 * @param hedgeRatio    Fraction of delta to hedge (0-1), set by volatility engine
 */
export function computeDelta(
  currentPrice: number,
  entryPrice: number,
  tickLower: number,
  tickUpper: number,
  liquidity: bigint,
  hedgeRatio: number = 1.0
): DeltaResult {
  const pa = tickToPrice(tickLower);
  const pb = tickToPrice(tickUpper);
  const s = currentPrice;

  const L = Number(liquidity) / 1e18; // normalize

  let delta: number;
  let inRange: boolean;

  if (s < pa) {
    // Below range — all token1, no risky asset exposure
    delta = 0;
    inRange = false;
  } else if (s > pb) {
    // Above range — all token0, max exposure
    delta = L * (1 / Math.sqrt(pa) - 1 / Math.sqrt(pb));
    inRange = false;
  } else {
    // In range: delta = L/√S - L/√P_b
    delta = L / Math.sqrt(s) - L / Math.sqrt(pb);
    inRange = true;
  }

  const effectiveDelta = delta * hedgeRatio;
  const hedgeAmountUSD = effectiveDelta * s;
  const ilPercent = computeILPercent(entryPrice, currentPrice, tickLower, tickUpper);

  return {
    delta: effectiveDelta,
    inRange,
    currentPrice: s,
    tickLower,
    tickUpper,
    liquidity,
    priceLower: pa,
    priceUpper: pb,
    ilPercent,
    hedgeAmountUSD,
  };
}

/**
 * Compute optimal tick range using:
 * 1. Historical volatility (σ annualized)
 * 2. Target coverage probability (e.g. 0.95 = cover 95% of price moves)
 *
 * Tick range width = ±σ√(T) converted to ticks via ln(range)/ln(1.0001)
 * where T = desired coverage horizon in years
 */
export function computeOptimalTicks(
  currentPrice: number,
  annualizedVolBps: number,    // e.g. 8000 = 80%
  coverageHorizonDays: number, // e.g. 7 for 1-week coverage
  confidenceLevel: number = 1.96  // 1.96 = 95% confidence
): { tickLower: number; tickUpper: number; priceLower: number; priceUpper: number } {
  const sigma = annualizedVolBps / 10000;
  const T = coverageHorizonDays / 365;

  // Half-width: sigma * sqrt(T) * z-score
  const halfWidth = sigma * Math.sqrt(T) * confidenceLevel;

  const priceLower = currentPrice * Math.exp(-halfWidth);
  const priceUpper = currentPrice * Math.exp(halfWidth);

  // Convert prices to ticks: tick = ln(price) / ln(1.0001)
  const tickLower = Math.floor(Math.log(priceLower) / Math.log(1.0001));
  const tickUpper = Math.ceil(Math.log(priceUpper) / Math.log(1.0001));

  // Align to tick spacing (60 for 0.3% pools, 10 for 0.05%)
  const TICK_SPACING = 60;
  const alignedLower = Math.floor(tickLower / TICK_SPACING) * TICK_SPACING;
  const alignedUpper = Math.ceil(tickUpper / TICK_SPACING) * TICK_SPACING;

  return {
    tickLower: alignedLower,
    tickUpper: alignedUpper,
    priceLower,
    priceUpper,
  };
}
