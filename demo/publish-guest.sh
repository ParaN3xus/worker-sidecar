#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

TAG="${GUEST_RELEASE_TAG:-guest_wasm}"
TARGET_DIR="target/wasm32-unknown-unknown/release"
BUILD_ASSET="$TARGET_DIR/sidecar_typst_guest.wasm"
UPLOAD_ASSET="$TARGET_DIR/guest.wasm"

cargo build --package sidecar-typst-guest --target wasm32-unknown-unknown --release

WASM_OPT="${WASM_OPT_BIN:-wasm-opt}"
if command -v "$WASM_OPT" >/dev/null 2>&1; then
	"$WASM_OPT" -Oz --converge --enable-bulk-memory --enable-nontrapping-float-to-int "$BUILD_ASSET" -o "$UPLOAD_ASSET"
else
	cp "$BUILD_ASSET" "$UPLOAD_ASSET"
fi

if gh release view "$TAG" >/dev/null 2>&1; then
	gh release upload "$TAG" "$UPLOAD_ASSET" --clobber
else
	gh release create "$TAG" "$UPLOAD_ASSET" \
		--title "$TAG" \
		--notes "Sidecar guest wasm asset" \
		--target "sidecar" \
		--prerelease
fi
