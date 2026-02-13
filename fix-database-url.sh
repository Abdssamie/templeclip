#!/bin/bash

# Read the current .env.docker file
source .env.docker

# URL-encode the password
ENCODED_PASSWORD=$(printf %s "$POSTGRES_PASSWORD" | jq -sRr @uri)

# Generate the correct DATABASE_URL
NEW_DATABASE_URL="postgres://${POSTGRES_USER}:${ENCODED_PASSWORD}@postgres:5432/${POSTGRES_DB}"

echo "Current password: $POSTGRES_PASSWORD"
echo "Encoded password: $ENCODED_PASSWORD"
echo ""
echo "Update your .env.docker with this DATABASE_URL:"
echo "DATABASE_URL=$NEW_DATABASE_URL"
