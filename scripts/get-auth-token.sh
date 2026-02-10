#!/usr/bin/env bash
# Helper script to get your Better Auth session token from the browser
# Usage: ./scripts/get-auth-token.sh

echo "🔐 How to Get Your Better Auth Session Token"
echo "=============================================="
echo ""
echo "📋 Step-by-Step Instructions:"
echo ""
echo "1. Open your browser and go to: http://localhost:5173"
echo ""
echo "2. Make sure you're logged in (if not, log in first)"
echo ""
echo "3. Open Browser DevTools:"
echo "   - Chrome/Brave: Press F12 or Ctrl+Shift+I (Cmd+Option+I on Mac)"
echo "   - Firefox: Press F12 or Ctrl+Shift+I (Cmd+Option+I on Mac)"
echo ""
echo "4. Go to the 'Console' tab"
echo ""
echo "5. Copy and paste this command into the console:"
echo ""
echo "   document.cookie.split('; ').find(c => c.startsWith('better-auth.session_token='))?.split('=')[1]"
echo ""
echo "6. Press Enter - it will show your session token"
echo ""
echo "7. Copy the token (it will be a long string)"
echo ""
echo "8. Use it in your curl commands like this:"
echo ""
echo "   curl -X GET \"http://localhost:5173/api/scenes/YOUR_PROJECT_ID\" \\"
echo "     -H \"Cookie: better-auth.session_token=YOUR_TOKEN_HERE\""
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "📦 Your Project IDs and Scene IDs:"
echo ""

# Run the get-scene-info script to show project/scene info
if [ -f "$(dirname "$0")/get-scene-info.ts" ]; then
  pnpm dlx tsx "$(dirname "$0")/get-scene-info.ts"
else
  echo "⚠️  Run 'pnpm dlx tsx scripts/get-scene-info.ts' to see your projects and scenes"
fi
