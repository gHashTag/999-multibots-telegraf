#!/bin/bash

# User Management Script Executor for Telegram ID 5781166218
# Production Server: 212.86.115.30
# Project Path: /root/bot-farm

set -e  # Exit on error

TELEGRAM_ID="5781166218"
SERVER="root@212.86.115.30"
SSH_KEY="$HOME/.ssh/zomro"
REMOTE_PROJECT="/root/bot-farm"
LOCAL_SCRIPT="./scripts/manage-user-5781166218.js"

echo "╔════════════════════════════════════════════════════════════════╗"
echo "║         USER MANAGEMENT DEPLOYMENT SCRIPT                      ║"
echo "║         Telegram ID: 5781166218                                ║"
echo "║         Production Server: 212.86.115.30                       ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

# Check if SSH key exists
if [ ! -f "$SSH_KEY" ]; then
    echo "❌ ERROR: SSH key not found at $SSH_KEY"
    exit 1
fi

# Check if local script exists
if [ ! -f "$LOCAL_SCRIPT" ]; then
    echo "❌ ERROR: Management script not found at $LOCAL_SCRIPT"
    exit 1
fi

echo "📋 Step 1: Uploading management script to production server..."
scp -i "$SSH_KEY" "$LOCAL_SCRIPT" "$SERVER:$REMOTE_PROJECT/scripts/"

if [ $? -eq 0 ]; then
    echo "✅ Script uploaded successfully"
else
    echo "❌ Failed to upload script"
    exit 1
fi

echo ""
echo "📋 Step 2: Making script executable on server..."
ssh -i "$SSH_KEY" "$SERVER" "chmod +x $REMOTE_PROJECT/scripts/manage-user-5781166218.js"

echo ""
echo "📋 Step 3: Executing user management script on production server..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Execute the script on the server
ssh -i "$SSH_KEY" "$SERVER" << 'ENDSSH'
cd /root/bot-farm

echo "🔍 Current directory: $(pwd)"
echo "📦 Checking Node.js environment..."
node --version
echo ""

echo "🚀 Executing user management script..."
echo ""

# Run the script
node scripts/manage-user-5781166218.js

EXIT_CODE=$?

if [ $EXIT_CODE -eq 0 ]; then
    echo ""
    echo "✅ Script execution completed successfully!"
else
    echo ""
    echo "❌ Script execution failed with exit code: $EXIT_CODE"
fi

exit $EXIT_CODE
ENDSSH

REMOTE_EXIT_CODE=$?

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

if [ $REMOTE_EXIT_CODE -eq 0 ]; then
    echo "✅ ALL TASKS COMPLETED SUCCESSFULLY!"
    echo ""
    echo "📊 Summary:"
    echo "   - User check: ✅"
    echo "   - Balance check: ✅"
    echo "   - Subscription check: ✅"
    echo "   - NEUROVIDEO grant: ✅"
    echo "   - Access verification: ✅"
    echo ""
    echo "🎉 User 5781166218 now has NEUROVIDEO access!"
else
    echo "❌ SCRIPT EXECUTION FAILED"
    echo ""
    echo "Please check the error messages above for details."
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📝 Script execution completed at: $(date)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

exit $REMOTE_EXIT_CODE
