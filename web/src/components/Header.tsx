import { polkadotHubTestnet } from "../lib/chain"
import type { WalletState } from "../lib/useWallet"
import { noProviderAction } from "../lib/walletLinks"
import { CopyAddress, Spinner, formatBalance, shortAddress } from "./ui"

export function Header({ wallet }: { wallet: WalletState }) {
  const { hasProvider, account, onRightChain, balance, connecting, connect, switchChain } = wallet
  const noProvider = noProviderAction()

  return (
    <header className="header">
      <div className="shell header-inner">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            ⚔️
          </span>
          <span className="brand-text">
            Polka Arena <span className="brand-sub">· {polkadotHubTestnet.name}</span>
          </span>
        </div>

        {/* With no injected provider, "connect" has nothing to talk to. On a phone
            that means reopening the page inside the wallet app, not a dead button. */}
        {!account && !hasProvider && (
          <a className="btn primary sm" href={noProvider.href} target="_blank" rel="noreferrer noopener">
            {noProvider.label}
          </a>
        )}

        {!account && hasProvider && (
          <button className="btn primary sm" onClick={() => void connect()} disabled={connecting}>
            {connecting ? <Spinner /> : "지갑 연결"}
          </button>
        )}

        {account && !onRightChain && (
          <button className="btn sm" onClick={() => void switchChain()}>
            <span className="dot warn" /> 네트워크 전환
          </button>
        )}

        {account && onRightChain && (
          <div className="wallet-chip">
            <span className="dot" />
            <span className="addr">{shortAddress(account)}</span>
            <CopyAddress address={account} />
            <span className="bal">{formatBalance(balance)} PAS</span>
          </div>
        )}
      </div>
    </header>
  )
}
