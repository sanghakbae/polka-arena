import { useEffect, useMemo, useRef, useState } from "react"
import type { Round } from "../lib/arena"
import { Bar } from "./ui"

const ROUND_MS = 780

export type BattleView = {
  heroName: string
  foeName: string
  heroStartHp: number
  foeStartHp: number
  rounds: Round[]
  won: boolean
  /// Shown in the verdict line once the replay finishes.
  reward?: { xp: number; gold: number }
  ratingDelta?: number
  /// Changing this restarts the replay — use the fight's seed.
  key: string
}

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
}

/// Steps through a fight one round at a time. The rounds come from the contract's
/// pure `simulate`, so what plays here is exactly what the chain recorded.
export function BattleStage({ view }: { view: BattleView | undefined }) {
  // -1 means "not started"; rounds.length means "finished".
  const [step, setStep] = useState(-1)
  const timer = useRef<number | undefined>(undefined)

  const total = view?.rounds.length ?? 0

  useEffect(() => {
    window.clearTimeout(timer.current)
    if (!view || total === 0) {
      setStep(-1)
      return
    }

    // Players who asked for less motion get the result immediately.
    if (prefersReducedMotion()) {
      setStep(total)
      return
    }

    setStep(-1)
    let current = -1
    const tick = () => {
      current += 1
      setStep(current)
      if (current < total) timer.current = window.setTimeout(tick, ROUND_MS)
    }
    timer.current = window.setTimeout(tick, 220)

    return () => window.clearTimeout(timer.current)
  }, [view?.key, total, view])

  const frame = useMemo(() => {
    if (!view) return undefined
    if (step < 0) {
      return { heroHp: view.heroStartHp, foeHp: view.foeStartHp, round: undefined, index: -1 }
    }
    const index = Math.min(step, total - 1)
    const round = view.rounds[index]
    return { heroHp: round?.heroHp ?? 0, foeHp: round?.foeHp ?? 0, round, index }
  }, [step, total, view])

  if (!view || !frame) {
    return (
      <div className="stage">
        <div className="stage-empty">
          아직 전투 기록이 없습니다.
          <br />
          던전에 내려가면 여기에서 전투가 재생됩니다.
        </div>
      </div>
    )
  }

  const finished = step >= total
  const showFloaters = step >= 0 && step < total && frame.round !== undefined

  return (
    <div className="stage">
      <div className="fighters">
        <div className={showFloaters && (frame.round?.foeDamage ?? 0) > 0 ? "fighter hitshake" : "fighter"}>
          <div className="fighter-name">{view.heroName}</div>
          <div className="fighter-hp">
            HP {frame.heroHp} / {view.heroStartHp}
          </div>
          <Bar value={frame.heroHp} max={view.heroStartHp} label={`${view.heroName} 체력`} hideLabel />
        </div>

        <div className="versus" aria-hidden="true">
          VS
        </div>

        <div className={showFloaters && (frame.round?.heroDamage ?? 0) > 0 ? "fighter foe hitshake" : "fighter foe"}>
          <div className="fighter-name">{view.foeName}</div>
          <div className="fighter-hp">
            HP {frame.foeHp} / {view.foeStartHp}
          </div>
          <Bar value={frame.foeHp} max={view.foeStartHp} label={`${view.foeName} 체력`} hideLabel />
        </div>
      </div>

      {showFloaters && frame.round && (
        <div className="floaters" key={`f-${frame.index}`}>
          {frame.round.heroDamage > 0 && (
            <span className={frame.round.heroCrit ? "floater right crit" : "floater right"}>
              −{frame.round.heroDamage}
            </span>
          )}
          {frame.round.foeDamage > 0 && (
            <span className={frame.round.foeCrit ? "floater left crit" : "floater left"}>
              −{frame.round.foeDamage}
            </span>
          )}
        </div>
      )}

      <div className="roundline" aria-live="polite">
        {step < 0 && <span>전투 준비…</span>}
        {step >= 0 && !finished && frame.round && (
          <>
            <span className="roundno">
              R{frame.index + 1}/{total}
            </span>
            <span>
              {view.heroName} {frame.round.heroCrit ? "치명타!" : "공격"} −{frame.round.heroDamage}
              {frame.round.foeDamage > 0 && (
                <>
                  {" · "}
                  {view.foeName} {frame.round.foeCrit ? "치명타!" : "반격"} −{frame.round.foeDamage}
                </>
              )}
            </span>
          </>
        )}
        {finished && (
          <span className="roundno">
            {total}라운드 종료
          </span>
        )}
      </div>

      {finished && (
        <div className={view.won ? "verdict win" : "verdict loss"} role="status">
          <span>{view.won ? "🏆 승리" : "💀 패배"}</span>
          {view.reward && view.won && (
            <span className="reward">
              +{view.reward.xp} XP · +{view.reward.gold} 골드
            </span>
          )}
          {view.ratingDelta !== undefined && (
            <span className="reward">
              {view.won ? "+" : "−"}
              {view.ratingDelta} 점수
            </span>
          )}
          {!view.won && view.reward === undefined && view.ratingDelta === undefined && (
            <span>영웅이 쓰러졌습니다. 부활해야 다시 내려갈 수 있습니다.</span>
          )}
        </div>
      )}
    </div>
  )
}
