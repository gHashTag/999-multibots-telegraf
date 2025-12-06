#!/bin/bash

# Unified Development Server Startup Script
# Runs both main server and Inngest Dev UI simultaneously

set -e

# Colors
GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${CYAN}"
cat << 'EOF'
╔══════════════════════════════════════════════════════════╗
║                                                          ║
║  🚀 VIBEE DEVELOPMENT SERVER - UNIFIED STARTUP           ║
║                                                          ║
╚══════════════════════════════════════════════════════════╝
EOF
echo -e "${NC}\n"

# Cleanup function
cleanup() {
    echo -e "\n${YELLOW}Shutting down development servers...${NC}\n"
    jobs -p | xargs -r kill
    pkill -f "inngest-cli" || true
    exit 0
}

# Trap Ctrl+C
trap cleanup SIGINT SIGTERM

# Kill any existing processes
pkill -f "bun.*src/index.ts" || true
pkill -f "inngest-cli" || true

# Wait for cleanup
sleep 2

echo -e "${GREEN}🔄 Starting main development server...${NC}"

# Start main server in background
bun --watch src/index.ts &
SERVER_PID=$!

# Wait for server to start (increased to 10s for full initialization)
sleep 10

echo -e "${CYAN}🔄 Starting Inngest Dev UI...${NC}"

# Start Inngest in background
# NOTE: Use base URL (localhost:3000) without /api/inngest path
# because serve() middleware is already registered on /api/inngest in the Express app
npx inngest-cli@latest dev -u http://localhost:3000 --port 8288 &
INNGEST_PID=$!

echo -e "${YELLOW}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "${NC}Both services are starting up..."
echo -e "${GREEN}  • SERVER  - Main development server on port 3000${NC}"
echo -e "${CYAN}  • INNGEST - Inngest Dev UI on port 8288${NC}"
echo -e "${YELLOW}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "${NC}"

# Wait for both processes
wait $SERVER_PID $INNGEST_PID
