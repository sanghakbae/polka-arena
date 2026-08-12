const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture, mine } = require("@nomicfoundation/hardhat-network-helpers");

describe("PolkaArena", function () {
  async function deployFixture() {
    const [alice, bob, carol] = await ethers.getSigners();
    const Arena = await ethers.getContractFactory("PolkaArena");
    const arena = await Arena.deploy();
    return { arena, alice, bob, carol };
  }

  /// Pushes the hero down until they die or we hit the cap, returning the floor reached.
  async function delveUntilDead(arena, signer, cap = 40) {
    for (let i = 0; i < cap; i++) {
      await arena.connect(signer).delve();
      const hero = await arena.heroes(signer.address);
      if (!hero.alive) return Number(hero.depth);
    }
    return null;
  }

  describe("hero creation", function () {
    it("rolls a hero inside the advertised stat ranges", async function () {
      const { arena, alice } = await loadFixture(deployFixture);
      await arena.connect(alice).createHero("Ada");

      const hero = await arena.heroes(alice.address);
      expect(hero.exists).to.equal(true);
      expect(hero.alive).to.equal(true);
      expect(hero.name).to.equal("Ada");
      expect(hero.level).to.equal(1);
      expect(hero.gold).to.equal(100);
      expect(hero.rating).to.equal(1000);
      expect(hero.hp).to.equal(hero.maxHp);
      expect(Number(hero.maxHp)).to.be.within(80, 120);
      expect(Number(hero.atk)).to.be.within(10, 16);
      expect(Number(hero.def)).to.be.within(4, 9);
    });

    it("refuses a second hero and rejects bad names", async function () {
      const { arena, alice, bob } = await loadFixture(deployFixture);
      await arena.connect(alice).createHero("Ada");

      await expect(arena.connect(alice).createHero("Ada2")).to.be.revertedWithCustomError(arena, "HeroExists");
      await expect(arena.connect(bob).createHero("")).to.be.revertedWithCustomError(arena, "BadName");
      await expect(
        arena.connect(bob).createHero("a-name-far-too-long-to-fit"),
      ).to.be.revertedWithCustomError(arena, "BadName");
    });

    it("adds each hero to the roster exactly once", async function () {
      const { arena, alice, bob } = await loadFixture(deployFixture);
      await arena.connect(alice).createHero("Ada");
      await arena.connect(bob).createHero("Grace");

      expect(await arena.rosterSize()).to.equal(2);
      const [addrs, records] = await arena.ladder(0, 10);
      expect(addrs).to.deep.equal([alice.address, bob.address]);
      expect(records[1].name).to.equal("Grace");
    });
  });

  describe("combat simulation", function () {
    it("is deterministic: the same seed always yields the same fight", async function () {
      const { arena } = await loadFixture(deployFixture);
      const seed = ethers.keccak256(ethers.toUtf8Bytes("fixed-seed"));
      const hero = { hp: 100, atk: 14, def: 6, luck: 50 };
      const foe = { hp: 60, atk: 9, def: 4, luck: 30 };

      const a = await arena.simulate(seed, hero, foe);
      const b = await arena.simulate(seed, hero, foe);
      expect(a.fought).to.equal(b.fought);
      expect(a.heroWon).to.equal(b.heroWon);
      expect(a.heroHp).to.equal(b.heroHp);
      expect(a.rounds.map((r) => r.heroDamage)).to.deep.equal(b.rounds.map((r) => r.heroDamage));
    });

    it("returns exactly as many rounds as were fought, never more than MAX_ROUNDS", async function () {
      const { arena } = await loadFixture(deployFixture);
      const maxRounds = Number(await arena.MAX_ROUNDS());

      for (let i = 0; i < 8; i++) {
        const seed = ethers.keccak256(ethers.toUtf8Bytes(`seed-${i}`));
        const res = await arena.simulate(seed, { hp: 90, atk: 12, def: 5, luck: 50 }, { hp: 80, atk: 11, def: 5, luck: 40 });
        expect(res.rounds.length).to.equal(Number(res.fought));
        expect(res.rounds.length).to.be.at.most(maxRounds);
        expect(res.rounds.length).to.be.at.least(1);
      }
    });

    it("keeps the round log consistent with the reported result", async function () {
      const { arena } = await loadFixture(deployFixture);
      const seed = ethers.keccak256(ethers.toUtf8Bytes("consistency"));
      const res = await arena.simulate(seed, { hp: 100, atk: 13, def: 6, luck: 50 }, { hp: 70, atk: 10, def: 4, luck: 40 });

      const last = res.rounds[res.rounds.length - 1];
      expect(last.heroHp).to.equal(res.heroHp);
      // A win means the foe hit zero; a loss means the hero did, unless we timed out.
      if (res.heroWon) {
        expect(last.foeHp).to.equal(0);
        expect(Number(last.heroHp)).to.be.greaterThan(0);
      } else {
        expect(Number(last.foeHp)).to.be.greaterThan(0);
      }
    });

    it("always lands at least 1 damage, even against absurd armor", async function () {
      const { arena } = await loadFixture(deployFixture);
      const seed = ethers.keccak256(ethers.toUtf8Bytes("armor"));
      const res = await arena.simulate(seed, { hp: 100, atk: 1, def: 0, luck: 0 }, { hp: 50, atk: 1, def: 60000, luck: 0 });
      expect(Number(res.rounds[0].heroDamage)).to.be.at.least(1);
    });

    it("gives a big enough hero a guaranteed win", async function () {
      const { arena } = await loadFixture(deployFixture);
      const seed = ethers.keccak256(ethers.toUtf8Bytes("overkill"));
      const res = await arena.simulate(seed, { hp: 5000, atk: 900, def: 400, luck: 0 }, { hp: 40, atk: 3, def: 2, luck: 0 });
      expect(res.heroWon).to.equal(true);
      expect(res.fought).to.equal(1);
    });
  });

  describe("foe scaling", function () {
    it("makes deeper floors harder", async function () {
      const { arena } = await loadFixture(deployFixture);
      const seed = ethers.keccak256(ethers.toUtf8Bytes("scaling"));
      const shallow = await arena.foeFor(1, seed);
      const deep = await arena.foeFor(12, seed);

      expect(Number(deep.hp)).to.be.greaterThan(Number(shallow.hp));
      expect(Number(deep.atk)).to.be.greaterThan(Number(shallow.atk));
      expect(Number(deep.gold)).to.be.greaterThan(Number(shallow.gold));
    });

    it("puts a champion on every fifth floor", async function () {
      const { arena } = await loadFixture(deployFixture);
      const seed = ethers.keccak256(ethers.toUtf8Bytes("champion"));
      const normal = await arena.foeFor(4, seed);
      const champion = await arena.foeFor(5, seed);

      expect(champion.name).to.contain("Floor 5");
      expect(Number(champion.xp)).to.be.greaterThan(Number(normal.xp) * 2);
      expect(normal.name).to.not.contain("Floor");
    });
  });

  describe("the dungeon", function () {
    it("requires a living hero", async function () {
      const { arena, alice } = await loadFixture(deployFixture);
      await expect(arena.connect(alice).delve()).to.be.revertedWithCustomError(arena, "NoHero");
    });

    it("advances the floor and pays out on a win", async function () {
      const { arena, alice } = await loadFixture(deployFixture);
      await arena.connect(alice).createHero("Ada");
      await arena.connect(alice).delve();

      const hero = await arena.heroes(alice.address);
      const run = await arena.lastRun(alice.address);

      expect(run.depth).to.equal(1);
      if (run.won) {
        expect(hero.depth).to.equal(1);
        expect(hero.deepest).to.equal(1);
        expect(Number(hero.xp)).to.equal(Number(run.xpGained));
        expect(Number(hero.gold)).to.equal(100 + Number(run.goldGained));
        expect(hero.alive).to.equal(true);
      } else {
        expect(hero.alive).to.equal(false);
        expect(hero.hp).to.equal(0);
      }
    });

    it("records a run the client can replay to the same result", async function () {
      const { arena, alice } = await loadFixture(deployFixture);
      await arena.connect(alice).createHero("Ada");
      await arena.connect(alice).delve();

      const run = await arena.lastRun(alice.address);
      const replay = await arena.simulate(
        run.seed,
        { hp: run.hero.hp, atk: run.hero.atk, def: run.hero.def, luck: run.hero.luck },
        { hp: run.foe.hp, atk: run.foe.atk, def: run.foe.def, luck: run.foe.luck },
      );

      expect(replay.heroWon).to.equal(run.won);
      expect(replay.fought).to.equal(run.rounds);
      expect(replay.heroHp).to.equal(run.heroHpLeft);
    });

    it("emits enough in the log to replay the fight without any stored state", async function () {
      // This is the property the off-chain archive depends on: `lastRun` holds only
      // the newest fight, so an indexer has to rebuild older ones from logs alone.
      const { arena, alice } = await loadFixture(deployFixture);
      await arena.connect(alice).createHero("Ada");

      const tx = await arena.connect(alice).delve();
      const receipt = await tx.wait();
      const event = receipt.logs
        .map((log) => {
          try {
            return arena.interface.parseLog(log);
          } catch {
            return null;
          }
        })
        .find((parsed) => parsed?.name === "Delved");

      expect(event, "no Delved event").to.not.equal(undefined);
      const { seed, hero, foe, won, rounds } = event.args;

      const replay = await arena.simulate(
        seed,
        { hp: hero.hp, atk: hero.atk, def: hero.def, luck: hero.luck },
        { hp: foe.hp, atk: foe.atk, def: foe.def, luck: foe.luck },
      );

      expect(replay.heroWon).to.equal(won);
      expect(replay.fought).to.equal(rounds);
      expect(replay.rounds.length).to.equal(Number(rounds));
    });

    it("produces different fights on back-to-back calls in the same block", async function () {
      const { arena, alice } = await loadFixture(deployFixture);
      await arena.connect(alice).createHero("Ada");

      await arena.connect(alice).delve();
      const first = await arena.lastRun(alice.address);
      const hero = await arena.heroes(alice.address);
      if (!hero.alive) return; // died on floor 1; nothing to compare

      await arena.connect(alice).delve();
      const second = await arena.lastRun(alice.address);
      expect(second.seed).to.not.equal(first.seed);
    });

    it("kills the hero eventually — the dungeon always wins", async function () {
      const { arena, alice } = await loadFixture(deployFixture);
      await arena.connect(alice).createHero("Ada");

      const deathFloor = await delveUntilDead(arena, alice);
      expect(deathFloor, "hero survived 40 floors with no upgrades").to.not.equal(null);

      const hero = await arena.heroes(alice.address);
      expect(hero.alive).to.equal(false);
      await expect(arena.connect(alice).delve()).to.be.revertedWithCustomError(arena, "HeroDead");
    });
  });

  describe("death and recovery", function () {
    it("revives at half health, halves the purse, and resets the descent", async function () {
      const { arena, alice } = await loadFixture(deployFixture);
      await arena.connect(alice).createHero("Ada");
      await delveUntilDead(arena, alice);

      const before = await arena.heroes(alice.address);
      await arena.connect(alice).revive();
      const after = await arena.heroes(alice.address);

      expect(after.alive).to.equal(true);
      expect(after.depth).to.equal(0);
      expect(after.hp).to.equal(before.maxHp / 2n);
      expect(after.gold).to.equal(before.gold / 2n);
      expect(after.deepest).to.equal(before.deepest); // the record survives death
    });

    it("will not revive a living hero", async function () {
      const { arena, alice } = await loadFixture(deployFixture);
      await arena.connect(alice).createHero("Ada");
      await expect(arena.connect(alice).revive()).to.be.revertedWithCustomError(arena, "HeroAlive");
    });
  });

  describe("resting", function () {
    it("heals to full when the hero can afford it", async function () {
      const { arena, alice } = await loadFixture(deployFixture);
      await arena.connect(alice).createHero("Ada");
      await arena.connect(alice).delve();

      let hero = await arena.heroes(alice.address);
      if (!hero.alive || hero.hp === hero.maxHp) return;

      const perHp = await arena.REST_GOLD_PER_HP();
      const missing = hero.maxHp - hero.hp;
      if (hero.gold < missing * perHp) return; // covered by the partial-rest test

      await arena.connect(alice).rest();
      hero = await arena.heroes(alice.address);
      expect(hero.hp).to.equal(hero.maxHp);
    });

    it("rejects resting at full health", async function () {
      const { arena, alice } = await loadFixture(deployFixture);
      await arena.connect(alice).createHero("Ada");
      await expect(arena.connect(alice).rest()).to.be.revertedWithCustomError(arena, "AtFullHealth");
    });
  });

  describe("levelling", function () {
    it("charges a rising xp price per level", async function () {
      const { arena } = await loadFixture(deployFixture);
      const l1 = Number(await arena.xpForNextLevel(1));
      const l2 = Number(await arena.xpForNextLevel(2));
      const l5 = Number(await arena.xpForNextLevel(5));
      expect(l2).to.be.greaterThan(l1);
      expect(l5 - l2).to.be.greaterThan(l2 - l1);
    });

    it("refuses to level up without the xp", async function () {
      const { arena, alice } = await loadFixture(deployFixture);
      await arena.connect(alice).createHero("Ada");
      await expect(arena.connect(alice).levelUp()).to.be.revertedWithCustomError(arena, "NotEnoughXp");
    });
  });

  describe("equipment", function () {
    it("raises the stats the fight actually uses", async function () {
      const { arena, alice } = await loadFixture(deployFixture);
      await arena.connect(alice).createHero("Ada");

      const before = await arena.effectiveStats(alice.address);
      await arena.connect(alice).equip(0, 1); // weapon tier 1, costs 60 of the starting 100
      const after = await arena.effectiveStats(alice.address);

      expect(Number(after.atk)).to.equal(Number(before.atk) + 6);
      expect((await arena.heroes(alice.address)).gold).to.equal(40);
    });

    it("validates slot, tier, downgrades and price", async function () {
      const { arena, alice } = await loadFixture(deployFixture);
      await arena.connect(alice).createHero("Ada");

      await expect(arena.connect(alice).equip(3, 1)).to.be.revertedWithCustomError(arena, "BadSlot");
      await expect(arena.connect(alice).equip(0, 0)).to.be.revertedWithCustomError(arena, "BadTier");
      await expect(arena.connect(alice).equip(0, 6)).to.be.revertedWithCustomError(arena, "BadTier");
      await expect(arena.connect(alice).equip(0, 3)).to.be.revertedWithCustomError(arena, "NotEnoughGold");

      await arena.connect(alice).equip(0, 1);
      await expect(arena.connect(alice).equip(0, 1)).to.be.revertedWithCustomError(arena, "NoDowngrade");
    });
  });

  describe("pvp", function () {
    it("moves rating in opposite directions and records the duel", async function () {
      const { arena, alice, bob } = await loadFixture(deployFixture);
      await arena.connect(alice).createHero("Ada");
      await arena.connect(bob).createHero("Grace");

      await arena.connect(alice).duel(bob.address);

      const a = await arena.heroes(alice.address);
      const b = await arena.heroes(bob.address);
      const duel = await arena.lastDuel(alice.address);

      expect(duel.opponent).to.equal(bob.address);
      expect(Number(a.wins) + Number(a.losses)).to.equal(1);
      expect(Number(b.wins) + Number(b.losses)).to.equal(1);
      expect(Number(a.rating) + Number(b.rating)).to.equal(2000); // rating is conserved
      expect(duel.won).to.equal(a.wins === 1n);
    });

    it("fights at full health regardless of dungeon damage", async function () {
      const { arena, alice, bob } = await loadFixture(deployFixture);
      await arena.connect(alice).createHero("Ada");
      await arena.connect(bob).createHero("Grace");
      await arena.connect(alice).delve();

      const hero = await arena.heroes(alice.address);
      if (!hero.alive) return;

      await arena.connect(alice).duel(bob.address);
      const duel = await arena.lastDuel(alice.address);
      expect(duel.challenger.hp).to.equal(hero.maxHp);
    });

    it("emits enough in the log to replay the duel", async function () {
      const { arena, alice, bob } = await loadFixture(deployFixture);
      await arena.connect(alice).createHero("Ada");
      await arena.connect(bob).createHero("Grace");

      const receipt = await (await arena.connect(alice).duel(bob.address)).wait();
      const event = receipt.logs
        .map((log) => {
          try {
            return arena.interface.parseLog(log);
          } catch {
            return null;
          }
        })
        .find((parsed) => parsed?.name === "Dueled");

      expect(event, "no Dueled event").to.not.equal(undefined);
      const { seed, challengerStats, defenderStats, challengerWon, rounds } = event.args;

      const replay = await arena.simulate(
        seed,
        { hp: challengerStats.hp, atk: challengerStats.atk, def: challengerStats.def, luck: challengerStats.luck },
        { hp: defenderStats.hp, atk: defenderStats.atk, def: defenderStats.def, luck: defenderStats.luck },
      );

      expect(replay.heroWon).to.equal(challengerWon);
      expect(replay.fought).to.equal(rounds);
    });

    it("rejects self-duels, unknown opponents, and two duels in one block", async function () {
      const { arena, alice, bob, carol } = await loadFixture(deployFixture);
      await arena.connect(alice).createHero("Ada");
      await arena.connect(bob).createHero("Grace");

      await expect(arena.connect(alice).duel(alice.address)).to.be.revertedWithCustomError(arena, "SelfDuel");
      await expect(arena.connect(alice).duel(carol.address)).to.be.revertedWithCustomError(arena, "NoHero");

      await arena.connect(alice).duel(bob.address);
      await expect(arena.connect(alice).duel(bob.address)).to.be.revertedWithCustomError(arena, "DuelTooSoon");
    });

    it("allows another duel once the cooldown has elapsed", async function () {
      const { arena, alice, bob } = await loadFixture(deployFixture);
      await arena.connect(alice).createHero("Ada");
      await arena.connect(bob).createHero("Grace");

      await arena.connect(alice).duel(bob.address);
      await mine(Number(await arena.DUEL_COOLDOWN_BLOCKS()));
      await expect(arena.connect(alice).duel(bob.address)).to.not.be.reverted;
    });

    it("pays more for an upset than for punching down", async function () {
      const { arena } = await loadFixture(deployFixture);

      const upset = Number(await arena.ratingDelta(1000, 1600, true)); // beat someone far above
      const even = Number(await arena.ratingDelta(1000, 1000, true));
      const punchDown = Number(await arena.ratingDelta(1600, 1000, true)); // beat someone far below

      expect(upset).to.be.greaterThan(even);
      expect(even).to.be.greaterThan(punchDown);
      expect(punchDown).to.be.at.least(1); // never zero, so the ladder always moves
    });

    it("never moves rating by zero, at any gap", async function () {
      const { arena } = await loadFixture(deployFixture);
      for (const [c, d] of [[0, 0], [0, 5000], [5000, 0], [1000, 1020], [1020, 1000]]) {
        expect(Number(await arena.ratingDelta(c, d, true)), `win ${c} vs ${d}`).to.be.at.least(1);
        expect(Number(await arena.ratingDelta(c, d, false)), `loss ${c} vs ${d}`).to.be.at.least(1);
      }
    });
  });

  describe("ladder paging", function () {
    it("pages and clamps out-of-range requests", async function () {
      const { arena, alice, bob } = await loadFixture(deployFixture);
      await arena.connect(alice).createHero("Ada");
      await arena.connect(bob).createHero("Grace");

      const [firstPage] = await arena.ladder(0, 1);
      expect(firstPage.length).to.equal(1);

      const [clamped] = await arena.ladder(1, 50);
      expect(clamped.length).to.equal(1);

      const [empty] = await arena.ladder(99, 10);
      expect(empty.length).to.equal(0);
    });
  });
});
