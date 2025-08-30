#!/bin/bash

# Production deployment script for bot farm
# This script builds the project and starts all bots using PM2

echo "🚀 Starting production deployment..."

# Build the project
echo "📦 Building project..."
npm run build:prod

# Check if build was successful
if [ ! -f "dist/index.js" ]; then
    echo "❌ Build failed! dist/index.js not found"
    exit 1
fi

# Create PM2 ecosystem config for bots
cat > ecosystem.bots.config.js << 'EOF'
module.exports = {
  apps: [{
    name: 'bot-farm',
    script: 'dist/index.js',
    instances: 1,
    exec_mode: 'fork',
    autorestart: true,
    watch: false,
    max_memory_restart: '2G',
    env: {
      NODE_ENV: 'production',
      USE_POLLING: 'false',
      WEBHOOK_DOMAIN: '185.161.67.53'
    },
    error_file: './logs/bot-error.log',
    out_file: './logs/bot-out.log',
    merge_logs: true,
    time: true
  }]
}
EOF

# Stop existing PM2 processes
echo "🛑 Stopping existing PM2 processes..."
pm2 stop bot-farm 2>/dev/null || true
pm2 delete bot-farm 2>/dev/null || true

# Start with PM2
echo "🤖 Starting bot farm with PM2..."
pm2 start ecosystem.bots.config.js

# Save PM2 process list
pm2 save

# Show status
echo "✅ Deployment complete!"
pm2 status

echo ""
echo "📋 Useful commands:"
echo "  pm2 logs bot-farm    - View logs"
echo "  pm2 restart bot-farm - Restart bots"
echo "  pm2 stop bot-farm    - Stop bots"
echo "  pm2 monit            - Monitor bots"