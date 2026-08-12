// Indexes PolkaArena's chain logs into Firestore.
//
// Why this exists rather than having the browser write: anything the browser can
// write, a player can forge. Clients read Firestore and never write to it (see
// firestore.rules); this process holds the only credentials that can write, and
// everything it writes is derived from chain logs.
//
//   node src/index.js                 incremental, from the stored cursor
//   node src/index.js --from-genesis  rebuild everything
//
// Required env:
//   ARENA_ADDRESS              deployed contract
//   RPC_URL                    Ethereum JSON-RPC endpoint (default: Polkadot Hub TestNet)
//   FIREBASE_SERVICE_ACCOUNT   service-account JSON, as a single-line string
//   FIREBASE_PROJECT_ID        optional; taken from the service account otherwise
import "dotenv/config"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { cert, initializeApp } from "firebase-admin/app"
import { FieldValue, getFirestore } from "firebase-admin/firestore"
import { createPublicClient, http, parseAbi } from "viem"

const here = dirname(fileURLToPath(import.meta.url))

const RPC_URL = process.env.RPC_URL ?? "https://eth-rpc-testnet.polkadot.io/"
const ARENA_ADDRESS = process.env.ARENA_ADDRESS
const FROM_GENESIS = process.argv.includes("--from-genesis")

/// Some RPCs cap eth_getLogs ranges; 2k blocks is comfortably under every limit
/// we have hit and keeps a backfill to a sane number of round trips.
const CHUNK = 2000n

// Only the events the archive needs. Written out rather than importing the full
// ABI so a contract change that breaks decoding fails loudly here.
const EVENTS = parseAbi([
  "struct Combatant { uint16 hp; uint16 atk; uint16 def; uint16 luck; }",
  "struct Foe { uint16 hp; uint16 atk; uint16 def; uint16 luck; uint32 xp; uint32 gold; string name; }",
  "event HeroCreated(address indexed player, string name, uint16 maxHp, uint16 atk, uint16 def)",
  "event Delved(address indexed player, uint32 indexed depth, bytes32 seed, Combatant hero, Foe foe, bool won, bool died, uint8 rounds, uint32 xp, uint32 gold)",
  "event Dueled(address indexed challenger, address indexed defender, bytes32 seed, Combatant challengerStats, Combatant defenderStats, bool challengerWon, uint8 rounds, uint32 ratingDelta)",
])

const HERO_ABI = parseAbi([
  "struct Hero { bool exists; bool alive; uint8 level; uint8 weapon; uint8 armor; uint8 trinket; uint16 hp; uint16 maxHp; uint16 atk; uint16 def; uint16 luck; uint32 xp; uint32 gold; uint32 depth; uint32 deepest; uint32 wins; uint32 losses; uint32 rating; string name; }",
  "function heroOf(address player) view returns (Hero)",
])

async function main() {
  if (!ARENA_ADDRESS) throw new Error("ARENA_ADDRESS is not set")

  const db = initFirestore()
  const chain = createPublicClient({ transport: http(RPC_URL) })

  const latest = await chain.getBlockNumber()
  const cursorRef = db.collection("meta").doc("indexer")
  const cursor = FROM_GENESIS ? 0n : BigInt((await cursorRef.get()).data()?.lastBlock ?? 0)

  if (cursor >= latest) {
    console.log(`up to date at block ${latest}`)
    return
  }

  console.log(`indexing ${cursor + 1n} → ${latest} (${latest - cursor} blocks)`)

  const touched = new Set()
  let fights = 0

  for (let from = cursor + 1n; from <= latest; from += CHUNK) {
    const to = from + CHUNK - 1n > latest ? latest : from + CHUNK - 1n
    // Passing `events` makes viem decode as it fetches, so each log arrives with
    // `eventName` and typed `args` already attached.
    const logs = await chain.getLogs({
      address: ARENA_ADDRESS,
      events: EVENTS.filter((entry) => entry.type === "event"),
      fromBlock: from,
      toBlock: to,
    })

    const batch = db.batch()
    let writes = 0

    for (const log of logs) {
      if (log.eventName === "HeroCreated") {
        touched.add(log.args.player.toLowerCase())
        continue
      }
      if (log.eventName !== "Delved" && log.eventName !== "Dueled") continue

      const doc = log.eventName === "Delved" ? runDoc(log) : duelDoc(log)

      // Deterministic id keyed on the log position, so a re-run overwrites rather
      // than duplicating. A backfill is therefore always safe to repeat.
      batch.set(db.collection("fights").doc(`${log.transactionHash}_${log.logIndex}`), doc, { merge: true })
      writes++
      fights++
      doc.participants.forEach((p) => touched.add(p))
    }

    if (writes > 0) await batch.commit()
    console.log(`  ${from}–${to}: ${logs.length} logs, ${writes} fights`)
  }

  await snapshotHeroes(db, chain, touched)
  await rollUpSeasons(db)

  await cursorRef.set({ lastBlock: Number(latest), updatedAt: FieldValue.serverTimestamp() }, { merge: true })
  console.log(`\ndone: ${fights} fights, ${touched.size} heroes, cursor at ${latest}`)
}

function runDoc(log) {
  const a = log.args
  return {
    kind: "run",
    player: a.player.toLowerCase(),
    participants: [a.player.toLowerCase()],
    depth: Number(a.depth),
    seed: a.seed,
    // Both sides' stats travel with the fight, so a replay needs nothing else.
    hero: plainCombatant(a.hero),
    foe: { ...plainCombatant(a.foe), xp: Number(a.foe.xp), gold: Number(a.foe.gold), name: a.foe.name },
    won: a.won,
    died: a.died,
    rounds: Number(a.rounds),
    xpGained: Number(a.xp),
    goldGained: Number(a.gold),
    blockNumber: Number(log.blockNumber),
    txHash: log.transactionHash,
  }
}

function duelDoc(log) {
  const a = log.args
  return {
    kind: "duel",
    player: a.challenger.toLowerCase(),
    opponent: a.defender.toLowerCase(),
    participants: [a.challenger.toLowerCase(), a.defender.toLowerCase()],
    seed: a.seed,
    hero: plainCombatant(a.challengerStats),
    foe: plainCombatant(a.defenderStats),
    won: a.challengerWon,
    rounds: Number(a.rounds),
    ratingDelta: Number(a.ratingDelta),
    blockNumber: Number(log.blockNumber),
    txHash: log.transactionHash,
  }
}

function plainCombatant(c) {
  return { hp: Number(c.hp), atk: Number(c.atk), def: Number(c.def), luck: Number(c.luck) }
}

/// Hero rows come from `heroOf`, not from replaying events. Events tell us *who*
/// changed; the contract tells us what they now are. That keeps the cache
/// convergent — a missed event costs freshness, never correctness.
async function snapshotHeroes(db, chain, addresses) {
  if (addresses.size === 0) return
  console.log(`\nsnapshotting ${addresses.size} heroes`)

  const list = [...addresses]
  for (let i = 0; i < list.length; i += 50) {
    const slice = list.slice(i, i + 50)
    const heroes = await Promise.all(
      slice.map((address) =>
        chain
          .readContract({ address: ARENA_ADDRESS, abi: HERO_ABI, functionName: "heroOf", args: [address] })
          .catch(() => null),
      ),
    )

    const batch = db.batch()
    slice.forEach((address, j) => {
      const hero = heroes[j]
      if (!hero?.exists) return
      batch.set(
        db.collection("heroes").doc(address),
        {
          address,
          name: hero.name,
          alive: hero.alive,
          level: Number(hero.level),
          weapon: Number(hero.weapon),
          armor: Number(hero.armor),
          trinket: Number(hero.trinket),
          hp: Number(hero.hp),
          maxHp: Number(hero.maxHp),
          atk: Number(hero.atk),
          def: Number(hero.def),
          luck: Number(hero.luck),
          xp: Number(hero.xp),
          gold: Number(hero.gold),
          depth: Number(hero.depth),
          deepest: Number(hero.deepest),
          wins: Number(hero.wins),
          losses: Number(hero.losses),
          rating: Number(hero.rating),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      )
    })
    await batch.commit()
  }
}

/// Seasons are windows over the indexed fights. Recomputed from scratch each run
/// so a correction to an earlier fight propagates instead of sticking.
async function rollUpSeasons(db) {
  const seasons = JSON.parse(readFileSync(join(here, "..", "seasons.json"), "utf8"))
  if (seasons.length === 0) return

  console.log(`\nrolling up ${seasons.length} season(s)`)

  for (const season of seasons) {
    const snapshot = await db
      .collection("fights")
      .where("blockNumber", ">=", season.startBlock)
      .where("blockNumber", "<=", season.endBlock ?? Number.MAX_SAFE_INTEGER)
      .get()

    const tally = new Map()
    const bump = (address, patch) => {
      const row = tally.get(address) ?? { address, runs: 0, duelWins: 0, duelLosses: 0, deepest: 0, gold: 0 }
      Object.entries(patch).forEach(([key, value]) => {
        row[key] = key === "deepest" ? Math.max(row[key], value) : row[key] + value
      })
      tally.set(address, row)
    }

    snapshot.forEach((doc) => {
      const fight = doc.data()
      if (fight.kind === "run") {
        bump(fight.player, { runs: 1, deepest: fight.won ? fight.depth : 0, gold: fight.goldGained ?? 0 })
      } else {
        bump(fight.player, { duelWins: fight.won ? 1 : 0, duelLosses: fight.won ? 0 : 1 })
        bump(fight.opponent, { duelWins: fight.won ? 0 : 1, duelLosses: fight.won ? 1 : 0 })
      }
    })

    const standings = [...tally.values()]
      .sort((a, b) => b.deepest - a.deepest || b.duelWins - a.duelWins || b.gold - a.gold)
      .slice(0, 100)
      .map((row, i) => ({ ...row, rank: i + 1 }))

    await db.collection("seasons").doc(season.id).set(
      {
        ...season,
        standings,
        fightCount: snapshot.size,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    )
    console.log(`  ${season.id}: ${snapshot.size} fights, ${standings.length} ranked`)
  }
}

function initFirestore() {
  // Against the emulator there is nothing to authenticate as, which is the only
  // way to exercise the write path without a real service-account key:
  //   firebase emulators:start --only firestore
  //   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 FIREBASE_PROJECT_ID=polka-arena pnpm index
  if (process.env.FIRESTORE_EMULATOR_HOST) {
    const projectId = process.env.FIREBASE_PROJECT_ID
    if (!projectId) throw new Error("FIREBASE_PROJECT_ID is required when using the emulator")
    console.log(`using firestore emulator at ${process.env.FIRESTORE_EMULATOR_HOST}`)
    initializeApp({ projectId })
    return getFirestore()
  }

  const raw = process.env.FIREBASE_SERVICE_ACCOUNT
  if (!raw) throw new Error("FIREBASE_SERVICE_ACCOUNT is not set")

  let credentials
  try {
    credentials = JSON.parse(raw)
  } catch {
    throw new Error("FIREBASE_SERVICE_ACCOUNT is not valid JSON")
  }

  initializeApp({
    credential: cert(credentials),
    projectId: process.env.FIREBASE_PROJECT_ID ?? credentials.project_id,
  })
  return getFirestore()
}

main().catch((error) => {
  console.error(error.message ?? error)
  process.exitCode = 1
})
