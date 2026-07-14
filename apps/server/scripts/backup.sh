#!/usr/bin/env bash
# Consistent SQLite backup + tar with 14-day rotation (model of /root/backup-arminia.sh).
# Run from the host on a cron; the DB lives in the named volume mounted at /app/data.
set -euo pipefail

DB=${DB_PATH:-/app/data/app.db}
OUT=${BACKUP_DIR:-/app/data/backups}
RETENTION_DAYS=${RETENTION_DAYS:-14}

mkdir -p "$OUT"
ts=$(date +%Y%m%d-%H%M%S)

# .backup takes a consistent copy even while the app holds the DB open (WAL-safe).
sqlite3 "$DB" ".backup '$OUT/app-$ts.db'"
tar -czf "$OUT/app-$ts.tar.gz" -C "$OUT" "app-$ts.db"
rm -f "$OUT/app-$ts.db"

# Rotate: drop archives older than the retention window.
find "$OUT" -name 'app-*.tar.gz' -mtime +"$RETENTION_DAYS" -delete

echo "backup written: $OUT/app-$ts.tar.gz"
