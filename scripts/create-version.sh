#!/bin/bash

# ==========================================================================================================
# 🏷️  VERSION MANAGEMENT SCRIPT
# ==========================================================================================================
# Creates git tag, production snapshot, and manages version history
# Usage: ./scripts/create-version.sh v0.0.7 "Description of changes"
# ==========================================================================================================

set -e

VERSION=$1
MESSAGE=$2

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

if [ -z "$VERSION" ] || [ -z "$MESSAGE" ]; then
  echo -e "${RED}❌ ERROR: Missing arguments${NC}"
  echo ""
  echo "Usage: ./scripts/create-version.sh <version> <message>"
  echo ""
  echo "Examples:"
  echo "  ./scripts/create-version.sh v0.0.7 'Bug fixes and performance improvements'"
  echo "  ./scripts/create-version.sh v0.1.0 'New feature: user management'"
  exit 1
fi

# Validate version format
if ! echo "$VERSION" | grep -qE '^v[0-9]+\.[0-9]+\.[0-9]+$'; then
  echo -e "${RED}❌ ERROR: Invalid version format${NC}"
  echo "Version must match pattern: vX.Y.Z (e.g., v0.0.7)"
  exit 1
fi

echo ""
echo -e "${BLUE}🏷️  ═══════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}🏷️   VERSION MANAGEMENT - Creating $VERSION${NC}"
echo -e "${BLUE}🏷️  ═══════════════════════════════════════════════════════${NC}"
echo ""

# Step 1: Check if tag already exists
echo -e "${BLUE}[1/5] Checking if tag already exists...${NC}"
if git tag -l | grep -q "^$VERSION$"; then
  echo -e "${RED}❌ ERROR: Tag $VERSION already exists${NC}"
  echo "Use: git tag -d $VERSION && git push origin --delete $VERSION"
  exit 1
fi
echo -e "${GREEN}✅ Tag name available${NC}"
echo ""

# Step 2: Create git tag
echo -e "${BLUE}[2/5] Creating git tag...${NC}"
git tag -a "$VERSION" -m "🎉 RELEASE $VERSION: $MESSAGE

✅ Production deployment successful
✅ All services operational
✅ Snapshot created

Message: $MESSAGE

🤖 Generated with create-version.sh"

echo -e "${GREEN}✅ Git tag created: $VERSION${NC}"
echo ""

# Step 3: Push tag to remote
echo -e "${BLUE}[3/5] Pushing tag to remote...${NC}"
git push origin "$VERSION"
git push origin production
echo -e "${GREEN}✅ Tag pushed to remote${NC}"
echo ""

# Step 4: Create production snapshot
echo -e "${BLUE}[4/5] Creating production snapshot...${NC}"
ssh prod999 "cd /root/bot-farm && \
  mkdir -p .snapshots && \
  echo 'Creating snapshot...' && \
  tar -czf .snapshots/$VERSION-\$(date +%Y%m%d-%H%M%S).tar.gz \
  --exclude='.snapshots' \
  --exclude='node_modules' \
  --exclude='.git' \
  --exclude='dist' \
  . && \
  echo 'Snapshot created successfully' && \
  ls -lah .snapshots/ | tail -1"
echo -e "${GREEN}✅ Production snapshot created${NC}"
echo ""

# Step 5: Clean old snapshots (keep last 5)
echo -e "${BLUE}[5/5] Cleaning old snapshots...${NC}"
ssh prod999 "cd /root/bot-farm/.snapshots && ls -t | tail -n +6 | xargs -r rm && echo 'Old snapshots removed' || echo 'No old snapshots to remove'"
echo -e "${GREEN}✅ Snapshot cleanup completed${NC}"
echo ""

# Summary
echo -e "${GREEN}🏷️  ═══════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}🏷️   VERSION $VERSION CREATED SUCCESSFULLY${NC}"
echo -e "${GREEN}🏷️  ═══════════════════════════════════════════════════════${NC}"
echo ""
echo -e "${GREEN}✅ Git tag: $VERSION${NC}"
echo -e "${GREEN}✅ Remote: Pushed to origin${NC}"
echo -e "${GREEN}✅ Snapshot: Created on production${NC}"
echo -e "${GREEN}✅ Cleanup: Old snapshots removed${NC}"
echo ""
echo -e "${BLUE}📝 View all versions: git tag -l${NC}"
echo -e "${BLUE}📦 View snapshots: ssh prod999 'ls -lah /root/bot-farm/.snapshots/'${NC}"
echo ""
