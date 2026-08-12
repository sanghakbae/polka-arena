// Validates that the indexer's hand-written event signatures actually decode the
// contract's struct events, and that a decoded log replays to its stored outcome.
//
// The archive's whole premise is that a fight can be rebuilt from its log alone.
// If a contract change breaks these signatures, viem quietly decodes nothing and
// the indexer would write an empty archive without erroring — so check it:
//
//   ARENA_ADDRESS=0x... RPC_URL=http://127.0.0.1:8545 pnpm verify
import { createPublicClient, http, parseAbi } from "viem"

const ADDRESS = process.env.ARENA_ADDRESS
const EVENTS = parseAbi([
  "struct Combatant { uint16 hp; uint16 atk; uint16 def; uint16 luck; }",
  "struct Foe { uint16 hp; uint16 atk; uint16 def; uint16 luck; uint32 xp; uint32 gold; string name; }",
  "event HeroCreated(address indexed player, string name, uint16 maxHp, uint16 atk, uint16 def)",
  "event Delved(address indexed player, uint32 indexed depth, bytes32 seed, Combatant hero, Foe foe, bool won, bool died, uint8 rounds, uint32 xp, uint32 gold)",
  "event Dueled(address indexed challenger, address indexed defender, bytes32 seed, Combatant challengerStats, Combatant defenderStats, bool challengerWon, uint8 rounds, uint32 ratingDelta)",
])
const SIM = parseAbi([
  "struct Combatant { uint16 hp; uint16 atk; uint16 def; uint16 luck; }",
  "struct Round { uint16 heroDamage; uint16 foeDamage; uint16 heroHp; uint16 foeHp; bool heroCrit; bool foeCrit; }",
  "function simulate(bytes32 seed, Combatant hero, Combatant foe) pure returns (Round[], uint8, uint16, bool)",
])

const RPC_URL = process.env.RPC_URL ?? "http://127.0.0.1:8545"
const chain = createPublicClient({ transport: http(RPC_URL) })
const logs = await chain.getLogs({
  address: ADDRESS,
  events: EVENTS.filter((e) => e.type === "event"),
  fromBlock: 0n,
  toBlock: "latest",
})

const counts = {}
for (const log of logs) counts[log.eventName] = (counts[log.eventName] ?? 0) + 1
console.log("decoded events:", counts)

const delved = logs.filter((l) => l.eventName === "Delved")
if (delved.length === 0) throw new Error("no Delved events decoded — signature mismatch")

let verified = 0
for (const log of delved.slice(0, 5)) {
  const { seed, hero, foe, won, rounds } = log.args
  if (!seed || !hero || !foe) throw new Error("Delved decoded without struct fields")
  const [roundLog, fought, , heroWon] = await chain.readContract({
    address: ADDRESS,
    abi: SIM,
    functionName: "simulate",
    args: [seed, hero, { hp: foe.hp, atk: foe.atk, def: foe.def, luck: foe.luck }],
  })
  if (heroWon !== won) throw new Error(`replay disagrees on outcome: ${heroWon} vs ${won}`)
  if (Number(fought) !== Number(rounds)) throw new Error(`round count differs: ${fought} vs ${rounds}`)
  if (roundLog.length !== Number(rounds)) throw new Error("round log length differs")
  verified++
  console.log(`  ${foe.name.padEnd(14)} floor ${log.args.depth}  ${rounds} rounds  ${won ? "win" : "loss"}  replay ✓`)
}
console.log(`\n${verified} fights replayed from logs alone — indexer signatures are correct`)
