#!/bin/bash
# Production User Management Script for Telegram ID: 5781166218
# Server: 212.86.115.30, Path: /root/bot-farm

set -e

TELEGRAM_ID="5781166218"
SERVER="root@212.86.115.30"
SSH_KEY="$HOME/.ssh/zomro"
REMOTE_PROJECT="/root/bot-farm"
LOCAL_SCRIPT="./scripts/manage-user-5781166218-production.js"

echo "╔════════════════════════════════════════════════════════════════╗"
echo "║         PRODUCTION USER MANAGEMENT EXECUTOR                    ║"
echo "║         Telegram ID: 5781166218                                ║"
echo "║         Server: 212.86.115.30                                  ║"
echo "║         Project: /root/bot-farm                                ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

# Verify prerequisites
if [ ! -f "$SSH_KEY" ]; then
    echo "❌ SSH key not found: $SSH_KEY"
    exit 1
fi

if [ ! -f "$LOCAL_SCRIPT" ]; then
    echo "❌ Script not found: $LOCAL_SCRIPT"
    exit 1
fi

echo "✅ Prerequisites verified"
echo ""

# Upload script
echo "📤 Step 1: Uploading script to production server..."
scp -i "$SSH_KEY" "$LOCAL_SCRIPT" "$SERVER:$REMOTE_PROJECT/scripts/" 2>&1

if [ $? -eq 0 ]; then
    echo "✅ Script uploaded successfully"
else
    echo "❌ Upload failed"
    exit 1
fi

echo ""

# Execute on server
echo "🚀 Step 2: Executing script on production server..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

ssh -i "$SSH_KEY" "$SERVER" << 'ENDSSH'
#!/bin/bash
cd /root/bot-farm

echo "📍 Working directory: $(pwd)"
echo "🔧 Node.js version: $(node --version)"
echo ""

# Make executable
chmod +x scripts/manage-user-5781166218-production.js

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🚀 EXECUTING USER MANAGEMENT SCRIPT"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Run the script
node scripts/manage-user-5781166218-production.js

EXIT_CODE=$?

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if [ $EXIT_CODE -eq 0 ]; then
    echo "✅ Script execution completed successfully!"
    echo ""
    echo "📊 All tasks completed:"
    echo "   ✅ User existence check"
    echo "   ✅ Balance verification"
    echo "   ✅ Subscription status check"
    echo "   ✅ NEUROVIDEO subscription grant"
    echo "   ✅ Access verification"
else
    echo "❌ Script failed with exit code: $EXIT_CODE"
fi

exit $EXIT_CODE
ENDSSH

REMOTE_EXIT_CODE=$?

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if [ $REMOTE_EXIT_CODE -eq 0 ]; then
    echo "🎉 SUCCESS! All operations completed."
    echo ""
    echo "📋 Summary:"
    echo "   ✅ User 5781166218 verified in database"
    echo "   ✅ Balance checked successfully"
    echo "   ✅ NEUROVIDEO subscription granted/verified"
    echo "   ✅ Access to neurovideo features confirmed"
    echo ""
    echo "User 5781166218 now has full NEUROVIDEO access! 🚀"
else
    echo "❌ FAILED! Check error messages above."
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Completed at: $(date '+%Y-%m-%d %H:%M:%S')"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

exit $REMOTE_EXIT_CODE
