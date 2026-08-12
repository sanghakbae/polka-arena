import type { Address } from "viem"
import { polkaArenaAbi } from "../generated/abi"

export { polkaArenaAbi }

/// Set by contracts/scripts/deploy.js into web/.env.local.
const configured = import.meta.env.VITE_ARENA_ADDRESS as string | undefined

export const arenaAddress =
  configured && /^0x[0-9a-fA-F]{40}$/.test(configured) ? (configured as Address) : undefined

// ------------------------------------------------------------------ game types
//
// Written out rather than derived with viem's `ContractFunctionReturnType`: this
// ABI is large enough (45 entries, several nested structs) that TypeScript gives
// up on the inference and silently collapses every struct to `{}`, which turns
// every field access into an error. Hand types are stable and readable; the
// tradeoff is that a contract struct change will not show up here as a compile
// error, so `assertConstantsMatchChain` in useArena.ts checks the numbers that
// matter at dev-time startup instead.
//
// Every numeric field below is uint32 or smaller on-chain, so viem decodes them
// to `number`, not `bigint`.

export type Hero = {
  exists: boolean
  alive: boolean
  level: number
  weapon: number
  armor: number
  trinket: number
  hp: number
  maxHp: number
  atk: number
  def: number
  luck: number
  xp: number
  gold: number
  depth: number
  deepest: number
  wins: number
  losses: number
  rating: number
  name: string
}

export type Combatant = { hp: number; atk: number; def: number; luck: number }

export type Foe = Combatant & { xp: number; gold: number; name: string }

export type Round = {
  heroDamage: number
  foeDamage: number
  heroHp: number
  foeHp: number
  heroCrit: boolean
  foeCrit: boolean
}

export type Run = {
  seed: `0x${string}`
  depth: number
  hero: Combatant
  foe: Foe
  won: boolean
  died: boolean
  rounds: number
  heroHpLeft: number
  xpGained: number
  goldGained: number
}

export type Duel = {
  seed: `0x${string}`
  opponent: Address
  challenger: Combatant
  defender: Combatant
  won: boolean
  rounds: number
  ratingDelta: number
}

export type LadderEntry = Hero & { address: Address; rank: number }

// ------------------------------------------------------------- game constants
// Mirrors of on-chain values, used for display only. The chain remains the
// authority — these just let the UI price things before sending a transaction.

export const TIER_COST = [0, 60, 180, 450, 1000, 2200] as const
export const MAX_TIER = 5
export const REST_GOLD_PER_HP = 1

export const SLOTS = [
  { id: 0, name: "무기", stat: "공격", perTier: 6, icon: "⚔️" },
  { id: 1, name: "방어구", stat: "방어", perTier: 4, icon: "🛡️" },
  { id: 2, name: "장신구", stat: "행운", perTier: 25, icon: "💠" },
] as const

export type SlotId = 0 | 1 | 2

export function xpForNextLevel(level: number): number {
  return level * 80 + level * level * 10
}

export function heroTier(hero: Hero, slot: SlotId): number {
  return slot === 0 ? hero.weapon : slot === 1 ? hero.armor : hero.trinket
}

/// Gear-inclusive stats, matching the contract's `_totalAtk`/`_totalDef`/`_totalLuck`.
export function effectiveStats(hero: Hero): { hp: number; atk: number; def: number; luck: number } {
  return {
    hp: hero.hp,
    atk: hero.atk + hero.weapon * 6,
    def: hero.def + hero.armor * 4,
    luck: hero.luck + hero.trinket * 25,
  }
}

/// Cost to top a hero back up to full, matching `rest()`.
export function restCost(hero: Hero): number {
  return (hero.maxHp - hero.hp) * REST_GOLD_PER_HP
}

export function isChampionFloor(depth: number): boolean {
  return depth > 0 && depth % 5 === 0
}

export function isZeroAddress(address: string): boolean {
  return /^0x0{40}$/i.test(address)
}
