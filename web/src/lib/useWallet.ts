import { useCallback, useEffect, useMemo, useState } from "react"
import { createWalletClient, custom, http, type Address, type WalletClient } from "viem"
import { privateKeyToAccount } from "viem/accounts"
import { polkadotHubTestnet, publicClient, walletAddChainParams } from "./chain"
import { isMobileBrowser } from "./walletLinks"

/// Local development only: sign with a key from the config instead of a browser
/// extension, so the game is clickable against a local node without installing
/// a wallet. Gated on `import.meta.env.DEV`, so a production bundle never reads
/// it. Only ever point this at a throwaway local test key.
const devKey = import.meta.env.DEV ? (import.meta.env.VITE_DEV_PRIVATE_KEY as string | undefined) : undefined
const devAccount = devKey && /^0x[0-9a-fA-F]{64}$/.test(devKey) ? privateKeyToAccount(devKey as `0x${string}`) : undefined

/// The slice of EIP-1193 we rely on.
type Eip1193Provider = {
  request(args: { method: string; params?: unknown[] | object }): Promise<unknown>
  on?(event: string, handler: (...args: never[]) => void): void
  removeListener?(event: string, handler: (...args: never[]) => void): void
}

declare global {
  interface Window {
    ethereum?: Eip1193Provider
  }
}

export type WalletState = {
  hasProvider: boolean
  account: Address | undefined
  chainId: number | undefined
  onRightChain: boolean
  balance: bigint | undefined
  connecting: boolean
  error: string | undefined
  walletClient: WalletClient | undefined
  connect: () => Promise<void>
  switchChain: () => Promise<void>
  refreshBalance: () => Promise<void>
}

const HEX_CHAIN_ID = walletAddChainParams.chainId

export function useWallet(): WalletState {
  const wallet = useBrowserWallet()
  const dev = useDevWallet()
  return devAccount ? dev : wallet
}

/// The dev-key path: already "connected", already on the right chain, nothing to prompt.
function useDevWallet(): WalletState {
  const [balance, setBalance] = useState<bigint>()

  const refreshBalance = useCallback(async () => {
    if (!devAccount) return
    try {
      setBalance(await publicClient.getBalance({ address: devAccount.address }))
    } catch {
      setBalance(undefined)
    }
  }, [])

  useEffect(() => {
    void refreshBalance()
  }, [refreshBalance])

  const walletClient = useMemo(() => {
    if (!devAccount) return undefined
    return createWalletClient({ account: devAccount, chain: polkadotHubTestnet, transport: http() })
  }, [])

  const noop = useCallback(async () => {}, [])

  return {
    hasProvider: true,
    account: devAccount?.address,
    chainId: polkadotHubTestnet.id,
    onRightChain: true,
    balance,
    connecting: false,
    error: undefined,
    walletClient,
    connect: noop,
    switchChain: noop,
    refreshBalance,
  }
}

function useBrowserWallet(): WalletState {
  const provider = typeof window !== "undefined" ? window.ethereum : undefined
  const [account, setAccount] = useState<Address>()
  const [chainId, setChainId] = useState<number>()
  const [balance, setBalance] = useState<bigint>()
  const [connecting, setConnecting] = useState(false)
  const [error, setError] = useState<string>()

  // Pick up an already-authorised account without prompting, so a reload does
  // not make the player click Connect again.
  useEffect(() => {
    if (!provider) return
    let cancelled = false

    void (async () => {
      try {
        const [accounts, hexChain] = await Promise.all([
          provider.request({ method: "eth_accounts" }) as Promise<string[]>,
          provider.request({ method: "eth_chainId" }) as Promise<string>,
        ])
        if (cancelled) return
        setAccount(accounts[0] as Address | undefined)
        setChainId(Number.parseInt(hexChain, 16))
      } catch {
        // A provider that refuses these is simply treated as not connected.
      }
    })()

    return () => {
      cancelled = true
    }
  }, [provider])

  useEffect(() => {
    if (!provider?.on) return

    const onAccounts = (...args: never[]) => {
      const accounts = args[0] as unknown as string[]
      setAccount(accounts?.[0] as Address | undefined)
      setError(undefined)
    }
    const onChain = (...args: never[]) => {
      const hex = args[0] as unknown as string
      setChainId(Number.parseInt(hex, 16))
    }

    provider.on("accountsChanged", onAccounts)
    provider.on("chainChanged", onChain)
    return () => {
      provider.removeListener?.("accountsChanged", onAccounts)
      provider.removeListener?.("chainChanged", onChain)
    }
  }, [provider])

  const onRightChain = chainId === polkadotHubTestnet.id

  const refreshBalance = useCallback(async () => {
    if (!account) {
      setBalance(undefined)
      return
    }
    try {
      setBalance(await publicClient.getBalance({ address: account }))
    } catch {
      setBalance(undefined)
    }
  }, [account])

  useEffect(() => {
    void refreshBalance()
  }, [refreshBalance])

  const switchChain = useCallback(async () => {
    if (!provider) return
    setError(undefined)
    try {
      await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: HEX_CHAIN_ID }] })
    } catch (switchError) {
      // 4902 = the wallet has never heard of this chain, so offer to add it.
      const code = (switchError as { code?: number }).code
      if (code === 4902 || code === -32603) {
        try {
          await provider.request({ method: "wallet_addEthereumChain", params: [walletAddChainParams] })
          return
        } catch (addError) {
          setError(readableError(addError))
          return
        }
      }
      setError(readableError(switchError))
    }
  }, [provider])

  const connect = useCallback(async () => {
    if (!provider) {
      // On a phone the app being installed is not enough: MetaMask only injects a
      // provider inside its own in-app browser, so telling someone to install it
      // is misleading when they already have it.
      setError(
        isMobileBrowser()
          ? "모바일 브라우저에서는 지갑 앱을 찾을 수 없습니다. MetaMask 앱의 내장 브라우저로 이 페이지를 열어주세요."
          : "EVM 지갑을 찾을 수 없습니다. MetaMask 같은 지갑을 설치한 뒤 새로고침해 주세요.",
      )
      return
    }
    setConnecting(true)
    setError(undefined)
    try {
      const accounts = (await provider.request({ method: "eth_requestAccounts" })) as string[]
      setAccount(accounts[0] as Address | undefined)
      const hexChain = (await provider.request({ method: "eth_chainId" })) as string
      if (Number.parseInt(hexChain, 16) !== polkadotHubTestnet.id) await switchChain()
    } catch (connectError) {
      setError(readableError(connectError))
    } finally {
      setConnecting(false)
    }
  }, [provider, switchChain])

  const walletClient = useMemo(() => {
    if (!provider || !account) return undefined
    return createWalletClient({
      account,
      chain: polkadotHubTestnet,
      transport: custom(provider),
    })
  }, [provider, account])

  return {
    hasProvider: Boolean(provider),
    account,
    chainId,
    onRightChain,
    balance,
    connecting,
    error,
    walletClient,
    connect,
    switchChain,
    refreshBalance,
  }
}

/// Wallet errors are noisy; surface the one line a player can act on.
export function readableError(error: unknown): string {
  const err = error as { code?: number; shortMessage?: string; details?: string; message?: string }
  if (err?.code === 4001) return "지갑에서 요청을 거절했습니다."
  return err?.shortMessage ?? err?.details ?? err?.message ?? "알 수 없는 오류가 발생했습니다."
}
