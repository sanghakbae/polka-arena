import { useCallback, useEffect, useRef, useState } from "react"
import type { Address } from "viem"
import { publicClient } from "./chain"
import {
  MAX_TIER,
  REST_GOLD_PER_HP,
  TIER_COST,
  arenaAddress,
  isZeroAddress,
  polkaArenaAbi,
  xpForNextLevel,
  type Duel,
  type Hero,
  type LadderEntry,
  type Round,
  type Run,
  type SlotId,
} from "./arena"
import { readableError } from "./useWallet"

/// Every player-triggered transaction, so the UI can disable exactly the button
/// that is in flight rather than freezing the whole screen.
export type ArenaAction =
  | { kind: "createHero"; name: string }
  | { kind: "delve" }
  | { kind: "rest" }
  | { kind: "levelUp" }
  | { kind: "revive" }
  | { kind: "equip"; slot: SlotId; tier: number }
  | { kind: "duel"; opponent: Address }

export type TxStatus =
  | { phase: "idle" }
  | { phase: "signing"; label: string }
  | { phase: "pending"; label: string; hash: `0x${string}` }
  | { phase: "done"; label: string; hash: `0x${string}` }
  | { phase: "failed"; label: string; message: string }

const ACTION_LABELS: Record<ArenaAction["kind"], string> = {
  createHero: "영웅 생성",
  delve: "탐험",
  rest: "휴식",
  levelUp: "레벨업",
  revive: "부활",
  equip: "장비 구매",
  duel: "결투",
}

const LADDER_PAGE = 100n

export type ArenaState = {
  ready: boolean
  hero: Hero | undefined
  run: Run | undefined
  duel: Duel | undefined
  ladder: LadderEntry[]
  loading: boolean
  tx: TxStatus
  /// The action currently in flight, for per-button spinners.
  busy: ArenaAction["kind"] | undefined
  send: (action: ArenaAction) => Promise<boolean>
  replay: (run: Run) => Promise<Round[]>
  replayDuel: (duel: Duel) => Promise<Round[]>
  refresh: () => Promise<void>
  dismissTx: () => void
}

type SendDeps = {
  account: Address | undefined
  onRightChain: boolean
  /// Kept loose: viem's WalletClient generics fight with a bare `writeContract`
  /// call site, and this hook only ever needs that one method.
  walletClient: { writeContract: (args: never) => Promise<`0x${string}`> } | undefined
  onSettled?: () => void
}

export function useArena(deps: SendDeps): ArenaState {
  const { account, onRightChain, walletClient, onSettled } = deps

  const [hero, setHero] = useState<Hero>()
  const [run, setRun] = useState<Run>()
  const [duel, setDuel] = useState<Duel>()
  const [ladder, setLadder] = useState<LadderEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [ready, setReady] = useState(false)
  const [tx, setTx] = useState<TxStatus>({ phase: "idle" })
  const [busy, setBusy] = useState<ArenaAction["kind"]>()

  // Guards against a slow refresh landing after a newer one and clobbering it.
  const refreshToken = useRef(0)

  const loadLadder = useCallback(async (): Promise<LadderEntry[]> => {
    if (!arenaAddress) return []
    const [addrs, records] = (await publicClient.readContract({
      address: arenaAddress,
      abi: polkaArenaAbi,
      functionName: "ladder",
      args: [0n, LADDER_PAGE],
    })) as unknown as [Address[], Hero[]]

    return addrs
      .map((address, i) => ({ address, ...(records[i] as Hero) }))
      .sort((a, b) => b.rating - a.rating || b.deepest - a.deepest)
      .map((entry, i) => ({ ...entry, rank: i + 1 }))
  }, [])

  const refresh = useCallback(async () => {
    if (!arenaAddress) {
      setReady(true)
      return
    }
    const token = ++refreshToken.current
    setLoading(true)
    try {
      const nextLadder = await loadLadder()
      if (token !== refreshToken.current) return
      setLadder(nextLadder)

      if (!account) {
        setHero(undefined)
        setRun(undefined)
        setDuel(undefined)
        return
      }

      const common = { address: arenaAddress, abi: polkaArenaAbi } as const
      const [heroRaw, runRaw, duelRaw] = await Promise.all([
        publicClient.readContract({ ...common, functionName: "heroOf", args: [account] }),
        publicClient.readContract({ ...common, functionName: "lastRun", args: [account] }),
        publicClient.readContract({ ...common, functionName: "lastDuel", args: [account] }),
      ])
      if (token !== refreshToken.current) return

      const nextHero = heroRaw as unknown as Hero
      const nextRun = runRaw as unknown as Run
      const nextDuel = duelRaw as unknown as Duel

      setHero(nextHero.exists ? nextHero : undefined)
      setRun(nextRun.depth > 0 ? nextRun : undefined)
      setDuel(isZeroAddress(nextDuel.opponent) ? undefined : nextDuel)
    } catch {
      // A read failure is almost always a cold RPC; leave the last good state up.
    } finally {
      if (token === refreshToken.current) {
        setLoading(false)
        setReady(true)
      }
    }
  }, [account, loadLadder])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    if (import.meta.env.DEV) void assertConstantsMatchChain()
  }, [])

  const send = useCallback(
    async (action: ArenaAction): Promise<boolean> => {
      const label = ACTION_LABELS[action.kind]
      if (!arenaAddress) {
        setTx({ phase: "failed", label, message: "컨트랙트 주소가 설정되지 않았습니다. 먼저 배포해 주세요." })
        return false
      }
      if (!walletClient || !account) {
        setTx({ phase: "failed", label, message: "지갑을 먼저 연결해 주세요." })
        return false
      }
      if (!onRightChain) {
        setTx({ phase: "failed", label, message: "네트워크를 전환해 주세요." })
        return false
      }

      setBusy(action.kind)
      setTx({ phase: "signing", label })
      try {
        const hash = await walletClient.writeContract({
          address: arenaAddress,
          abi: polkaArenaAbi,
          ...callFor(action),
        } as never)

        setTx({ phase: "pending", label, hash })
        const receipt = await publicClient.waitForTransactionReceipt({ hash })

        if (receipt.status !== "success") {
          setTx({ phase: "failed", label, message: "트랜잭션이 체인에서 실패했습니다." })
          return false
        }

        setTx({ phase: "done", label, hash })
        await refresh()
        onSettled?.()
        return true
      } catch (error) {
        setTx({ phase: "failed", label, message: readableError(error) })
        return false
      } finally {
        setBusy(undefined)
      }
    },
    [account, onRightChain, refresh, walletClient, onSettled],
  )

  /// Re-derives a fight from its seed. The contract's `simulate` is pure, so this
  /// returns exactly the rounds that produced the stored outcome.
  const replay = useCallback(async (target: Run): Promise<Round[]> => {
    if (!arenaAddress) return []
    const result = (await publicClient.readContract({
      address: arenaAddress,
      abi: polkaArenaAbi,
      functionName: "simulate",
      args: [
        target.seed,
        { hp: target.hero.hp, atk: target.hero.atk, def: target.hero.def, luck: target.hero.luck },
        { hp: target.foe.hp, atk: target.foe.atk, def: target.foe.def, luck: target.foe.luck },
      ],
    })) as unknown as [Round[], number, number, boolean]
    return [...result[0]]
  }, [])

  const replayDuel = useCallback(async (target: Duel): Promise<Round[]> => {
    if (!arenaAddress) return []
    const result = (await publicClient.readContract({
      address: arenaAddress,
      abi: polkaArenaAbi,
      functionName: "simulate",
      args: [target.seed, target.challenger, target.defender],
    })) as unknown as [Round[], number, number, boolean]
    return [...result[0]]
  }, [])

  const dismissTx = useCallback(() => setTx({ phase: "idle" }), [])

  return { ready, hero, run, duel, ladder, loading, tx, busy, send, replay, replayDuel, refresh, dismissTx }
}

/// The display constants in arena.ts are hand-copied from the contract, and they
/// have drifted before — a rebalance changed the xp curve on-chain while the UI
/// kept quoting the old numbers. In dev, check them against the chain on load so
/// the next drift is loud instead of silent.
async function assertConstantsMatchChain(): Promise<void> {
  if (!arenaAddress) return
  const common = { address: arenaAddress, abi: polkaArenaAbi } as const
  const mismatches: string[] = []
  const check = (what: string, onChain: number, ui: number) => {
    if (onChain !== ui) mismatches.push(`${what}: chain ${onChain}, ui ${ui}`)
  }

  try {
    const restPerHp = await publicClient.readContract({ ...common, functionName: "REST_GOLD_PER_HP" })
    check("REST_GOLD_PER_HP", Number(restPerHp), REST_GOLD_PER_HP)

    const maxTier = await publicClient.readContract({ ...common, functionName: "MAX_TIER" })
    check("MAX_TIER", Number(maxTier), MAX_TIER)

    for (const level of [1, 2, 5, 10]) {
      const onChain = await publicClient.readContract({
        ...common,
        functionName: "xpForNextLevel",
        args: [level],
      })
      check(`xpForNextLevel(${level})`, Number(onChain), xpForNextLevel(level))
    }

    for (let tier = 1; tier <= MAX_TIER; tier++) {
      const onChain = await publicClient.readContract({ ...common, functionName: "tierCost", args: [tier] })
      check(`tierCost(${tier})`, Number(onChain), TIER_COST[tier] ?? -1)
    }
  } catch {
    return // No contract reachable yet; nothing to compare against.
  }

  if (mismatches.length > 0) {
    console.error("[polka-arena] UI constants no longer match the deployed contract:\n  " + mismatches.join("\n  "))
  }
}

function callFor(action: ArenaAction): { functionName: string; args: readonly unknown[] } {
  switch (action.kind) {
    case "createHero":
      return { functionName: "createHero", args: [action.name] }
    case "equip":
      return { functionName: "equip", args: [action.slot, action.tier] }
    case "duel":
      return { functionName: "duel", args: [action.opponent] }
    default:
      return { functionName: action.kind, args: [] }
  }
}
