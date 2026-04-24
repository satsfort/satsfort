#!/usr/bin/env bash
# Run the Tauri WebdriverIO e2e suite inside a Linux Docker container.
# Intended for macOS dev machines since tauri-driver has no macOS support.
#
# Usage: npm run test:e2e:mac
#
# Named volumes cache Linux-native build outputs so iterative runs don't
# redo the frontend+cargo build each time:
#   - satsfort-e2e-node-modules     node_modules built on Linux
#   - satsfort-e2e-target           Rust build artifacts (src-tauri/target)
#   - satsfort-e2e-cargo-registry   cargo download cache
#
# To wipe everything and start from scratch:
#   docker volume rm satsfort-e2e-node-modules satsfort-e2e-target satsfort-e2e-cargo-registry
#   docker rmi satsfort-e2e
set -euo pipefail

IMAGE="satsfort-e2e"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if ! command -v docker >/dev/null 2>&1; then
    echo "docker not found in PATH. Install Docker Desktop, Colima, or OrbStack first." >&2
    exit 1
fi

echo "Building $IMAGE image (first run can take a few minutes)..."
docker build -t "$IMAGE" -f "$REPO_ROOT/docker/e2e.Dockerfile" "$REPO_ROOT/docker"

echo "Running e2e suite in container..."
docker run --rm --init \
    -v "$REPO_ROOT":/app \
    -v satsfort-e2e-node-modules:/app/node_modules \
    -v satsfort-e2e-target:/app/src-tauri/target \
    -v satsfort-e2e-cargo-registry:/root/.cargo/registry \
    "$IMAGE"
