import { useState } from "react"
import { Notice, Panel, Spinner } from "./ui"

const MAX_NAME = 24

export function CreateHero({
  onCreate,
  busy,
  hasFunds,
}: {
  onCreate: (name: string) => void
  busy: boolean
  hasFunds: boolean
}) {
  const [name, setName] = useState("")
  const trimmed = name.trim()
  const tooLong = [...trimmed].length > MAX_NAME
  // The contract measures bytes, so a Korean name hits the 24-byte cap sooner.
  const byteLength = new TextEncoder().encode(trimmed).length
  const tooManyBytes = byteLength > MAX_NAME
  const valid = trimmed.length > 0 && !tooLong && !tooManyBytes

  return (
    <Panel title="영웅 만들기">
      <p style={{ marginTop: 0, color: "var(--text-dim)", fontSize: 13.5 }}>
        능력치는 체인에서 무작위로 굴려집니다. 같은 이름이라도 두 영웅은 같지 않습니다.
      </p>

      <form
        onSubmit={(event) => {
          event.preventDefault()
          if (valid && !busy) onCreate(trimmed)
        }}
      >
        <label className="field">
          <span className="field-label">이름</span>
          <input
            className="input"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="예: 아라벨라"
            maxLength={40}
            autoComplete="off"
            enterKeyHint="go"
            aria-invalid={trimmed.length > 0 && !valid}
          />
        </label>
        <div className={tooManyBytes ? "field-hint err" : "field-hint"}>
          {tooManyBytes
            ? `너무 깁니다 (${byteLength}/${MAX_NAME}바이트). 한글은 한 자에 3바이트를 씁니다.`
            : `${byteLength}/${MAX_NAME}바이트`}
        </div>

        <button className="btn primary block" type="submit" disabled={!valid || busy} style={{ marginTop: 14 }}>
          {busy ? <Spinner /> : "🎲 영웅 굴리기"}
        </button>
      </form>

      {!hasFunds && (
        <div style={{ marginTop: 14 }}>
          <Notice>
            잔액이 0입니다. 트랜잭션 수수료를 낼 수 없으니 먼저 faucet에서 PAS를 받아주세요.
          </Notice>
        </div>
      )}
    </Panel>
  )
}
