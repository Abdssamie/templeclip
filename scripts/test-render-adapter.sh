#!/bin/bash
# scripts/test-render-adapter.sh

set -e

echo "=== Testing Render Adapter ==="

# Test 1: Lambda mode (default)
echo -e "\n1. Testing Lambda adapter (default)..."
ENABLE_DOCKER_RENDER=false pnpm vitest run app/services/render-adapter.factory.test.ts app/services/lambda-render-adapter.test.ts --reporter=verbose

# Test 2: Docker mode
echo -e "\n2. Testing Docker adapter..."
ENABLE_DOCKER_RENDER=true RENDER_SERVER_URL=http://localhost:8080 pnpm vitest run app/services/docker-render-adapter.test.ts --reporter=verbose

echo -e "\n=== All tests passed! ==="
