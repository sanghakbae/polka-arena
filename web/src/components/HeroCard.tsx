import { effectiveStats, xpForNextLevel, type Hero } from "../lib/arena"
import { Bar, Panel, Stat } from "./ui"

export function HeroCard({ hero }: { hero: Hero }) {
  const stats = effectiveStats(hero)
  const xpNeeded = xpForNextLevel(hero.level)
  const gearScore = hero.weapon + hero.armor + hero.trinket

  return (
    <Panel title="영웅" note={`${hero.wins}승 ${hero.losses}패`}>
      <div className="hero-top">
        <div className="avatar" aria-hidden="true">
          {hero.alive ? "🧝" : "💀"}
        </div>
        <div style={{ minWidth: 0 }}>
          <h3 className="hero-name">{hero.name}</h3>
          <div className="hero-meta">
            <span className="tag accent">Lv.{hero.level}</span>
            <span className="tag gold">{hero.gold} 골드</span>
            <span className="tag">최고 {hero.deepest}층</span>
            <span className="tag">점수 {hero.rating}</span>
            {!hero.alive && <span className="tag dead">사망</span>}
          </div>
        </div>
      </div>

      <div className="bars">
        <Bar value={hero.hp} max={hero.maxHp} label="체력" />
        <Bar
          kind="xp"
          value={Math.min(hero.xp, xpNeeded)}
          max={xpNeeded}
          label={hero.xp >= xpNeeded ? "경험치 · 레벨업 가능" : `경험치 · 다음 레벨까지 ${xpNeeded - hero.xp}`}
          readout={`${hero.xp} / ${xpNeeded}`}
        />
      </div>

      <div className="stats">
        <Stat k="공격" v={stats.atk} bonus={hero.weapon * 6} />
        <Stat k="방어" v={stats.def} bonus={hero.armor * 4} />
        <Stat k="치명타" v={`${(stats.luck / 10).toFixed(1)}%`} bonus={undefined} />
        <Stat k="장비 등급" v={`${gearScore} / 15`} />
      </div>

      <div style={{ marginTop: 12, fontSize: 12, color: "var(--text-faint)" }}>
        현재 위치: {hero.depth === 0 ? "지상 (입구)" : `${hero.depth}층`}
        {hero.alive && hero.depth > 0 && ` · 다음은 ${hero.depth + 1}층`}
      </div>
    </Panel>
  )
}
