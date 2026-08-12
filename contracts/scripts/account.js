// Prints the deployer address and balance for the key in contracts/.env.
//
// The faucet wants an address, not a key — this derives one from the other so the
// key never has to leave the file.
//
//   pnpm account                 checks Polkadot Hub TestNet
//   pnpm account --network localhost --config hardhat.evm.config.js
const hre = require("hardhat");

const FAUCET = "https://faucet.polkadot.io/";

async function main() {
  const { ethers, network } = hre;

  const signers = await ethers.getSigners();
  if (signers.length === 0) {
    console.log(`No account configured for network "${network.name}".`);
    console.log(`Put PRIVATE_KEY=0x... in contracts/.env first.`);
    return;
  }

  const [deployer] = signers;
  const balance = await ethers.provider.getBalance(deployer.address);
  const symbol = network.config.chainId === 420420417 ? "PAS" : "ETH";

  console.log(`network  ${network.name}`);
  console.log(`address  ${deployer.address}`);
  console.log(`balance  ${ethers.formatEther(balance)} ${symbol}`);

  if (balance === 0n) {
    console.log(`\nPaste that 0x address into ${FAUCET}`);
    console.log(`  Network: Polkadot testnet (Paseo)`);
    console.log(`  Chain:   Asset Hub (1000) — the default`);
    console.log(`\nThe faucet's field takes either an SS58 or an 0x address; use the 0x one`);
    console.log(`above, since that is the account the deployment signs with.`);
    console.log(`Then re-run this to confirm the drip landed, and deploy with:`);
    console.log(`  pnpm deploy:testnet`);
  } else {
    console.log(`\nFunded. Deploy with: pnpm deploy:testnet`);
  }
}

main().catch((error) => {
  console.error(`\n${error.message}`);
  process.exitCode = 1;
});
