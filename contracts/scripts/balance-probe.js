// Measures how deep the dungeon actually lets people get.
//
// Plays every available signer through one life with a plain greedy strategy —
// level when you can, buy the best gear you can afford, rest when badly hurt —
// and reports the distribution of death floors. Tuning the numbers in
// PolkaArena.sol without running this is guesswork.
//
//   npx hardhat --config hardhat.evm.config.js run scripts/balance-probe.js
const hre = require("hardhat");

const MAX_FLOORS = 60;

async function main() {
  const { ethers } = hre;
  const Arena = await ethers.getContractFactory("PolkaArena");
  const arena = await Arena.deploy();
  await arena.waitForDeployment();

  const signers = await ethers.getSigners();
  const results = [];

  for (const [i, signer] of signers.entries()) {
    await (await arena.connect(signer).createHero(`probe${i}`)).wait();
    const outcome = await playOneLife(arena, signer);
    results.push(outcome);
  }

  report(results);
}

async function playOneLife(arena, signer) {
  let peakLevel = 1;
  let gearBought = 0;

  for (let floor = 0; floor < MAX_FLOORS; floor++) {
    let hero = await arena.heroOf(signer.address);
    if (!hero.alive) break;

    // Level up whenever it is affordable — it is strictly good.
    const needed = await arena.xpForNextLevel(hero.level);
    if (hero.xp >= needed) {
      await (await arena.connect(signer).levelUp()).wait();
      hero = await arena.heroOf(signer.address);
      peakLevel = Number(hero.level);
    }

    // Buy the best weapon then armor the purse allows, keeping a rest buffer.
    for (const slot of [0, 1]) {
      const owned = slot === 0 ? Number(hero.weapon) : Number(hero.armor);
      for (let tier = 5; tier > owned; tier--) {
        const cost = Number(await arena.tierCost(tier));
        const spare = Number(hero.gold) - (Number(hero.maxHp) - Number(hero.hp));
        if (spare >= cost) {
          await (await arena.connect(signer).equip(slot, tier)).wait();
          hero = await arena.heroOf(signer.address);
          gearBought++;
          break;
        }
      }
    }

    // Rest when under 60% and there is gold for it.
    if (hero.hp * 100n < hero.maxHp * 60n && hero.gold > 0n) {
      await (await arena.connect(signer).rest()).wait();
    }

    await (await arena.connect(signer).delve()).wait();
  }

  const hero = await arena.heroOf(signer.address);
  return {
    deepest: Number(hero.deepest),
    level: Math.max(peakLevel, Number(hero.level)),
    gearBought,
    survived: hero.alive,
  };
}

function report(results) {
  const depths = results.map((r) => r.deepest).sort((a, b) => a - b);
  const n = depths.length;
  const pick = (q) => depths[Math.min(n - 1, Math.floor(q * n))];
  const mean = depths.reduce((a, b) => a + b, 0) / n;

  console.log(`\n${n} runs, greedy strategy, cap ${MAX_FLOORS} floors\n`);
  console.log(`  deepest floor   min ${depths[0]}  p25 ${pick(0.25)}  median ${pick(0.5)}  p75 ${pick(0.75)}  max ${depths[n - 1]}`);
  console.log(`  mean            ${mean.toFixed(1)}`);
  console.log(`  peak level      ${(results.reduce((a, r) => a + r.level, 0) / n).toFixed(1)} avg`);
  console.log(`  gear purchases  ${(results.reduce((a, r) => a + r.gearBought, 0) / n).toFixed(1)} avg`);
  console.log(`  hit the cap     ${results.filter((r) => r.survived).length}/${n}`);

  const histogram = new Map();
  for (const d of depths) histogram.set(d, (histogram.get(d) ?? 0) + 1);
  console.log("\n  death floor histogram");
  for (const [depth, count] of [...histogram.entries()].sort((a, b) => a[0] - b[0])) {
    console.log(`    ${String(depth).padStart(3)} ${"█".repeat(count)}`);
  }
  console.log();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
