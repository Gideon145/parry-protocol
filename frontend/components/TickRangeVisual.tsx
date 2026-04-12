"use client";

interface Props {
  currentPrice: number;
  entryPrice: number;
  tickLower: number;
  tickUpper: number;
}

// Approximate tick → price: price = 1.0001^tick
function tickToPrice(tick: number, entryPrice: number) {
  return entryPrice * Math.pow(1.0001, tick);
}

export function TickRangeVisual({ currentPrice, entryPrice, tickLower, tickUpper }: Props) {
  const priceLower = tickToPrice(tickLower, entryPrice);
  const priceUpper = tickToPrice(tickUpper, entryPrice);

  const rangeWidth = priceUpper - priceLower;
  const displayMin = priceLower * 0.985;
  const displayMax = priceUpper * 1.015;
  const displayRange = displayMax - displayMin;

  const toX = (price: number) =>
    Math.max(0, Math.min(100, ((price - displayMin) / displayRange) * 100));

  const currentX = toX(currentPrice);
  const lowerX = toX(priceLower);
  const upperX = toX(priceUpper);

  const inRange = currentPrice >= priceLower && currentPrice <= priceUpper;

  return (
    <div style={{ width: "100%" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          marginBottom: 6,
        }}
      >
        <span style={{ fontSize: 9, color: "var(--text-dim)", letterSpacing: "0.1em" }}>
          TICK RANGE
        </span>
        <span
          style={{
            fontSize: 9,
            color: inRange ? "var(--green)" : "var(--amber)",
            letterSpacing: "0.1em",
          }}
        >
          {inRange ? "IN RANGE" : "OUT OF RANGE"}
        </span>
      </div>

      <div
        style={{
          position: "relative",
          height: 28,
          background: "rgba(255,255,255,0.03)",
          borderRadius: 3,
          border: "1px solid var(--border)",
          overflow: "hidden",
        }}
      >
        {/* Range zone */}
        <div
          style={{
            position: "absolute",
            top: 0,
            bottom: 0,
            left: `${lowerX}%`,
            width: `${upperX - lowerX}%`,
            background: "rgba(0,212,255,0.08)",
            borderLeft: "1px solid rgba(0,212,255,0.4)",
            borderRight: "1px solid rgba(0,212,255,0.4)",
          }}
        />

        {/* Current price needle */}
        <div
          style={{
            position: "absolute",
            top: 0,
            bottom: 0,
            left: `${currentX}%`,
            width: 2,
            background: inRange ? "var(--green)" : "var(--amber)",
            boxShadow: `0 0 6px ${inRange ? "var(--green)" : "var(--amber)"}`,
            transform: "translateX(-1px)",
            transition: "left 0.4s ease",
          }}
        />
      </div>

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          marginTop: 4,
        }}
      >
        <span
          style={{
            fontSize: 9,
            color: "var(--text-dim)",
            fontFamily: "var(--font-hud), monospace",
          }}
        >
          ${priceLower.toFixed(0)}
        </span>
        <span
          style={{
            fontSize: 9,
            color: inRange ? "var(--green)" : "var(--amber)",
            fontFamily: "var(--font-hud), monospace",
          }}
        >
          ${currentPrice.toFixed(2)}
        </span>
        <span
          style={{
            fontSize: 9,
            color: "var(--text-dim)",
            fontFamily: "var(--font-hud), monospace",
          }}
        >
          ${priceUpper.toFixed(0)}
        </span>
      </div>
    </div>
  );
}
