#!/usr/bin/env bash
# 生产部署脚本：Docker Compose 起 db(PostgreSQL) + server + admin 静态站
#
# 常用：
#   bash scripts/deploy.sh                # 首次/更新部署（构建 + 启动 + 等健康检查）
#   bash scripts/deploy.sh up --pull      # 先 git pull 再部署
#   bash scripts/deploy.sh up --no-cache   # 清 Docker 构建缓存，全量重新构建
#   bash scripts/deploy.sh status          # 看容器与健康状态
#   bash scripts/deploy.sh logs            # 跟踪 server/web/db 日志
#   bash scripts/deploy.sh backup          # 备份数据库到 backups/
#   bash scripts/deploy.sh migrate         # 只跑未执行的迁移
#   bash scripts/deploy.sh down            # 停止（保留数据卷）
#   bash scripts/deploy.sh restart         # 只重启应用容器

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

COMPOSE_FILE="docker-compose.prod.yml"
ENV_FILE="${ENV_FILE:-.env.production}"
CMD="${1:-up}"
shift || true

DO_PULL=0
DO_BUILD=1
NO_CACHE=0
for arg in "$@"; do
  case "$arg" in
    --pull) DO_PULL=1 ;;
    --no-build) DO_BUILD=0 ;;
    --no-cache) NO_CACHE=1 ;;
    -h|--help|help) CMD="help" ;;
    *) echo "未知参数：${arg}（用 --help 查看）" >&2; exit 2 ;;
  esac
done

COMPOSE=(docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE")

log() { printf '\033[1;32m[deploy]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[deploy]\033[0m %s\n' "$*"; }
die() { printf '\033[1;31m[deploy]\033[0m %s\n' "$*" >&2; exit 1; }

usage() {
  # 头部注释块就是帮助，按注释行自适应行数，避免改注释后错位
  awk 'NR > 1 { if (/^#/) { sub(/^# ?/, ""); print; next } exit }' "${BASH_SOURCE[0]}"
}

# 读 .env.production 里的值（不 source，避免执行任意内容）
env_get() {
  [ -f "$ENV_FILE" ] || return 0
  awk -F= -v k="$1" '$1==k {sub($1"=",""); print; exit}' "$ENV_FILE" | sed 's/^"//; s/"$//'
}

rand_secret() {
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -hex 32
  else
    LC_ALL=C tr -dc 'a-f0-9' </dev/urandom | head -c 64
  fi
}

preflight() {
  command -v docker >/dev/null 2>&1 || die "未安装 Docker"
  docker info >/dev/null 2>&1 || die "Docker 未运行，或当前用户没有权限（可试 sudo 或加入 docker 组）"
  docker compose version >/dev/null 2>&1 || die "缺少 docker compose 插件（docker compose version 不可用）"

  if [ ! -f "$ENV_FILE" ]; then
    [ -f .env.production.example ] || die "缺少 .env.production.example，无法生成 $ENV_FILE"
    cp .env.production.example "$ENV_FILE"
    chmod 600 "$ENV_FILE"
    local pg_pwd jwt ds_secret
    pg_pwd="$(rand_secret | cut -c1-24)"
    jwt="$(rand_secret)"
    ds_secret="$(rand_secret)"
    # 只替换占位值，不改用户已填内容（新生成的文件必然都是占位值）
    if sed --version >/dev/null 2>&1; then
      sed -i "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=${pg_pwd}|" "$ENV_FILE"
      sed -i "s|^JWT_SECRET=.*|JWT_SECRET=${jwt}|" "$ENV_FILE"
      sed -i "s|^DATA_SOURCE_SECRET=.*|DATA_SOURCE_SECRET=${ds_secret}|" "$ENV_FILE"
    else
      sed -i '' "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=${pg_pwd}|" "$ENV_FILE"
      sed -i '' "s|^JWT_SECRET=.*|JWT_SECRET=${jwt}|" "$ENV_FILE"
      sed -i '' "s|^DATA_SOURCE_SECRET=.*|DATA_SOURCE_SECRET=${ds_secret}|" "$ENV_FILE"
    fi
    warn "已生成 ${ENV_FILE}，并填入了随机的 POSTGRES_PASSWORD / JWT_SECRET / DATA_SOURCE_SECRET。"
    warn "请确认 SEED_ADMIN_PASSWORD、WECHAT_*、CORS_ORIGIN 后再执行部署（密码务必自己留存）。"
    exit 0
  fi

  case "$(env_get POSTGRES_PASSWORD)" in
    ""|change-me*) die "$ENV_FILE 里 POSTGRES_PASSWORD 还是占位值，请先改成强密码" ;;
  esac
  case "$(env_get JWT_SECRET)" in
    ""|change-me*) die "$ENV_FILE 里 JWT_SECRET 还是占位值，请改成 ≥32 位随机串" ;;
  esac
  case "$(env_get DATA_SOURCE_SECRET)" in
    ""|change-me*) die "$ENV_FILE 里 DATA_SOURCE_SECRET 为空或占位值，请改成 ≥16 位随机串（留空会导致后端启动失败）" ;;
  esac
  [ "$(env_get WECHAT_MOCK)" = "true" ] && warn "WECHAT_MOCK=true：App 微信登录为模拟模式（本次未部署 App 时不影响 admin）；后续部署 App 前请关闭"
  [ "$(env_get CORS_ORIGIN)" = "*" ] && warn "CORS_ORIGIN=*：同域反代下可用，分域名部署请改成具体域名"
}

git_pull() {
  command -v git >/dev/null 2>&1 || { warn "无 git，跳过 --pull"; return 0; }
  [ -d .git ] || { warn "当前目录不是 git 仓库，跳过 --pull"; return 0; }
  if [ -n "$(git status --porcelain)" ]; then
    die "工作区有未提交改动，拒绝 --pull（先 commit/stash）"
  fi
  log "拉取代码：$(git rev-parse --abbrev-ref HEAD)"
  git pull --ff-only
}

wait_healthy() {
  local name="$1" timeout="${2:-180}" i=0
  log "等待 $name 健康检查通过（最多 ${timeout}s）"
  while [ "$i" -lt "$timeout" ]; do
    local cid status
    cid="$(docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" ps -q "$name" 2>/dev/null || true)"
    if [ -n "$cid" ]; then
      status="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$cid" 2>/dev/null || true)"
      case "$status" in
        healthy|running) log "$name 就绪（${status}）"; return 0 ;;
        unhealthy) die "$name 健康检查失败，用 bash scripts/deploy.sh logs 看日志" ;;
      esac
    fi
    sleep 3; i=$((i + 3))
  done
  die "等待 $name 超时，用 bash scripts/deploy.sh logs 排查"
}

smoke_test() {
  local port; port="$(env_get HTTP_PORT)"; port="${port:-8092}"
  command -v curl >/dev/null 2>&1 || { warn "无 curl，跳过接口连通性检查"; return 0; }
  local url="http://127.0.0.1:${port}/api/health"
  if curl -fsS --max-time 10 "$url" >/dev/null; then
    log "接口连通：$url"
  else
    die "接口不通：${url}，检查端口占用与 nginx 日志（bash scripts/deploy.sh logs）"
  fi
}

summary() {
  local port; port="$(env_get HTTP_PORT)"; port="${port:-8092}"
  echo
  log "部署完成"
  echo "  管理后台： http://<服务器IP>:${port}/"
  echo "  健康检查： http://<服务器IP>:${port}/api/health"
  echo "  初始超管： admin（密码见 ${ENV_FILE} 的 SEED_ADMIN_PASSWORD，登录后立即修改）"
  echo "  演示账户： demo（密码见 ${ENV_FILE} 的 SEED_DEMO_PASSWORD；在线开发可增删改查，用户/角色/菜单/系统配置只读）"
  echo "  数据卷：   admin_base_prod_pgdata（数据库）/ admin_base_prod_uploads（上传文件）"
  echo "  常用命令： bash scripts/deploy.sh status|logs|backup|migrate|restart|down"
}

cmd_up() {
  preflight
  [ "$DO_PULL" = "1" ] && git_pull
  if [ "$DO_BUILD" = "1" ]; then
    if [ "$NO_CACHE" = "1" ]; then
      log "无缓存构建镜像（跳过 Docker 构建缓存，重新拉依赖 + 编译）"
      "${COMPOSE[@]}" build --no-cache
    else
      log "构建镜像（首次较慢：需要拉依赖 + 编译 server 与 admin）"
      "${COMPOSE[@]}" build
    fi
  fi
  log "启动容器"
  "${COMPOSE[@]}" up -d --remove-orphans
  wait_healthy db 60
  wait_healthy server 240
  wait_healthy web 60
  smoke_test
  summary
}

cmd_down() {
  preflight
  "${COMPOSE[@]}" down --remove-orphans
  log "已停止容器，数据卷保留（彻底删除需手动 docker volume rm admin_base_prod_pgdata admin_base_prod_uploads）"
}

cmd_restart() {
  preflight
  "${COMPOSE[@]}" up -d --remove-orphans
  wait_healthy server 120
  log "应用容器已重启（未重新构建镜像）"
}

cmd_status() {
  preflight
  "${COMPOSE[@]}" ps
  echo
  local cid
  for name in db server web; do
    cid="$("${COMPOSE[@]}" ps -q "$name" 2>/dev/null || true)"
    [ -n "$cid" ] || continue
    printf '%-8s %s\n' "$name" "$(docker inspect -f '{{.State.Status}} / {{if .State.Health}}{{.State.Health.Status}}{{else}}no-healthcheck{{end}}' "$cid")"
  done
}

cmd_logs() {
  preflight
  "${COMPOSE[@]}" logs -f --tail=100 db server web
}

cmd_backup() {
  preflight
  local db user out
  db="$(env_get POSTGRES_DB)"; db="${db:-admin_base}"
  user="$(env_get POSTGRES_USER)"; user="${user:-postgres}"
  mkdir -p backups
  out="backups/db-$(date +%Y%m%d-%H%M%S).sql.gz"
  log "导出数据库 $db → $out"
  "${COMPOSE[@]}" exec -T db pg_dump -U "$user" -d "$db" | gzip -9 >"$out"
  log "完成：$(du -h "$out" | cut -f1)"
  echo "  上传文件备份：docker run --rm -v admin_base_prod_uploads:/data -v \"$PWD/backups:/backup\" alpine tar czf /backup/uploads-$(date +%Y%m%d-%H%M%S).tar.gz -C /data ."
}

cmd_migrate() {
  preflight
  log "执行未执行的迁移"
  "${COMPOSE[@]}" exec -T server node ./node_modules/typeorm/cli.js migration:run -d dist/db/data-source.js
}

case "$CMD" in
  up) cmd_up ;;
  down) cmd_down ;;
  restart) cmd_restart ;;
  status|ps) cmd_status ;;
  logs) cmd_logs ;;
  backup) cmd_backup ;;
  migrate) cmd_migrate ;;
  help|-h) usage ;;
  *) usage; exit 2 ;;
esac
