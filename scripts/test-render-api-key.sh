#!/bin/bash

# Check if API Key is provided
if [ -z "$API_KEY" ]; then
  echo "❌ Error: API_KEY environment variable is not set."
  echo "Usage: API_KEY=kimu_... ./scripts/test-render-api-key.sh"
  exit 1
fi

echo "🚀 Starting API Render Test with API Key (v1)..."

# Payload: Scene with variable 'my_variable' referencing R2 asset
PAYLOAD='{
  "projectId": "ad8c538b-b0c9-41e9-ab81-ca93aaf6a519",
  "scenes": [{
    "sceneId": "0273cbf5-fca6-4c4a-b127-3b87c630589a",
    "variables": {
      "my_variable": "/api/assets/5d33958a-9c18-439f-97fa-9aecde4b47a4/raw"
    },
    "duration": 5
  }],
  "compositionWidth": 1920,
  "compositionHeight": 1080
}'

# Make the request using Authorization header to the NEW endpoint
# Endpoint: /api/v1/render
RESPONSE=$(curl -s -X POST http://localhost:5173/api/v1/render \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $API_KEY" \
  -d "$PAYLOAD")

echo "Response: $RESPONSE"

# Extract Render ID (requires jq, simple grep fallback if not installed)
RENDER_ID=$(echo "$RESPONSE" | grep -o '"renderId":"[^"]*"' | cut -d'"' -f4)
BUCKET_NAME=$(echo "$RESPONSE" | grep -o '"bucketName":"[^"]*"' | cut -d'"' -f4)

if [ -z "$RENDER_ID" ]; then
  echo "❌ Failed to start render"
  exit 1
fi

echo "✅ Render Started! ID: $RENDER_ID"
echo "⏳ Polling progress..."

# Poll for completion
for i in {1..20}; do
  STATUS_JSON=$(curl -s "http://localhost:5173/api/v1/render?renderId=$RENDER_ID&bucketName=$BUCKET_NAME" \
    -H "Authorization: Bearer $API_KEY")
  
  echo "Poll $i: $STATUS_JSON"
  
  if echo "$STATUS_JSON" | grep -q '"done":true'; then
    OUTPUT_URL=$(echo "$STATUS_JSON" | grep -o '"outputFile":"[^"]*"' | cut -d'"' -f4)
    echo ""
    echo "🎉 Render Complete!"
    echo "📹 Video URL: $OUTPUT_URL"
    exit 0
  fi

  sleep 5
done

echo "⚠️ Timed out waiting for render completion"
