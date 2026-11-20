#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

# 默认自动拉起 Docker PostgreSQL；使用外部库或 SQLite 时用 SKIP_DB=1
if [ "${SKIP_DB:-0}" != "1" ]; then
  bash "$ROOT_DIR/scripts/db-up.sh"
fi

exec pnpm --filter server dev
