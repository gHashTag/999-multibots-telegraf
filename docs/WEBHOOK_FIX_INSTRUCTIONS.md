# Webhook Configuration Fix - Production Deployment

## Problem Identified
Bots were not responding because webhooks were not configured. The system was defaulting to polling mode because:
1. `WEBHOOK_DOMAIN` environment variable was missing
2. Production server (185.161.67.53) was returning 502 Bad Gateway
3. Bots were not running on the production server

## Solution Implemented

### 1. Created Webhook Automation Scripts

#### `/scripts/setup-webhooks.js`
- Automatically configures webhooks for all 10 bots
- Sets webhook URL to `https://185.161.67.53/{bot_name}`
- Validates webhook configuration after setup

#### `/scripts/deploy-production.sh`
- Builds the project in production mode
- Creates PM2 ecosystem configuration
- Starts bots with PM2 for process management

#### `/scripts/restart-production-bots.sh`
- Connects to production server via SSH
- Pulls latest code from git
- Rebuilds and restarts the application
- Configures webhooks automatically

### 2. Environment Configuration

Add to `.env` file on production:
```env
# Webhook configuration
WEBHOOK_DOMAIN=185.161.67.53
USE_POLLING=false
```

## Deployment Instructions

### Option 1: Local Deployment Script
```bash
# From your local machine
./scripts/restart-production-bots.sh
```

### Option 2: Manual Deployment on Server
```bash
# SSH into production server
ssh -i ~/.ssh/selectel root@185.161.67.53

# Navigate to project
cd /root/999-agents-telegraf

# Pull latest changes
git pull origin production

# Install dependencies
npm install --production

# Build project
npm run build:prod

# Start/restart with PM2
pm2 restart bot-farm || pm2 start dist/index.js --name bot-farm

# Setup webhooks
node scripts/setup-webhooks.js

# Check status
pm2 status
pm2 logs bot-farm
```

## Webhook URLs
Each bot has its own webhook endpoint:
- `https://185.161.67.53/neuro_blogger_bot` → Port 3001
- `https://185.161.67.53/MetaMuse_Manifest_bot` → Port 3002
- `https://185.161.67.53/ZavaraBot` → Port 3003
- `https://185.161.67.53/LeeSolarbot` → Port 3004
- `https://185.161.67.53/NeuroLenaAssistant_bot` → Port 3005
- `https://185.161.67.53/NeurostylistShtogrina_bot` → Port 3006
- `https://185.161.67.53/Gaia_Kamskaia_bot` → Port 3007
- `https://185.161.67.53/Kaya_easy_art_bot` → Port 3008
- `https://185.161.67.53/AI_STARS_bot` → Port 3009
- `https://185.161.67.53/HaimGroupMedia_bot` → Port 3010

## Monitoring

### Check Bot Status
```bash
pm2 status
```

### View Logs
```bash
pm2 logs bot-farm
```

### Monitor Resources
```bash
pm2 monit
```

### Test Webhook Configuration
```bash
node scripts/setup-webhooks.js
```

## Troubleshooting

### If bots don't respond:
1. Check PM2 status: `pm2 status`
2. Check logs: `pm2 logs bot-farm`
3. Verify nginx is running: `systemctl status nginx`
4. Test webhook connectivity: `curl http://185.161.67.53`
5. Re-run webhook setup: `node scripts/setup-webhooks.js`

### If webhooks show "Connection refused":
- Ensure bots are running: `pm2 start dist/index.js --name bot-farm`
- Check nginx configuration is correct
- Verify firewall allows ports 80/443

### Invalid bot tokens:
Some bots show "Unauthorized" errors. Update tokens in `.env`:
- BOT_TOKEN_4 (LeeSolarbot)
- BOT_TOKEN_5 (NeuroLenaAssistant_bot)
- BOT_TOKEN_6 (NeurostylistShtogrina_bot)
- BOT_TOKEN_9 (AI_STARS_bot)

## Next Steps
1. SSH into production server and run deployment script
2. Verify all bots are running with `pm2 status`
3. Test each bot in Telegram to confirm they're responding
4. Update invalid bot tokens as needed