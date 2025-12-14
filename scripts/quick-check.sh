#!/bin/bash
# Quick production check script
# Быстрая диагностика production сервера
# Usage: ./scripts/quick-check.sh

set -e

SERVER="188.137.250.69"
CONTAINER="999-multibots"
SSH_HOST="prod999"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}=== Quick Production Check ===${NC}"
echo ""

# 1. Container Status
echo -e "${YELLOW}[1/6] Container Status:${NC}"
ssh $SSH_HOST "docker ps --filter 'name=$CONTAINER' --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'" 2>/dev/null || echo -e "${RED}Failed to get container status${NC}"

echo ""

# 2. Resource Usage
echo -e "${YELLOW}[2/6] Resource Usage:${NC}"
ssh $SSH_HOST "docker stats $CONTAINER --no-stream --format 'CPU: {{.CPUPerc}} | Memory: {{.MemUsage}} | Net I/O: {{.NetIO}}'" 2>/dev/null || echo -e "${RED}Failed to get resource usage${NC}"

echo ""

# 3. Health Check
echo -e "${YELLOW}[3/6] Health Check:${NC}"
HEALTH=$(curl -s "http://$SERVER:3001/health" 2>/dev/null)
if [ -n "$HEALTH" ]; then
    echo "$HEALTH" | jq '.' 2>/dev/null || echo "$HEALTH"
    echo -e "${GREEN}Health check OK${NC}"
else
    echo -e "${RED}Health check FAILED - server not responding${NC}"
fi

echo ""

# 4. Webhook Status
echo -e "${YELLOW}[4/6] Webhook Status:${NC}"
WEBHOOKS=$(curl -s "http://$SERVER:3001/health" 2>/dev/null | jq '.webhooks' 2>/dev/null)
if [ -n "$WEBHOOKS" ] && [ "$WEBHOOKS" != "null" ]; then
    echo "$WEBHOOKS"
else
    echo "Webhook status not available in health response"
fi

echo ""

# 5. Recent Errors
echo -e "${YELLOW}[5/6] Recent Errors (last 50 lines):${NC}"
ERRORS=$(ssh $SSH_HOST "docker logs $CONTAINER --tail 50 2>&1 | grep -E '(Error|ERROR|TypeError|Cannot find|CRITICAL|FATAL|SyntaxError|ReferenceError)'" 2>/dev/null)
if [ -n "$ERRORS" ]; then
    echo -e "${RED}$ERRORS${NC}"
else
    echo -e "${GREEN}No errors found in last 50 lines${NC}"
fi

echo ""

# 6. HTTPS Domain Check
echo -e "${YELLOW}[6/8] HTTPS Domain (neuro-blogger.com):${NC}"
HTTPS_STATUS=$(curl -sI https://neuro-blogger.com/health 2>/dev/null | head -1)
if [[ "$HTTPS_STATUS" == *"200"* ]]; then
    echo -e "${GREEN}HTTPS OK: $HTTPS_STATUS${NC}"
else
    echo -e "${RED}HTTPS PROBLEM: $HTTPS_STATUS${NC}"
fi

# 7. SSL Certificate Check
echo ""
echo -e "${YELLOW}[7/8] SSL Certificate:${NC}"
SSL_DATES=$(echo | openssl s_client -connect neuro-blogger.com:443 -servername neuro-blogger.com 2>/dev/null | openssl x509 -noout -dates 2>/dev/null)
if [ -n "$SSL_DATES" ]; then
    echo "$SSL_DATES"
else
    echo -e "${RED}Could not check SSL certificate${NC}"
fi

echo ""

# 8. Critical Errors Check
echo -e "${YELLOW}[8/8] Critical Errors (last 500 lines):${NC}"
CRITICAL=$(ssh $SSH_HOST "docker logs $CONTAINER --tail 500 2>&1 | grep -E '(Cannot find module|MODULE_NOT_FOUND|FATAL|Segmentation fault|ENOMEM)'" 2>/dev/null)
if [ -n "$CRITICAL" ]; then
    echo -e "${RED}CRITICAL ISSUES FOUND:${NC}"
    echo -e "${RED}$CRITICAL${NC}"
    echo ""
    echo -e "${RED}ACTION REQUIRED: Run ./deploy.sh production to rebuild${NC}"
else
    echo -e "${GREEN}No critical errors found${NC}"
fi

echo ""
echo -e "${BLUE}=== Check Complete ===${NC}"

# Summary
if [ -n "$CRITICAL" ]; then
    echo -e "${RED}STATUS: CRITICAL - Immediate action required${NC}"
    exit 1
elif [ -n "$ERRORS" ]; then
    echo -e "${YELLOW}STATUS: WARNING - Review errors above${NC}"
    exit 0
else
    echo -e "${GREEN}STATUS: OK - Production working normally${NC}"
    exit 0
fi
