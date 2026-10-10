#!/usr/bin/env bash
set -euo pipefail

backup_file="${1:-}"
if [[ -z "$backup_file" || ! -f "$backup_file" ]]; then
  echo "Usage: RESTORE_DATABASE_URL=... RESTORE_TARGET_ENV=staging|local $0 <backup.dump>" >&2
  exit 2
fi
if [[ -z "${RESTORE_DATABASE_URL:-}" ]]; then
  echo "Set RESTORE_DATABASE_URL to the intended non-production restore target." >&2
  exit 2
fi
if [[ "${RESTORE_TARGET_ENV:-}" != "staging" && "${RESTORE_TARGET_ENV:-}" != "local" ]]; then
  echo "Set RESTORE_TARGET_ENV to staging or local. Production restores are not supported by this script." >&2
  exit 2
fi
if ! command -v pg_restore >/dev/null || ! command -v psql >/dev/null; then
  echo "Install PostgreSQL client tools (pg_restore and psql)." >&2
  exit 2
fi

checksum_file="${backup_file}.sha256"
if [[ ! -f "$checksum_file" ]]; then
  echo "Matching checksum file not found: $checksum_file" >&2
  exit 2
fi
expected_digest="$(awk 'NR == 1 {print $1}' "$checksum_file")"
if [[ ! "$expected_digest" =~ ^[0-9a-fA-F]{64}$ ]]; then
  echo "Backup checksum file is malformed." >&2
  exit 2
fi
if command -v sha256sum >/dev/null; then
  actual_digest="$(sha256sum "$backup_file" | awk '{print $1}')"
else
  actual_digest="$(shasum -a 256 "$backup_file" | awk '{print $1}')"
fi
expected_digest="$(printf '%s' "$expected_digest" | tr '[:upper:]' '[:lower:]')"
actual_digest="$(printf '%s' "$actual_digest" | tr '[:upper:]' '[:lower:]')"
if [[ "$actual_digest" != "$expected_digest" ]]; then
  echo "Backup checksum does not match; restore cancelled." >&2
  exit 1
fi

target_database="$(psql "$RESTORE_DATABASE_URL" -X -Atq -v ON_ERROR_STOP=1 -c 'SELECT current_database()')"
if [[ -z "$target_database" ]]; then
  echo "Could not identify the restore target database." >&2
  exit 1
fi
target_environment="$(psql "$RESTORE_DATABASE_URL" -X -Atq -v ON_ERROR_STOP=1 -c "SELECT COALESCE(current_setting('asset_register.environment', true), '')")"
if [[ "$target_environment" != "$RESTORE_TARGET_ENV" ]]; then
  echo "Database environment marker '$target_environment' does not match RESTORE_TARGET_ENV='$RESTORE_TARGET_ENV'; restore cancelled." >&2
  exit 1
fi
echo "Target environment: $RESTORE_TARGET_ENV"
echo "Target database: $target_database"
echo "This drops and restores matching objects from the archive; unrelated target objects remain."
read -r -p "Type the target database name to continue: " confirmation
if [[ "$confirmation" != "$target_database" ]]; then
  echo "Confirmation did not match; restore cancelled." >&2
  exit 1
fi

pg_restore --exit-on-error --single-transaction --clean --if-exists --no-owner --no-acl \
  --dbname "$RESTORE_DATABASE_URL" "$backup_file"
echo "Restore completed for the confirmed non-production database."
