# Soroban Contracts Testing and Linting Guide

This is the authoritative validation guide for the `contracts/` workspace. Use it instead of piecing commands together from checklists or older quick references.

## Expected toolchain

- Rust `1.88.0` to match [.github/workflows/contracts.yml](../.github/workflows/contracts.yml)
- Target: `wasm32-unknown-unknown`
- Components: `clippy`, `rustfmt`
- Optional for deployment and manual invocation: `soroban-cli`

Setup:

```bash
rustup toolchain install 1.88.0
rustup default 1.88.0
rustup target add wasm32-unknown-unknown
rustup component add clippy rustfmt
```

## Focused package commands

Run these when you are working in one contract and want the fastest feedback.

From `contracts/`:

```bash
cargo test -p tip-time-lock
cargo build -p tip-time-lock --target wasm32-unknown-unknown --release
```

From a contract directory such as `contracts/tip-time-lock`:

```bash
cargo test --verbose
cargo build --target wasm32-unknown-unknown --release
cargo clippy -- -D warnings
cargo fmt -- --check
```

Use the package-scoped path first after a local code change. It is the cheapest way to catch logic, type, and ledger-behavior regressions.

## Workspace and CI-parity validation

The current contracts CI does not run a single `cargo test --workspace` command. It iterates over each contract directory, skips `./lottery`, and runs validation inside each package directory.

Use this when a change affects shared crates, workspace configuration, or multiple contracts:

```bash
cd contracts
for dir in */; do
  if [ "$dir" = "lottery/" ]; then
    continue
  fi
  if [ -f "$dir/Cargo.toml" ]; then
    (cd "$dir" && cargo test --verbose)
    (cd "$dir" && cargo build --target wasm32-unknown-unknown --release)
    (cd "$dir" && cargo clippy -- -D warnings)
    (cd "$dir" && cargo fmt -- --check)
  fi
done
```

If you are on Windows without a POSIX shell, run the same four commands manually in each changed contract directory.

## When to use each command

- `cargo test -p <package>`: default choice for a single contract change.
- `cargo test --verbose`: same validation from inside a package directory and matches CI output more closely.
- `cargo build --target wasm32-unknown-unknown --release`: required whenever contract WASM output might change.
- `cargo clippy -- -D warnings`: required before review to keep CI green.
- `cargo fmt -- --check`: required before review to avoid format-only CI failures.

## Snapshot guidance

Prefer explicit assertions for balances, events, ledger timestamps, storage transitions, and auth failures.

Use snapshots only when:

- the output is large enough that field-by-field assertions would hide intent,
- the serialized shape is expected to stay stable across normal refactors,
- and the review clearly benefits from a before/after diff.

Avoid snapshots for rapidly changing payloads, random addresses, or values derived from current ledger timestamps unless you first make the test deterministic.

## Recommended validation flow

1. Run the narrowest package test command that covers your change.
2. Build the changed contract for `wasm32-unknown-unknown --release`.
3. Run `clippy` and `fmt` in the changed contract directory.
4. Run the CI-parity sweep if you touched shared code, workspace config, or multiple contracts.

## Current examples

For the time-lock storage TTL hardening work:

```bash
cd contracts
cargo test -p tip-time-lock
cargo build -p tip-time-lock --target wasm32-unknown-unknown --release
```