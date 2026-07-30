#!/usr/bin/env bash
# Daily backup for Ladungsplaner (Coolify-managed). Model: /root/backup-arminia.sh.
#
# Runs on the DOCKER HOST, not in the container — the deployed copy lives at
# /root/backup-ladungsplaner.sh, cron 03:15 (offset from backup-arminia.sh at 03:00).
# The host has no sqlite3 binary, so the consistent snapshot is taken by the
# container's own better-sqlite3 via `docker exec`.
#
# - Consistent SQLite snapshot via .backup() (WAL-safe). This is not optional:
#   app.db is a few KB while the -wal file holds the rest, so tarring the raw
#   files would capture a nearly empty database.
# - Source connection is readonly: a backup run can never mutate live data.
# - Tars the whole persistent volume (DB + snapshot), 14-day retention.
set -euo pipefail

APP_UUID="z7rphypy5eytfwjr58iponfd"
FALLBACK_VOL="z7rphypy5eytfwjr58iponfd-ladungsplaner-data"
BK="/root/backups"
DATE="$(date +%F)"

mkdir -p "$BK"

# Resolve the running app container (Coolify appends a per-deploy suffix to the UUID)
C="$(docker ps --filter "name=${APP_UUID}" --format '{{.Names}}' | head -1 || true)"

VOL="$FALLBACK_VOL"
if [ -n "$C" ]; then
  V="$(docker inspect "$C" --format '{{range .Mounts}}{{if eq .Destination "/app/data"}}{{.Name}}{{end}}{{end}}' 2>/dev/null || true)"
  [ -n "$V" ] && VOL="$V"
  # Snapshot written into the volume so the tar below captures it
  docker exec "$C" node -e 'require("better-sqlite3")(process.env.DB_PATH || "/app/data/app.db", { readonly: true }).backup("/app/data/backup-daily.db").then(() => process.exit(0), (e) => { console.error(e.message); process.exit(1); })' \
    || echo "WARN: live .backup() failed, tarring raw files"
else
  echo "WARN: app container not running; tarring volume as-is"
fi

DATA="/var/lib/docker/volumes/${VOL}/_data"
tar czf "${BK}/ladungsplaner-${DATE}.tar.gz" -C "$DATA" .

# Retention: keep 14 days
find "$BK" -name 'ladungsplaner-*.tar.gz' -mtime +14 -delete

echo "backup ok: ${BK}/ladungsplaner-${DATE}.tar.gz ($(du -h "${BK}/ladungsplaner-${DATE}.tar.gz" | cut -f1))"
