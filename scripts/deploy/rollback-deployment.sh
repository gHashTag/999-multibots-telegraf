#!/bin/bash

# 🔄 ROLLBACK SCRIPT FOR INNGEST MIGRATION
# Use this if deployment fails or causes issues

set -e

echo "🔄 ROLLBACK DEPLOYMENT SCRIPT"
echo "=============================="
echo ""
echo "⚠️  This script will rollback to the previous version"
echo "   Tag: v1.0.0-pre-inngest-migration"
echo ""
read -p "Are you sure you want to rollback? (yes/no): " confirm

if [ "$confirm" != "yes" ]; then
    echo "❌ Rollback cancelled"
    exit 1
fi

echo ""
echo "🔄 Starting rollback process..."
echo ""

# Function to rollback locally
rollback_local() {
    echo "📍 LOCAL ROLLBACK:"
    echo "=================="

    # Check if tag exists
    if ! git rev-parse v1.0.0-pre-inngest-migration >/dev/null 2>&1; then
        echo "❌ Error: Tag v1.0.0-pre-inngest-migration not found"
        echo "   Please check git tags with: git tag -l"
        exit 1
    fi

    # Get current branch
    CURRENT_BRANCH=$(git branch --show-current)
    echo "Current branch: $CURRENT_BRANCH"

    # Save any uncommitted changes
    echo "💾 Stashing any uncommitted changes..."
    git stash push -m "rollback-backup-$(date +%Y%m%d-%H%M%S)"

    # Rollback to tag
    echo "⏪ Rolling back to v1.0.0-pre-inngest-migration..."
    git reset --hard v1.0.0-pre-inngest-migration

    echo "✅ Local rollback complete"
}

# Function to rollback on production
rollback_production() {
    echo ""
    echo "🌐 PRODUCTION ROLLBACK:"
    echo "======================="

    echo "📡 Connecting to Zomro server..."

    ssh -i ~/.ssh/zomro root@212.86.115.30 << 'ENDSSH'
echo "🔄 Rolling back on production server..."
cd /root/bot-farm

# Check if we have git repo
if [ -d .git ]; then
    echo "📦 Git repository found, rolling back..."

    # Stash any changes
    git stash push -m "rollback-prod-$(date +%Y%m%d-%H%M%S)"

    # Pull latest and reset to tag
    git fetch --tags

    if git rev-parse v1.0.0-pre-inngest-migration >/dev/null 2>&1; then
        git reset --hard v1.0.0-pre-inngest-migration
        echo "✅ Git rollback complete"
    else
        echo "⚠️  Tag not found, using previous Docker image..."
    fi
fi

# Rollback Docker container
echo ""
echo "🐳 Rolling back Docker container..."

# Check if we have a previous image
if docker images | grep -q "999-multibots.*backup"; then
    echo "Found backup image, restoring..."

    # Stop current container
    docker stop 999-multibots 2>/dev/null || true
    docker rm 999-multibots 2>/dev/null || true

    # Tag backup as latest
    docker tag 999-multibots:backup 999-multibots:latest

    # Start container with backup image
    docker run -d --name 999-multibots --restart=always \
        -p 3000:3000 -p 2999:2999 -p 3001:3001 -p 3002:3002 -p 3003:3003 \
        -p 3004:3004 -p 3005:3005 -p 3006:3006 -p 3007:3007 -p 3008:3008 \
        -p 3009:3009 -p 3010:3010 \
        -v /root/bot-farm/.env:/app/.env:ro \
        999-multibots:latest

    echo "✅ Docker rollback complete"
else
    echo "⚠️  No backup image found. Please rebuild manually."
fi

# Check container status
echo ""
echo "📊 Checking container status..."
docker ps | grep 999-multibots
echo ""
echo "📝 Last 20 lines of logs:"
docker logs 999-multibots --tail 20

echo ""
echo "✅ Production rollback complete"
ENDSSH
}

# Main execution
echo ""
echo "Select rollback option:"
echo "1) Local only"
echo "2) Production only"
echo "3) Both local and production"
echo ""
read -p "Enter option (1-3): " option

case $option in
    1)
        rollback_local
        ;;
    2)
        rollback_production
        ;;
    3)
        rollback_local
        rollback_production
        ;;
    *)
        echo "❌ Invalid option"
        exit 1
        ;;
esac

echo ""
echo "============================"
echo "🔄 ROLLBACK COMPLETE"
echo "============================"
echo ""
echo "📋 Next steps:"
echo "  1. Check application functionality"
echo "  2. Review logs for any errors"
echo "  3. If issues persist, check Docker logs:"
echo "     ssh -i ~/.ssh/zomro root@212.86.115.30 'docker logs 999-multibots --tail 100'"
echo ""
echo "💡 To re-apply migration after fixing issues:"
echo "  1. Fix the issues in code"
echo "  2. Create new commit"
echo "  3. Run deployment again"