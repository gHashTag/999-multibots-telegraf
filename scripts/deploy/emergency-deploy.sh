#!/bin/bash

# 🚨 EMERGENCY DEPLOYMENT SCRIPT
# For immediate production deployment of critical error fixes

set -e  # Exit on any error

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
SERVER="root@185.161.67.53"
SSH_KEY="~/.ssh/selectel"
CONTAINER_NAME="999-multibots"

echo "🚨 EMERGENCY DEPLOYMENT STARTING..."
echo "📍 Project directory: $PROJECT_DIR"
echo "🖥️  Target server: $SERVER"
echo "🐳 Container: $CONTAINER_NAME"
echo ""

# Verify SSH connection
echo "🔍 Testing SSH connection..."
ssh -i $SSH_KEY $SERVER "echo '✅ SSH connection successful'"

echo ""
echo "🚀 Starting deployment process..."

# Function to run commands on remote server
run_remote() {
    echo "🖥️  Remote: $1"
    ssh -i $SSH_KEY $SERVER "cd /root/999-agents-telegraf && $1"
}

# Function to check if container exists
container_exists() {
    run_remote "docker ps -a --filter name=$CONTAINER_NAME --format '{{.Names}}'" | grep -q "$CONTAINER_NAME"
}

# Function to check if container is running
container_running() {
    run_remote "docker ps --filter name=$CONTAINER_NAME --format '{{.Names}}'" | grep -q "$CONTAINER_NAME"
}

echo ""
echo "📦 STEP 1: Stopping and removing existing container..."

if container_running; then
    echo "⏹️  Stopping container $CONTAINER_NAME..."
    run_remote "docker stop $CONTAINER_NAME"
    echo "✅ Container stopped"
else
    echo "ℹ️  Container $CONTAINER_NAME is not running"
fi

if container_exists; then
    echo "🗑️  Removing container $CONTAINER_NAME..."
    run_remote "docker rm $CONTAINER_NAME"
    echo "✅ Container removed"
else
    echo "ℹ️  Container $CONTAINER_NAME does not exist"
fi

echo ""
echo "🔨 STEP 2: Building new Docker image with --no-cache..."
run_remote "docker build --no-cache -t $CONTAINER_NAME ."
echo "✅ Docker image built successfully"

echo ""
echo "🚀 STEP 3: Starting new container..."
run_remote "docker run -d --name $CONTAINER_NAME --restart=always -p 3001:3001 -v /root/999-agents-telegraf/.env:/app/.env:ro $CONTAINER_NAME"
echo "✅ Container started"

echo ""
echo "🔍 STEP 4: Verification..."

# Wait a moment for container to fully start
echo "⏳ Waiting 10 seconds for container startup..."
sleep 10

echo "📊 Container status:"
run_remote "docker ps | grep $CONTAINER_NAME || echo '❌ Container not running'"

echo ""
echo "📋 Container logs (last 20 lines):"
run_remote "docker logs $CONTAINER_NAME --tail 20"

echo ""
echo "🎯 STEP 5: Testing bot functionality..."
echo "🔗 Bot should be accessible via these endpoints:"
echo "   - Internal: http://localhost:3001"
echo "   - External: https://your-domain.com (if configured)"

echo ""
echo "🎉 EMERGENCY DEPLOYMENT COMPLETED!"
echo ""
echo "📝 Next steps:"
echo "   1. Test the bot manually to verify the error fix"
echo "   2. Monitor logs for any new errors"
echo "   3. Check error handler is working properly"
echo ""
echo "🔧 Quick commands for monitoring:"
echo "   ssh -i $SSH_KEY $SERVER 'docker logs $CONTAINER_NAME -f'"
echo "   ssh -i $SSH_KEY $SERVER 'docker exec $CONTAINER_NAME ps aux'"
echo ""
echo "🚨 If issues persist, use rollback script or manually debug"