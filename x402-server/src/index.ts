import "dotenv/config";
import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import { ethers } from "ethers";
import * as http from "http";

/**
 * PARRY x402 Payment Server
 *
 * Implements the x402 HTTP payment protocol for PARRY's pay-per-block
 * IL protection premium.
 *
 * Flow:
 *  1. Client requests /protect/activate
 *  2. Server responds 402 with payment details (X-Payment-Required header)
 *  3. Client sends x402 authorization via OnchainOS okx-x402-payment skill
 *  4. Server verifies payment signature, activates protection
 *
 * This creates a gasless micropayment stream — LPs pay only while protected,
 * stopping payment immediately exits protection. No smart contract interaction
 * needed for every premium block — the TEE-signed authorization handles it.
 */

const app = express();
app.use(express.json());
app.use(cors());

const PORT = parseInt(process.env.PORT || process.env.X402_PORT || "3002", 10);
const VAULT_ADDRESS = process.env.VAULT_ADDRESS || "";
const AGENT_WALLET = process.env.AGENT_WALLET || "";
const ALLOW_DEMO_AUTH_BYPASS = process.env.ALLOW_DEMO_AUTH_BYPASS === "true";

// Price per protection period (in OKB, 18 decimals)
const PRICE_PER_DAY_OKB = ethers.parseEther("0.001"); // 0.001 OKB/day

// ─────────────────────────────────────────────────────────────────────────────
// Active protections (in-memory — use Redis/DB in production)
// ─────────────────────────────────────────────────────────────────────────────

interface ActiveProtection {
  policyId: string;
  lp: string;
  paidUntil: number; // unix timestamp
  poolAddress: string;
  tickLower: number;
  tickUpper: number;
  premiumPaid: string;
  activatedAt: number;
}

const activeProtections = new Map<string, ActiveProtection>();

// ─────────────────────────────────────────────────────────────────────────────
// Routes
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /protect/status/:policyId
 * Check protection status for a policy
 */
app.get("/protect/status/:policyId", (req: Request, res: Response) => {
  const policy = activeProtections.get(req.params.policyId);
  if (!policy) {
    return res.status(404).json({ protected: false, error: "Policy not found" });
  }
  const active = Date.now() < policy.paidUntil;
  return res.json({
    protected: active,
    policyId: policy.policyId,
    paidUntil: new Date(policy.paidUntil).toISOString(),
    remainingMs: Math.max(0, policy.paidUntil - Date.now()),
    lp: policy.lp,
  });
});

/**
 * POST /protect/activate
 * Activate IL protection. Requires x402 payment authorization.
 *
 * Body: { lp, poolAddress, tickLower, tickUpper, durationDays }
 * Headers required (after 402 flow):
 *   X-Payment-Authorization: <onchainos x402 TEE signature>
 *   X-Payment-Amount: <OKB amount in wei>
 *   X-Payment-Currency: OKB
 */
app.post("/protect/activate", x402Middleware, async (req: Request, res: Response) => {
  const { lp, poolAddress, tickLower, tickUpper, durationDays = 1 } = req.body;

  if (!lp || !poolAddress) {
    return res.status(400).json({ error: "lp and poolAddress required" });
  }

  const policyId = ethers.keccak256(
    ethers.AbiCoder.defaultAbiCoder().encode(
      ["address", "address", "uint256"],
      [lp, poolAddress, Date.now()]
    )
  );

  const protection: ActiveProtection = {
    policyId,
    lp,
    paidUntil: Date.now() + durationDays * 24 * 60 * 60 * 1000,
    poolAddress,
    tickLower: parseInt(tickLower),
    tickUpper: parseInt(tickUpper),
    premiumPaid: String((req as Request & { paymentAmount?: string }).paymentAmount || "0"),
    activatedAt: Date.now(),
  };

  activeProtections.set(policyId, protection);

  console.log(`[x402] Protection activated: ${policyId} for ${lp}`);
  console.log(`[x402] Duration: ${durationDays} days | Paid until: ${new Date(protection.paidUntil).toISOString()}`);

  return res.status(201).json({
    policyId,
    message: "PARRY IL protection activated",
    protectedUntil: new Date(protection.paidUntil).toISOString(),
    vaultAddress: VAULT_ADDRESS,
    agentWallet: AGENT_WALLET,
    coverage: "IL protection active — Parry agent monitoring your position",
  });
});

/**
 * POST /protect/extend/:policyId
 * Extend existing protection with x402 payment
 */
app.post("/protect/extend/:policyId", x402Middleware, async (req: Request, res: Response) => {
  const policy = activeProtections.get(req.params.policyId);
  if (!policy) {
    return res.status(404).json({ error: "Policy not found" });
  }

  const { durationDays = 1 } = req.body;
  const extensionMs = durationDays * 24 * 60 * 60 * 1000;
  const baseTime = Math.max(policy.paidUntil, Date.now());
  policy.paidUntil = baseTime + extensionMs;

  console.log(`[x402] Protection extended: ${req.params.policyId} until ${new Date(policy.paidUntil).toISOString()}`);

  return res.json({
    policyId: req.params.policyId,
    extended: true,
    newPaidUntil: new Date(policy.paidUntil).toISOString(),
    addedDays: durationDays,
  });
});

/**
 * GET /protect/active
 * List all active protections (agent endpoint)
 */
app.get("/protect/active", (_req: Request, res: Response) => {
  const active = Array.from(activeProtections.values())
    .filter(p => Date.now() < p.paidUntil)
    .map(p => ({
      policyId: p.policyId,
      lp: p.lp,
      paidUntil: new Date(p.paidUntil).toISOString(),
      poolAddress: p.poolAddress,
      tickLower: p.tickLower,
      tickUpper: p.tickUpper,
    }));
  return res.json({ active, count: active.length });
});

/**
 * GET /payment-info
 * Return payment requirements for x402 integrations
 */
app.get("/payment-info", (_req: Request, res: Response) => {
  return res.json({
    scheme: "x402",
    network: "xlayer",
    chainId: parseInt(process.env.CHAIN_ID || "1952"),
    payTo: AGENT_WALLET,
    currency: "OKB",
    pricePerDay: ethers.formatEther(PRICE_PER_DAY_OKB),
    endpoint: "/protect/activate",
    description: "Parry Protocol — Delta-Neutral LP Impermanent Loss Protection",
  });
});

/**
 * GET /health
 */
app.get("/health", (_req: Request, res: Response) => {
  res.json({ ok: true, service: "PARRY-x402-server" });
});

// ─────────────────────────────────────────────────────────────────────────────
// x402 Middleware
// ─────────────────────────────────────────────────────────────────────────────

/**
 * x402 HTTP payment middleware.
 * On first request (no auth header): respond 402 with payment requirements.
 * On subsequent request with X-Payment-Authorization: verify and proceed.
 */
function x402Middleware(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers["x-payment-authorization"] as string | undefined;

  if (!authHeader) {
    // Send 402 with payment requirements
    res.setHeader("X-Payment-Required", JSON.stringify({
      version: "1.0",
      scheme: "x402",
      network: "xlayer",
      chainId: parseInt(process.env.CHAIN_ID || "1952"),
      payTo: AGENT_WALLET,
      amount: ethers.formatEther(PRICE_PER_DAY_OKB),
      currency: "OKB",
      maxAmountRequired: ethers.formatEther(PRICE_PER_DAY_OKB * BigInt(30)),
      resource: req.path,
      description: "Parry Protocol IL Protection — 1 day coverage",
      mimeType: "application/json",
    }));
    res.status(402).json({
      error: "Payment required",
      message: "Use onchainos x402 authorize --resource " + req.path + " --max-amount 0.001 --currency OKB to authorize payment",
    });
    return;
  }

  // Verify x402 authorization
  // In production: verify TEE signature from okx-x402-payment skill
  // For hackathon: simplified verification
  try {
    const authData = JSON.parse(
      Buffer.from(authHeader.replace("Bearer ", ""), "base64").toString()
    );

    if (!authData.amount || !authData.payer) {
      res.status(401).json({ error: "Invalid x402 authorization" });
      return;
    }

    console.log(`[x402] Payment authorized: ${authData.amount} OKB from ${authData.payer}`);
    (req as Request & { paymentAmount?: string; payer?: string }).paymentAmount = authData.amount;
    (req as Request & { paymentAmount?: string; payer?: string }).payer = authData.payer;
    next();
  } catch {
    if (!ALLOW_DEMO_AUTH_BYPASS) {
      res.status(401).json({
        error: "Invalid x402 authorization",
        message: "Malformed or unverifiable X-Payment-Authorization header",
      });
      return;
    }
    // Optional demo bypass (disabled by default). Enable only when explicitly set.
    console.log("[x402] Demo bypass enabled: accepting mock payment authorization");
    (req as Request & { paymentAmount?: string }).paymentAmount = "0.001";
    next();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Start
// ─────────────────────────────────────────────────────────────────────────────

const candidatePorts = Array.from(new Set([PORT, 3002, 8080]));

for (const p of candidatePorts) {
  try {
    const server = http.createServer(app);
    server.listen(p, () => {
      console.log(`
╔═══════════════════════════════════════╗
║   PARRY x402 Payment Server          ║
║   Port: ${p}                          ║
║   Pay-per-block IL Protection         ║
║   Network: X Layer (Chain ${process.env.CHAIN_ID || "1952"})      ║
╚═══════════════════════════════════════╝
      `);
      console.log(`[x402] Payment endpoint: POST http://localhost:${p}/protect/activate`);
      console.log(`[x402] Payment info: GET http://localhost:${p}/payment-info`);
    });
    server.on("error", () => {
      // Ignore bind collisions and continue trying other ports.
    });
  } catch {
    // Continue trying candidate ports.
  }
}
