#!/bin/sh
set -e

echo "========================================"
echo "AI SVG Asset Builder - API Startup"
echo "========================================"

# Run database migrations with retry
echo "Running database migrations..."
attempt=1
max_attempts=20
until npx prisma migrate deploy --schema=prisma/schema.prisma; do
  if [ "$attempt" -ge "$max_attempts" ]; then
    echo "Migration failed after $max_attempts attempts"
    exit 1
  fi

  echo "Migration attempt $attempt failed. Retrying in 3s..."
  attempt=$((attempt + 1))
  sleep 3
done

# Generate Prisma client
echo "Generating Prisma client..."
npx prisma generate --schema=prisma/schema.prisma

# Create storage directory if it doesn't exist
mkdir -p /app/storage

echo "========================================"
echo "Starting API server..."
echo "========================================"

# Start the application
exec "$@"
