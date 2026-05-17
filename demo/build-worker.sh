#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

cargo build --package sidecar-host --target wasm32-unknown-unknown --release

mkdir -p demo/build
cp target/wasm32-unknown-unknown/release/sidecar_host.wasm demo/build/worker_sidecar.wasm

WASM_OPT="${WASM_OPT_BIN:-wasm-opt}"
if command -v "$WASM_OPT" >/dev/null 2>&1; then
	"$WASM_OPT" -Oz --converge --enable-bulk-memory --enable-nontrapping-float-to-int demo/build/worker_sidecar.wasm -o demo/build/worker_sidecar.opt.wasm
	mv demo/build/worker_sidecar.opt.wasm demo/build/worker_sidecar.wasm
fi

node --experimental-strip-types demo/build-js.mts
