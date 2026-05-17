#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

cargo build --target wasm32-unknown-unknown --release
cargo build --manifest-path guest/Cargo.toml --target wasm32-unknown-unknown --release

mkdir -p build
cp target/wasm32-unknown-unknown/release/sidecar_host.wasm build/index_bg.wasm
cp target/wasm32-unknown-unknown/release/sidecar_typst_guest.wasm build/guest.wasm

WASM_OPT="${WASM_OPT_BIN:-wasm-opt}"
if command -v "$WASM_OPT" >/dev/null 2>&1; then
  "$WASM_OPT" -Oz --converge --enable-bulk-memory --enable-nontrapping-float-to-int build/index_bg.wasm -o build/index_bg.opt.wasm
  mv build/index_bg.opt.wasm build/index_bg.wasm
  "$WASM_OPT" -Oz --converge --enable-bulk-memory --enable-nontrapping-float-to-int build/guest.wasm -o build/guest.opt.wasm
  mv build/guest.opt.wasm build/guest.wasm
fi

pnpm exec node scripts/build-js.mjs

