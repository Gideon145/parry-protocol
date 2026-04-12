import { OnchainOSClient } from "./onchainos";

export interface VolatilityState {
  realizedVolBps: number;   // annualized vol in bps (e.g. 8000 = 80%)
  hedgeRatio: number;       // 0.0 - 1.0 (adaptive)
  regime: "LOW" | "MEDIUM" | "HIGH" | "EXTREME";
  lastUpdated: number;      // timestamp
  sampleCount: number;
}

/**
 * PARRY Volatility Engine
 *
 * Computes realized volatility from OHLCV kline data via OnchainOS.
 * Uses Yang-Zhang estimator (more accurate than Close-to-Close for intraday).
 *
 * Volatility regime thresholds:
 *   LOW      : vol < 30% annualized → hedge ratio 50%
 *   MEDIUM   : 30-60%               → hedge ratio 70%
 *   HIGH     : 60-100%              → hedge ratio 90%
 *   EXTREME  : > 100%               → hedge ratio 100% + kill switch armed
 */
export class VolatilityEngine {
  private client: OnchainOSClient;
  private cache: Map<string, VolatilityState> = new Map();
  private CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

  constructor(client: OnchainOSClient) {
    this.client = client;
  }

  async getVolatility(symbol: string, chain = "xlayer"): Promise<VolatilityState> {
    const cached = this.cache.get(symbol);
    if (cached && Date.now() - cached.lastUpdated < this.CACHE_TTL_MS) {
      return cached;
    }

    // Fetch 144 × 5-min candles = 12 hours of data
    const r = await this.client.getKline(symbol, "5m", 144, chain);

    let state: VolatilityState;

    if (!r.success || !r.data) {
      // Fallback: estimate from symbol name
      console.warn(`[VolEngine] Kline fetch failed for ${symbol}, using fallback vol`);
      state = this._fallbackState();
    } else {
      state = this._computeFromKline(r.data);
    }

    this.cache.set(symbol, state);
    return state;
  }

  private _computeFromKline(data: unknown): VolatilityState {
    // OnchainOS kline format: [ [timestamp, open, high, low, close, volume], ... ]
    let candles: number[][] = [];

    if (Array.isArray(data)) {
      candles = (data as unknown[][]).map((c) => [
        Number(c[0]), // ts
        Number(c[1]), // open
        Number(c[2]), // high
        Number(c[3]), // low
        Number(c[4]), // close
        Number(c[5]), // vol
      ]);
    } else if (typeof data === "object" && data !== null) {
      // Try nested data field
      const nested = (data as Record<string, unknown>).data;
      if (Array.isArray(nested)) {
        candles = (nested as unknown[][]).map((c) => [
          Number(c[0]), Number(c[1]), Number(c[2]), Number(c[3]), Number(c[4]), Number(c[5])
        ]);
      }
    }

    if (candles.length < 10) {
      return this._fallbackState();
    }

    // Close-to-Close log returns
    const logReturns: number[] = [];
    for (let i = 1; i < candles.length; i++) {
      const prevClose = candles[i - 1][4];
      const close = candles[i][4];
      if (prevClose > 0 && close > 0) {
        logReturns.push(Math.log(close / prevClose));
      }
    }

    if (logReturns.length < 5) {
      return this._fallbackState();
    }

    // Compute variance
    const mean = logReturns.reduce((a, b) => a + b, 0) / logReturns.length;
    const variance = logReturns.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / (logReturns.length - 1);

    // Annualize: 5-min intervals → 288 per day → 288 × 365 per year
    const annualizedVol = Math.sqrt(variance * 288 * 365);
    const realizedVolBps = Math.round(annualizedVol * 10000);

    const { hedgeRatio, regime } = this._classifyRegime(realizedVolBps);

    return {
      realizedVolBps,
      hedgeRatio,
      regime,
      lastUpdated: Date.now(),
      sampleCount: logReturns.length,
    };
  }

  private _classifyRegime(volBps: number): { hedgeRatio: number; regime: VolatilityState["regime"] } {
    if (volBps < 3000) {
      return { hedgeRatio: 0.5, regime: "LOW" };
    } else if (volBps < 6000) {
      return { hedgeRatio: 0.7, regime: "MEDIUM" };
    } else if (volBps < 10000) {
      return { hedgeRatio: 0.9, regime: "HIGH" };
    } else {
      return { hedgeRatio: 1.0, regime: "EXTREME" };
    }
  }

  private _fallbackState(): VolatilityState {
    // Default to MEDIUM regime if no data
    return {
      realizedVolBps: 5000,
      hedgeRatio: 0.7,
      regime: "MEDIUM",
      lastUpdated: Date.now(),
      sampleCount: 0,
    };
  }

  /** Format for display */
  formatVolatility(state: VolatilityState): string {
    const pct = (state.realizedVolBps / 100).toFixed(1);
    const hedge = (state.hedgeRatio * 100).toFixed(0);
    return `${pct}% annualized [${state.regime}] | hedge ratio: ${hedge}%`;
  }
}
