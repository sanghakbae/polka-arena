// Deploys PolkaArena to Polkadot Hub TestNet and hands the frontend its ABI.
//
//   pnpm compile && pnpm deploy:testnet
//
// Uses viem rather than hardhat-ethers on purpose. Sending the deployment through
// hardhat's ethers provider fails against the eth-rpc adapter with a bare "fields
// had validation errors", for every transaction type (legacy, EIP-1559, explicit
// gas). The same transaction signed and sent by viem goes through, so this script
// talks to the RPC directly and hardhat is only used to compile.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { createPublicClient, createWalletClient, defineChain, formatEther, http } from "viem"
import { privateKeyToAccount } from "viem/accounts"

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, "..")

const ARTIFACT = join(root, "artifacts-pvm", "contracts", "PolkaArena.sol", "PolkaArena.json")
const GENERATED = join(root, "..", "web", "src", "generated")

const polkadotHubTestnet = defineChain({
  id: 420_420_417,
  name: "Polkadot Hub TestNet",
  nativeCurrency: { name: "Paseo", symbol: "PAS", decimals: 18 },
  rpcUrls: { default: { http: [process.env.RPC_URL ?? "https://eth-rpc-testnet.polkadot.io/"] } },
  blockExplorers: { default: { name: "Blockscout", url: "https://blockscout-testnet.polkadot.io" } },
  testnet: true,
})

async function main() {
  const key = readPrivateKey()
  const account = privateKeyToAccount(key)

  const artifact = JSON.parse(readFileSync(ARTIFACT, "utf8"))
  const blobBytes = (artifact.bytecode.length - 2) / 2

  const publicClient = createPublicClient({ chain: polkadotHubTestnet, transport: http() })
  const wallet = createWalletClient({ account, chain: polkadotHubTestnet, transport: http() })

  const balance = await publicClient.getBalance({ address: account.address })
  console.log(`network   ${polkadotHubTestnet.name} (${polkadotHubTestnet.id})`)
  console.log(`deployer  ${account.address}`)
  console.log(`balance   ${formatEther(balance)} PAS`)
  console.log(`blob      ${blobBytes.toLocaleString()} bytes`)

  if (balance === 0n) {
    throw new Error(`${account.address} has no PAS. Fund it at https://faucet.polkadot.io/ (Chain: Asset Hub).`)
  }

  console.log(`\ndeploying...`)
  const hash = await wallet.deployContract({ abi: artifact.abi, bytecode: artifact.bytecode, args: [] })
  const receipt = await publicClient.waitForTransactionReceipt({ hash })

  if (receipt.status !== "success" || !receipt.contractAddress) {
    throw new Error(`deployment reverted (tx ${hash})`)
  }

  const address = receipt.contractAddress
  console.log(`deployed  ${address}  (gas ${receipt.gasUsed})`)

  // A blob built by the wrong resolc uploads happily and then traps on every
  // call, so prove the deployed instance actually runs before calling it done.
  await assertItRuns(publicClient, artifact.abi, address)

  writeAbi(artifact.abi)

  console.log(`\nexplorer  ${polkadotHubTestnet.blockExplorers.default.url}/address/${address}`)

  // Deliberately not written to web/.env.local. That file usually points the app
  // at a local node, and pasting a testnet address beside a localhost RPC leaves
  // local dev silently broken. The deployed site reads the repository variable.
  console.log(`\nPoint the deployed site at it:`)
  console.log(`  gh variable set VITE_ARENA_ADDRESS --body ${address} --repo <owner>/<repo>`)
  console.log(`\nOr, to play against the testnet locally, put this in web/.env.local and`)
  console.log(`remove VITE_RPC_URL / VITE_CHAIN_ID / VITE_DEV_PRIVATE_KEY:`)
  console.log(`  VITE_ARENA_ADDRESS=${address}`)
}

/// Reads a few constants and one pure function. If the blob is broken these fail
/// with ContractTrapped even though the upload succeeded.
async function assertItRuns(client, abi, address) {
  const checks = [
    ["MAX_ROUNDS", []],
    ["REST_GOLD_PER_HP", []],
    ["xpForNextLevel", [1]],
    ["rosterSize", []],
  ]
  for (const [functionName, args] of checks) {
    try {
      await client.readContract({ address, abi, functionName, args })
    } catch (error) {
      throw new Error(
        `deployed, but ${functionName}() traps — the blob is broken.\n` +
          `Check resolc's pinned version in hardhat.config.js (0.6.0 produces blobs that ` +
          `upload and then trap on every call).\n  ${error.shortMessage ?? error.message}`,
      )
    }
  }
  console.log(`verified  constants and a pure call both respond`)
}

function readPrivateKey() {
  const fromEnv = process.env.PRIVATE_KEY
  if (fromEnv) return normalise(fromEnv)

  let contents
  try {
    contents = readFileSync(join(root, ".env"), "utf8")
  } catch {
    throw new Error(`No key found. Put PRIVATE_KEY=0x... in contracts/.env`)
  }
  const match = contents.match(/^PRIVATE_KEY=(.+)$/m)
  if (!match) throw new Error(`contracts/.env has no PRIVATE_KEY line`)
  return normalise(match[1])
}

function normalise(key) {
  const trimmed = key.trim()
  const prefixed = trimmed.startsWith("0x") ? trimmed : `0x${trimmed}`
  if (!/^0x[0-9a-fA-F]{64}$/.test(prefixed)) throw new Error(`PRIVATE_KEY is not a 32-byte hex key`)
  return prefixed
}

/// Committed so a fresh clone builds without deploying first.
function writeAbi(abi) {
  mkdirSync(GENERATED, { recursive: true })
  writeFileSync(
    join(GENERATED, "abi.ts"),
    `// Generated by contracts/scripts/deploy.mjs — do not edit by hand.\n` +
      `export const polkaArenaAbi = ${JSON.stringify(abi, null, 2)} as const;\n`,
  )
  console.log(`wrote     web/src/generated/abi.ts`)
}

main().catch((error) => {
  console.error(`\n${error.message}`)
  process.exitCode = 1
})
