// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @title Polka Arena — an on-chain dungeon crawler with a PvP ladder.
/// @notice Every fight is resolved by a pure function from a single seed, so the
///         frontend can replay the exact same rounds it will get on-chain. The
///         chain decides; the browser only animates.
///
/// RANDOMNESS WARNING: seeds are derived from `blockhash`, which block producers
/// can influence by choosing whether to publish a block. That is acceptable for
/// a testnet toy. Do NOT put real value behind this — a production game needs a
/// commit-reveal scheme or a VRF.
contract PolkaArena {
    // ---------------------------------------------------------------- types

    struct Hero {
        bool exists;
        bool alive;
        uint8 level;
        uint8 weapon; // equipment tier, 0 = none
        uint8 armor;
        uint8 trinket;
        uint16 hp; // current hp, carried between floors
        uint16 maxHp;
        uint16 atk;
        uint16 def;
        uint16 luck; // crit chance in per-mille (1000 = always)
        uint32 xp;
        uint32 gold;
        uint32 depth; // current dungeon floor
        uint32 deepest; // best floor ever reached
        uint32 wins; // pvp wins
        uint32 losses;
        uint32 rating;
        string name;
    }

    struct Foe {
        uint16 hp;
        uint16 atk;
        uint16 def;
        uint16 luck;
        uint32 xp;
        uint32 gold;
        string name;
    }

    /// @dev One exchange of blows. Both sides swing every round; the hero swings first.
    struct Round {
        uint16 heroDamage;
        uint16 foeDamage;
        uint16 heroHp; // hp remaining after the round
        uint16 foeHp;
        bool heroCrit;
        bool foeCrit;
    }

    struct Combatant {
        uint16 hp;
        uint16 atk;
        uint16 def;
        uint16 luck;
    }

    /// @dev The record of the last dungeon fight, enough for the client to replay it.
    struct Run {
        bytes32 seed;
        uint32 depth;
        Combatant hero; // hero stats as they entered the fight
        Foe foe;
        bool won;
        bool died;
        uint8 rounds;
        uint16 heroHpLeft;
        uint32 xpGained;
        uint32 goldGained;
    }

    /// @dev The record of the last PvP duel.
    struct Duel {
        bytes32 seed;
        address opponent;
        Combatant challenger;
        Combatant defender;
        bool won;
        uint8 rounds;
        uint32 ratingDelta;
    }

    // ------------------------------------------------------------ constants

    uint8 public constant MAX_ROUNDS = 16;
    uint8 public constant MAX_TIER = 5;
    uint16 public constant BASE_LUCK = 50; // 5% crit

    /// @dev Blocks a challenger must wait between duels. Without a real gap the
    ///      limit is meaningless — one transaction per block already advances
    ///      `block.number`, so a same-block check never fires.
    uint64 public constant DUEL_COOLDOWN_BLOCKS = 3;

    /// @dev Gold per hit point at the surface inn.
    uint32 public constant REST_GOLD_PER_HP = 1;

    /// @dev Equipment cost per tier (index 0 unused — tier 0 is "nothing equipped").
    uint32[6] private TIER_COST = [0, 60, 180, 450, 1000, 2200];

    // -------------------------------------------------------------- storage

    mapping(address => Hero) public heroes;
    mapping(address => Run) private runs;
    mapping(address => Duel) private duels;
    mapping(address => uint64) private nonces;
    mapping(address => uint64) public lastDuelBlock;

    address[] public roster;

    // --------------------------------------------------------------- events

    event HeroCreated(address indexed player, string name, uint16 maxHp, uint16 atk, uint16 def);
    event Delved(address indexed player, uint32 depth, bool won, bool died, uint32 xp, uint32 gold);
    event LeveledUp(address indexed player, uint8 level, uint16 maxHp, uint16 atk, uint16 def);
    event Equipped(address indexed player, uint8 slot, uint8 tier, uint32 cost);
    event Rested(address indexed player, uint16 healed, uint32 cost);
    event Revived(address indexed player, uint32 depthLost);
    event Dueled(address indexed challenger, address indexed defender, bool challengerWon, uint32 ratingDelta);

    // ---------------------------------------------------------------- errors

    error NoHero();
    error HeroExists();
    error HeroDead();
    error HeroAlive();
    error NotEnoughGold(uint32 have, uint32 need);
    error NotEnoughXp(uint32 have, uint32 need);
    error BadName();
    error BadSlot();
    error BadTier();
    error NoDowngrade();
    error AtFullHealth();
    error SelfDuel();
    error DuelTooSoon();

    // ------------------------------------------------------------ hero setup

    /// @notice Roll a new hero. Stats are seeded, so no two heroes start identical.
    function createHero(string calldata name) external {
        if (heroes[msg.sender].exists) revert HeroExists();
        uint256 len = bytes(name).length;
        if (len == 0 || len > 24) revert BadName();

        bytes32 seed = _seed();
        uint16 maxHp = uint16(80 + _roll(seed, 1, 41)); // 80..120
        uint16 atk = uint16(10 + _roll(seed, 2, 7)); //  10..16
        uint16 def = uint16(4 + _roll(seed, 3, 6)); //   4..9

        heroes[msg.sender] = Hero({
            exists: true,
            alive: true,
            level: 1,
            weapon: 0,
            armor: 0,
            trinket: 0,
            hp: maxHp,
            maxHp: maxHp,
            atk: atk,
            def: def,
            luck: BASE_LUCK,
            xp: 0,
            gold: 100,
            depth: 0,
            deepest: 0,
            wins: 0,
            losses: 0,
            rating: 1000,
            name: name
        });
        roster.push(msg.sender);

        emit HeroCreated(msg.sender, name, maxHp, atk, def);
    }

    // ---------------------------------------------------------- the dungeon

    /// @notice Descend one floor and fight whatever lives there.
    /// @dev The hero keeps their damage between floors — that is the whole tension:
    ///      push deeper for better loot, or spend gold resting before you die.
    function delve() external returns (bool won, bool died) {
        Hero storage h = heroes[msg.sender];
        if (!h.exists) revert NoHero();
        if (!h.alive) revert HeroDead();

        uint32 depth = h.depth + 1;
        bytes32 seed = _seed();
        Foe memory foe = foeFor(depth, seed);

        Combatant memory hero = Combatant(h.hp, _totalAtk(h), _totalDef(h), _totalLuck(h));
        (, uint8 rounds, uint16 heroHpLeft, bool heroWon) =
            simulate(seed, hero, Combatant(foe.hp, foe.atk, foe.def, foe.luck));

        uint32 xpGained;
        uint32 goldGained;

        if (heroWon) {
            xpGained = foe.xp;
            goldGained = foe.gold;
            h.xp += xpGained;
            h.gold += goldGained;

            // Second wind: clearing a floor patches the hero up a little. Without
            // it, carried-over damage made every run end by floor 2 no matter how
            // the player spent their gold.
            uint16 secondWind = h.maxHp / 10 + 2;
            uint16 healed = heroHpLeft + secondWind;
            h.hp = healed > h.maxHp ? h.maxHp : healed;

            h.depth = depth;
            if (depth > h.deepest) h.deepest = depth;
        } else {
            // A loss is death: the run ends and the hero must be revived.
            h.hp = 0;
            h.alive = false;
        }

        runs[msg.sender] = Run({
            seed: seed,
            depth: depth,
            hero: hero,
            foe: foe,
            won: heroWon,
            died: !heroWon,
            rounds: rounds,
            heroHpLeft: heroHpLeft,
            xpGained: xpGained,
            goldGained: goldGained
        });

        emit Delved(msg.sender, depth, heroWon, !heroWon, xpGained, goldGained);
        return (heroWon, !heroWon);
    }

    /// @notice Bring a dead hero back. The dungeon keeps the progress you had.
    function revive() external {
        Hero storage h = heroes[msg.sender];
        if (!h.exists) revert NoHero();
        if (h.alive) revert HeroAlive();

        uint32 lost = h.depth;
        h.alive = true;
        h.depth = 0; // start the descent again from the surface
        h.hp = h.maxHp / 2; // and you come back weakened
        h.gold = h.gold / 2; // death is expensive

        emit Revived(msg.sender, lost);
    }

    /// @notice Heal at the surface. Costs 1 gold per hit point.
    function rest() external {
        Hero storage h = heroes[msg.sender];
        if (!h.exists) revert NoHero();
        if (!h.alive) revert HeroDead();
        if (h.hp >= h.maxHp) revert AtFullHealth();

        uint16 missing = h.maxHp - h.hp;
        uint32 cost = uint32(missing) * REST_GOLD_PER_HP;
        if (h.gold < cost) {
            // Heal as much as the purse allows rather than reverting on a partial rest.
            missing = uint16(h.gold / REST_GOLD_PER_HP);
            cost = uint32(missing) * REST_GOLD_PER_HP;
            if (missing == 0) revert NotEnoughGold(h.gold, REST_GOLD_PER_HP);
        }

        h.gold -= cost;
        h.hp += missing;
        emit Rested(msg.sender, missing, cost);
    }

    // ------------------------------------------------------- growth & gear

    /// @notice Spend xp to gain a level. Each level costs more than the last.
    function levelUp() external {
        Hero storage h = heroes[msg.sender];
        if (!h.exists) revert NoHero();
        if (!h.alive) revert HeroDead();

        uint32 cost = xpForNextLevel(h.level);
        if (h.xp < cost) revert NotEnoughXp(h.xp, cost);

        bytes32 seed = _seed();
        h.xp -= cost;
        h.level += 1;

        uint16 hpGain = uint16(8 + _roll(seed, 1, 8)); // 8..15
        h.maxHp += hpGain;
        h.hp += hpGain; // leveling patches you up by the same amount
        h.atk += uint16(1 + _roll(seed, 2, 3)); // 1..3
        h.def += uint16(_roll(seed, 3, 3)); // 0..2
        h.luck += 3;

        emit LeveledUp(msg.sender, h.level, h.maxHp, h.atk, h.def);
    }

    /// @notice Buy gear for a slot. 0 = weapon (atk), 1 = armor (def+hp), 2 = trinket (luck).
    /// @dev Tiers only go up; you pay the full price of the new tier.
    function equip(uint8 slot, uint8 tier) external {
        Hero storage h = heroes[msg.sender];
        if (!h.exists) revert NoHero();
        if (!h.alive) revert HeroDead();
        if (slot > 2) revert BadSlot();
        if (tier == 0 || tier > MAX_TIER) revert BadTier();

        uint8 current = slot == 0 ? h.weapon : slot == 1 ? h.armor : h.trinket;
        if (tier <= current) revert NoDowngrade();

        uint32 cost = TIER_COST[tier];
        if (h.gold < cost) revert NotEnoughGold(h.gold, cost);
        h.gold -= cost;

        if (slot == 0) h.weapon = tier;
        else if (slot == 1) h.armor = tier;
        else h.trinket = tier;

        emit Equipped(msg.sender, slot, tier, cost);
    }

    // ------------------------------------------------------------------ pvp

    /// @notice Challenge another player's hero. Both fight at full health, so the
    ///         ladder measures builds rather than who happens to be rested.
    function duel(address defender) external returns (bool won) {
        Hero storage a = heroes[msg.sender];
        Hero storage d = heroes[defender];
        if (!a.exists) revert NoHero();
        if (!d.exists) revert NoHero();
        if (defender == msg.sender) revert SelfDuel();
        if (!a.alive) revert HeroDead();

        uint64 last = lastDuelBlock[msg.sender];
        if (last != 0 && block.number < last + DUEL_COOLDOWN_BLOCKS) revert DuelTooSoon();

        bytes32 seed = _seed();
        Combatant memory ca = Combatant(a.maxHp, _totalAtk(a), _totalDef(a), _totalLuck(a));
        Combatant memory cd = Combatant(d.maxHp, _totalAtk(d), _totalDef(d), _totalLuck(d));

        (, uint8 rounds,, bool challengerWon) = simulate(seed, ca, cd);

        // Elo-lite: beating someone rated above you is worth more.
        uint32 delta = ratingDelta(a.rating, d.rating, challengerWon);

        if (challengerWon) {
            a.wins += 1;
            d.losses += 1;
            a.rating += delta;
            d.rating = d.rating > delta ? d.rating - delta : 0;
            a.gold += 25;
        } else {
            a.losses += 1;
            d.wins += 1;
            d.rating += delta;
            a.rating = a.rating > delta ? a.rating - delta : 0;
        }

        lastDuelBlock[msg.sender] = uint64(block.number);
        duels[msg.sender] = Duel({
            seed: seed,
            opponent: defender,
            challenger: ca,
            defender: cd,
            won: challengerWon,
            rounds: rounds,
            ratingDelta: delta
        });

        emit Dueled(msg.sender, defender, challengerWon, delta);
        return challengerWon;
    }

    // ----------------------------------------------------------- simulation

    /// @notice Resolve a fight. Pure, so the client can call it to replay any seed
    ///         blow for blow and get exactly what the chain got.
    /// @return rounds  the full blow-by-blow log, trimmed to the rounds actually fought
    /// @return fought  how many rounds happened
    /// @return heroHp  the hero's hp when it ended
    /// @return heroWon true if the foe dropped first (a timeout counts as a loss)
    function simulate(bytes32 seed, Combatant memory hero, Combatant memory foe)
        public
        pure
        returns (Round[] memory rounds, uint8 fought, uint16 heroHp, bool heroWon)
    {
        Round[] memory log = new Round[](MAX_ROUNDS);
        heroHp = hero.hp;
        uint16 foeHp = foe.hp;

        for (uint8 i = 0; i < MAX_ROUNDS; i++) {
            (uint16 heroDmg, bool heroCrit) = _swing(seed, i * 2, hero.atk, foe.def, hero.luck);
            foeHp = heroDmg >= foeHp ? 0 : foeHp - heroDmg;

            uint16 foeDmg;
            bool foeCrit;
            if (foeHp > 0) {
                (foeDmg, foeCrit) = _swing(seed, i * 2 + 1, foe.atk, hero.def, foe.luck);
                heroHp = foeDmg >= heroHp ? 0 : heroHp - foeDmg;
            }

            log[i] = Round(heroDmg, foeDmg, heroHp, foeHp, heroCrit, foeCrit);
            fought = i + 1;

            if (foeHp == 0) {
                heroWon = true;
                break;
            }
            if (heroHp == 0) break;
        }

        rounds = new Round[](fought);
        for (uint8 i = 0; i < fought; i++) {
            rounds[i] = log[i];
        }
    }

    /// @notice The foe waiting on a given floor, for a given seed.
    /// @dev Every 5th floor is a champion: much tougher, much richer.
    function foeFor(uint32 depth, bytes32 seed) public pure returns (Foe memory) {
        bool champion = depth % 5 == 0;
        uint32 tier = depth;

        uint16 hp = uint16(26 + tier * 10 + _roll(seed, 11, 16));
        // Attack grows at 1.5/floor. At 2/floor it outran the hero's defence —
        // soak is only def/2 and a level adds ~1 def — and every run ended on the
        // first champion floor.
        uint16 atk = uint16(6 + (tier * 3) / 2 + _roll(seed, 12, 4));
        uint16 def = uint16(1 + tier + _roll(seed, 13, 3));
        uint16 luck = uint16(25 + tier * 2);
        uint32 xp = 30 + tier * 16;
        uint32 gold = 25 + tier * 14;

        if (champion) {
            // Tuned down twice. At x2 hp / x1.5 atk, and again at x1.7 / x1.25,
            // champions were a hard gate rather than a spike: 70% of runs ended
            // on floor 5 and the floors between were trivial. Run
            // scripts/balance-probe.js after touching these.
            hp = (hp * 7) / 5;
            atk = (atk * 23) / 20;
            def = (def * 23) / 20;
            luck += 25;
            xp *= 3;
            gold *= 3;
        }

        return Foe(hp, atk, def, luck, xp, gold, _foeName(depth, seed, champion));
    }

    // -------------------------------------------------------------- getters

    /// @notice The full hero record as one struct.
    /// @dev The auto-generated `heroes` getter returns 19 positional values, which
    ///      clients then have to keep in sync by hand. This returns a named struct
    ///      so decoding stays honest.
    function heroOf(address player) external view returns (Hero memory) {
        return heroes[player];
    }

    function lastRun(address player) external view returns (Run memory) {
        return runs[player];
    }

    function lastDuel(address player) external view returns (Duel memory) {
        return duels[player];
    }

    /// @notice Hero stats with gear folded in — what the fight actually uses.
    function effectiveStats(address player) external view returns (Combatant memory) {
        Hero storage h = heroes[player];
        if (!h.exists) revert NoHero();
        return Combatant(h.hp, _totalAtk(h), _totalDef(h), _totalLuck(h));
    }

    function xpForNextLevel(uint8 level) public pure returns (uint32) {
        return uint32(level) * 80 + (uint32(level) * uint32(level) * 10);
    }

    function tierCost(uint8 tier) external view returns (uint32) {
        if (tier > MAX_TIER) revert BadTier();
        return TIER_COST[tier];
    }

    function rosterSize() external view returns (uint256) {
        return roster.length;
    }

    /// @notice A page of the ladder. Sorting is the client's job — this just pages.
    function ladder(uint256 offset, uint256 limit)
        external
        view
        returns (address[] memory addrs, Hero[] memory records)
    {
        uint256 total = roster.length;
        if (offset >= total) return (new address[](0), new Hero[](0));
        uint256 end = offset + limit;
        if (end > total) end = total;
        uint256 n = end - offset;

        addrs = new address[](n);
        records = new Hero[](n);
        for (uint256 i = 0; i < n; i++) {
            address player = roster[offset + i];
            addrs[i] = player;
            records[i] = heroes[player];
        }
    }

    // ------------------------------------------------------------ internals

    /// @dev Gear bonuses are multiplicative-ish but kept in integer math.
    function _totalAtk(Hero storage h) private view returns (uint16) {
        return h.atk + uint16(h.weapon) * 6;
    }

    function _totalDef(Hero storage h) private view returns (uint16) {
        return h.def + uint16(h.armor) * 4;
    }

    function _totalLuck(Hero storage h) private view returns (uint16) {
        return h.luck + uint16(h.trinket) * 25;
    }

    /// @dev One attack. Damage swings 80%–120% of attack, armor soaks half its value,
    ///      and a crit doubles the result. A hit always lands for at least 1.
    function _swing(bytes32 seed, uint8 step, uint16 atk, uint16 def, uint16 luck)
        private
        pure
        returns (uint16 damage, bool crit)
    {
        uint256 variance = 80 + _roll(seed, 100 + step, 41); // 80..120
        uint256 raw = (uint256(atk) * variance) / 100;
        uint256 soak = uint256(def) / 2;
        uint256 net = raw > soak ? raw - soak : 1;

        crit = _roll(seed, 200 + step, 1000) < luck;
        if (crit) net *= 2;

        damage = net > type(uint16).max ? type(uint16).max : uint16(net);
    }

    /// @dev Draws `mod` values deterministically from a seed and a label.
    function _roll(bytes32 seed, uint256 label, uint256 mod) private pure returns (uint256) {
        return uint256(keccak256(abi.encodePacked(seed, label))) % mod;
    }

    /// @dev Mixes the previous block hash with a per-player nonce so two calls in
    ///      the same block cannot produce the same fight.
    function _seed() private returns (bytes32) {
        uint64 n = ++nonces[msg.sender];
        bytes32 bh = blockhash(block.number - 1);
        return keccak256(abi.encodePacked(bh, block.number, block.timestamp, msg.sender, n));
    }

    /// @notice How much rating a duel would move. Exposed so the UI can show the
    ///         stakes before the player commits to a fight.
    function ratingDelta(uint32 challengerRating, uint32 defenderRating, bool challengerWon)
        public
        pure
        returns (uint32)
    {
        if (challengerWon) {
            // Upsets pay more; farming someone far below you pays almost nothing.
            if (defenderRating > challengerRating) {
                uint32 gap = defenderRating - challengerRating;
                return 20 + (gap > 400 ? 20 : gap / 20);
            }
            uint32 down = challengerRating - defenderRating;
            return down > 380 ? 1 : 20 - down / 20;
        }
        // Losing to someone weaker stings more.
        if (challengerRating > defenderRating) {
            uint32 gap = challengerRating - defenderRating;
            return 20 + (gap > 400 ? 20 : gap / 20);
        }
        uint32 up = defenderRating - challengerRating;
        return up > 380 ? 1 : 20 - up / 20;
    }

    function _foeName(uint32 depth, bytes32 seed, bool champion) private pure returns (string memory) {
        string[8] memory beasts =
            ["Cave Rat", "Goblin", "Shadow Wolf", "Bone Archer", "Rock Troll", "Wisp", "Crypt Spider", "Fungal Brute"];
        string[4] memory titles = ["Warden", "Devourer", "Sovereign", "Herald"];

        if (champion) {
            return string.concat(titles[_roll(seed, 21, 4)], " of Floor ", _toString(depth));
        }
        return beasts[_roll(seed, 22, 8)];
    }

    function _toString(uint256 value) private pure returns (string memory) {
        if (value == 0) return "0";
        uint256 temp = value;
        uint256 digits;
        while (temp != 0) {
            digits++;
            temp /= 10;
        }
        bytes memory buffer = new bytes(digits);
        while (value != 0) {
            digits--;
            buffer[digits] = bytes1(uint8(48 + (value % 10)));
            value /= 10;
        }
        return string(buffer);
    }
}
