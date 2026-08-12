import { useCallback, useEffect, useState } from "react"
import { arenaAddress } from "./lib/arena"
import { FAUCET_URL, explorerAddress, polkadotHubTestnet } from "./lib/chain"
import { useArena, type ArenaAction } from "./lib/useArena"
import { useWallet } from "./lib/useWallet"
import { Armory } from "./components/Armory"
import type { BattleView } from "./components/BattleStage"
import { CreateHero } from "./components/CreateHero"
import { ExplorerLink } from "./components/ExplorerLink"
import { Dungeon } from "./components/Dungeon"
import { Header } from "./components/Header"
import { HeroCard } from "./components/HeroCard"
import { Ladder } from "./components/Ladder"
import { Landing } from "./components/Landing"
import { TxToast } from "./components/TxToast"
import { Notice, shortAddress } from "./components/ui"

type Tab = "dungeon" | "armory" | "ladder"

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: "dungeon", label: "던전", icon: "🗡️" },
  { id: "armory", label: "장비", icon: "🛡️" },
  { id: "ladder", label: "랭킹", icon: "🏅" },
]

export default function App() {
  const wallet = useWallet()
  const arena = useArena({
    account: wallet.account,
    onRightChain: wallet.onRightChain,
    walletClient: wallet.walletClient as never,
    onSettled: wallet.refreshBalance,
  })

  const [tab, setTab] = useState<Tab>("dungeon")
  const [battle, setBattle] = useState<BattleView>()
  // Which fight the stage is showing: the last dungeon run or the last duel.
  const [focus, setFocus] = useState<"run" | "duel">("run")

  const { hero, run, duel, replay, replayDuel, ladder, send } = arena

  // Rebuild the replay whenever the fight we are focused on changes.
  useEffect(() => {
    let cancelled = false

    void (async () => {
      if (focus === "duel" && duel) {
        const rounds = await replayDuel(duel)
        if (cancelled) return
        const opponent = ladder.find((e) => e.address.toLowerCase() === duel.opponent.toLowerCase())
        setBattle({
          key: `duel-${duel.seed}`,
          heroName: hero?.name ?? "나",
          foeName: opponent?.name ?? shortAddress(duel.opponent),
          heroStartHp: duel.challenger.hp,
          foeStartHp: duel.defender.hp,
          rounds,
          won: duel.won,
          ratingDelta: duel.ratingDelta,
        })
        return
      }

      if (run) {
        const rounds = await replay(run)
        if (cancelled) return
        setBattle({
          key: `run-${run.seed}`,
          heroName: hero?.name ?? "나",
          foeName: `${run.foe.name} (${run.depth}층)`,
          heroStartHp: run.hero.hp,
          foeStartHp: run.foe.hp,
          rounds,
          won: run.won,
          reward: { xp: run.xpGained, gold: run.goldGained },
        })
        return
      }

      setBattle(undefined)
    })()

    return () => {
      cancelled = true
    }
  }, [focus, run, duel, hero?.name, ladder, replay, replayDuel])

  const onAction = useCallback(
    (action: ArenaAction) => {
      // Point the stage at whichever kind of fight this action produces, before
      // the refresh lands, so the replay does not flash the previous fight.
      if (action.kind === "duel") setFocus("duel")
      if (action.kind === "delve") setFocus("run")
      void send(action)
    },
    [send],
  )

  const deployed = arenaAddress !== undefined
  const connected = Boolean(wallet.account) && wallet.onRightChain
  const showLanding = !deployed || !connected
  const hasFunds = (wallet.balance ?? 0n) > 0n

  return (
    <div className="app">
      <Header wallet={wallet} />

      <main className="main">
        <div className="shell">
          {showLanding ? (
            <Landing wallet={wallet} deployed={deployed} ladderCount={ladder.length} />
          ) : !arena.ready ? (
            <div className="empty" style={{ padding: "60px 0" }}>
              체인에서 상태를 불러오는 중…
            </div>
          ) : !hero ? (
            <div style={{ maxWidth: 480, margin: "24px auto" }}>
              <CreateHero
                onCreate={(name) => onAction({ kind: "createHero", name })}
                busy={arena.busy === "createHero"}
                hasFunds={hasFunds}
              />
            </div>
          ) : (
            <div className="board" style={{ paddingTop: 14 }}>
              <div className="column">
                <HeroCard hero={hero} />
                <div className="tabpanel" hidden={tab !== "dungeon"} id="panel-dungeon" role="tabpanel">
                  <Dungeon hero={hero} battle={battle} busy={arena.busy} onAction={onAction} />
                </div>
              </div>

              <div className="column">
                <div className="tabpanel" hidden={tab !== "armory"} id="panel-armory" role="tabpanel">
                  <Armory hero={hero} busy={arena.busy} onAction={onAction} />
                </div>
                <div className="tabpanel" hidden={tab !== "ladder"} id="panel-ladder" role="tabpanel">
                  <Ladder
                    entries={ladder}
                    me={wallet.account}
                    hero={hero}
                    busy={arena.busy}
                    loading={arena.loading}
                    onAction={onAction}
                  />
                </div>
              </div>
            </div>
          )}

          {connected && !hasFunds && (
            <div style={{ marginTop: 14 }}>
              <Notice>
                이 계정의 PAS 잔액이 0입니다.{" "}
                <a href={FAUCET_URL} target="_blank" rel="noreferrer noopener">
                  faucet에서 받기 ↗
                </a>
              </Notice>
            </div>
          )}

          <footer className="footer">
            {arenaAddress !== undefined && (
              <>
                컨트랙트{" "}
                <ExplorerLink href={explorerAddress(arenaAddress)}>{shortAddress(arenaAddress)}</ExplorerLink> ·{" "}
                {polkadotHubTestnet.name}
                <br />
              </>
            )}
            전투 난수는 블록 해시에서 나옵니다 — 테스트넷 학습용이며 실제 자금에는 적합하지 않습니다.
          </footer>
        </div>
      </main>

      {hero && !showLanding && (
        <nav className="tabbar" role="tablist" aria-label="게임 화면">
          {TABS.map((entry) => (
            <button
              key={entry.id}
              className="tab"
              role="tab"
              aria-selected={tab === entry.id}
              aria-controls={`panel-${entry.id}`}
              onClick={() => setTab(entry.id)}
            >
              <span className="ico" aria-hidden="true">
                {entry.icon}
              </span>
              {entry.label}
              {entry.id === "ladder" && ladder.length > 0 && <span className="badge">{ladder.length}</span>}
            </button>
          ))}
        </nav>
      )}

      <TxToast tx={arena.tx} onDismiss={arena.dismissTx} />
    </div>
  )
}
