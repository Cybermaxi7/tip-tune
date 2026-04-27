# TipTune Contracts Quickstart

Use this quickstart to get a local contracts environment running without hunting through multiple files.

## Toolchain

```bash
rustup toolchain install 1.88.0
rustup default 1.88.0
rustup target add wasm32-unknown-unknown
rustup component add clippy rustfmt
```

Install Soroban CLI when you need deployment or manual invocation:

```bash
cargo install --locked soroban-cli
```

## First validation run

From the repository root:

```bash
cd contracts
cargo test -p tip-time-lock
```

From a single contract directory:

```bash
cd contracts/tip-time-lock
cargo test --verbose
cargo build --target wasm32-unknown-unknown --release
cargo clippy -- -D warnings
cargo fmt -- --check
```

## Where to go next

- Use [TESTING.md](TESTING.md) for the full validation matrix, CI-parity commands, and guidance on when to use snapshots.
- Use [CHECKLIST.md](CHECKLIST.md) before opening a PR.
- Use [README.md](README.md) for contract overview and deployment notes.

## Common next steps

```bash
cd contracts
cargo build -p tip-time-lock --target wasm32-unknown-unknown --release
cargo test -p tip-time-lock -- --nocapture
```

If you changed multiple contracts, run the CI-parity sweep from [TESTING.md](TESTING.md) instead of relying on a single package command.
