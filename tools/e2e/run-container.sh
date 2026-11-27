#!/usr/bin/env bash
# Run the packaged artifact inside a clean Ubuntu container.
#
# Usage: tools/e2e/run-container.sh <22.04|24.04> <deb|appimage> <minimal|full>
#
# Expects the packages in ./dist and writes logs/screenshots to ./e2e-output.
# Uses the host Docker daemon; nothing about Render Night is installed on the host.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

DISTRO="${1:?usage: run-container.sh <22.04|24.04> <deb|appimage> <minimal|full>}"
KIND="${2:?usage: run-container.sh <22.04|24.04> <deb|appimage> <minimal|full>}"
MODE="${3:-minimal}"

case "${DISTRO}" in
    22.04|24.04) : ;;
    *) echo "unsupported distro: ${DISTRO}" >&2; exit 2 ;;
esac
case "${KIND}" in
    deb|appimage) : ;;
    *) echo "unsupported kind: ${KIND}" >&2; exit 2 ;;
esac
[ -d dist ] || { echo "run-container: ./dist is missing (download the CI packages first)" >&2; exit 2; }

mkdir -p e2e-output
OUT_ABS="$(cd e2e-output && pwd)"
DIST_ABS="$(cd dist && pwd)"

docker build -t "rn-e2e:${DISTRO}" -f "tools/e2e/Dockerfile.${DISTRO}" tools/e2e

SETUP=()
if [ -n "${RN_E2E_UID:-}" ]; then
    SETUP=(--user "${RN_E2E_UID}")
fi

docker run --rm --init \
    "${SETUP[@]}" \
    -v "${DIST_ABS}:/dist:ro" \
    -v "${OUT_ABS}:/out" \
    -v "${ROOT_DIR}/tools/e2e:/opt/e2e:ro" \
    "rn-e2e:${DISTRO}" \
    /bin/bash /opt/e2e/in-container.sh "${KIND}" "${MODE}"
