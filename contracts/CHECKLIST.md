# Contracts Contributor Checklist

Use this checklist before opening a contracts PR.

## Environment

- Install Rust 1.88.0 and add the `wasm32-unknown-unknown` target.
- Install `clippy` and `rustfmt` components.
- Use the [contracts quickstart](QUICKSTART.md) for first-time setup.
- Use the [contracts testing and linting guide](TESTING.md) for exact commands.

## Validation

- Run focused tests for every contract you changed.
- Build every changed contract for `wasm32-unknown-unknown --release`.
- Run `cargo clippy -- -D warnings` in every changed contract directory.
- Run `cargo fmt -- --check` in every changed contract directory.
- If a change spans multiple contracts or shared crates, run the CI-parity sweep from [TESTING.md](TESTING.md).

## Behavior checks

- Add or update tests for new storage, auth, and ledger-timing behavior.
- Prefer explicit assertions for balances, events, and status transitions.
- Use snapshot-style assertions only when serialized payloads are large or repetitive and the output shape is intentionally stable.
- Update any contributor-facing docs when commands or workflows change.

## Before review

- Confirm new docs link back to the [docs index](../docs/README.md) when they are meant to be entry points.
- Keep contract-specific command examples aligned with [TESTING.md](TESTING.md).
- Include the exact validation commands you ran in the PR description.
