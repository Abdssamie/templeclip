#!/bin/bash

# Load environment variables from .env.docker
set -a
source .env.docker
set +a

# Run docker-compose with the sourced environment variables
docker compose up "$@" &

# Wait for postgres to be healthy
echo "Waiting for postgres to be ready..."
until docker exec kimu-postgres pg_isready -U postgres > /dev/null 2>&1; do
  sleep 1
done

echo "Running database migrations..."
docker exec kimu-frontend npx tsx app/lib/migrate.ts

echo "Database migrations completed!"
echo "Application is ready at http://localhost:5173"

# Wait for docker compose
wait
