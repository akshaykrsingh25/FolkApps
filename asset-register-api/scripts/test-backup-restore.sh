#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${SOURCE_DATABASE_URL:-}" || -z "${RESTORE_DATABASE_URL:-}" ]]; then
  echo "Set SOURCE_DATABASE_URL and RESTORE_DATABASE_URL to two disposable test databases." >&2
  exit 2
fi
if [[ "$SOURCE_DATABASE_URL" == "$RESTORE_DATABASE_URL" ]]; then
  echo "Source and restore test databases must be different." >&2
  exit 2
fi
for tool in psql pg_dump pg_restore; do
  if ! command -v "$tool" >/dev/null; then
    echo "Install PostgreSQL client tools; missing $tool." >&2
    exit 2
  fi
done

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
api_dir="$(cd "$script_dir/.." && pwd -P)"
test_root="$(mktemp -d "${TMPDIR:-/tmp}/incuasset-restore-test.XXXXXX")"
trap 'rm -rf "$test_root"' EXIT
mkdir -p "$test_root/backups"

(cd "$api_dir" && DATABASE_URL="$SOURCE_DATABASE_URL" npm run db:migrate >/dev/null)
(cd "$api_dir" && DATABASE_URL="$RESTORE_DATABASE_URL" npm run db:migrate >/dev/null)
psql "$SOURCE_DATABASE_URL" -X -v ON_ERROR_STOP=1 \
  -c "INSERT INTO organizations(name,slug) VALUES ('Restore Fixture','restore-fixture')" >/dev/null
psql "$RESTORE_DATABASE_URL" -X -v ON_ERROR_STOP=1 \
  -c "CREATE TABLE restore_sentinel(value text); INSERT INTO restore_sentinel VALUES ('unrelated object remains'); INSERT INTO organizations(name,slug) VALUES ('Old Fixture','old-fixture')" >/dev/null

(cd "$api_dir" && DATABASE_URL="$SOURCE_DATABASE_URL" npm run db:backup -- "$test_root/backups")
backup_file="$(find "$test_root/backups" -name '*.dump' -type f -print -quit)"
if [[ -z "$backup_file" ]]; then
  echo "Backup command did not create an archive." >&2
  exit 1
fi
target_database="$(psql "$RESTORE_DATABASE_URL" -X -Atq -v ON_ERROR_STOP=1 -c 'SELECT current_database()')"
target_environment="$(psql "$RESTORE_DATABASE_URL" -X -Atq -v ON_ERROR_STOP=1 -c "SELECT COALESCE(current_setting('asset_register.environment', true), '')")"
if [[ "$target_environment" != "local" ]]; then
  echo "Mark the disposable restore database with asset_register.environment=local before running this exercise." >&2
  exit 2
fi
RESTORE_DATABASE_URL="$RESTORE_DATABASE_URL" RESTORE_TARGET_ENV=local \
  "$script_dir/restore-db.sh" "$backup_file" <<< "$target_database"

restored_count="$(psql "$RESTORE_DATABASE_URL" -X -Atq -v ON_ERROR_STOP=1 -c "SELECT count(*) FROM organizations WHERE slug='restore-fixture'")"
old_count="$(psql "$RESTORE_DATABASE_URL" -X -Atq -v ON_ERROR_STOP=1 -c "SELECT count(*) FROM organizations WHERE slug='old-fixture'")"
sentinel_count="$(psql "$RESTORE_DATABASE_URL" -X -Atq -v ON_ERROR_STOP=1 -c 'SELECT count(*) FROM restore_sentinel')"
if [[ "$restored_count" != "1" || "$old_count" != "0" || "$sentinel_count" != "1" ]]; then
  echo "Restore verification mismatch: restored=$restored_count old=$old_count sentinel=$sentinel_count" >&2
  exit 1
fi
if RESTORE_DATABASE_URL="$RESTORE_DATABASE_URL" RESTORE_TARGET_ENV=staging \
  "$script_dir/restore-db.sh" "$backup_file" </dev/null; then
  echo "Restore unexpectedly accepted an environment marker mismatch." >&2
  exit 1
fi

tampered_file="$test_root/tampered.dump"
cp "$backup_file" "$tampered_file"
printf 'tamper' >> "$tampered_file"
cp "$backup_file.sha256" "$tampered_file.sha256"
if RESTORE_DATABASE_URL="$RESTORE_DATABASE_URL" RESTORE_TARGET_ENV=local \
  "$script_dir/restore-db.sh" "$tampered_file" </dev/null; then
  echo "Tampered archive unexpectedly passed checksum verification." >&2
  exit 1
fi

echo "Backup/restore integration passed: migrations, checksums, data recovery, object replacement, and tamper rejection."
