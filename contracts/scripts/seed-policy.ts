/**
 * Seed a demo protection policy on ParryVault.
 * Run once: npx tsx scripts/seed-policy.ts
 * Outputs the policyId — add it to agent/.env as POLICY_ID
 */
import "dotenv/config";
import { ethers } from "ethers";
import * as fs from "fs";

const VAULT_ABI = [
  "function activateProtection(address pool, uint256 tokenId, int24 tickLower, int24 tickUpper, uint128 liquidity, uint256 entryPrice, uint256 threshold, uint256 durationBlocks) external payable",
  "function vaultCapital() external view returns (uint256)",
  "event ProtectionActivated(bytes32 indexed policyId, address indexed lp, address pool, uint256 tokenId, uint256 coverageAmount, uint256 expiresAt, uint256 certTokenId)",
];

async function main() {
  const rpcUrl   = process.env.RPC_URL   || "https://testrpc.xlayer.tech";
  const key      = process.env.PRIVATE_KEY!;
  const vault    = process.env.VAULT_ADDRESS || "0x57C7f2F3051928E2cc7C871Bac590bF1d4BF4c8e";

  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const signer   = new ethers.Wallet(key, provider);
  const contract = new ethers.Contract(vault, VAULT_ABI, signer);

  const capital  = await contract.vaultCapital() as bigint;
  console.log("Vault capital:", ethers.formatEther(capital), "OKB");

  // maxPremium = capital / 20; use half that to be safe
  const maxPremium = capital / 20n;
  const premium  = maxPremium > ethers.parseEther("0.001")
    ? ethers.parseEther("0.001")    // cap at 0.001 OKB
    : maxPremium;

  if (premium === 0n) {
    console.error("Vault capital too low — cannot activate policy");
    process.exit(1);
  }

  console.log("Sending premium:", ethers.formatEther(premium), "OKB");

  const wethXLayer = "0x5A77f1443D16ee5761d310e38b62f77f726bC71c";

  const tx = await contract.activateProtection(
    wethXLayer,                       // pool (WETH address as proxy)
    1n,                               // tokenId
    -887220,                          // tickLower (full range)
    887220,                           // tickUpper
    BigInt("1000000000000000000"),     // liquidity = 1e18
    ethers.parseEther("2000"),        // entryPrice = $2000
    200,                              // threshold = 2% IL
    28800n,                           // durationBlocks (~1 day)
    { value: premium }
  );
  console.log("TX hash:", tx.hash);
  const receipt = await tx.wait();

  // Extract policyId from ProtectionActivated event
  let policyId: string | null = null;
  for (const log of (receipt?.logs ?? [])) {
    try {
      const parsed = contract.interface.parseLog(log);
      if (parsed?.name === "ProtectionActivated") {
        policyId = parsed.args.policyId as string;
        break;
      }
    } catch { /* skip */ }
  }

  if (!policyId) {
    console.error("Could not extract policyId from logs");
    console.log("Raw logs:", receipt?.logs);
    process.exit(1);
  }

  console.log("\n✓ Policy activated!");
  console.log("  policyId:", policyId);
  console.log("  Block:   ", receipt?.blockNumber);

  // Save to parent directory as .policy.json
  const out = { policyId, activatedAt: new Date().toISOString(), txHash: tx.hash };
  fs.writeFileSync("deployments-policy.json", JSON.stringify(out, null, 2));
  console.log("\nSaved to deployments-policy.json");
  console.log("Add to agent/.env:  POLICY_ID=" + policyId);
}

main().catch((e) => { console.error(e); process.exit(1); });
