// Logic-only test config.
//
// The PolkaVM build (hardhat.config.js) swaps solc for resolc, which means local
// `hardhat test` would need a substrate node plus the eth-rpc adapter running.
// The game rules are plain Solidity with no PolkaVM-specific opcodes, so we test
// them on the in-process EVM — fast, no binaries — and keep PolkaVM for deploys.
//
//   pnpm test      -> this config, EVM, in-process
//   pnpm compile   -> hardhat.config.js, resolc, PolkaVM blob
require("@nomicfoundation/hardhat-toolbox");

/** @type {import('hardhat/config').HardhatUserConfig} */
module.exports = {
  solidity: {
    version: "0.8.28",
    settings: {
      viaIR: true,
      optimizer: { enabled: true, runs: 200 },
    },
  },
  paths: {
    sources: "./contracts",
    tests: "./test",
    artifacts: "./artifacts",
    cache: "./cache",
  },
};
