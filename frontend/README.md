# Parry Protocol — Frontend

Live HUD dashboard for the Parry autonomous IL protection agent.

## Stack

- Next.js 14 (App Router)
- Vercel deployment
- Real-time agent status via Agent API polling

## Components

- **ParryHUD** — Live dashboard with position metrics
- **DeltaGauge** — Visual delta exposure indicator
- **PositionOrb** — Concentrated liquidity position visualization
- **TerminalLog** — Real-time hedge execution feed
- **MetricCard** — Key metrics display
- **VolatilityBar** — Volatility regime indicator
- **TickRangeVisual** — Tick range visualization
- **AgentChat** — MCP-powered AI agent chat interface

## Live

https://frontend-mu-three-93.vercel.app

## Run Locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
