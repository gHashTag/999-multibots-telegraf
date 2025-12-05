#!/bin/bash

# 🔧 FIX INNGEST IMPORTS AND EXTERNAL CALLS
# Replaces all external dependencies with local ones

set -e

echo "🔧 Fixing Inngest Functions Imports and External Calls..."
echo "======================================================="

FUNCTIONS_DIR="/Users/playra/999-agents-telegraf/worktrees/transfer-server/src/inngest_app/functions"

# Function to fix imports in a file
fix_imports() {
    local file=$1
    echo "  📝 Fixing: $(basename $file)"

    # Replace external server URLs
    sed -i '' "s|https://999-agents\.site|http://localhost:3000|g" "$file" 2>/dev/null || true
    sed -i '' "s|process\.env\.SERVER_API_URL.*'https://999-agents\.site'|'http://localhost:3000'|g" "$file" 2>/dev/null || true

    # Fix import paths for local modules
    sed -i '' "s|from '\.\./\.\./services|from '@/core|g" "$file" 2>/dev/null || true
    sed -i '' "s|from '\.\./\.\./core|from '@/core|g" "$file" 2>/dev/null || true
    sed -i '' "s|from '\.\./\.\./utils|from '@/utils|g" "$file" 2>/dev/null || true
    sed -i '' "s|from '\.\./\.\./config|from '@/config|g" "$file" 2>/dev/null || true
    sed -i '' "s|from '\.\./\.\./interfaces|from '@/interfaces|g" "$file" 2>/dev/null || true

    # Fix Inngest client imports
    sed -i '' "s|from '\.\./inngestClient'|from '@/inngest_app/inngestClient'|g" "$file" 2>/dev/null || true
    sed -i '' "s|from '\.\./\.\./inngestClient'|from '@/inngest_app/inngestClient'|g" "$file" 2>/dev/null || true

    # Replace axios calls to ai-server with local handlers
    sed -i '' "s|await axios\.post.*'/api/elevenlabs/.*|// TODO: Replace with local createVoiceElevenLabs|g" "$file" 2>/dev/null || true
    sed -i '' "s|await axios\.post.*'/api/replicate/.*|// TODO: Replace with local Replicate client|g" "$file" 2>/dev/null || true
    sed -i '' "s|await axios\.post.*'/api/openai/.*|// TODO: Replace with local OpenAI client|g" "$file" 2>/dev/null || true
}

echo ""
echo "📦 Processing Content Functions..."
for file in "$FUNCTIONS_DIR"/content/*.ts; do
    [ -f "$file" ] && fix_imports "$file"
done

echo ""
echo "📸 Processing Instagram Functions..."
for file in "$FUNCTIONS_DIR"/instagram/*.ts; do
    [ -f "$file" ] && fix_imports "$file"
done

echo ""
echo "📊 Processing Monitoring Functions..."
for file in "$FUNCTIONS_DIR"/monitoring/*.ts; do
    [ -f "$file" ] && fix_imports "$file"
done

echo ""
echo "🤖 Processing Training Functions..."
for file in "$FUNCTIONS_DIR"/training/*.ts; do
    [ -f "$file" ] && fix_imports "$file"
done

echo ""
echo "🎨 Processing Generation Functions..."
for file in "$FUNCTIONS_DIR"/generation/*.ts; do
    [ -f "$file" ] && fix_imports "$file"
done

echo ""
echo "💳 Processing Payment Functions..."
for file in "$FUNCTIONS_DIR"/payments/*.ts; do
    [ -f "$file" ] && fix_imports "$file"
done

echo ""
echo "📢 Processing Broadcast Functions..."
for file in "$FUNCTIONS_DIR"/broadcast/*.ts; do
    [ -f "$file" ] && fix_imports "$file"
done

echo ""
echo "🎬 Processing Render Module..."
for file in "$FUNCTIONS_DIR"/render/*.ts; do
    [ -f "$file" ] && fix_imports "$file"
done

for file in "$FUNCTIONS_DIR"/render/helpers/*.ts; do
    [ -f "$file" ] && fix_imports "$file"
done

echo ""
echo "📁 Processing Existing Functions..."
for file in "$FUNCTIONS_DIR"/existing/*.ts; do
    [ -f "$file" ] && fix_imports "$file"
done

echo ""
echo "🔍 Verification..."
echo "=================="

# Check for remaining external calls
echo "Checking for remaining 999-agents.site calls..."
REMAINING_EXTERNAL=$(grep -r '999-agents.site' "$FUNCTIONS_DIR" 2>/dev/null | wc -l)
if [ "$REMAINING_EXTERNAL" -gt 0 ]; then
    echo "⚠️  Found $REMAINING_EXTERNAL references to 999-agents.site"
    grep -r '999-agents.site' "$FUNCTIONS_DIR" | head -5
else
    echo "✅ No references to 999-agents.site found"
fi

echo ""
echo "Checking for axios.post calls..."
AXIOS_CALLS=$(grep -r 'axios.post' "$FUNCTIONS_DIR" 2>/dev/null | wc -l)
if [ "$AXIOS_CALLS" -gt 0 ]; then
    echo "⚠️  Found $AXIOS_CALLS axios.post calls that may need updating"
    grep -r 'axios.post' "$FUNCTIONS_DIR" | head -5
else
    echo "✅ No axios.post calls found"
fi

echo ""
echo "✅ Import fixing complete!"
echo ""
echo "📋 TODO: Manual fixes needed for:"
echo "  1. Replace axios calls with local service implementations"
echo "  2. Update Inngest client configuration"
echo "  3. Test each function individually"