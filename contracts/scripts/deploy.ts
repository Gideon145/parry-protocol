import { ethers } from "ethers";
import * as fs from "fs";
import { createRequire } from "module";
const require = createRequire(import.meta.url);

const ParryVaultArtifact   = require("../artifacts/contracts/ParryVault.sol/ParryVault.json");
const ProtectionCertArtifact = require("../artifacts/contracts/ProtectionCert.sol/ProtectionCert.json");

const RPC_URL    = "https://testrpc.xlayer.tech";
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

  // 4. Seed initial vault capital
  const seedAmount = ethers.parseEther("0.05");
  await (await vaultContract.depositCapital({ value: seedAmount })).wait();
  console.log("  Vault seeded with", ethers.formatEther(seedAmount), "OKB");

  const deployments = {
    network: "xlayer_testnet",
    chainId: Number(network.chainId),
    deployer: deployer.address,
    ParryVault: vaultAddress,
    ProtectionCert: certAddress,
    deployedAt: new Date().toISOString(),
  };

  fs.writeFileSync("deployments.json", JSON.stringify(deployments, null, 2));

  console.log("\n✓ Parry Protocol deployed successfully");
  console.log("  Deployments saved to deployments.json");
  console.table(deployments);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
