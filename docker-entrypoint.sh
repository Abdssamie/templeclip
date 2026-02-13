#!/bin/sh
set -e

echo "🔄 Running database migrations..."
npx tsx app/lib/migrate.ts

echo "✅ Migrations complete. Starting application..."
exec "$@"
