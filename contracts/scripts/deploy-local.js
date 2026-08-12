// Deploys to a local Hardhat EVM node for UI development.
//
//   npx hardhat --config hardhat.evm.config.js run scripts/deploy-local.js --network localhost
//
// Kept separate from scripts/deploy.mjs: hardhat-ethers works perfectly against a
// local node, and only falls over on the eth-rpc adapter, so the testnet path
// needs viem while this one does not.
const fs = require("fs");
const path = require("path");
const hre = require("hardhat");

const WEB_ENV = path.join(__dirname, "..", "..", "web", ".env.local");

async function main() {
  const { ethers, network } = hre;
  const [deployer] = await ethers.getSigners();

  const Arena = await ethers.getContractFactory("PolkaArena");
  const arena = await Arena.deploy();
  await arena.waitForDeployment();
  const address = await arena.getAddress();

  console.log(`network  ${network.name}`);
  console.log(`deployer ${deployer.address}`);
  console.log(`deployed ${address}`);

  upsertEnv(WEB_ENV, "VITE_ARENA_ADDRESS", address);
  console.log(`\nwrote web/.env.local — make sure it also has:`);
  console.log(`  VITE_RPC_URL=http://127.0.0.1:8545`);
  console.log(`  VITE_CHAIN_ID=31337`);
  console.log(`\nSeed some rivals with:`);
  console.log(`  ARENA_ADDRESS=${address} npx hardhat --config hardhat.evm.config.js run scripts/seed-local.js --network localhost`);
}

/// Rewrites one key in place, so the RPC url and dev key beside it survive.
function upsertEnv(envPath, key, value) {
  const line = `${key}=${value}`;
  let contents;
  try {
    contents = fs.readFileSync(envPath, "utf8");
  } catch {
    fs.writeFileSync(envPath, `${line}\n`);
    return;
  }
  const existing = new RegExp(`^${key}=.*$`, "m");
  fs.writeFileSync(
    envPath,
    existing.test(contents) ? contents.replace(existing, line) : `${contents.replace(/\n*$/, "\n")}${line}\n`,
  );
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
