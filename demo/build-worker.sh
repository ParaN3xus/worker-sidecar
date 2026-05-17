#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

cargo build --target wasm32-unknown-unknown --release
cargo build --manifest-path demo/guest/Cargo.toml --target wasm32-unknown-unknown --release

mkdir -p demo/build
cp target/wasm32-unknown-unknown/release/sidecar_host.wasm demo/build/index_bg.wasm
cp demo/guest/target/wasm32-unknown-unknown/release/sidecar_typst_guest.wasm demo/build/guest.wasm

WASM_OPT="${WASM_OPT_BIN:-wasm-opt}"
if command -v "$WASM_OPT" >/dev/null 2>&1; then
  "$WASM_OPT" -Oz --converge --enable-bulk-memory --enable-nontrapping-float-to-int demo/build/index_bg.wasm -o demo/build/index_bg.opt.wasm
  mv demo/build/index_bg.opt.wasm demo/build/index_bg.wasm
  "$WASM_OPT" -Oz --converge --enable-bulk-memory --enable-nontrapping-float-to-int demo/build/guest.wasm -o demo/build/guest.opt.wasm
  mv demo/build/guest.opt.wasm demo/build/guest.wasm
fi

pnpm exec node demo/build-js.mjs
