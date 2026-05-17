#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

TAG="${GUEST_RELEASE_TAG:-guest-v0.1.0}"
ASSET="build/guest.wasm"

if [[ ! -f "$ASSET" ]]; then
  echo "error: missing $ASSET, run scripts/build-worker.sh first" >&2
  exit 1
fi

if gh release view "$TAG" >/dev/null 2>&1; then
  gh release upload "$TAG" "$ASSET" --clobber
else
  gh release create "$TAG" "$ASSET" \
    --title "$TAG" \
    --notes "Sidecar guest wasm asset" \
    --target "sidecar" \
    --prerelease
fi
