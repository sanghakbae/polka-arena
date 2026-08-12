import {
  MAX_TIER,
  SLOTS,
  TIER_COST,
  heroTier,
  itemFor,
  rarityClass,
  type Hero,
  type SlotId,
} from "../lib/arena"
import type { ArenaAction } from "../lib/useArena"
import { Panel, Spinner } from "./ui"

/// One card per slot: what is equipped, how far along the five tiers, and the one
/// upgrade that is actually available next.
///
/// The previous version showed all five tiers as a row of "T3 / 450" boxes. It fit,
/// but it made a purchase read like a spreadsheet cell, and four of the five boxes
/// were never actionable — you can only ever buy the next one up.
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
    <Panel title="장비" note={`${hero.gold} 골드`}>
      <div className="slots">
        {SLOTS.map((slot) => (
          <SlotCard
            key={slot.id}
            slot={slot}
            hero={hero}
            anyBusy={anyBusy}
            buying={busy === "equip"}
            onBuy={(tier) => onAction({ kind: "equip", slot: slot.id as SlotId, tier })}
          />
        ))}
      </div>
    </Panel>
  )
}

function SlotCard({
  slot,
  hero,
  anyBusy,
  buying,
  onBuy,
}: {
  slot: (typeof SLOTS)[number]
  hero: Hero
  anyBusy: boolean
  buying: boolean
  onBuy: (tier: number) => void
}) {
  const owned = heroTier(hero, slot.id as SlotId)
  const equipped = owned > 0 ? itemFor(slot.id as SlotId, owned) : undefined
  const nextTier = owned + 1
  const next = nextTier <= MAX_TIER ? itemFor(slot.id as SlotId, nextTier) : undefined
  const price = TIER_COST[nextTier] ?? 0
  const affordable = hero.gold >= price
  const canBuy = Boolean(next) && hero.alive && affordable && !anyBusy

  return (
    <div className={equipped ? `slot-card ${rarityClass(equipped.rarity)}` : "slot-card"}>
      <div className="slot-row">
        <span className="slot-gem" aria-hidden="true">
          {equipped?.icon ?? slot.icon}
        </span>

        <div className="slot-info">
          <div className="slot-kind">{slot.name}</div>
          <div className="slot-item">
            {equipped ? (
              <>
                <b>{equipped.name}</b>
                <span className="slot-rarity">{equipped.rarity}</span>
              </>
            ) : (
              <span className="slot-none">비어 있음</span>
            )}
          </div>
        </div>

        <div className="pips" role="img" aria-label={`${slot.name} ${owned} / ${MAX_TIER} 단계`}>
          {Array.from({ length: MAX_TIER }, (_, i) => (
            <i key={i} className={i < owned ? "on" : undefined} />
          ))}
        </div>
      </div>

      {next ? (
        <button
          className={`upgrade ${rarityClass(next.rarity)}`}
          disabled={!canBuy}
          onClick={() => onBuy(nextTier)}
          title={
            !hero.alive
              ? "사망 상태에서는 구매할 수 없습니다"
              : affordable
                ? `${price}골드에 구매`
                : `${price - hero.gold}골드 부족`
          }
        >
          <span className="up-icon" aria-hidden="true">
            {next.icon}
          </span>
          <span className="up-text">
            <b>{next.name}</b>
            <small>
              {next.rarity} · {slot.stat} +{slot.perTier * nextTier}
            </small>
          </span>
          <span className="up-cost">{buying ? <Spinner /> : `${price}g`}</span>
        </button>
      ) : (
        <div className="upgrade maxed">
          <span className="up-icon" aria-hidden="true">
            ✨
          </span>
          <span className="up-text">
            <b>최고 등급</b>
            <small>더 올릴 것이 없습니다</small>
          </span>
        </div>
      )}
    </div>
  )
}
