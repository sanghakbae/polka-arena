import { explorerTx } from "../lib/chain"
import type { ArchivedFight } from "../lib/firestore"
import type { ArchiveState } from "../lib/useArchive"
import { ExplorerLink } from "./ExplorerLink"
import { Panel, shortAddress } from "./ui"

/// Fight history and season standings, both served from the off-chain archive.
/// The contract keeps only the newest fight, so without this there is no history
/// to show at all.
export function Archive({
  archive,
  onReplay,
  currentSeed,
}: {
  archive: ArchiveState
  onReplay: (fight: ArchivedFight) => void
  currentSeed: string | undefined
}) {
  const season = archive.seasons[0]

  return (
    <>
      <Panel
        title="전적"
        note={archive.loading ? "불러오는 중…" : archive.history.length > 0 ? `${archive.history.length}전` : undefined}
        tight
      >
        {archive.history.length === 0 ? (
          <div className="empty">
            {archive.loading
              ? "전적을 불러오는 중…"
              : "아직 기록된 전투가 없습니다. 인덱서가 다음 주기에 반영합니다."}
          </div>
        ) : (
          <div className="ladder">
            {archive.history.map((fight) => (
              <HistoryRow
                key={fight.id}
                fight={fight}
                active={currentSeed === fight.seed}
                onReplay={() => onReplay(fight)}
              />
            ))}
          </div>
        )}

        {archive.cursor !== undefined && (
          <div className="field-hint" style={{ padding: "10px 8px 4px" }}>
            {archive.cursor.toLocaleString()}번 블록까지 색인됨. 방금 끝낸 전투는 다음 색인 주기에 나타납니다.
          </div>
        )}
      </Panel>

      {season && (
        <Panel title={season.label} note={`${season.fightCount.toLocaleString()}전`} tight>
          {season.standings.length === 0 ? (
            <div className="empty">이번 시즌 기록이 아직 없습니다.</div>
          ) : (
            <div className="ladder">
              {season.standings.slice(0, 10).map((row) => (
                <div className="rowitem" key={row.address}>
                  <div className={row.rank <= 3 ? "rank top" : "rank"}>
                    {row.rank <= 3 ? ["🥇", "🥈", "🥉"][row.rank - 1] : row.rank}
                  </div>
                  <div className="who">
                    <div className="n">{shortAddress(row.address)}</div>
                    <div className="s">
                      최고 {row.deepest}층 · 탐험 {row.runs}회 · 결투 {row.duelWins}승 {row.duelLosses}패
                    </div>
                  </div>
                  <div className="right">
                    <div className="rating">
                      {row.deepest}
                      <small>층</small>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="field-hint" style={{ padding: "10px 8px 4px" }}>
            시즌 순위는 기간 내 기록만 집계합니다. 전체 점수 랭킹과는 별개입니다.
          </div>
        </Panel>
      )}
    </>
  )
}

function HistoryRow({
  fight,
  active,
  onReplay,
}: {
  fight: ArchivedFight
  active: boolean
  onReplay: () => void
}) {
  const foeName = fight.kind === "run" ? foeLabel(fight) : shortAddress(fight.opponent ?? "0x")
  const reward =
    fight.kind === "run"
      ? fight.won
        ? `+${fight.xpGained ?? 0} XP · +${fight.goldGained ?? 0}g`
        : "사망"
      : `${fight.won ? "+" : "−"}${fight.ratingDelta ?? 0} 점수`

  return (
    <div className={active ? "rowitem me" : "rowitem"}>
      <div className="rank" aria-hidden="true">
        {fight.won ? "✅" : "❌"}
      </div>
      <div className="who">
        <div className="n">
          {fight.kind === "run" ? "탐험" : "결투"} · {foeName}
        </div>
        <div className="s">
          {fight.rounds}라운드 · {reward} ·{" "}
          <ExplorerLink href={explorerTx(fight.txHash)}>#{fight.blockNumber.toLocaleString()}</ExplorerLink>
        </div>
      </div>
      <div className="right">
        <button className="btn sm" onClick={onReplay} title="이 전투를 다시 재생">
          재생
        </button>
      </div>
    </div>
  )
}

function foeLabel(fight: ArchivedFight): string {
  const named = fight.foe as { name?: string }
  if (named.name) return named.name
  return `${fight.depth ?? "?"}층`
}
