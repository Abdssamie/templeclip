#!/bin/bash

# Load environment variables from .env.docker
set -a
source .env.docker
set +a

# Run docker-compose down with the sourced environment variables
docker compose down "$@"
