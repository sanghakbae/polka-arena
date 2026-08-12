import { useCallback, useEffect, useState } from "react"
import type { Address } from "viem"
import {
  fetchFightHistory,
  fetchIndexerCursor,
  fetchSeasons,
  firestoreEnabled,
  type ArchivedFight,
  type Season,
} from "./firestore"

export type ArchiveState = {
  /// False when Firebase is not configured — the UI hides the archive entirely
  /// rather than showing an empty panel that will never fill.
  available: boolean
  history: ArchivedFight[]
  seasons: Season[]
  /// Last block the indexer has processed, for an honest freshness line.
  cursor: number | undefined
  loading: boolean
  reload: () => Promise<void>
}

/// The off-chain archive: fights older than the one the contract still holds, plus
/// season rollups. Read-only, and entirely optional — every consumer must work
/// when `available` is false.
export function useArchive(player: Address | undefined, refreshKey: unknown): ArchiveState {
  const [history, setHistory] = useState<ArchivedFight[]>([])
  const [seasons, setSeasons] = useState<Season[]>([])
  const [cursor, setCursor] = useState<number>()
  const [loading, setLoading] = useState(false)

  const reload = useCallback(async () => {
    if (!firestoreEnabled) return
    setLoading(true)
    try {
      const [nextSeasons, nextCursor] = await Promise.all([fetchSeasons(), fetchIndexerCursor()])
      setSeasons(nextSeasons ?? [])
      setCursor(nextCursor)

      if (player) {
        setHistory((await fetchFightHistory(player)) ?? [])
      } else {
        setHistory([])
      }
    } finally {
      setLoading(false)
    }
  }, [player])

  // `refreshKey` lets the caller pull again after a transaction settles; the
  // indexer runs on a schedule, so a fresh fight may take a cycle to appear.
  useEffect(() => {
    void reload()
  }, [reload, refreshKey])

  return { available: firestoreEnabled, history, seasons, cursor, loading, reload }
}
