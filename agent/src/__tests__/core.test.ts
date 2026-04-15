import { describe, it, expect } from "vitest";
import {
  tickToPrice,
  computeILPercent,
  computeDelta,
  computeOptimalTicks,
} from "../delta";

const LIQUIDITY = BigInt("1000000000000000000"); // 1e18
// ETH/USDC reference: tick for $2000 ≈ 76013 (ln(2000)/ln(1.0001))
const ENTRY_PRICE = 2000;
const TICK_LOWER = 75413; // entryTick - 600 → priceLower ≈ $1883
const TICK_UPPER = 76613; // entryTick + 600 → priceUpper ≈ $2117

// ─────────────────────────────────────────────────────────────────────────────
// tickToPrice
// ─────────────────────────────────────────────────────────────────────────────

describe("tickToPrice", () => {
  it("tick 0 → price 1", () => {
    expect(tickToPrice(0)).toBeCloseTo(1, 8);
  });

  it("tick 10 → ~1.001001", () => {
    expect(tickToPrice(10)).toBeCloseTo(1.001001, 4);
  });

  it("negative tick is inverse of positive tick", () => {
    expect(tickToPrice(-100)).toBeCloseTo(1 / tickToPrice(100), 6);
  });

  it("tick 76013 ≈ 2000 (ETH reference price)", () => {
    expect(tickToPrice(76013)).toBeCloseTo(2000, 0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// computeILPercent
// ─────────────────────────────────────────────────────────────────────────────

describe("computeILPercent", () => {
  it("IL is zero when price has not moved", () => {
    const il = computeILPercent(ENTRY_PRICE, ENTRY_PRICE, TICK_LOWER, TICK_UPPER);
    expect(il).toBeCloseTo(0, 4);
  });

  it("IL increases as price moves further from entry", () => {
    const ilSmall = computeILPercent(ENTRY_PRICE, ENTRY_PRICE * 1.05, TICK_LOWER, TICK_UPPER);
    const ilLarge = computeILPercent(ENTRY_PRICE, ENTRY_PRICE * 1.20, TICK_LOWER, TICK_UPPER);
    expect(ilLarge).toBeGreaterThan(ilSmall);
  });

  it("downward 10% move has higher IL than upward 10% (formula asymmetry)", () => {
    const ilUp   = computeILPercent(ENTRY_PRICE, ENTRY_PRICE * 1.10, TICK_LOWER, TICK_UPPER);
    const ilDown = computeILPercent(ENTRY_PRICE, ENTRY_PRICE * 0.90, TICK_LOWER, TICK_UPPER);
    expect(ilDown).toBeGreaterThan(ilUp);
  });

  it("IL is always non-negative", () => {
    [-0.5, -0.2, -0.05, 0.05, 0.2, 0.5].forEach((pct) => {
      const il = computeILPercent(ENTRY_PRICE, ENTRY_PRICE * (1 + pct), TICK_LOWER, TICK_UPPER);
      expect(il).toBeGreaterThanOrEqual(0);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// computeDelta — in range
// ─────────────────────────────────────────────────────────────────────────────

describe("computeDelta — in range", () => {
  it("inRange is true at entry price", () => {
    const r = computeDelta(ENTRY_PRICE, ENTRY_PRICE, TICK_LOWER, TICK_UPPER, LIQUIDITY);
    expect(r.inRange).toBe(true);
  });

  it("delta is positive when in range", () => {
    const r = computeDelta(ENTRY_PRICE, ENTRY_PRICE, TICK_LOWER, TICK_UPPER, LIQUIDITY);
    expect(r.delta).toBeGreaterThan(0);
  });

  it("hedgeAmountUSD ≈ delta × currentPrice", () => {
    const r = computeDelta(ENTRY_PRICE, ENTRY_PRICE, TICK_LOWER, TICK_UPPER, LIQUIDITY);
    expect(r.hedgeAmountUSD).toBeCloseTo(r.delta * ENTRY_PRICE, 4);
  });

  it("hedgeRatio 0 → zero hedge amount", () => {
    const r = computeDelta(ENTRY_PRICE, ENTRY_PRICE, TICK_LOWER, TICK_UPPER, LIQUIDITY, 0);
    expect(r.delta).toBe(0);
    expect(r.hedgeAmountUSD).toBe(0);
  });

  it("hedgeRatio 0.5 → half the hedge amount of hedgeRatio 1.0", () => {
    const r1 = computeDelta(ENTRY_PRICE, ENTRY_PRICE, TICK_LOWER, TICK_UPPER, LIQUIDITY, 1.0);
    const r2 = computeDelta(ENTRY_PRICE, ENTRY_PRICE, TICK_LOWER, TICK_UPPER, LIQUIDITY, 0.5);
    expect(r2.hedgeAmountUSD).toBeCloseTo(r1.hedgeAmountUSD * 0.5, 4);
  });

  it("delta decreases as price rises toward upper tick", () => {
    // Both prices must be within [priceLower≈1883, priceUpper≈2117]
    const r1 = computeDelta(2020, ENTRY_PRICE, TICK_LOWER, TICK_UPPER, LIQUIDITY);
    const r2 = computeDelta(2090, ENTRY_PRICE, TICK_LOWER, TICK_UPPER, LIQUIDITY);
    // As price rises, more ETH is converted to USDC → less risky exposure
    expect(r2.delta).toBeLessThan(r1.delta);
  });

  it("priceLower < currentPrice < priceUpper when in range", () => {
    const r = computeDelta(ENTRY_PRICE, ENTRY_PRICE, TICK_LOWER, TICK_UPPER, LIQUIDITY);
    expect(r.priceLower).toBeLessThan(ENTRY_PRICE);
    expect(r.priceUpper).toBeGreaterThan(ENTRY_PRICE);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// computeDelta — out of range
// ─────────────────────────────────────────────────────────────────────────────

describe("computeDelta — out of range", () => {
  it("inRange is false when price is below range", () => {
    const r = computeDelta(1700, ENTRY_PRICE, TICK_LOWER, TICK_UPPER, LIQUIDITY);
    expect(r.inRange).toBe(false);
  });

  it("delta is 0 below range (all token1, no risky exposure to hedge)", () => {
    const r = computeDelta(1700, ENTRY_PRICE, TICK_LOWER, TICK_UPPER, LIQUIDITY);
    expect(r.delta).toBe(0);
    expect(r.hedgeAmountUSD).toBe(0);
  });

  it("inRange is false when price is above range", () => {
    const r = computeDelta(2400, ENTRY_PRICE, TICK_LOWER, TICK_UPPER, LIQUIDITY);
    expect(r.inRange).toBe(false);
  });

  it("delta > 0 above range (all token0, max risky exposure)", () => {
    const r = computeDelta(2400, ENTRY_PRICE, TICK_LOWER, TICK_UPPER, LIQUIDITY);
    expect(r.delta).toBeGreaterThan(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// computeOptimalTicks
// ─────────────────────────────────────────────────────────────────────────────

describe("computeOptimalTicks", () => {
  it("tickLower < tickUpper", () => {
    const r = computeOptimalTicks(2000, 5000, 7);
    expect(r.tickLower).toBeLessThan(r.tickUpper);
  });

  it("priceLower < currentPrice < priceUpper", () => {
    const price = 2000;
    const r = computeOptimalTicks(price, 5000, 7);
    expect(r.priceLower).toBeLessThan(price);
    expect(r.priceUpper).toBeGreaterThan(price);
  });

  it("ticks are aligned to tick spacing 60", () => {
    const r = computeOptimalTicks(2000, 5000, 7);
    expect(r.tickLower % 60).toBe(0);
    expect(r.tickUpper % 60).toBe(0);
  });

  it("higher volatility → wider tick range", () => {
    const lowVol  = computeOptimalTicks(2000, 3000, 7);
    const highVol = computeOptimalTicks(2000, 8000, 7);
    const lowVolWidth  = lowVol.tickUpper  - lowVol.tickLower;
    const highVolWidth = highVol.tickUpper - highVol.tickLower;
    expect(highVolWidth).toBeGreaterThan(lowVolWidth);
  });

  it("longer coverage horizon → wider tick range", () => {
    const r7  = computeOptimalTicks(2000, 5000, 7);
    const r30 = computeOptimalTicks(2000, 5000, 30);
    expect(r30.tickUpper - r30.tickLower).toBeGreaterThan(r7.tickUpper - r7.tickLower);
  });

  it("range midpoint is close to current price tick", () => {
    const r = computeOptimalTicks(2000, 5000, 7);
    const midTick = (r.tickLower + r.tickUpper) / 2;
    const currentTick = Math.log(2000) / Math.log(1.0001);
    expect(Math.abs(midTick - currentTick)).toBeLessThan(120); // within 2 tick spacings
  });
});
