#!/bin/bash
# Быстрый тест сборки Node.js vs Bun

set -e

GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}🔬 Quick Build Test: Node.js vs Bun${NC}"
echo ""

# Test 1: Node.js build
echo -e "${BLUE}[1/2] Testing Node.js build...${NC}"
START_NODE=$(date +%s)
docker build -f Dockerfile.optimized -t 999-test:node . > /tmp/node-build.log 2>&1
END_NODE=$(date +%s)
NODE_TIME=$((END_NODE - START_NODE))
NODE_SIZE=$(docker images 999-test:node --format "{{.Size}}")

echo -e "${GREEN}✅ Node.js: ${NODE_TIME}s (Size: $NODE_SIZE)${NC}"
echo ""

# Test 2: Bun build
echo -e "${BLUE}[2/2] Testing Bun build...${NC}"
START_BUN=$(date +%s)
docker build -f Dockerfile.bun -t 999-test:bun . > /tmp/bun-build.log 2>&1
END_BUN=$(date +%s)
BUN_TIME=$((END_BUN - START_BUN))
BUN_SIZE=$(docker images 999-test:bun --format "{{.Size}}")

echo -e "${GREEN}✅ Bun: ${BUN_TIME}s (Size: $BUN_SIZE)${NC}"
echo ""

# Comparison
echo "╔════════════════╦════════════╦═══════════╗"
echo "║ Build Type     ║ Time (s)   ║ Size      ║"
echo "╠════════════════╬════════════╬═══════════╣"
printf "║ Node.js        ║ %-10s ║ %-9s ║\n" "$NODE_TIME" "$NODE_SIZE"
printf "║ Bun            ║ %-10s ║ %-9s ║\n" "$BUN_TIME" "$BUN_SIZE"
echo "╚════════════════╩════════════╩═══════════╝"
echo ""

# Calculate improvement
if [ "$NODE_TIME" -gt "$BUN_TIME" ]; then
    IMPROVEMENT=$(awk "BEGIN {printf \"%.1f\", ($NODE_TIME - $BUN_TIME) / $NODE_TIME * 100}")
    echo -e "${GREEN}🚀 Bun is ${IMPROVEMENT}% faster!${NC}"
else
    SLOWER=$(awk "BEGIN {printf \"%.1f\", ($BUN_TIME - $NODE_TIME) / $NODE_TIME * 100}")
    echo -e "⚠️  Bun is ${SLOWER}% slower"
fi
