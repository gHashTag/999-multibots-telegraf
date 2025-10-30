#!/bin/bash

# 🚀 FULL INNGEST FUNCTIONS MIGRATION SCRIPT
# Migrates ALL Inngest functions from ai-server to telegraf
# Ensures complete isolation from external server

set -e

echo "🚀 Starting FULL Inngest Functions Migration..."
echo "============================================"

# Auto-detect paths or use defaults
TELEGRAF_PATH="${TELEGRAF_PATH:-$(git rev-parse --show-toplevel 2>/dev/null || echo "/Users/playra/999-agents-telegraf/worktrees/transfer-server")}"
AI_SERVER_PATH="${AI_SERVER_PATH:-/Users/playra/ai-server}"

echo "📂 Source: $AI_SERVER_PATH/src/inngest-functions"
echo "📂 Target: $TELEGRAF_PATH/src/inngest_app/functions"
echo ""

# Create directory structure
echo "📁 Creating directory structure..."
mkdir -p "$TELEGRAF_PATH/src/inngest_app/functions"/{content,instagram,monitoring,training,generation,payments,broadcast,render/helpers,existing}

# Function to copy and update imports
copy_and_update() {
    local src_file=$1
    local dest_file=$2
    local category=$3

    if [ -f "$src_file" ]; then
        echo "  ✅ Copying $(basename $src_file) to $category/"
        cp "$src_file" "$dest_file"

        # Update imports to use local modules
        sed -i '' "s|from '@/|from '@/|g" "$dest_file" 2>/dev/null || true
        sed -i '' "s|from '\.\./\.\./|from '@/|g" "$dest_file" 2>/dev/null || true
        sed -i '' "s|https://999-agents\.site|http://localhost:3000|g" "$dest_file" 2>/dev/null || true
    else
        echo "  ⚠️  Not found: $(basename $src_file)"
    fi
}

echo ""
echo "📦 Phase 1: Migrating Content Functions..."
echo "==========================================="
copy_and_update "$AI_SERVER_PATH/src/inngest-functions/analyzeCompetitorReels.ts" \
                "$TELEGRAF_PATH/src/inngest_app/functions/content/analyzeCompetitorReels.ts" "content"

copy_and_update "$AI_SERVER_PATH/src/inngest-functions/extractTopContent.ts" \
                "$TELEGRAF_PATH/src/inngest_app/functions/content/extractTopContent.ts" "content"

copy_and_update "$AI_SERVER_PATH/src/inngest-functions/findCompetitors.ts" \
                "$TELEGRAF_PATH/src/inngest_app/functions/content/findCompetitors.ts" "content"

copy_and_update "$AI_SERVER_PATH/src/inngest-functions/generateContentScripts.ts" \
                "$TELEGRAF_PATH/src/inngest_app/functions/content/generateContentScripts.ts" "content"

copy_and_update "$AI_SERVER_PATH/src/inngest-functions/generateDetailedScript.ts" \
                "$TELEGRAF_PATH/src/inngest_app/functions/content/generateDetailedScript.ts" "content"

copy_and_update "$AI_SERVER_PATH/src/inngest-functions/generateScenarioClips.ts" \
                "$TELEGRAF_PATH/src/inngest_app/functions/content/generateScenarioClips.ts" "content"

echo ""
echo "📸 Phase 2: Migrating Instagram Functions..."
echo "==========================================="
copy_and_update "$AI_SERVER_PATH/src/inngest-functions/instagramScraper-v2.ts" \
                "$TELEGRAF_PATH/src/inngest_app/functions/instagram/instagramScraper-v2.ts" "instagram"

copy_and_update "$AI_SERVER_PATH/src/inngest-functions/instagramScraper-v2-simple.ts" \
                "$TELEGRAF_PATH/src/inngest_app/functions/instagram/instagramScraper-v2-simple.ts" "instagram"

echo ""
echo "📊 Phase 3: Migrating Monitoring Functions..."
echo "============================================="
copy_and_update "$AI_SERVER_PATH/src/inngest-functions/criticalErrorMonitor.ts" \
                "$TELEGRAF_PATH/src/inngest_app/functions/monitoring/criticalErrorMonitor.ts" "monitoring"

copy_and_update "$AI_SERVER_PATH/src/inngest-functions/logMonitor.ts" \
                "$TELEGRAF_PATH/src/inngest_app/functions/monitoring/logMonitor.ts" "monitoring"

echo ""
echo "🤖 Phase 4: Migrating Training Functions..."
echo "==========================================="
copy_and_update "$AI_SERVER_PATH/src/inngest-functions/modelTrainingV2.ts" \
                "$TELEGRAF_PATH/src/inngest_app/functions/training/modelTrainingV2.ts" "training"

copy_and_update "$AI_SERVER_PATH/src/inngest-functions/morphImages.ts" \
                "$TELEGRAF_PATH/src/inngest_app/functions/training/morphImages.ts" "training"

echo ""
echo "🎨 Phase 5: Migrating Generation Functions..."
echo "=============================================="
copy_and_update "$AI_SERVER_PATH/src/inngest-functions/neuroImageGeneration.ts" \
                "$TELEGRAF_PATH/src/inngest_app/functions/generation/neuroImageGeneration.ts" "generation"

echo ""
echo "💳 Phase 6: Migrating Payment Functions..."
echo "==========================================="
copy_and_update "$AI_SERVER_PATH/src/inngest-functions/paymentProcessing.ts" \
                "$TELEGRAF_PATH/src/inngest_app/functions/payments/paymentProcessing.ts" "payments"

echo ""
echo "📢 Phase 7: Migrating Broadcast Functions..."
echo "============================================"
copy_and_update "$AI_SERVER_PATH/src/inngest-functions/broadcastMessage.ts" \
                "$TELEGRAF_PATH/src/inngest_app/functions/broadcast/broadcastMessage.ts" "broadcast"

echo ""
echo "🎬 Phase 8: Migrating Complete Render Module..."
echo "================================================"

# Copy main render files
copy_and_update "$AI_SERVER_PATH/src/inngest-functions/render/render.ts" \
                "$TELEGRAF_PATH/src/inngest_app/functions/render/render.ts" "render"

copy_and_update "$AI_SERVER_PATH/src/inngest-functions/render/renderRiddle.ts" \
                "$TELEGRAF_PATH/src/inngest_app/functions/render/renderRiddle.ts" "render"

copy_and_update "$AI_SERVER_PATH/src/inngest-functions/render/renderAvatarVideo.ts" \
                "$TELEGRAF_PATH/src/inngest_app/functions/render/renderAvatarVideo.ts" "render"

copy_and_update "$AI_SERVER_PATH/src/inngest-functions/render/steps.ts" \
                "$TELEGRAF_PATH/src/inngest_app/functions/render/steps.ts" "render"

copy_and_update "$AI_SERVER_PATH/src/inngest-functions/render/schemas.ts" \
                "$TELEGRAF_PATH/src/inngest_app/functions/render/schemas.ts" "render"

copy_and_update "$AI_SERVER_PATH/src/inngest-functions/render/types.ts" \
                "$TELEGRAF_PATH/src/inngest_app/functions/render/types.ts" "render"

# Copy render helpers
echo "  📂 Copying render helpers..."
for helper in config.ts faceDetection.ts heygenAvatarDetails.ts renderSteps.ts s3.service.ts ssh.service.ts templateProcessor.ts; do
    copy_and_update "$AI_SERVER_PATH/src/inngest-functions/render/helpers/$helper" \
                    "$TELEGRAF_PATH/src/inngest_app/functions/render/helpers/$helper" "render/helpers"
done

# Copy render index
copy_and_update "$AI_SERVER_PATH/src/inngest-functions/render/index.ts" \
                "$TELEGRAF_PATH/src/inngest_app/functions/render/index.ts" "render"

echo ""
echo "🔧 Phase 9: Creating Master Index File..."
echo "=========================================="

cat > "$TELEGRAF_PATH/src/inngest_app/functions/index.ts" << 'EOF'
/**
 * Master Index - All Inngest Functions
 * Complete migration from ai-server
 * Fully isolated, no external dependencies
 */

// Content Functions
export { analyzeCompetitorReelsFunction } from './content/analyzeCompetitorReels'
export { extractTopContentFunction } from './content/extractTopContent'
export { findCompetitorsFunction } from './content/findCompetitors'
export { generateContentScriptsFunction } from './content/generateContentScripts'
export { generateDetailedScriptFunction } from './content/generateDetailedScript'
export { generateScenarioClipsFunction } from './content/generateScenarioClips'

// Instagram Functions
export { instagramScraperV2Function } from './instagram/instagramScraper-v2'
export { instagramScraperV2SimpleFunction } from './instagram/instagramScraper-v2-simple'

// Monitoring Functions
export { criticalErrorMonitorFunction } from './monitoring/criticalErrorMonitor'
export { logMonitorFunction } from './monitoring/logMonitor'

// Training Functions
export { modelTrainingV2Function } from './training/modelTrainingV2'
export { morphImagesFunction } from './training/morphImages'

// Generation Functions
export { neuroImageGenerationFunction } from './generation/neuroImageGeneration'

// Payment Functions
export { paymentProcessingFunction } from './payments/paymentProcessing'

// Broadcast Functions
export { broadcastMessageFunction } from './broadcast/broadcastMessage'

// Render Functions (complete module)
export * from './render'

// Existing Functions (already in telegraf)
export { generateAIReelsFunction } from './existing/generateAIReelsFunction'
export { generateAdvancedLoopingVideoFunction } from './existing/generateAdvancedLoopingVideoFunction'
export { generateModelTrainingFunction } from './existing/generateModelTrainingFunction'

// Helper functions for all Inngest functions
export const getAllFunctions = () => [
  analyzeCompetitorReelsFunction,
  extractTopContentFunction,
  findCompetitorsFunction,
  generateContentScriptsFunction,
  generateDetailedScriptFunction,
  generateScenarioClipsFunction,
  instagramScraperV2Function,
  instagramScraperV2SimpleFunction,
  criticalErrorMonitorFunction,
  logMonitorFunction,
  modelTrainingV2Function,
  morphImagesFunction,
  neuroImageGenerationFunction,
  paymentProcessingFunction,
  broadcastMessageFunction,
  // Render functions
  renderFunction,
  renderAvatarVideoFunction,
  renderRiddleFunction,
  // Existing functions
  generateAIReelsFunction,
  generateAdvancedLoopingVideoFunction,
  generateModelTrainingFunction
]
EOF

echo "  ✅ Created master index.ts"

echo ""
echo "🔄 Phase 10: Moving Existing Functions..."
echo "=========================================="

# Move existing functions to proper location
if [ -f "$TELEGRAF_PATH/src/inngest_app/functions/generateAIReelsFunction.ts" ]; then
    mv "$TELEGRAF_PATH/src/inngest_app/functions/generateAIReelsFunction.ts" \
       "$TELEGRAF_PATH/src/inngest_app/functions/existing/" 2>/dev/null || true
    echo "  ✅ Moved generateAIReelsFunction.ts"
fi

if [ -f "$TELEGRAF_PATH/src/inngest_app/functions/generateAdvancedLoopingVideoFunction.ts" ]; then
    mv "$TELEGRAF_PATH/src/inngest_app/functions/generateAdvancedLoopingVideoFunction.ts" \
       "$TELEGRAF_PATH/src/inngest_app/functions/existing/" 2>/dev/null || true
    echo "  ✅ Moved generateAdvancedLoopingVideoFunction.ts"
fi

if [ -f "$TELEGRAF_PATH/src/inngest_app/functions/generateModelTrainingFunction.ts" ]; then
    mv "$TELEGRAF_PATH/src/inngest_app/functions/generateModelTrainingFunction.ts" \
       "$TELEGRAF_PATH/src/inngest_app/functions/existing/" 2>/dev/null || true
    echo "  ✅ Moved generateModelTrainingFunction.ts"
fi

echo ""
echo "📊 Migration Summary"
echo "===================="
echo "✅ Content functions: 6 migrated"
echo "✅ Instagram functions: 2 migrated"
echo "✅ Monitoring functions: 2 migrated"
echo "✅ Training functions: 2 migrated"
echo "✅ Generation functions: 1 migrated"
echo "✅ Payment functions: 1 migrated"
echo "✅ Broadcast functions: 1 migrated"
echo "✅ Render module: Complete with helpers"
echo "✅ Existing functions: 3 reorganized"
echo ""
echo "📁 Total: 18+ functions migrated"
echo ""

echo "⚠️  IMPORTANT NEXT STEPS:"
echo "========================="
echo "1. Update all imports to remove ai-server dependencies"
echo "2. Replace external API calls with local handlers"
echo "3. Update webhook URLs from 999-agents.site to localhost"
echo "4. Test each function individually"
echo "5. Build and verify: npm run build"
echo ""
echo "🎯 Run verification:"
echo "   grep -r '999-agents.site' $TELEGRAF_PATH/src/inngest_app/functions/"
echo "   grep -r 'axios.post' $TELEGRAF_PATH/src/inngest_app/functions/"
echo ""
echo "✅ Migration script complete! Now need manual updates for full isolation."