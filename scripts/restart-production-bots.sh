#!/bin/bash

# Script to restart bots on production server
# This connects to the Selectel server and restarts the bot application

SERVER_IP="185.161.67.53"
SERVER_USER="root"
SSH_KEY="~/.ssh/selectel"

echo "🔄 Restarting bots on production server..."
echo "📍 Server: $SERVER_IP"
echo ""

# Function to execute remote command
remote_exec() {
    ssh -i $SSH_KEY $SERVER_USER@$SERVER_IP "$1"
}

# Check server connectivity
echo "🔌 Checking server connectivity..."
if ! ssh -i $SSH_KEY -o ConnectTimeout=5 $SERVER_USER@$SERVER_IP "echo 'Connected'" 2>/dev/null; then
    echo "❌ Cannot connect to server. Please check:"
    echo "   1. SSH key exists at $SSH_KEY"
    echo "   2. Server is accessible at $SERVER_IP"
    echo "   3. Network connection is available"
    exit 1
fi

echo "✅ Connected to server"
echo ""

# Check bot application status
echo "📊 Checking current bot status..."
remote_exec "cd /root/999-agents-telegraf && pm2 status"

# Pull latest changes
echo "📥 Pulling latest changes from git..."
remote_exec "cd /root/999-agents-telegraf && git pull origin production"

# Install dependencies if needed
echo "📦 Installing dependencies..."
remote_exec "cd /root/999-agents-telegraf && npm install --production"

# Build the application
echo "🔨 Building application..."
remote_exec "cd /root/999-agents-telegraf && npm run build:prod"

# Restart bots with PM2
echo "🤖 Restarting bots..."
remote_exec "cd /root/999-agents-telegraf && pm2 restart bot-farm || pm2 start dist/index.js --name bot-farm"

# Setup webhooks
echo "🔗 Setting up webhooks..."
remote_exec "cd /root/999-agents-telegraf && node scripts/setup-webhooks.js"

# Show final status
echo ""
echo "📊 Final bot status:"
remote_exec "pm2 status"

echo ""
echo "✅ Bots restarted successfully!"
echo ""
echo "📋 To view logs, run:"
echo "   ssh -i $SSH_KEY $SERVER_USER@$SERVER_IP 'pm2 logs bot-farm'"