#!/usr/bin/env bash
# Disposable Docker-only test of the production image with the bundle's database image.
# Never touches production: own network, containers and volume, all removed on exit.
set -euo pipefail
cd "$(dirname "$0")/.."
: "${IMAGE:?Set IMAGE to the image under test}"
REVISION="${REVISION:-$(git rev-parse HEAD)}"
id="hemmafix-smoke-${SMOKE_ID:-$$}"
port="${SMOKE_PORT:-18080}"
base="http://127.0.0.1:$port"
db_image="$(node -p 'require("./deploy/runtime/compose.json").services.db.image')"

fail() { echo "::error::$*" >&2; exit 1; }
cleanup() {
  status=$?
  if [ "$status" -ne 0 ]; then docker logs --tail 80 "$id-web" 2>&1 || true; fi
  docker rm -f "$id-web" "$id-db" >/dev/null 2>&1 || true
  docker volume rm "$id-data" >/dev/null 2>&1 || true
  docker network rm "$id" >/dev/null 2>&1 || true
  exit "$status"
}
trap cleanup EXIT

wait_healthy() {
  for _ in $(seq 1 60); do
    state="$(docker inspect -f '{{.State.Health.Status}}' "$1" 2>/dev/null || echo missing)"
    [ "$state" = healthy ] && return 0
    [ "$state" = unhealthy ] && fail "$1 became unhealthy"
    sleep 2
  done
  fail "$1 did not become healthy"
}

docker network create "$id" >/dev/null
docker run -d --name "$id-db" --network "$id" --network-alias db \
  -e POSTGRES_USER=hemmafix -e POSTGRES_PASSWORD=smoke -e POSTGRES_DB=hemmafix \
  -v "$id-data:/var/lib/postgresql/data" \
  --health-cmd "pg_isready -U hemmafix -d hemmafix" --health-interval 2s \
  "$db_image" >/dev/null
wait_healthy "$id-db"

start_web() {
  docker run -d --name "$id-web" --network "$id" -p "127.0.0.1:$port:8080" \
    -e DATABASE_URL=postgres://hemmafix:smoke@db:5432/hemmafix \
    -e BETTER_AUTH_SECRET="smoke-secret-not-for-production-0123456789" \
    -e BETTER_AUTH_URL="$base" -e ALLOWED_EMAILS=smoke@example.com \
    -e GOOGLE_CLIENT_ID=smoke -e GOOGLE_CLIENT_SECRET=smoke \
    "$IMAGE" >/dev/null
  wait_healthy "$id-web"
}

start_web
[ "$(curl -fsS "$base/healthz" | jq -r .status)" = ok ] || fail "/healthz"
[ "$(curl -fsS "$base/release.json" | jq -r .revision)" = "$REVISION" ] || fail "baked revision"
# Output is checked from a variable, never piped to grep -q: grep stops at the first match and,
# with pipefail, the writer's SIGPIPE (curl's "Failed writing body", docker logs' exit 141) fails a
# check whose text was there.
headers="$(curl -fsSI "$base/release.json")"
grep -qi 'cache-control: no-cache' <<<"$headers" || fail "release.json cache policy"
login="$(curl -fsS "$base/login")"
[[ "$login" == *Hemmafix* ]] || fail "/login did not render"
curl -fsS "$base/manifest.webmanifest" | jq -e '.name == "Hemmafix"' >/dev/null || fail "manifest"
[ "$(curl -sS -o /dev/null -w '%{http_code}' "$base/api/events")" = 401 ] || fail "events must require login"
[ "$(curl -sS "$base/api/auth/get-session")" = null ] || fail "anonymous session"
tables="$(docker exec "$id-db" psql -U hemmafix -d hemmafix -tAc \
  "select count(*) from information_schema.tables where table_schema = 'public'")"
[ "$tables" -ge 7 ] || fail "migrations did not create the schema ($tables tables)"

# A second start must find the schema current and come up again (migrations are idempotent).
docker rm -f "$id-web" >/dev/null
start_web
restart_log="$(docker logs "$id-web" 2>&1)"
[[ "$restart_log" == *"migrate: database is up to date"* ]] || fail "migration on restart"

# Graceful stop must be quick (SIGTERM closes event streams; nothing waits for the kill timeout).
started=$(date +%s)
docker stop -t 20 "$id-web" >/dev/null
[ $(( $(date +%s) - started )) -lt 10 ] || fail "graceful stop was too slow"

echo "Smoke test passed for $IMAGE ($REVISION)"
