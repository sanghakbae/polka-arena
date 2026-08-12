import { createPublicClient, defineChain, http } from "viem"

/// Local UI development can point at a plain Hardhat EVM node instead of the
/// testnet — the contract is ordinary Solidity, so the frontend behaves the same
/// and nobody needs a funded key to click through the game. Set VITE_RPC_URL and
/// VITE_CHAIN_ID in web/.env.local to switch.
const overrideRpc = import.meta.env.VITE_RPC_URL as string | undefined
const overrideChainId = Number(import.meta.env.VITE_CHAIN_ID ?? Number.NaN)
const isLocal = Boolean(overrideRpc) && Number.isFinite(overrideChainId)

/// Polkadot Hub TestNet, reached through its Ethereum JSON-RPC adapter.
/// Values from https://docs.polkadot.com/smart-contracts/connect/
export const polkadotHubTestnet = defineChain({
  id: isLocal ? overrideChainId : 420_420_417,
  name: isLocal ? "Local Dev Chain" : "Polkadot Hub TestNet",
  nativeCurrency: {
    name: "Paseo",
    symbol: "PAS",
    // The chain itself uses 10 decimals; the eth-rpc adapter rescales balances
    // to 18 so Ethereum tooling behaves normally. We talk to the adapter.
    decimals: 18,
  },
  rpcUrls: {
    default: { http: [overrideRpc ?? "https://eth-rpc-testnet.polkadot.io/"] },
  },
  blockExplorers: {
    default: {
      name: "Blockscout",
      url: "https://blockscout-testnet.polkadot.io",
    },
  },
  testnet: true,
})

export const FAUCET_URL = "https://faucet.polkadot.io/"

/// Reads go through this regardless of whether a wallet is connected, so the
/// ladder and a hero's public record are visible to visitors who never connect.
export const publicClient = createPublicClient({
  chain: polkadotHubTestnet,
  transport: http(),
})

/// A local dev chain has no block explorer, so callers get `undefined` and should
/// render plain text instead of a dead link.
export const hasExplorer = !isLocal

export function explorerAddress(address: string): string | undefined {
  if (isLocal) return undefined
  return `${polkadotHubTestnet.blockExplorers.default.url}/address/${address}`
}

export function explorerTx(hash: string): string | undefined {
  if (isLocal) return undefined
  return `${polkadotHubTestnet.blockExplorers.default.url}/tx/${hash}`
}

/// The shape MetaMask & friends want when asked to add a network.
export const walletAddChainParams = {
  chainId: `0x${polkadotHubTestnet.id.toString(16)}`,
  chainName: polkadotHubTestnet.name,
  nativeCurrency: polkadotHubTestnet.nativeCurrency,
  rpcUrls: [...polkadotHubTestnet.rpcUrls.default.http],
  blockExplorerUrls: [polkadotHubTestnet.blockExplorers.default.url],
} as const
