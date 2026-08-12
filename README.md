# Polka Arena

An on-chain dungeon crawler with a PvP ladder, built on Polkadot Hub with a
Solidity contract compiled to PolkaVM.

The chain decides every fight. `PolkaArena.simulate` is a `pure` function from one
seed to a full blow-by-blow log, so the browser replays exactly what the contract
recorded rather than inventing its own animation.

**Live:** https://polka-arena.sanghak.kr

## How it plays

- Roll a hero — HP, attack, defence are seeded on-chain, so no two start alike.
- Descend a floor at a time. Damage carries over between floors; clearing one
  gives back a little ("second wind"), and gold buys a proper rest at the surface.
- Every fifth floor is a champion: tougher, and worth triple.
- Death costs half your gold and sends you back to the surface. Your deepest
  floor survives as a record.
- Spend xp on levels, gold on gear across three slots (attack / defence / crit).
- Challenge other players' heroes. Both sides fight at full health, so the ladder
  measures builds rather than who happens to be rested.

### Randomness

Seeds come from `blockhash`, which a block producer can influence by choosing
whether to publish. That is fine for a testnet toy and **not** fine for anything
with value behind it — a production version needs commit-reveal or a VRF.

## Layout

```
contracts/   Solidity + Hardhat. Compiles to PolkaVM via @parity/resolc.
web/         React + Vite + viem frontend.
```

## Running it

```bash
pnpm install
```

### Tests

Game rules are plain Solidity, so they run on the in-process EVM — fast, no node
binaries needed. PolkaVM is used for deploys.

```bash
pnpm --filter @polka-arena/contracts test
```

### Balance

Tuning the dungeon by eye does not work; the first two attempts produced a game
where every run ended on floor 2, then one where 70% ended on floor 5. Measure:

```bash
cd contracts
npx hardhat --config hardhat.evm.config.js run scripts/balance-probe.js
```

It plays 20 heroes through a greedy strategy and prints the death-floor
distribution. Current numbers land around: min 8, median 14, max 24.

### Playing locally

A local EVM node plus the dev-key path means you can click through the whole game
without a wallet extension or any testnet tokens.

```bash
# terminal 1
cd contracts
npx hardhat --config hardhat.evm.config.js node

# terminal 2
cd contracts
npx hardhat --config hardhat.evm.config.js run scripts/deploy.js --network localhost
npx hardhat --config hardhat.evm.config.js run scripts/seed-local.js --network localhost
```

Then set `web/.env.local`:

```
VITE_ARENA_ADDRESS=<printed by deploy>
VITE_RPC_URL=http://127.0.0.1:8545
VITE_CHAIN_ID=31337
VITE_DEV_PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
```

That last one is Hardhat's first well-known test account — publicly documented,
holds nothing, and only read when `import.meta.env.DEV` is true so it can never
reach a production bundle. Never put a real key there.

```bash
pnpm --filter @polka-arena/web dev
```

### Deploying to Polkadot Hub TestNet

| | |
|---|---|
| Network | Polkadot Hub TestNet |
| ETH JSON-RPC | `https://eth-rpc-testnet.polkadot.io/` |
| Chain ID | `420420417` |
| Gas token | PAS (free, from the faucet) |
| Explorer | https://blockscout-testnet.polkadot.io |
| Faucet | https://faucet.polkadot.io/ |

PAS pays for gas only — the gold in the game is a number inside the contract, not
a token.

```bash
cd contracts
echo "PRIVATE_KEY=0x..." > .env    # an account funded from the faucet
pnpm deploy:testnet
```

`pnpm deploy:testnet` writes the ABI to `web/src/generated/abi.ts` and the address
into `web/.env.local`.

Note: `pallet-revive` uses 20-byte Ethereum-style addresses. The first time an
account interacts with it, that account has to be mapped from its 32-byte
Substrate id — wallets that target Polkadot Hub handle this, but it is worth
knowing if a first transaction fails oddly.

### Deploying the site

`.github/workflows/deploy.yml` builds `web/` and publishes to GitHub Pages on
every push to `main`. Set `VITE_ARENA_ADDRESS` as a repository **variable**
(Settings → Secrets and variables → Actions → Variables) so the built site knows
where the contract lives. Without it the site still builds and shows a "not
deployed yet" notice.

## Notes on the contract

- `viaIR` is on: the run/loot structs push `delve` past Solidity's 16-slot stack
  limit without it.
- `heroOf(address)` exists alongside the auto-generated `heroes` mapping getter
  because the auto getter returns 19 positional values, which clients then have to
  keep in sync by hand.
- The duel cooldown is measured in blocks (`DUEL_COOLDOWN_BLOCKS`). A same-block
  check does nothing — one transaction per block already advances `block.number`.

## Why ink! is not used

ink! was the natural choice for a Rust-native Polkadot contract, but the ink! team
[stopped maintaining it in January 2026](https://use.ink/docs/v6/getting-started/deploy-your-contract/).
Solidity on `pallet-revive` targets the same chain and the same 20-byte address
model, and is actively supported.
