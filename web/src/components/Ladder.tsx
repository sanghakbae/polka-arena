import type { Address } from "viem"
import { explorerAddress } from "../lib/chain"
import type { Hero, LadderEntry } from "../lib/arena"
import type { ArenaAction } from "../lib/useArena"
import { ExplorerLink } from "./ExplorerLink"
import { Panel, Spinner, shortAddress } from "./ui"

export function Ladder({
  entries,
  me,
  hero,
  busy,
  loading,
  onAction,
}: {
  entries: LadderEntry[]
  me: Address | undefined
  hero: Hero | undefined
  busy: ArenaAction["kind"] | undefined
  loading: boolean
  onAction: (action: ArenaAction) => void
}) {
  const anyBusy = busy !== undefined

  return (
    <Panel title="랭킹" note={loading ? "불러오는 중…" : `${entries.length}명`} tight>
      {entries.length === 0 ? (
        <div className="empty">
          {loading ? "랭킹을 불러오는 중…" : "아직 등록된 영웅이 없습니다. 첫 번째가 되어보세요."}
        </div>
      ) : (
        <div className="ladder">
          {entries.map((entry) => {
            const isMe = me !== undefined && entry.address.toLowerCase() === me.toLowerCase()
            const canDuel = Boolean(hero?.alive) && !isMe && !anyBusy

            return (
              <div className={isMe ? "rowitem me" : "rowitem"} key={entry.address}>
                <div className={entry.rank <= 3 ? "rank top" : "rank"}>
                  {entry.rank <= 3 ? ["🥇", "🥈", "🥉"][entry.rank - 1] : entry.rank}
                </div>

                <div className="who">
                  <div className="n">
                    {entry.name}
                    {isMe && <span style={{ color: "var(--accent-soft)", fontSize: 11 }}> · 나</span>}
                    {!entry.alive && <span style={{ color: "var(--text-faint)", fontSize: 11 }}> 💀</span>}
                  </div>
                  <div className="s">
                    Lv.{entry.level} · 최고 {entry.deepest}층 · {entry.wins}승 {entry.losses}패 ·{" "}
                    <ExplorerLink href={explorerAddress(entry.address)}>
                      {shortAddress(entry.address)}
                    </ExplorerLink>
                  </div>
                </div>

                <div className="right">
                  <div className="rating">
                    {entry.rating}
                    <small>점수</small>
                  </div>
                  {!isMe && (
                    <button
                      className="btn sm"
                      disabled={!canDuel}
                      onClick={() => onAction({ kind: "duel", opponent: entry.address })}
                      title={
                        !hero
                          ? "먼저 영웅을 만들어주세요"
                          : !hero.alive
                            ? "사망 상태에서는 도전할 수 없습니다"
                            : `${entry.name}에게 도전`
                      }
                    >
                      {busy === "duel" ? <Spinner /> : "도전"}
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      <div className="field-hint" style={{ padding: "10px 8px 4px" }}>
        결투는 양쪽 모두 최대 체력으로 시작하므로, 순위는 휴식 상태가 아니라 빌드를 반영합니다. 도전 사이에는 3블록의
        쿨다운이 있습니다.
      </div>
    </Panel>
  )
}
