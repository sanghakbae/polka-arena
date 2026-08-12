import { FAUCET_URL, polkadotHubTestnet } from "../lib/chain"
import type { WalletState } from "../lib/useWallet"
import { Notice, Spinner } from "./ui"

/// Everything a visitor sees before they have a hero on this chain: the pitch,
/// plus whichever single obstacle is currently in their way.
export function Landing({
  wallet,
  deployed,
  ladderCount,
}: {
  wallet: WalletState
  deployed: boolean
  ladderCount: number
}) {
  const { hasProvider, account, onRightChain, connecting, connect, switchChain, error } = wallet

  return (
    <div className="hero-splash">
      <h1>온체인 던전에 내려가세요</h1>
      <p>
        전투는 브라우저가 아니라 체인이 판정합니다. 결과가 나온 뒤 프론트엔드는 같은 시드로 전투를 그대로 재생할
        뿐입니다. {polkadotHubTestnet.name}에서 무료로 플레이하세요.
      </p>

      <div className="splash-actions">
        {!deployed ? (
          <span className="btn ghost" aria-disabled="true">
            컨트랙트 배포 대기 중
          </span>
        ) : !hasProvider ? (
          <a className="btn primary" href="https://metamask.io/download/" target="_blank" rel="noreferrer noopener">
            지갑 설치하기 ↗
          </a>
        ) : !account ? (
          <button className="btn primary" onClick={() => void connect()} disabled={connecting}>
            {connecting ? <Spinner /> : "지갑 연결하고 시작"}
          </button>
        ) : !onRightChain ? (
          <button className="btn primary" onClick={() => void switchChain()}>
            {polkadotHubTestnet.name}으로 전환
          </button>
        ) : null}

        <a className="btn ghost" href={FAUCET_URL} target="_blank" rel="noreferrer noopener">
          테스트 토큰 받기 ↗
        </a>
      </div>

      {error && (
        <div style={{ maxWidth: 440, margin: "18px auto 0", textAlign: "left" }}>
          <Notice>{error}</Notice>
        </div>
      )}

      {!deployed && (
        <div style={{ maxWidth: 520, margin: "18px auto 0", textAlign: "left" }}>
          <Notice>
            컨트랙트 주소가 설정되지 않았습니다. <code>contracts</code>에서{" "}
            <code>pnpm deploy:testnet</code>을 실행하면 <code>web/.env.local</code>에 주소가 기록되고 앱이 살아납니다.
          </Notice>
        </div>
      )}

      <div className="facts">
        <div className="fact">
          <b>🎲 검증 가능한 전투</b>
          <span>
            전투 결과는 시드 하나로 결정됩니다. 컨트랙트의 순수 함수를 다시 호출하면 누구든 같은 결과를 재현할 수
            있습니다.
          </span>
        </div>
        <div className="fact">
          <b>🗡️ 잃을 것이 있는 탐험</b>
          <span>
            체력은 층을 넘어가며 누적됩니다. 더 내려갈지 골드를 써서 쉴지 — 죽으면 골드 절반과 진행도를 잃습니다.
          </span>
        </div>
        <div className="fact">
          <b>🏅 공개 랭킹</b>
          <span>
            다른 플레이어에게 도전해 점수를 겨룹니다. 현재 {ladderCount}명이 등록되어 있습니다.
          </span>
        </div>
      </div>
    </div>
  )
}
