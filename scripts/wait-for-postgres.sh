#!/bin/sh
# wait-for-postgres.sh
# Wait for PostgreSQL to be ready before running commands

set -e

host="$1"
port="${2:-5432}"
shift 2
cmd="$@"

until PGPASSWORD="$POSTGRES_PASSWORD" psql -h "$host" -p "$port" -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c '\q'; do
  >&2 echo "Postgres is unavailable - sleeping"
  sleep 1
done

>&2 echo "Postgres is up - executing command"
exec $cmd
