import { useState, type ReactNode } from "react"

export function Spinner() {
  return <span className="spinner" role="presentation" />
}

export function Panel({
  title,
  note,
  children,
  tight,
  action,
}: {
  title: string
  note?: ReactNode
  children: ReactNode
  tight?: boolean
  action?: ReactNode
}) {
  return (
    <section className="panel">
      <div className="panel-head">
        <h2 className="panel-title">{title}</h2>
        {note !== undefined && <span className="panel-note">{note}</span>}
        {action}
      </div>
      <div className={tight ? "panel-body tight" : "panel-body"}>{children}</div>
    </section>
  )
}

export function Bar({
  kind = "hp",
  value,
  max,
  label,
  readout,
  hideLabel,
}: {
  kind?: "hp" | "xp"
  value: number
  max: number
  label: string
  readout?: string
  /// Keeps `label` for screen readers but drops the visible row — used where the
  /// surrounding UI already names the bar.
  hideLabel?: boolean
}) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0
  return (
    <div>
      {!hideLabel && (
        <div className="bar-label">
          <span>{label}</span>
          <b>{readout ?? `${value} / ${max}`}</b>
        </div>
      )}
      <div
        className={kind === "xp" ? "bar xp" : "bar"}
        role="progressbar"
        aria-label={label}
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={max}
      >
        <i style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

export function Stat({ k, v, bonus }: { k: string; v: number | string; bonus?: number }) {
  return (
    <div className="stat">
      <div className="stat-k">{k}</div>
      <div className="stat-v">
        {v}
        {bonus !== undefined && bonus > 0 && <span className="bonus">+{bonus}</span>}
      </div>
    </div>
  )
}

export function Notice({
  tone = "warn",
  icon,
  children,
}: {
  tone?: "warn" | "info"
  icon?: string
  children: ReactNode
}) {
  return (
    <div className={tone === "info" ? "notice info" : "notice"}>
      <span className="ico" aria-hidden="true">
        {icon ?? (tone === "info" ? "ℹ️" : "⚠️")}
      </span>
      <div>{children}</div>
    </div>
  )
}

export function shortAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`
}

/// Copies an address to the clipboard and confirms it briefly. Exists because the
/// faucet lives in another app: on a phone, copying the address by hand out of the
/// wallet is the most annoying step in getting started.
export function CopyAddress({ address }: { address: string }) {
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(address)
    } catch {
      return // Clipboard blocked (insecure context, or denied); leave the label alone.
    }
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1600)
  }

  return (
    <button
      className="copy-addr"
      onClick={() => void copy()}
      aria-label={copied ? "주소를 복사했습니다" : "주소 복사"}
      title={address}
    >
      {copied ? "복사됨" : "복사"}
    </button>
  )
}

/// PAS balances come back in 18-decimal wei; four places is plenty for a faucet balance.
export function formatBalance(wei: bigint | undefined): string {
  if (wei === undefined) return "—"
  const whole = wei / 10n ** 18n
  const frac = (wei % 10n ** 18n) / 10n ** 14n // 4 decimal places
  return `${whole}.${frac.toString().padStart(4, "0")}`
}
