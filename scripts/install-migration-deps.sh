#!/bin/bash

# 📦 INSTALL MIGRATION DEPENDENCIES
# This script installs all required dependencies for Inngest migration

set -e  # Exit on error

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║     Installing Migration Dependencies                      ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo -e "${YELLOW}⚠ Error: package.json not found. Run from project root.${NC}"
    exit 1
fi

echo -e "${YELLOW}Step 1: Installing CRITICAL dependencies...${NC}"
npm install ssh2@^1.17.0 \
  @aws-sdk/client-s3@^3.913.0 \
  @aws-sdk/s3-request-presigner@^3.913.0 \
  archiver@^7.0.1

echo -e "${GREEN}✓ Critical dependencies installed${NC}"
echo ""

echo -e "${YELLOW}Step 2: Upgrading Inngest to 3.x...${NC}"
npm install inngest@^3.37.0

echo -e "${GREEN}✓ Inngest upgraded${NC}"
echo ""

echo -e "${YELLOW}Step 3: Upgrading other packages...${NC}"
npm install openai@^4.77.0 \
  replicate@^0.32.0 \
  zod@^3.25.76 \
  uuid@^11.0.3 \
  @supabase/supabase-js@^2.47.10

echo -e "${GREEN}✓ Packages upgraded${NC}"
echo ""

echo -e "${YELLOW}Step 4: Fixing Express version...${NC}"
npm install express@^4.18.1 --save-exact

echo -e "${GREEN}✓ Express downgraded to 4.x${NC}"
echo ""

echo -e "${BLUE}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║     ✅ All Dependencies Installed!                          ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""

echo -e "${GREEN}Installed versions:${NC}"
npm list inngest ssh2 @aws-sdk/client-s3 archiver express --depth=0

echo ""
echo -e "${YELLOW}Next steps:${NC}"
echo -e "  1. npm run build"
echo -e "  2. npm run typecheck"
echo -e "  3. npm run test"
echo -e "  4. Review docs/MIGRATION_DEPENDENCIES.md"
echo ""

exit 0
