import { useEffect } from "react"
import { explorerTx } from "../lib/chain"
import type { TxStatus } from "../lib/useArena"
import { Spinner } from "./ui"

/// A single toast for the one transaction that can be in flight at a time.
export function TxToast({ tx, onDismiss }: { tx: TxStatus; onDismiss: () => void }) {
  // Successes clear themselves; failures wait to be read and dismissed.
  useEffect(() => {
    if (tx.phase !== "done") return
    const id = window.setTimeout(onDismiss, 4200)
    return () => window.clearTimeout(id)
  }, [tx, onDismiss])

  if (tx.phase === "idle") return null

  const tone = tx.phase === "done" ? "toast ok" : tx.phase === "failed" ? "toast bad" : "toast"

  return (
    <div className="toast-wrap">
      <div className={tone} role="status" aria-live="polite">
        {(tx.phase === "signing" || tx.phase === "pending") && <Spinner />}
        {tx.phase === "done" && <span aria-hidden="true">✅</span>}
        {tx.phase === "failed" && <span aria-hidden="true">⚠️</span>}

        <div className="body">
          <div className="t">
            {tx.label}
            {tx.phase === "signing" && " · 지갑에서 서명 대기"}
            {tx.phase === "pending" && " · 체인에 기록 중"}
            {tx.phase === "done" && " · 완료"}
            {tx.phase === "failed" && " · 실패"}
          </div>
          {tx.phase === "failed" && <div className="m">{tx.message}</div>}
          {(tx.phase === "pending" || tx.phase === "done") && explorerTx(tx.hash) && (
            <div className="m">
              <a href={explorerTx(tx.hash)} target="_blank" rel="noreferrer noopener">
                탐색기에서 보기 ↗
              </a>
            </div>
          )}
        </div>

        <button className="x" onClick={onDismiss} aria-label="알림 닫기">
          ×
        </button>
      </div>
    </div>
  )
}
