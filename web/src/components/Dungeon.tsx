import { isChampionFloor, restCost, xpForNextLevel, type Hero } from "../lib/arena"
import type { ArenaAction } from "../lib/useArena"
import { BattleStage, type BattleView } from "./BattleStage"
import { Notice, Panel, Spinner } from "./ui"

export function Dungeon({
  hero,
  battle,
  busy,
  onAction,
}: {
  hero: Hero
  battle: BattleView | undefined
  busy: ArenaAction["kind"] | undefined
  onAction: (action: ArenaAction) => void
}) {
  const nextFloor = hero.depth + 1
  const canLevel = hero.xp >= xpForNextLevel(hero.level)
  const cost = restCost(hero)
  const canRest = hero.alive && hero.hp < hero.maxHp && hero.gold >= 2
  const anyBusy = busy !== undefined
  const lowHp = hero.alive && hero.hp <= hero.maxHp * 0.3

  return (
    <Panel
      title={hero.alive ? `던전 · ${nextFloor}층` : "던전 · 사망"}
      note={isChampionFloor(nextFloor) && hero.alive ? "챔피언 층" : undefined}
    >
      {!hero.alive && (
        <div style={{ marginBottom: 14 }}>
          <Notice icon="💀">
            영웅이 {hero.depth}층에서 쓰러졌습니다. 부활하면 최대 체력의 절반으로 지상에서 다시 시작하고, 골드의 절반을
            잃습니다. 최고 기록 {hero.deepest}층은 남습니다.
          </Notice>
        </div>
      )}

      {hero.alive && isChampionFloor(nextFloor) && (
        <div style={{ marginBottom: 14 }}>
          <Notice icon="👑">
            {nextFloor}층은 챔피언 층입니다. 체력이 두 배이고 보상은 세 배입니다.
          </Notice>
        </div>
      )}

      {hero.alive && lowHp && (
        <div style={{ marginBottom: 14 }}>
          <Notice icon="🩸">
            체력이 {hero.hp}/{hero.maxHp}까지 떨어졌습니다. 이대로 내려가면 죽을 가능성이 높습니다.
          </Notice>
        </div>
      )}

      <BattleStage view={battle} />

      <div className="btn-row" style={{ marginTop: 14 }}>
        {hero.alive ? (
          <button
            className="btn primary span-2"
            disabled={anyBusy}
            onClick={() => onAction({ kind: "delve" })}
          >
            {busy === "delve" ? <Spinner /> : `⬇️ ${nextFloor}층으로`}
          </button>
        ) : (
          <button
            className="btn danger span-2"
            disabled={anyBusy}
            onClick={() => onAction({ kind: "revive" })}
          >
            {busy === "revive" ? <Spinner /> : "✨ 부활"}
          </button>
        )}

        <button className="btn" disabled={anyBusy || !canRest} onClick={() => onAction({ kind: "rest" })}>
          {busy === "rest" ? <Spinner /> : cost > 0 ? `🛌 휴식 ${cost}g` : "🛌 휴식"}
        </button>

        <button className="btn" disabled={anyBusy || !canLevel} onClick={() => onAction({ kind: "levelUp" })}>
          {busy === "levelUp" ? <Spinner /> : canLevel ? "⬆️ 레벨업" : `⬆️ ${xpForNextLevel(hero.level) - hero.xp} XP`}
        </button>
      </div>

      {hero.alive && cost > hero.gold && hero.hp < hero.maxHp && (
        <div className="field-hint" style={{ marginTop: 8 }}>
          완전 회복에는 {cost}골드가 필요합니다. 보유 골드({hero.gold})만큼만 회복됩니다.
        </div>
      )}
    </Panel>
  )
}
