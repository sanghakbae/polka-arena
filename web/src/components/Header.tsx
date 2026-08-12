import { polkadotHubTestnet } from "../lib/chain"
import type { WalletState } from "../lib/useWallet"
import { Spinner, formatBalance, shortAddress } from "./ui"

export function Header({ wallet }: { wallet: WalletState }) {
  const { account, onRightChain, balance, connecting, connect, switchChain } = wallet

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

        {!account && (
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
            <span className="bal">{formatBalance(balance)} PAS</span>
          </div>
        )}
      </div>
    </header>
  )
}
