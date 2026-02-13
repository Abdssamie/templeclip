#!/bin/bash
# scripts/test-render-adapter.sh

set -e

echo "=== Testing Docker Render Adapter ==="

# Test Docker adapter
pnpm vitest run app/services/docker-render-adapter.test.ts --reporter=verbose

echo -e "\n=== All tests passed! ==="
