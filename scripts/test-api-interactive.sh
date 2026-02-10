#!/usr/bin/env bash
# Interactive script to test the Scene API
# Usage: ./scripts/test-api-interactive.sh

set -e

echo "🧪 Scene API Interactive Tester"
echo "================================"
echo ""

# Check if server is running
if ! curl -s http://localhost:5173 > /dev/null 2>&1; then
  echo "❌ Error: Server is not running on http://localhost:5173"
  echo "   Please start the server with: pnpm dev"
  exit 1
fi

echo "✅ Server is running"
echo ""

# Get project and scene info
echo "📦 Fetching your projects and scenes..."
echo ""

PROJECT_DATA=$(pnpm dlx tsx scripts/get-scene-info.ts 2>/dev/null | grep -A 20 "Found" || echo "")

if [ -z "$PROJECT_DATA" ]; then
  echo "❌ Could not fetch project data"
  exit 1
fi

echo "$PROJECT_DATA"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Default values from database
DEFAULT_PROJECT_ID="c2f1278f-09bf-4efd-9fd0-7105506cafad"
DEFAULT_SCENE_ID="867937a7-26c5-4602-8848-3e1843f42194"

# Ask for project ID
echo "📝 Enter Project ID (or press Enter to use default):"
echo "   Default: $DEFAULT_PROJECT_ID"
read -r PROJECT_ID
PROJECT_ID=${PROJECT_ID:-$DEFAULT_PROJECT_ID}

echo ""
echo "📝 Enter Scene ID (or press Enter to use default, or 'skip' to list all scenes):"
echo "   Default: $DEFAULT_SCENE_ID"
read -r SCENE_ID
SCENE_ID=${SCENE_ID:-$DEFAULT_SCENE_ID}

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Test 1: Get session (no auth required)
echo "🧪 Test 1: Check auth session endpoint"
echo "   GET /api/auth/session"
echo ""
SESSION_RESPONSE=$(curl -s -c /tmp/kimu-cookies.txt http://localhost:5173/api/auth/session)
echo "Response: $SESSION_RESPONSE"
echo ""

# Check if user is logged in
if echo "$SESSION_RESPONSE" | grep -q '"user":null'; then
  echo "⚠️  You are NOT logged in!"
  echo ""
  echo "Please log in first:"
  echo "1. Open http://localhost:5173 in your browser"
  echo "2. Log in with email/password or Google"
  echo "3. Come back and run this script again"
  echo ""
  exit 1
fi

echo "✅ You are logged in!"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Test 2: List all scenes in project
echo "🧪 Test 2: List all scenes in project"
echo "   GET /api/scenes/$PROJECT_ID"
echo ""

# Try to get session cookie from browser
echo "Attempting to use session from browser..."
echo ""

# Create a simple Node.js script to make authenticated request
cat > /tmp/test-api.js << 'EOF'
const http = require('http');

const projectId = process.argv[2];
const sceneId = process.argv[3];

function makeRequest(path) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 5173,
      path: path,
      method: 'GET',
      headers: {
        'Accept': 'application/json'
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        resolve({ status: res.statusCode, data: data, headers: res.headers });
      });
    });

    req.on('error', reject);
    req.end();
  });
}

async function test() {
  console.log('Testing Scene API endpoints...\n');
  
  // Test 1: List scenes
  console.log(`📋 GET /api/scenes/${projectId}`);
  try {
    const result1 = await makeRequest(`/api/scenes/${projectId}`);
    console.log(`Status: ${result1.status}`);
    console.log(`Response: ${result1.data}\n`);
  } catch (err) {
    console.error('Error:', err.message);
  }

  // Test 2: Get single scene (if not 'skip')
  if (sceneId !== 'skip') {
    console.log(`📋 GET /api/scenes/${projectId}/${sceneId}`);
    try {
      const result2 = await makeRequest(`/api/scenes/${projectId}/${sceneId}`);
      console.log(`Status: ${result2.status}`);
      console.log(`Response: ${result2.data}\n`);
    } catch (err) {
      console.error('Error:', err.message);
    }
  }
}

test();
EOF

node /tmp/test-api.js "$PROJECT_ID" "$SCENE_ID"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "💡 Note: If you see 'Unauthorized', the API requires authentication."
echo "   The endpoints are protected and need a valid session."
echo ""
echo "🔧 To test with authentication, you need to:"
echo "   1. Be logged in to the app in your browser"
echo "   2. Use the same session in your API requests"
echo ""
echo "📖 See docs/api/scene-rendering.md for more details"
echo ""

# Cleanup
rm -f /tmp/test-api.js /tmp/kimu-cookies.txt
