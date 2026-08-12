// Fills a freshly deployed local arena with rival heroes so the ladder and the
// duel buttons have something to act on while developing the UI.
//
//   npx hardhat --config hardhat.evm.config.js run scripts/seed-local.js --network localhost
const hre = require("hardhat");

const RIVALS = [
  { name: "카일렌", floors: 6, gear: [[0, 2]] },
  { name: "모르가나", floors: 4, gear: [[1, 2]] },
  { name: "브란도", floors: 8, gear: [[0, 1], [2, 1]] },
  { name: "실비아", floors: 2, gear: [] },
  { name: "테오", floors: 11, gear: [[0, 3], [1, 1]] },
];

async function main() {
  const { ethers } = hre;
  const address = process.env.ARENA_ADDRESS ?? "0x5FbDB2315678afecb367f032d93F642f64180aa3";
  const arena = await ethers.getContractAt("PolkaArena", address);
  const signers = await ethers.getSigners();

  console.log(`seeding ${address}`);

  for (const [i, rival] of RIVALS.entries()) {
    // Signer 0 is the player the frontend uses; rivals start at 1.
    const signer = signers[i + 1];
    if (!signer) break;

    const existing = await arena.heroOf(signer.address);
    if (!existing.exists) {
      await (await arena.connect(signer).createHero(rival.name)).wait();
    }

    for (let floor = 0; floor < rival.floors; floor++) {
      const hero = await arena.heroOf(signer.address);
      if (!hero.alive) break;
      await (await arena.connect(signer).delve()).wait();
    }

    // Spend whatever the descent earned, so rivals are not all naked.
    for (const [slot, tier] of rival.gear) {
      const hero = await arena.heroOf(signer.address);
      const cost = await arena.tierCost(tier);
      if (hero.alive && hero.gold >= cost) {
        await (await arena.connect(signer).equip(slot, tier)).wait();
      }
    }

    const hero = await arena.heroOf(signer.address);
    console.log(
      `  ${rival.name.padEnd(8)} Lv.${hero.level} 최고 ${hero.deepest}층 ` +
        `${hero.gold}g ${hero.alive ? "생존" : "사망"}`,
    );
  }

  // A few duels so the ladder has spread rather than everyone sitting at 1000.
  for (let i = 1; i <= 4; i++) {
    const challenger = signers[i];
    const defender = signers[i + 1];
    if (!challenger || !defender) break;
    const a = await arena.heroOf(challenger.address);
    if (!a.alive) continue;
    try {
      await (await arena.connect(challenger).duel(defender.address)).wait();
    } catch {
      // Cooldown or a dead defender; not worth failing the seed over.
    }
  }

  const size = await arena.rosterSize();
  console.log(`\nroster: ${size} heroes`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
