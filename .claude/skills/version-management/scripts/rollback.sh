#!/bin/bash

# ==========================================================================================================
# 🔄 ROLLBACK SCRIPT
# ==========================================================================================================
# Rollback production to specific snapshot version
# Usage: ./scripts/rollback.sh v0.0.6
# ==========================================================================================================

set -e

VERSION=$1

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

if [ -z "$VERSION" ]; then
  echo -e "${RED}❌ ERROR: Missing version argument${NC}"
  echo ""
  echo "Usage: ./scripts/rollback.sh <version>"
  echo ""
  echo "Examples:"
  echo "  ./scripts/rollback.sh v0.0.6"
  echo "  ./scripts/rollback.sh v0.0.5"
  echo ""
  echo "Available snapshots:"
  ssh prod999 "ls -lh /root/bot-farm/.snapshots/"
  exit 1
fi

echo ""
echo -e "${YELLOW}🔄 ═══════════════════════════════════════════════════════${NC}"
echo -e "${YELLOW}🔄  ROLLBACK TO $VERSION${NC}"
echo -e "${YELLOW}🔄 ═══════════════════════════════════════════════════════${NC}"
echo ""

# Step 1: Find snapshot
echo -e "${BLUE}[1/6] Finding snapshot for $VERSION...${NC}"
SNAPSHOT=$(ssh prod999 "ls /root/bot-farm/.snapshots/ | grep '^$VERSION-' | head -1")

if [ -z "$SNAPSHOT" ]; then
  echo -e "${RED}❌ ERROR: No snapshot found for version $VERSION${NC}"
  echo ""
  echo "Available snapshots:"
  ssh prod999 "ls -lh /root/bot-farm/.snapshots/"
  exit 1
fi

echo -e "${GREEN}✅ Found snapshot: $SNAPSHOT${NC}"
echo ""

# Step 2: Create safety backup of current state
echo -e "${BLUE}[2/6] Creating safety backup of current state...${NC}"
SAFETY_BACKUP="rollback-safety-$(date +%Y%m%d-%H%M%S).tar.gz"
ssh prod999 "cd /root/bot-farm && \
  tar -czf .snapshots/$SAFETY_BACKUP \
  --exclude='.snapshots' \
  --exclude='node_modules' \
  --exclude='.git' \
  --exclude='dist' \
  ."
echo -e "${GREEN}✅ Safety backup created: $SAFETY_BACKUP${NC}"
echo ""

# Step 3: Stop current application
echo -e "${BLUE}[3/6] Stopping current application...${NC}"
ssh prod999 "cd /root/bot-farm && docker compose down"
echo -e "${GREEN}✅ Application stopped${NC}"
echo ""

# Step 4: Backup current files (move to temp)
echo -e "${BLUE}[4/6] Backing up current files...${NC}"
ssh prod999 "cd /root/bot-farm && \
  mkdir -p .rollback-temp && \
  find . -maxdepth 1 -not -name '.' -not -name '..' -not -name '.snapshots' -not -name '.rollback-temp' -exec mv {} .rollback-temp/ \;"
echo -e "${GREEN}✅ Current files backed up${NC}"
echo ""

# Step 5: Extract snapshot
echo -e "${BLUE}[5/6] Extracting snapshot $VERSION...${NC}"
ssh prod999 "cd /root/bot-farm && tar -xzf .snapshots/$SNAPSHOT"
echo -e "${GREEN}✅ Snapshot extracted${NC}"
echo ""

# Step 6: Restart application
echo -e "${BLUE}[6/6] Restarting application...${NC}"
ssh prod999 "cd /root/bot-farm && docker compose up -d"
sleep 10
echo -e "${GREEN}✅ Application restarted${NC}"
echo ""

# Verify
echo -e "${BLUE}Verifying deployment...${NC}"
ssh prod999 "docker ps | grep 999-multibots"
echo ""

# Summary
echo -e "${GREEN}🔄 ═══════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}🔄  ROLLBACK TO $VERSION COMPLETED${NC}"
echo -e "${GREEN}🔄 ═══════════════════════════════════════════════════════${NC}"
echo ""
echo -e "${GREEN}✅ Version: $VERSION${NC}"
echo -e "${GREEN}✅ Safety backup: $SAFETY_BACKUP${NC}"
echo -e "${GREEN}✅ Application: Running${NC}"
echo ""
echo -e "${BLUE}📝 Check logs: ssh prod999 'docker logs -f --tail 50 999-multibots'${NC}"
echo -e "${BLUE}📝 Rollback temp files: /root/bot-farm/.rollback-temp/${NC}"
echo ""
echo -e "${YELLOW}⚠️  If rollback failed, restore from safety backup:${NC}"
echo -e "${YELLOW}   ssh prod999 'cd /root/bot-farm && tar -xzf .snapshots/$SAFETY_BACKUP'${NC}"
echo ""
