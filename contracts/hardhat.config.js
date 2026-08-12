require("dotenv").config();
require("@nomicfoundation/hardhat-toolbox");
require("@parity/hardhat-polkadot");

const PRIVATE_KEY = process.env.PRIVATE_KEY;
const accounts = PRIVATE_KEY ? [PRIVATE_KEY] : [];

/** @type {import('hardhat/config').HardhatUserConfig} */
module.exports = {
  solidity: {
    version: "0.8.28",
    settings: {
      // The fight/loot structs push past the 16-slot stack limit in `delve`.
      viaIR: true,
      optimizer: { enabled: true, runs: 200 },
    },
  },
  // Compiles Solidity down to PolkaVM (RISC-V) bytecode instead of EVM bytecode.
  resolc: {
    compilerSource: "npm",
    settings: {
      optimizer: { enabled: true, runs: 200 },
    },
  },
  networks: {
    hardhat: {
      polkadot: true,
    },
    polkadotHubTestnet: {
      polkadot: true,
      url: "https://eth-rpc-testnet.polkadot.io/",
      chainId: 420420417,
      accounts,
    },
  },
  paths: {
    sources: "./contracts",
    tests: "./test",
    artifacts: "./artifacts-pvm",
  },
};
