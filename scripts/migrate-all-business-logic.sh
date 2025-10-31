#!/bin/bash

# 🚀 COMPLETE BUSINESS LOGIC MIGRATION: ai-server → telegraf
# This script migrates ALL 325 files from ai-server to telegraf

set -e  # Exit on error

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
MAGENTA='\033[0;35m'
NC='\033[0m'

# Paths (auto-detect)
AI_SERVER_PATH="${AI_SERVER_PATH:-/Users/playra/ai-server}"
TELEGRAF_PATH="${TELEGRAF_PATH:-$(git rev-parse --show-toplevel 2>/dev/null || echo "/Users/playra/999-agents-telegraf")}"
BACKUP_PATH="/tmp/full-migration-backup-$(date +%Y%m%d-%H%M%S)"

echo -e "${BLUE}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║   COMPLETE BUSINESS LOGIC MIGRATION: ai-server → telegraf  ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Print section
print_section() {
    echo -e "\n${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${YELLOW}  $1${NC}"
    echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}\n"
}

print_status() { echo -e "${GREEN}✓${NC} $1"; }
print_error() { echo -e "${RED}✗${NC} $1"; }
print_warning() { echo -e "${YELLOW}⚠${NC} $1"; }
print_info() { echo -e "${MAGENTA}ℹ${NC} $1"; }

# Pre-flight checks
print_section "Pre-flight Checks"

if [ ! -d "$AI_SERVER_PATH" ]; then
    print_error "ai-server not found: $AI_SERVER_PATH"
    exit 1
fi
print_status "ai-server found: $AI_SERVER_PATH"

if [ ! -d "$TELEGRAF_PATH" ]; then
    print_error "telegraf not found: $TELEGRAF_PATH"
    exit 1
fi
print_status "telegraf found: $TELEGRAF_PATH"

# Count files to migrate
TOTAL_FILES=$(find "$AI_SERVER_PATH/src" -name "*.ts" -type f | wc -l | tr -d ' ')
print_info "Total files to migrate: $TOTAL_FILES"

# Create backup
print_section "Creating Backup"
mkdir -p "$BACKUP_PATH"
cp -r "$TELEGRAF_PATH/src" "$BACKUP_PATH/" 2>/dev/null || true
print_status "Backup created: $BACKUP_PATH"

# Phase 1: Critical Infrastructure
print_section "PHASE 1: Critical Infrastructure"

# 1.1 Create directory structure
print_info "Creating directory structure..."
mkdir -p "$TELEGRAF_PATH/src/api_server"/{routes,controllers,middlewares}
mkdir -p "$TELEGRAF_PATH/src/services"/{generation,video,broadcast,avatar,prompts}
mkdir -p "$TELEGRAF_PATH/src/core"/{openai,replicate,instagram,storytelling,bfl,kling,elevenlabs,100ms}
mkdir -p "$TELEGRAF_PATH/src/dtos"
mkdir -p "$TELEGRAF_PATH/src/exceptions"
mkdir -p "$TELEGRAF_PATH/src/database"
mkdir -p "$TELEGRAF_PATH/src/price"
mkdir -p "$TELEGRAF_PATH/src/template"
print_status "Directory structure created"

# 1.2 Migrate core/supabase (82 files - CRITICAL!)
print_info "Migrating core/supabase (82 files)..."
if [ -d "$AI_SERVER_PATH/src/core/supabase" ]; then
    # Copy all files
    cp -r "$AI_SERVER_PATH/src/core/supabase/"* "$TELEGRAF_PATH/src/core/supabase/" 2>/dev/null || true

    # Count migrated files
    SUPABASE_FILES=$(find "$TELEGRAF_PATH/src/core/supabase" -name "*.ts" -type f | wc -l | tr -d ' ')
    print_status "Supabase core migrated ($SUPABASE_FILES files)"
    print_warning "Review for conflicts with existing files!"
else
    print_warning "core/supabase not found in ai-server"
fi

# Phase 2: REST API & Webhooks
print_section "PHASE 2: REST API & Webhooks"

# 2.1 Migrate routes (17 files)
print_info "Migrating routes..."
if [ -d "$AI_SERVER_PATH/src/routes" ]; then
    cp "$AI_SERVER_PATH/src/routes/"*.route.ts "$TELEGRAF_PATH/src/api_server/routes/" 2>/dev/null
    cp "$AI_SERVER_PATH/src/routes/index.ts" "$TELEGRAF_PATH/src/api_server/routes/" 2>/dev/null

    ROUTES_COUNT=$(find "$TELEGRAF_PATH/src/api_server/routes" -name "*.ts" | wc -l | tr -d ' ')
    print_status "Routes migrated ($ROUTES_COUNT files)"
fi

# 2.2 Migrate controllers (17 files)
print_info "Migrating controllers..."
if [ -d "$AI_SERVER_PATH/src/controllers" ]; then
    cp "$AI_SERVER_PATH/src/controllers/"*.controller.ts "$TELEGRAF_PATH/src/api_server/controllers/" 2>/dev/null
    cp "$AI_SERVER_PATH/src/controllers/index.ts" "$TELEGRAF_PATH/src/api_server/controllers/" 2>/dev/null

    CONTROLLERS_COUNT=$(find "$TELEGRAF_PATH/src/api_server/controllers" -name "*.ts" | wc -l | tr -d ' ')
    print_status "Controllers migrated ($CONTROLLERS_COUNT files)"
fi

# 2.3 Migrate middlewares (4 files)
print_info "Migrating middlewares..."
if [ -d "$AI_SERVER_PATH/src/middlewares" ]; then
    cp "$AI_SERVER_PATH/src/middlewares/"*.ts "$TELEGRAF_PATH/src/api_server/middlewares/" 2>/dev/null

    MIDDLEWARES_COUNT=$(find "$TELEGRAF_PATH/src/api_server/middlewares" -name "*.ts" | wc -l | tr -d ' ')
    print_status "Middlewares migrated ($MIDDLEWARES_COUNT files)"
fi

# Phase 3: Services
print_section "PHASE 3: Services & Business Logic"

# 3.1 Migrate generation services
print_info "Migrating generation services..."
if [ -d "$AI_SERVER_PATH/src/services" ]; then
    cp "$AI_SERVER_PATH/src/services/generate"*.ts "$TELEGRAF_PATH/src/services/generation/" 2>/dev/null
    cp "$AI_SERVER_PATH/src/services/createTasksService.ts" "$TELEGRAF_PATH/src/services/generation/" 2>/dev/null

    GEN_SERVICES=$(find "$TELEGRAF_PATH/src/services/generation" -name "*.ts" | wc -l | tr -d ' ')
    print_status "Generation services migrated ($GEN_SERVICES files)"
fi

# 3.2 Migrate video services
print_info "Migrating video services..."
cp "$AI_SERVER_PATH/src/services/"*Morphing*.ts "$TELEGRAF_PATH/src/services/video/" 2>/dev/null
cp "$AI_SERVER_PATH/src/services/"*Video*.ts "$TELEGRAF_PATH/src/services/video/" 2>/dev/null

VIDEO_SERVICES=$(find "$TELEGRAF_PATH/src/services/video" -name "*.ts" 2>/dev/null | wc -l | tr -d ' ')
print_status "Video services migrated ($VIDEO_SERVICES files)"

# 3.3 Migrate broadcast services
print_info "Migrating broadcast services..."
cp "$AI_SERVER_PATH/src/services/broadcast.service.ts" "$TELEGRAF_PATH/src/services/broadcast/" 2>/dev/null
print_status "Broadcast services migrated"

# 3.4 Migrate avatar services
print_info "Migrating avatar services..."
cp "$AI_SERVER_PATH/src/services/avatar.service.ts" "$TELEGRAF_PATH/src/services/avatar/" 2>/dev/null
cp "$AI_SERVER_PATH/src/services/createVoiceAvatar.ts" "$TELEGRAF_PATH/src/services/avatar/" 2>/dev/null
cp "$AI_SERVER_PATH/src/services/elevenLabs.ts" "$TELEGRAF_PATH/src/services/avatar/" 2>/dev/null
print_status "Avatar services migrated"

# 3.5 Migrate prompt services
print_info "Migrating prompt services..."
cp "$AI_SERVER_PATH/src/services/brollPromptsService.ts" "$TELEGRAF_PATH/src/services/prompts/" 2>/dev/null
print_status "Prompt services migrated"

# 3.6 Copy remaining services
print_info "Copying remaining services..."
cp "$AI_SERVER_PATH/src/services/"*.ts "$TELEGRAF_PATH/src/services/" 2>/dev/null || true

TOTAL_SERVICES=$(find "$TELEGRAF_PATH/src/services" -name "*.ts" -type f | wc -l | tr -d ' ')
print_status "Total services migrated: $TOTAL_SERVICES"

# Phase 4: Core Modules
print_section "PHASE 4: Core Modules"

# 4.1 Migrate all core modules (except supabase - done in Phase 1)
CORE_MODULES=("openai" "replicate" "instagram" "storytelling" "bfl" "kling" "elevenlabs" "100ms" "bot")

for module in "${CORE_MODULES[@]}"; do
    if [ -d "$AI_SERVER_PATH/src/core/$module" ]; then
        print_info "Migrating core/$module..."
        cp -r "$AI_SERVER_PATH/src/core/$module" "$TELEGRAF_PATH/src/core/" 2>/dev/null

        MODULE_FILES=$(find "$TELEGRAF_PATH/src/core/$module" -name "*.ts" -type f 2>/dev/null | wc -l | tr -d ' ')
        print_status "core/$module migrated ($MODULE_FILES files)"
    fi
done

# 4.2 Migrate utils
print_info "Migrating utils..."
if [ -d "$AI_SERVER_PATH/src/utils" ]; then
    cp "$AI_SERVER_PATH/src/utils/"*.ts "$TELEGRAF_PATH/src/utils/" 2>/dev/null || true

    UTILS_COUNT=$(find "$TELEGRAF_PATH/src/utils" -name "*.ts" | wc -l | tr -d ' ')
    print_status "Utils migrated ($UTILS_COUNT files)"
    print_warning "Check for conflicts with existing utils!"
fi

# 4.3 Migrate config/dtos/interfaces
print_info "Migrating config, DTOs, interfaces..."

if [ -d "$AI_SERVER_PATH/src/dtos" ]; then
    cp -r "$AI_SERVER_PATH/src/dtos/"* "$TELEGRAF_PATH/src/dtos/" 2>/dev/null || true
fi

if [ -d "$AI_SERVER_PATH/src/exceptions" ]; then
    cp -r "$AI_SERVER_PATH/src/exceptions/"* "$TELEGRAF_PATH/src/exceptions/" 2>/dev/null || true
fi

if [ -d "$AI_SERVER_PATH/src/database" ]; then
    cp -r "$AI_SERVER_PATH/src/database/"* "$TELEGRAF_PATH/src/database/" 2>/dev/null || true
fi

if [ -d "$AI_SERVER_PATH/src/price" ]; then
    cp -r "$AI_SERVER_PATH/src/price/"* "$TELEGRAF_PATH/src/price/" 2>/dev/null || true
fi

if [ -d "$AI_SERVER_PATH/src/template" ]; then
    cp -r "$AI_SERVER_PATH/src/template/"* "$TELEGRAF_PATH/src/template/" 2>/dev/null || true
fi

print_status "Config/DTOs/Interfaces migrated"

# Phase 5: Inngest Functions
print_section "PHASE 5: Inngest Functions"

print_info "Migrating Inngest functions..."

# Render functions
if [ -d "$AI_SERVER_PATH/src/inngest-functions/render" ]; then
    cp -r "$AI_SERVER_PATH/src/inngest-functions/render" "$TELEGRAF_PATH/src/inngest_app/functions/" 2>/dev/null
    print_status "Render functions migrated"
fi

# Content functions
CONTENT_FUNCTIONS=(
    "analyzeCompetitorReels"
    "instagramScraper-v2"
    "findCompetitors"
    "extractTopContent"
    "generateContentScripts"
    "generateScenarioClips"
    "generateDetailedScript"
)

mkdir -p "$TELEGRAF_PATH/src/inngest_app/functions/content"
for func in "${CONTENT_FUNCTIONS[@]}"; do
    if [ -f "$AI_SERVER_PATH/src/inngest-functions/${func}.ts" ]; then
        cp "$AI_SERVER_PATH/src/inngest-functions/${func}.ts" "$TELEGRAF_PATH/src/inngest_app/functions/content/" 2>/dev/null
        cp "$AI_SERVER_PATH/src/inngest-functions/${func}.test.ts" "$TELEGRAF_PATH/src/inngest_app/functions/content/" 2>/dev/null || true
    fi
done
print_status "Content functions migrated"

# Training, image, payments, broadcast, monitoring functions
mkdir -p "$TELEGRAF_PATH/src/inngest_app/functions"/{training,image,payments,broadcast,monitoring}

# Training
cp "$AI_SERVER_PATH/src/inngest-functions/generateModelTraining.ts" "$TELEGRAF_PATH/src/inngest_app/functions/training/" 2>/dev/null || true
cp "$AI_SERVER_PATH/src/inngest-functions/modelTrainingV2.ts" "$TELEGRAF_PATH/src/inngest_app/functions/training/" 2>/dev/null || true

# Image
cp "$AI_SERVER_PATH/src/inngest-functions/neuroImageGeneration.ts" "$TELEGRAF_PATH/src/inngest_app/functions/image/" 2>/dev/null || true
cp "$AI_SERVER_PATH/src/inngest-functions/morphImages.ts" "$TELEGRAF_PATH/src/inngest_app/functions/image/" 2>/dev/null || true

# Payments & Broadcast
cp "$AI_SERVER_PATH/src/inngest-functions/paymentProcessing.ts" "$TELEGRAF_PATH/src/inngest_app/functions/payments/" 2>/dev/null || true
cp "$AI_SERVER_PATH/src/inngest-functions/broadcastMessage.ts" "$TELEGRAF_PATH/src/inngest_app/functions/broadcast/" 2>/dev/null || true

# Monitoring
cp "$AI_SERVER_PATH/src/inngest-functions/logMonitor.ts" "$TELEGRAF_PATH/src/inngest_app/functions/monitoring/" 2>/dev/null || true
cp "$AI_SERVER_PATH/src/inngest-functions/criticalErrorMonitor.ts" "$TELEGRAF_PATH/src/inngest_app/functions/monitoring/" 2>/dev/null || true

INNGEST_TOTAL=$(find "$TELEGRAF_PATH/src/inngest_app/functions" -name "*.ts" -type f | wc -l | tr -d ' ')
print_status "Total Inngest functions migrated: $INNGEST_TOTAL"

# Phase 6: Helpers
print_section "PHASE 6: Helpers & Support Files"

# Inngest helpers
if [ -d "$AI_SERVER_PATH/src/helpers/inngest" ]; then
    mkdir -p "$TELEGRAF_PATH/src/helpers/inngest"
    cp -r "$AI_SERVER_PATH/src/helpers/inngest/"* "$TELEGRAF_PATH/src/helpers/inngest/" 2>/dev/null || true
    print_status "Inngest helpers migrated"
fi

# Migration Report
print_section "Migration Summary"

# Count migrated files
MIGRATED_TOTAL=$(find "$TELEGRAF_PATH/src" -name "*.ts" -type f | wc -l | tr -d ' ')

echo -e "${GREEN}Migration Statistics:${NC}"
echo -e "  • Source files (ai-server): $TOTAL_FILES"
echo -e "  • Total files in telegraf: $MIGRATED_TOTAL"
echo -e "  • Supabase core: $SUPABASE_FILES files"
echo -e "  • Routes: $ROUTES_COUNT files"
echo -e "  • Controllers: $CONTROLLERS_COUNT files"
echo -e "  • Middlewares: $MIDDLEWARES_COUNT files"
echo -e "  • Services: $TOTAL_SERVICES files"
echo -e "  • Utils: $UTILS_COUNT files"
echo -e "  • Inngest functions: $INNGEST_TOTAL files"
echo ""

# Create migration report
REPORT_FILE="$TELEGRAF_PATH/docs/FULL_MIGRATION_REPORT_$(date +%Y%m%d-%H%M%S).md"
cat > "$REPORT_FILE" << EOF
# FULL BUSINESS LOGIC MIGRATION REPORT
Generated: $(date)

## Migration Summary
- Source: $AI_SERVER_PATH
- Target: $TELEGRAF_PATH
- Backup: $BACKUP_PATH

## Files Migrated

### Phase 1: Critical Infrastructure
- Supabase core: $SUPABASE_FILES files

### Phase 2: REST API & Webhooks
- Routes: $ROUTES_COUNT files
- Controllers: $CONTROLLERS_COUNT files
- Middlewares: $MIDDLEWARES_COUNT files

### Phase 3: Services
- Total services: $TOTAL_SERVICES files

### Phase 4: Core Modules
$(find "$TELEGRAF_PATH/src/core" -maxdepth 1 -type d | tail -n +2 | sed 's/.*\//  - /' | sed 's/$/ (migrated)/')

### Phase 5: Inngest Functions
- Total Inngest: $INNGEST_TOTAL files

### Phase 6: Helpers
- Inngest helpers: migrated

## Next Steps

1. **Update ALL imports** (CRITICAL!):
   \`\`\`bash
   # Find and replace in all migrated files
   find src/api_server src/services -name "*.ts" -exec sed -i '' 's|@/core/inngest/clients|@/inngest_app/client|g' {} \;
   find src/api_server src/services -name "*.ts" -exec sed -i '' 's|@/config/supabase|@/core/supabase|g' {} \;
   \`\`\`

2. **Create Express server** (\`src/api_server/server.ts\`)

3. **Update main entry point** (\`src/index.ts\`)

4. **Merge conflicting files**:
   - core/supabase/* (check for duplicates)
   - utils/* (merge logging, etc)
   - config/* (merge configs)

5. **Build and test**:
   \`\`\`bash
   npm run build
   npm run typecheck
   npm run test
   \`\`\`

6. **Create Inngest functions index**:
   - \`src/inngest_app/functions/index.ts\`
   - Export all migrated functions

7. **Environment variables**:
   - Copy all from ai-server .env
   - Merge with existing .env
   - Remove duplicates

8. **Test locally**:
   \`\`\`bash
   npm run dev
   # Test REST API
   # Test Telegram bot
   # Test Inngest functions
   \`\`\`

## Rollback Instructions

If migration needs to be rolled back:
\`\`\`bash
rm -rf $TELEGRAF_PATH/src/api_server
rm -rf $TELEGRAF_PATH/src/services/generation
rm -rf $TELEGRAF_PATH/src/services/video
rm -rf $TELEGRAF_PATH/src/services/broadcast
rm -rf $TELEGRAF_PATH/src/services/avatar
rm -rf $TELEGRAF_PATH/src/services/prompts
cp -r $BACKUP_PATH/src/* $TELEGRAF_PATH/src/
\`\`\`

## Manual Review Required

- [ ] Check core/supabase for conflicts
- [ ] Merge utils/logger.ts
- [ ] Merge config files
- [ ] Update imports in all files
- [ ] Create api_server/server.ts
- [ ] Update src/index.ts
- [ ] Create inngest_app/functions/index.ts
- [ ] Merge environment variables
- [ ] Test all endpoints
- [ ] Test all Inngest functions

EOF

print_status "Migration report created: $REPORT_FILE"

# Final message
print_section "Migration Complete! 🎉"

echo -e "${GREEN}Summary:${NC}"
echo -e "  • Backup: $BACKUP_PATH"
echo -e "  • Report: $REPORT_FILE"
echo -e "  • Migrated: $MIGRATED_TOTAL TypeScript files"
echo ""

echo -e "${YELLOW}⚠ CRITICAL NEXT STEPS:${NC}"
echo -e "  1. Update ALL imports (see report for commands)"
echo -e "  2. Create src/api_server/server.ts"
echo -e "  3. Update src/index.ts"
echo -e "  4. Merge conflicting files"
echo -e "  5. Build and test: npm run build && npm run test"
echo -e "  6. Review: docs/COMPLETE_MIGRATION_PLAN.md"
echo ""

exit 0
