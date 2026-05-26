#!/usr/bin/env bash
# Kills any stale qa-postgres containers, then launches qa:env:setup.
set -euo pipefail
echo "[qa:clean] Stopping stale qa-postgres containers..."
docker ps -a | grep qa-postgres | awk '{print $1}' | xargs -r docker rm -f || true
echo "[qa:clean] Clean. Starting fresh QA env..."
exec bash scripts/qa-env-setup.sh
