#!/usr/bin/env bash
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/_compose.sh"

if [ "${FORCE:-0}" != "1" ]; then
  read -r -p "将删除 PostgreSQL 数据卷（所有数据不可恢复），输入 yes 继续: " answer
  if [ "$answer" != "yes" ]; then
    echo "已取消。"
    exit 0
  fi
fi

"${COMPOSE[@]}" down -v
echo "数据库容器与数据卷已清空。执行 pnpm db:up 重新初始化。"
