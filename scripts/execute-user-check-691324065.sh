#!/bin/bash

# User Management Execution Script
# Telegram ID: 691324065
# Production Server: 212.86.115.30
# Project Path: /root/bot-farm

set -e

echo "========================================="
echo "User Management Script Execution"
echo "Telegram ID: 691324065"
echo "========================================="
echo ""

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Step 1: Copy script to production server
echo -e "${YELLOW}Step 1: Copying script to production server...${NC}"
scp -i ~/.ssh/zomro /Users/playra/999-agents-telegraf/scripts/check-user-691324065.js root@212.86.115.30:/root/bot-farm/scripts/

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Script copied successfully${NC}"
else
    echo -e "${RED}✗ Failed to copy script${NC}"
    exit 1
fi

echo ""

# Step 2: Execute script on production server
echo -e "${YELLOW}Step 2: Executing user management script on production...${NC}"
echo ""

ssh -i ~/.ssh/zomro root@212.86.115.30 << 'ENDSSH'
cd /root/bot-farm
echo "Current directory: $(pwd)"
echo "Node version: $(node --version)"
echo ""
echo "Executing user management script..."
echo ""
node scripts/check-user-691324065.js
ENDSSH

if [ $? -eq 0 ]; then
    echo ""
    echo -e "${GREEN}=========================================${NC}"
    echo -e "${GREEN}✓ User management completed successfully${NC}"
    echo -e "${GREEN}=========================================${NC}"
else
    echo ""
    echo -e "${RED}=========================================${NC}"
    echo -e "${RED}✗ User management failed${NC}"
    echo -e "${RED}=========================================${NC}"
    exit 1
fi

echo ""
echo "Script execution finished at $(date)"
