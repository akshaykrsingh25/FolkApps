#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "Set DATABASE_URL to the database to back up." >&2
  exit 2
fi
if ! command -v pg_dump >/dev/null || ! command -v shasum >/dev/null && ! command -v sha256sum >/dev/null; then
  echo "Install PostgreSQL client tools (pg_dump and shasum or sha256sum)." >&2
  exit 2
fi

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
source_root="$(cd "$script_dir/../.." && pwd -P)"
backup_dir="${1:-${ASSET_REGISTER_BACKUP_DIR:-}}"
if [[ -z "$backup_dir" ]]; then
  echo "Usage: DATABASE_URL=... $0 <backup-directory>" >&2
  exit 2
fi
mkdir -p "$backup_dir"
backup_dir="$(cd "$backup_dir" && pwd -P)"
if [[ "$backup_dir" == "$source_root" || "$backup_dir" == "$source_root/"* ]]; then
  echo "Backups must be stored outside the Git worktree." >&2
  exit 2
fi
chmod 700 "$backup_dir"

timestamp="$(date -u '+%Y%m%dT%H%M%SZ')"
temp_dump="$(mktemp "$backup_dir/.asset-register-${timestamp}.XXXXXX")"
temp_sum="${temp_dump}.sha256"
trap 'rm -f "$temp_dump" "$temp_sum"' EXIT

pg_dump --format=custom --no-owner --no-acl --dbname "$DATABASE_URL" --file "$temp_dump"
if [[ ! -s "$temp_dump" ]]; then
  echo "Database backup is empty; refusing to publish it." >&2
  exit 1
fi
chmod 600 "$temp_dump"

if command -v sha256sum >/dev/null; then
  digest="$(sha256sum "$temp_dump" | awk '{print $1}')"
else
  digest="$(shasum -a 256 "$temp_dump" | awk '{print $1}')"
fi

final_dump="$backup_dir/asset-register-${timestamp}-${digest:0:12}.dump"
printf '%s  %s\n' "$digest" "$(basename "$final_dump")" > "$temp_sum"
chmod 600 "$temp_sum"
mv "$temp_dump" "$final_dump"
mv "$temp_sum" "$final_dump.sha256"
trap - EXIT
echo "Backup created: $final_dump"
echo "SHA-256: $digest"
