#!/bin/bash

# 🚀 INNGEST MIGRATION SCRIPT: ai-server → 999-agents-telegraf
# This script automates the migration of Inngest functions from ai-server to telegraf

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Paths
AI_SERVER_PATH="/Users/playra/ai-server"
TELEGRAF_PATH="/Users/playra/999-agents-telegraf"
BACKUP_PATH="/tmp/inngest-migration-backup-$(date +%Y%m%d-%H%M%S)"

echo -e "${BLUE}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║        INNGEST MIGRATION: ai-server → telegraf             ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Function to print section headers
print_section() {
    echo -e "\n${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${YELLOW}  $1${NC}"
    echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}\n"
}

# Function to print status
print_status() {
    echo -e "${GREEN}✓${NC} $1"
}

# Function to print error
print_error() {
    echo -e "${RED}✗${NC} $1"
}

# Function to print warning
print_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

# Step 0: Pre-flight checks
print_section "Step 0: Pre-flight Checks"

if [ ! -d "$AI_SERVER_PATH" ]; then
    print_error "ai-server path not found: $AI_SERVER_PATH"
    exit 1
fi
print_status "ai-server path verified"

if [ ! -d "$TELEGRAF_PATH" ]; then
    print_error "telegraf path not found: $TELEGRAF_PATH"
    exit 1
fi
print_status "telegraf path verified"

# Step 1: Create backup
print_section "Step 1: Creating Backup"

mkdir -p "$BACKUP_PATH"
cp -r "$TELEGRAF_PATH/src/inngest_app" "$BACKUP_PATH/" 2>/dev/null || true
print_status "Backup created at: $BACKUP_PATH"

# Step 2: Create new directory structure
print_section "Step 2: Creating Directory Structure"

mkdir -p "$TELEGRAF_PATH/src/inngest_app/functions/render"
mkdir -p "$TELEGRAF_PATH/src/inngest_app/functions/content"
mkdir -p "$TELEGRAF_PATH/src/inngest_app/functions/training"
mkdir -p "$TELEGRAF_PATH/src/inngest_app/functions/image"
mkdir -p "$TELEGRAF_PATH/src/inngest_app/functions/payments"
mkdir -p "$TELEGRAF_PATH/src/inngest_app/functions/broadcast"
mkdir -p "$TELEGRAF_PATH/src/inngest_app/functions/monitoring"
mkdir -p "$TELEGRAF_PATH/src/helpers/inngest"

print_status "Directory structure created"

# Step 3: Copy render functions (Phase 1 - HIGH PRIORITY)
print_section "Step 3: Migrating Render Functions (Phase 1)"

if [ -d "$AI_SERVER_PATH/src/inngest-functions/render" ]; then
    cp -r "$AI_SERVER_PATH/src/inngest-functions/render/"* "$TELEGRAF_PATH/src/inngest_app/functions/render/"
    print_status "Render functions copied"
else
    print_warning "Render functions not found in ai-server"
fi

# Step 4: Copy content generation functions (Phase 2)
print_section "Step 4: Migrating Content Functions (Phase 2)"

CONTENT_FUNCTIONS=(
    "analyzeCompetitorReels"
    "instagramScraper-v2"
    "findCompetitors"
    "extractTopContent"
    "generateContentScripts"
    "generateScenarioClips"
    "generateDetailedScript"
)

for func in "${CONTENT_FUNCTIONS[@]}"; do
    if [ -f "$AI_SERVER_PATH/src/inngest-functions/${func}.ts" ]; then
        cp "$AI_SERVER_PATH/src/inngest-functions/${func}.ts" "$TELEGRAF_PATH/src/inngest_app/functions/content/"
        print_status "Copied ${func}.ts"

        # Copy test file if exists
        if [ -f "$AI_SERVER_PATH/src/inngest-functions/${func}.test.ts" ]; then
            cp "$AI_SERVER_PATH/src/inngest-functions/${func}.test.ts" "$TELEGRAF_PATH/src/inngest_app/functions/content/"
            print_status "  └─ Copied ${func}.test.ts"
        fi
    fi
done

# Step 5: Copy training functions (Phase 3)
print_section "Step 5: Migrating Training Functions (Phase 3)"

TRAINING_FUNCTIONS=(
    "generateModelTraining"
    "modelTrainingV2"
)

for func in "${TRAINING_FUNCTIONS[@]}"; do
    if [ -f "$AI_SERVER_PATH/src/inngest-functions/${func}.ts" ]; then
        # Check if file already exists in telegraf
        if [ -f "$TELEGRAF_PATH/src/inngest_app/functions/training/${func}.ts" ]; then
            print_warning "${func}.ts already exists, creating .ai-server.ts version"
            cp "$AI_SERVER_PATH/src/inngest-functions/${func}.ts" "$TELEGRAF_PATH/src/inngest_app/functions/training/${func}.ai-server.ts"
        else
            cp "$AI_SERVER_PATH/src/inngest-functions/${func}.ts" "$TELEGRAF_PATH/src/inngest_app/functions/training/"
            print_status "Copied ${func}.ts"
        fi
    fi
done

# Step 6: Copy image functions (Phase 3)
print_section "Step 6: Migrating Image Functions (Phase 3)"

IMAGE_FUNCTIONS=(
    "neuroImageGeneration"
    "morphImages"
)

for func in "${IMAGE_FUNCTIONS[@]}"; do
    if [ -f "$AI_SERVER_PATH/src/inngest-functions/${func}.ts" ]; then
        cp "$AI_SERVER_PATH/src/inngest-functions/${func}.ts" "$TELEGRAF_PATH/src/inngest_app/functions/image/"
        print_status "Copied ${func}.ts"
    fi
done

# Step 7: Copy payment & broadcast functions (Phase 4)
print_section "Step 7: Migrating Payments & Broadcast (Phase 4)"

if [ -f "$AI_SERVER_PATH/src/inngest-functions/paymentProcessing.ts" ]; then
    cp "$AI_SERVER_PATH/src/inngest-functions/paymentProcessing.ts" "$TELEGRAF_PATH/src/inngest_app/functions/payments/"
    print_status "Copied paymentProcessing.ts"
fi

if [ -f "$AI_SERVER_PATH/src/inngest-functions/broadcastMessage.ts" ]; then
    cp "$AI_SERVER_PATH/src/inngest-functions/broadcastMessage.ts" "$TELEGRAF_PATH/src/inngest_app/functions/broadcast/"
    print_status "Copied broadcastMessage.ts"
fi

# Step 8: Copy monitoring functions (Phase 4)
print_section "Step 8: Migrating Monitoring Functions (Phase 4)"

MONITORING_FUNCTIONS=(
    "logMonitor"
    "criticalErrorMonitor"
)

for func in "${MONITORING_FUNCTIONS[@]}"; do
    if [ -f "$AI_SERVER_PATH/src/inngest-functions/${func}.ts" ]; then
        cp "$AI_SERVER_PATH/src/inngest-functions/${func}.ts" "$TELEGRAF_PATH/src/inngest_app/functions/monitoring/"
        print_status "Copied ${func}.ts"
    fi
done

# Step 9: Copy helpers
print_section "Step 9: Migrating Helpers"

if [ -d "$AI_SERVER_PATH/src/helpers/inngest" ]; then
    cp -r "$AI_SERVER_PATH/src/helpers/inngest/"* "$TELEGRAF_PATH/src/helpers/inngest/" 2>/dev/null || true
    print_status "Helpers copied"
fi

# Step 10: Copy core files
print_section "Step 10: Migrating Core Files"

if [ -f "$AI_SERVER_PATH/src/core/inngest/clients.ts" ]; then
    cp "$AI_SERVER_PATH/src/core/inngest/clients.ts" "$TELEGRAF_PATH/src/inngest_app/client.ai-server.ts"
    print_status "Copied clients.ts (review needed for merge)"
fi

# Step 11: Generate migration report
print_section "Step 11: Generating Migration Report"

REPORT_FILE="$TELEGRAF_PATH/docs/MIGRATION_REPORT_$(date +%Y%m%d-%H%M%S).md"

cat > "$REPORT_FILE" << EOF
# INNGEST MIGRATION REPORT
Generated: $(date)

## Migration Summary
- Source: $AI_SERVER_PATH
- Target: $TELEGRAF_PATH
- Backup: $BACKUP_PATH

## Files Migrated

### Render Functions (Phase 1)
$(find "$TELEGRAF_PATH/src/inngest_app/functions/render" -type f -name "*.ts" 2>/dev/null | sed 's/.*\//  - /' || echo "  - None")

### Content Functions (Phase 2)
$(find "$TELEGRAF_PATH/src/inngest_app/functions/content" -type f -name "*.ts" 2>/dev/null | sed 's/.*\//  - /' || echo "  - None")

### Training Functions (Phase 3)
$(find "$TELEGRAF_PATH/src/inngest_app/functions/training" -type f -name "*.ts" 2>/dev/null | sed 's/.*\//  - /' || echo "  - None")

### Image Functions (Phase 3)
$(find "$TELEGRAF_PATH/src/inngest_app/functions/image" -type f -name "*.ts" 2>/dev/null | sed 's/.*\//  - /' || echo "  - None")

### Payment Functions (Phase 4)
$(find "$TELEGRAF_PATH/src/inngest_app/functions/payments" -type f -name "*.ts" 2>/dev/null | sed 's/.*\//  - /' || echo "  - None")

### Broadcast Functions (Phase 4)
$(find "$TELEGRAF_PATH/src/inngest_app/functions/broadcast" -type f -name "*.ts" 2>/dev/null | sed 's/.*\//  - /' || echo "  - None")

### Monitoring Functions (Phase 4)
$(find "$TELEGRAF_PATH/src/inngest_app/functions/monitoring" -type f -name "*.ts" 2>/dev/null | sed 's/.*\//  - /' || echo "  - None")

## Next Steps

1. **Review migrated files** for import path changes
2. **Update imports** from ai-server paths to telegraf paths
3. **Merge client.ai-server.ts** into existing client.ts
4. **Test each function** in isolation
5. **Update index.ts** to export all migrated functions
6. **Run build**: \`npm run build\`
7. **Run tests**: \`npm run test\`

## Rollback Instructions

If migration needs to be rolled back:
\`\`\`bash
rm -rf $TELEGRAF_PATH/src/inngest_app/functions/render
rm -rf $TELEGRAF_PATH/src/inngest_app/functions/content
rm -rf $TELEGRAF_PATH/src/inngest_app/functions/training
rm -rf $TELEGRAF_PATH/src/inngest_app/functions/image
rm -rf $TELEGRAF_PATH/src/inngest_app/functions/payments
rm -rf $TELEGRAF_PATH/src/inngest_app/functions/broadcast
rm -rf $TELEGRAF_PATH/src/inngest_app/functions/monitoring
cp -r $BACKUP_PATH/inngest_app/* $TELEGRAF_PATH/src/inngest_app/
\`\`\`

## Files Requiring Manual Review

- [ ] src/inngest_app/client.ai-server.ts (merge into client.ts)
- [ ] Import paths in all migrated functions
- [ ] Environment variables in .env
- [ ] Dependencies in package.json

EOF

print_status "Migration report created: $REPORT_FILE"

# Final summary
print_section "Migration Complete! 🎉"

echo -e "${GREEN}Summary:${NC}"
echo -e "  • Backup location: $BACKUP_PATH"
echo -e "  • Migration report: $REPORT_FILE"
echo -e ""
echo -e "${YELLOW}Next Steps:${NC}"
echo -e "  1. Review migration report"
echo -e "  2. Update import paths in migrated files"
echo -e "  3. Merge client.ai-server.ts into client.ts"
echo -e "  4. Update src/inngest_app/functions/index.ts"
echo -e "  5. Run: npm run build"
echo -e "  6. Run: npm run test"
echo -e "  7. Test locally before deploying"
echo -e ""
echo -e "${BLUE}Documentation:${NC}"
echo -e "  • Migration Plan: docs/INNGEST_MIGRATION_PLAN.md"
echo -e "  • Migration Report: $REPORT_FILE"
echo -e ""

exit 0
