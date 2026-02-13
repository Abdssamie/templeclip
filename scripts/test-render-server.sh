#!/bin/bash
# scripts/test-render-server.sh

echo "Testing render server..."

# Health check
curl http://localhost:8080/health

echo ""
echo "Test complete!"
