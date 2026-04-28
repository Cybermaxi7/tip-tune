# Contracts Workspace Overview

All 19 packages declared in `contracts/Cargo.toml`, their purposes, and how to build/test each one.

## Package reference

| Package | Directory | Purpose |
| :------ | :-------- | :------ |
| `arithmetic-utils` | `arithmetic-utils/` | Shared math helpers (safe arithmetic, basis-point calculations) used by other contracts |
| `artist-allowlist` | `artist-allowlist/` | On-chain allowlist that gates which artist addresses may receive tips |
| `auto-royalty-distribution` | `auto-royalty-distribution/` | Automatically splits and distributes royalty payments to configured recipients on each tip |
| `drip-tip-matching` | `drip-tip-matching/` | Matching-pool contract: a sponsor pool matches fan tips up to a configured cap |
| `fan-token` | `fan-token/` | Fungible fan-loyalty token minted when fans tip; redeemable for perks |
| `governance` | `governance/` | On-chain proposal and voting contract for platform parameter changes |
| `lottery` | `lottery/` | Periodic lottery that rewards a random tipper from a pool of eligible participants |
| `reward-token` | `reward-token/` | Platform reward token with role-based minting, burning, and allowance support |
| `royalty-split` | `royalty-split/` | Configurable static royalty-split contract; artists register percentage splits per collaborator |
| `tip_vault` | `tip_vault/` | Custodial vault that holds tips until an artist claims them |
| `tip-bridge` | `tip-bridge/` | Cross-contract bridge that routes tips between different token types or networks |
| `tip-escrow` | `tip-escrow/` | Core escrow contract: holds a tip in escrow and releases it on fulfilment or cancellation |
| `tip-goal-campaign` | `tip-goal-campaign/` | Crowdfunding-style campaign: tips accumulate toward a goal; refunds if goal is not met |
| `tip-nft-badge` | `tip-nft-badge/` | Mints an NFT badge to a fan when their cumulative tips cross a threshold |
| `tip-streaming` | `tip-streaming/` | Streams a tip continuously over time (per-second drip) rather than as a lump sum |
| `tip-subscription` | `tip-subscription/` | Recurring subscription billing: fans pay a fixed amount on a configurable cadence |
| `tip-time-lock` | `tip-time-lock/` | Time-locks a tip; the artist can only claim it after a specified ledger timestamp |
| `tip-verification` | `tip-verification/` | Verifies that a tip transaction hash exists on-chain before crediting the backend |
| `track_access_control` | `track_access_control/` | Access-control contract that unlocks premium track content for verified tippers |

## Build & test commands

### Entire workspace

```bash
# From contracts/
cargo test --workspace
cargo build --workspace --target wasm32-unknown-unknown --release
cargo clippy --workspace -- -D warnings
cargo fmt --all -- --check
```

### Single package

```bash
# Replace <package> with any name from the table above
cargo test -p <package>
cargo build -p <package> --target wasm32-unknown-unknown --release
cargo clippy -p <package> -- -D warnings
cargo fmt -p <package> -- --check
```

### Examples

```bash
cargo test -p fan-token
cargo test -p tip-streaming
cargo build -p governance --target wasm32-unknown-unknown --release
```

## Keeping this file accurate

The authoritative package list is `contracts/Cargo.toml` (`[workspace] members`). When a package is added or removed, update the table above to match.

```bash
# Quick diff check — list workspace members from Cargo.toml
grep '^\s*"' contracts/Cargo.toml
```
