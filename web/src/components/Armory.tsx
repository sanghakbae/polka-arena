import { MAX_TIER, SLOTS, TIER_COST, heroTier, type Hero, type SlotId } from "../lib/arena"
import type { ArenaAction } from "../lib/useArena"
import { Panel } from "./ui"

export function Armory({
  hero,
  busy,
  onAction,
}: {
  hero: Hero
  busy: ArenaAction["kind"] | undefined
  onAction: (action: ArenaAction) => void
}) {
  const anyBusy = busy !== undefined

  return (
    <Panel title="장비 상점" note={`${hero.gold} 골드`}>
      {SLOTS.map((slot) => {
        const owned = heroTier(hero, slot.id as SlotId)
        return (
          <div className="slot" key={slot.id}>
            <div className="slot-head">
              <span className="slot-icon" aria-hidden="true">
                {slot.icon}
              </span>
              <span className="slot-name">{slot.name}</span>
              <span className="slot-desc">
                등급당 {slot.stat} +{slot.perTier}
                <br />
                현재 {owned > 0 ? `T${owned}` : "없음"}
              </span>
            </div>

            <div className="tiers" role="group" aria-label={`${slot.name} 등급`}>
              {Array.from({ length: MAX_TIER }, (_, i) => i + 1).map((tier) => {
                const price = TIER_COST[tier] ?? 0
                const isOwned = tier < owned
                const isCurrent = tier === owned
                const affordable = hero.gold >= price
                const purchasable = hero.alive && tier > owned && affordable && !anyBusy

                const className = isCurrent
                  ? "tier current"
                  : isOwned
                    ? "tier owned"
                    : purchasable
                      ? "tier affordable"
                      : "tier locked"

                return (
                  <button
                    key={tier}
                    type="button"
                    className={className}
                    disabled={!purchasable}
                    onClick={() => onAction({ kind: "equip", slot: slot.id as SlotId, tier })}
                    aria-label={`${slot.name} 등급 ${tier}, ${price} 골드`}
                    title={
                      isCurrent
                        ? "장착 중"
                        : isOwned
                          ? "이미 지나간 등급"
                          : !affordable
                            ? `${price - hero.gold}골드 부족`
                            : `${price}골드에 구매`
                    }
                  >
                    <span className="t-no">{isCurrent ? "✓" : `T${tier}`}</span>
                    <span className="t-cost">{isOwned || isCurrent ? "—" : price}</span>
                  </button>
                )
              })}
            </div>
          </div>
        )
      })}

      <div className="field-hint" style={{ marginTop: 14 }}>
        등급은 올라가기만 합니다. 새 등급을 살 때는 이전 등급 값을 빼주지 않고 정가를 냅니다.
      </div>
    </Panel>
  )
}
