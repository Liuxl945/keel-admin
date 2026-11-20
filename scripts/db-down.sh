#!/usr/bin/env bash
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/_compose.sh"

"${COMPOSE[@]}" down
echo "PostgreSQL 容器已停止，数据卷保留。"
