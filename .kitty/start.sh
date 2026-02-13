#!/bin/bash
cd "$1"

# Open render server in right pane
kitty @ launch --location=vsplit bash -c "set -a && source .env && set +a && echo 'Render Server:8080' && pnpm exec tsx app/services/render/index.ts"

# Run frontend in left pane
set -a && source .env && set +a
echo "Frontend:5173"
pnpm dev
