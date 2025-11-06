# Inngest Cloud Setup Guide

## Overview

After centralizing Inngest functions in this repository, you need to register the bot server with Inngest Cloud to receive event triggers and function execution requests.

## Prerequisites

- Server deployed and accessible via public URL (e.g., `https://45-66-11-152.example.com` or domain)
- Inngest Cloud account at https://app.inngest.com

## Step 1: Get Your Server's Public API URL

Your Inngest endpoint will be:
```
https://YOUR_DOMAIN/api/inngest
```

Example:
```
https://45-66-11-152.example.com/api/inngest
```

## Step 2: Login to Inngest Cloud

1. Go to https://app.inngest.com
2. Login or create account
3. Navigate to your workspace

## Step 3: Create/Update Environment Keys

In Inngest Dashboard:

1. Go to **Settings** → **Keys**
2. Create new keys or use existing:
   - **Event Key** - for sending events to Inngest Cloud
   - **Signing Key** - for verifying requests from Inngest Cloud

## Step 4: Register Your Server Endpoint

In Inngest Dashboard:

1. Go to **Apps** or **Deployments**
2. Click **+ New App** or **Sync App**
3. Enter your server URL:
   ```
   https://YOUR_DOMAIN/api/inngest
   ```
4. Choose environment (Production/Staging)
5. Click **Sync** or **Register**

Inngest will:
- Send a GET request to verify endpoint is accessible
- Discover all registered functions (should show 7 functions)
- Register them for execution

## Step 5: Update .env on Server

SSH to your server and update `.env` file:

```bash
ssh -i ~/.ssh/zomro root@45.66.11.152

cd /root/999-multibots
nano .env
```

Update these variables:
```env
# Inngest Configuration (централизованно)
BOT_INNGEST_EVENT_KEY=your_event_key_from_dashboard
BOT_INNGEST_SIGNING_KEY=your_signing_key_from_dashboard
BOT_INNGEST_BASE_URL=https://YOUR_DOMAIN/api/inngest

# Remove old RENDER variables (no longer needed)
# RENDER_INNGEST_EVENT_KEY=...  # ← DELETE THIS
# RENDER_INNGEST_SIGNING_KEY=...  # ← DELETE THIS
```

Save and restart Docker:
```bash
docker-compose down
docker-compose up -d
```

## Step 6: Verify Registration

Check Inngest Dashboard:

1. Go to **Functions** tab
2. You should see 7 functions registered:
   - 🔔 AI Reels Callback Handler
   - 🎬 Render Workflow
   - 🎥 Render Avatar Video Workflow
   - 🧩 Render Riddle Workflow
   - AI Reels Generation
   - Generate Kling Morphing Loop v7
   - Model Training - Flux LoRA

3. Check **Events** tab to see incoming events

## Step 7: Test Event Sending

From your server logs, you should see:
```
✅ [API] Server started on port 3000
🚀 [INNGEST] Registering functions {"count":7,"functions":[...]}
```

Test sending an event (optional):
```bash
curl -X POST https://YOUR_DOMAIN/api/test-inngest
```

## Troubleshooting

### Endpoint not accessible
- Check firewall: `sudo ufw status`
- Check nginx config: `sudo nginx -t`
- Check Docker: `docker ps`
- Check logs: `docker logs 999-multibots`

### Functions not discovered
- Check Inngest endpoint returns 200: `curl https://YOUR_DOMAIN/api/inngest`
- Check server logs for Inngest registration errors
- Verify `BOT_INNGEST_SIGNING_KEY` is set correctly

### Events not triggering functions
- Verify `BOT_INNGEST_EVENT_KEY` matches Dashboard
- Check Inngest Dashboard → Events for delivery status
- Check server logs for incoming webhook requests

## Architecture After Setup

```
┌─────────────────┐
│  Telegram Bot   │
│   (Your Server) │
└────────┬────────┘
         │
         │ 1. Send Event
         ↓
┌─────────────────┐
│  Inngest Cloud  │
│  (app.inngest.com)
└────────┬────────┘
         │
         │ 2. Trigger Function
         ↓
┌─────────────────┐
│  Your Server    │
│  /api/inngest   │ ← 3. Execute Function
└─────────────────┘
```

## Expected Result

After setup:
- ✅ All 7 Inngest functions registered in Inngest Cloud
- ✅ Events sent from bot trigger function execution
- ✅ No external render server needed (fully centralized)
- ✅ Function logs visible in Inngest Dashboard

## Next Steps

1. Test AI Reels generation workflow
2. Monitor Inngest Dashboard for function executions
3. Check server logs for any errors
4. Once stable on test server → Deploy to production (212.86.115.30)
