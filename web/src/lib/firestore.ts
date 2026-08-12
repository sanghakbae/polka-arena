import type { Address } from "viem"
import type { Combatant, Foe, LadderEntry } from "./arena"

// Read-only Firestore access over the REST API.
//
// The REST endpoints rather than the firebase SDK: the app only ever reads, and
// the SDK would add a couple of hundred kilobytes to a bundle that is already the
// largest thing on the page. The cost is no realtime listeners — fine for a
// turn-based game where every change follows a transaction the client just sent.
//
// Writes are impossible here by design; see firestore.rules.

const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID as string | undefined
const apiKey = import.meta.env.VITE_FIREBASE_API_KEY as string | undefined

/// When Firebase is not configured the app falls back to reading the chain
/// directly. Everything below returns undefined in that case rather than throwing,
/// so the game stays playable with no backend at all.
export const firestoreEnabled = Boolean(projectId && apiKey)

const BASE = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`

export type ArchivedFight = {
  id: string
  kind: "run" | "duel"
  player: Address
  opponent?: Address
  depth?: number
  seed: `0x${string}`
  hero: Combatant
  foe: Combatant | Foe
  won: boolean
  died?: boolean
  rounds: number
  xpGained?: number
  goldGained?: number
  ratingDelta?: number
  blockNumber: number
  txHash: `0x${string}`
}

export type SeasonStanding = {
  rank: number
  address: Address
  runs: number
  duelWins: number
  duelLosses: number
  deepest: number
  gold: number
}

export type Season = {
  id: string
  label: string
  startBlock: number
  endBlock: number | null
  fightCount: number
  standings: SeasonStanding[]
}

// ------------------------------------------------------------------- decoding
//
// Firestore's REST shape wraps every scalar in a typed field ({ integerValue:
// "3" }), so a document has to be unwrapped before it looks like data.

type FsValue = Record<string, unknown>

function unwrap(value: FsValue | undefined): unknown {
  if (!value) return undefined
  if ("integerValue" in value) return Number(value.integerValue)
  if ("doubleValue" in value) return Number(value.doubleValue)
  if ("booleanValue" in value) return Boolean(value.booleanValue)
  if ("stringValue" in value) return value.stringValue
  if ("nullValue" in value) return null
  if ("timestampValue" in value) return value.timestampValue
  if ("arrayValue" in value) {
    const values = (value.arrayValue as { values?: FsValue[] }).values ?? []
    return values.map(unwrap)
  }
  if ("mapValue" in value) {
    const fields = (value.mapValue as { fields?: Record<string, FsValue> }).fields ?? {}
    return unwrapFields(fields)
  }
  return undefined
}

function unwrapFields(fields: Record<string, FsValue>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(fields)) out[key] = unwrap(value)
  return out
}

type FsDocument = { name?: string; fields?: Record<string, FsValue> }

function docToObject(doc: FsDocument): Record<string, unknown> & { id: string } {
  const id = (doc.name ?? "").split("/").pop() ?? ""
  return { id, ...unwrapFields(doc.fields ?? {}) }
}

async function runQuery(body: unknown): Promise<Record<string, unknown>[]> {
  const response = await fetch(`${BASE}:runQuery?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  if (!response.ok) throw new Error(`firestore query failed: ${response.status}`)

  const rows = (await response.json()) as { document?: FsDocument }[]
  return rows.filter((row) => row.document).map((row) => docToObject(row.document as FsDocument))
}

// ---------------------------------------------------------------------- reads

/// The cached ladder. Falls back to `undefined` on any failure so the caller can
/// read the chain instead — a stale or missing cache must never break the game.
export async function fetchLadder(limit = 100): Promise<LadderEntry[] | undefined> {
  if (!firestoreEnabled) return undefined
  try {
    const rows = await runQuery({
      structuredQuery: {
        from: [{ collectionId: "heroes" }],
        orderBy: [
          { field: { fieldPath: "rating" }, direction: "DESCENDING" },
          { field: { fieldPath: "deepest" }, direction: "DESCENDING" },
        ],
        limit,
      },
    })

    return rows.map((row, i) => ({ ...(row as unknown as LadderEntry), rank: i + 1 }))
  } catch {
    return undefined
  }
}

/// A player's archived fights, newest first. The contract keeps only the most
/// recent one, so this is the only place older fights exist.
export async function fetchFightHistory(player: Address, limit = 25): Promise<ArchivedFight[] | undefined> {
  if (!firestoreEnabled) return undefined
  try {
    const rows = await runQuery({
      structuredQuery: {
        from: [{ collectionId: "fights" }],
        where: {
          fieldFilter: {
            field: { fieldPath: "participants" },
            op: "ARRAY_CONTAINS",
            value: { stringValue: player.toLowerCase() },
          },
        },
        orderBy: [{ field: { fieldPath: "blockNumber" }, direction: "DESCENDING" }],
        limit,
      },
    })
    return rows as unknown as ArchivedFight[]
  } catch {
    return undefined
  }
}

export async function fetchSeasons(): Promise<Season[] | undefined> {
  if (!firestoreEnabled) return undefined
  try {
    const response = await fetch(`${BASE}/seasons?key=${apiKey}&pageSize=20`)
    if (!response.ok) throw new Error(`firestore read failed: ${response.status}`)
    const body = (await response.json()) as { documents?: FsDocument[] }
    return (body.documents ?? []).map((doc) => docToObject(doc) as unknown as Season)
  } catch {
    return undefined
  }
}

/// How far behind the chain the cache is, for an honest "last updated" line.
export async function fetchIndexerCursor(): Promise<number | undefined> {
  if (!firestoreEnabled) return undefined
  try {
    const response = await fetch(`${BASE}/meta/indexer?key=${apiKey}`)
    if (!response.ok) return undefined
    const doc = (await response.json()) as FsDocument
    const value = docToObject(doc).lastBlock
    return typeof value === "number" ? value : undefined
  } catch {
    return undefined
  }
}
