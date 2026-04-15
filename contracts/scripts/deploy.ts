import { ethers } from "ethers";
import * as fs from "fs";
import { createRequire } from "module";
const require = createRequire(import.meta.url);

const ParryVaultArtifact   = require("../artifacts/contracts/ParryVault.sol/ParryVault.json");
const ProtectionCertArtifact = require("../artifacts/contracts/ProtectionCert.sol/ProtectionCert.json");

// Switch mainnet vs testnet via NETWORK env var:
//   NETWORK=mainnet  → https://rpc.xlayer.tech  (Chain 196)
//   NETWORK=testnet  → https://testrpc.xlayer.tech (Chain 1952)
const MAINNET = (process.env.NETWORK ?? "testnet") === "mainnet";
const RPC_URL = MAINNET ? "https://rpc.xlayer.tech" : "https://testrpc.xlayer.tech";
const PRIVATE_KEY = process.env.PRIVATE_KEY!;

async function main() {
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const deployer = new ethers.Wallet(PRIVATE_KEY, provider);
  const network  = await provider.getNetwork();

  console.log("Deploying Parry Protocol contracts...");
  console.log("Deployer:", deployer.address);
  console.log("Network: chainId", network.chainId.toString());

  // 1. Deploy ProtectionCert NFT
  console.log("\n[1/3] Deploying ProtectionCert...");
  const certFactory = new ethers.ContractFactory(
    ProtectionCertArtifact.abi,
    ProtectionCertArtifact.bytecode,
    deployer
  );
  const cert = await certFactory.deploy();
  await cert.waitForDeployment();
  const certAddress = await cert.getAddress();
  console.log("  ProtectionCert deployed to:", certAddress);

  // 2. Deploy ParryVault with deployer as initial agent
  console.log("\n[2/3] Deploying ParryVault...");
  const vaultFactory = new ethers.ContractFactory(
    ParryVaultArtifact.abi,
    ParryVaultArtifact.bytecode,
    deployer
  );
  const vault = await vaultFactory.deploy(deployer.address);
  await vault.waitForDeployment();
  const vaultAddress = await vault.getAddress();
  console.log("  ParryVault deployed to:", vaultAddress);

  // 3. Wire them together
  console.log("\n[3/3] Wiring contracts...");
  const certContract  = new ethers.Contract(certAddress,  ProtectionCertArtifact.abi,  deployer);
  const vaultContract = new ethers.Contract(vaultAddress, ParryVaultArtifact.abi, deployer);
  await (await certContract.setVault(vaultAddress)).wait();
  await (await vaultContract.setCertContract(certAddress)).wait();
  console.log("  ProtectionCert.vault =", vaultAddress);
  console.log("  ParryVault.certContract =", certAddress);

  // 4. Seed initial vault capital (minimal — just enough to initialise)
  const seedAmount = ethers.parseEther("0.001");
  await (await vaultContract.depositCapital({ value: seedAmount })).wait();
  console.log("  Vault seeded with", ethers.formatEther(seedAmount), "OKB");

  const deployments = {
    network: MAINNET ? "xlayer_mainnet" : "xlayer_testnet",
    chainId: Number(network.chainId),
    deployer: deployer.address,
    ParryVault: vaultAddress,
    ProtectionCert: certAddress,
    deployedAt: new Date().toISOString(),
  };

  const outFile = MAINNET ? "deployments-mainnet.json" : "deployments.json";
  fs.writeFileSync(outFile, JSON.stringify(deployments, null, 2));
  console.log(`  Deployments saved to ${outFile}`);
  if (MAINNET) {
    console.log("\n⚡ MAINNET DEPLOY COMPLETE — update agent env vars:");
    console.log(`  VAULT_ADDRESS=${vaultAddress}`);
    console.log(`  RPC_URL=https://rpc.xlayer.tech`);
    console.log(`  CHAIN_ID=196`);
  }

  console.log("\n✓ Parry Protocol deployed successfully");
  console.log("  Deployments saved to deployments.json");
  console.table(deployments);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
