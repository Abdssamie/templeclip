#!/bin/bash

# Test script for Scene API and rendering with variables
# Usage: ./scripts/test-scene-api.sh <project-id> <scene-id> <session-token>

set -e

PROJECT_ID=${1:-""}
SCENE_ID=${2:-""}
SESSION_TOKEN=${3:-""}

if [ -z "$PROJECT_ID" ] || [ -z "$SCENE_ID" ] || [ -z "$SESSION_TOKEN" ]; then
  echo "Usage: ./scripts/test-scene-api.sh <project-id> <scene-id> <session-token>"
  exit 1
fi

API_BASE="http://localhost:5173"
RENDER_BASE="http://localhost:8000"

echo "🧪 Testing Scene API..."
echo ""

# Test 1: List all scenes
echo "1️⃣ Listing all scenes in project..."
curl -X GET "$API_BASE/api/scenes/$PROJECT_ID" \
  -H "Cookie: better-auth.session_token=$SESSION_TOKEN" \
  -s | jq '.'

echo ""
echo "✅ List scenes test complete"
echo ""

# Test 2: Export single scene
echo "2️⃣ Exporting scene template..."
SCENE_DATA=$(curl -X GET "$API_BASE/api/scenes/$PROJECT_ID/$SCENE_ID" \
  -H "Cookie: better-auth.session_token=$SESSION_TOKEN" \
  -s)

echo "$SCENE_DATA" | jq '.'
echo ""
echo "✅ Export scene test complete"
echo ""

# Test 3: Render with variables (requires manual timeline data)
echo "3️⃣ To test rendering with variables, use:"
echo ""
echo "curl -X POST \"$RENDER_BASE/render\" \\"
echo "  -H \"Content-Type: application/json\" \\"
echo "  -d '{"
echo "    \"timelineData\": [...your timeline data...],"
echo "    \"compositionWidth\": 1920,"
echo "    \"compositionHeight\": 1080,"
echo "    \"variableValues\": {"
echo "      \"headline\": \"Test Headline\","
echo "      \"subtitle\": \"Test Subtitle\""
echo "    },"
echo "    \"scenes\": [...your scenes...],"
echo "    \"applyElasticity\": true"
echo "  }' \\"
echo "  --output test-render.mp4"
echo ""

echo "✅ All tests complete!"
