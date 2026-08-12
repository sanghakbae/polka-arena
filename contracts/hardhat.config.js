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
  // Compiles Solidity to PolkaVM (RISC-V) rather than EVM bytecode.
  //
  // `version` must be pinned. The plugin hardcodes 0.6.0 as its default and its
  // "npm" source resolves the @parity/resolc 0.3.0 it bundles, ignoring whatever
  // version this project installs. A blob built by 0.6.0 uploaded fine and then
  // trapped on every single call, including constant getters, while a 2kB
  // contract from the same toolchain worked — so the version is not cosmetic.
  resolc: {
    version: "1.2.0",
    compilerSource: "binary",
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
