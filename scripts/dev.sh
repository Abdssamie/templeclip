#!/bin/bash
# KIMU Dev - Simple kitty workflow
# Left: Frontend (5173) | Right: Render Server (8080)

echo "Starting KIMU development environment..."

# Start Redis in Docker
docker run -d --name kimu-redis -p 6379:6379 redis:8-bookworm 2>/dev/null || docker start kimu-redis 2>/dev/null
echo "✓ Redis running on port 6379"

# Create a simple startup script
mkdir -p .kitty
cat >.kitty/start.sh <<'EOF'
#!/bin/bash
cd "$1"

# Open render server in right pane
kitty @ launch --location=vsplit bash -c "set -a && source .env && set +a && echo 'Render Server:8080' && pnpm exec tsx app/services/render/index.ts"

# Run frontend in left pane
set -a && source .env && set +a
echo "Frontend:5173"
pnpm dev
EOF

chmod +x .kitty/start.sh

# Open new kitty window with the startup script
kitty --start-as=maximized --title="KIMU Dev" ./.kitty/start.sh "$PWD"
