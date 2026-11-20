#!/usr/bin/env bash
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/_compose.sh"

echo "启动 PostgreSQL 容器..."
"${COMPOSE[@]}" up -d postgres

echo -n "等待数据库就绪"
for _ in $(seq 1 60); do
  if "${COMPOSE[@]}" exec -T postgres sh -c 'pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB"' >/dev/null 2>&1; then
    echo ""
    echo "PostgreSQL 已就绪：$("${COMPOSE[@]}" port postgres 5432)"
    echo "数据库/账号见 docker-compose.yml，服务端默认读取 server/.env 或同名 DB_* 环境变量。"
    exit 0
  fi
  echo -n "."
  sleep 1
done

echo ""
echo "PostgreSQL 启动超时，请执行 pnpm db:logs 查看日志。" >&2
exit 1
