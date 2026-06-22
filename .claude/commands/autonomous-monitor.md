---
name: autonomous-monitor
description: Control autonomous error monitoring via Railway logs and provider health
---

# Autonomous Monitor — Railway Edition

Monitor Railway production deployment for errors, provider outages, and billing issues.

## Commands

### `/autonomous-monitor start`
Start watching Railway logs for errors:
```bash
railway logs -n 200 2>&1 | grep -iE "error|CRITICAL|fail|❌|unhandled|reject" | grep -v "Supabase.*успешно|уведомлений|pending"
```

### `/autonomous-monitor status`
```bash
BASE="https://999-multibots-telegraf-production-2008.up.railway.app"
echo "Health: $(curl -s $BASE/health)"
echo "Providers: $(curl -s $BASE/api/providers)"
echo "Billing: $(curl -s $BASE/api/billing | python3 -c 'import json,sys;d=json.load(sys.stdin);print(f\"Total debt: {d.get(\"total_platform_debt\",0):.0f}⭐\")')"
```

### `/autonomous-monitor errors`
```bash
railway logs -n 500 2>&1 | grep -iE "error|❌|CRITICAL" | grep -v "Supabase|уведомлений" | tail -20
```

### `/autonomous-monitor providers`
```bash
curl -s "$BASE/api/providers?refresh=true" | python3 -m json.tool
```

## Auto-Detection

Built-in provider health monitor runs every 5 minutes:
- Checks Fal.ai, Replicate, OpenAI, ElevenLabs
- Sends Telegram alert to ADMIN_CHAT_ID on status change
- Blocks generation if all providers down

Built-in billing monitor runs every 24 hours:
- Checks bot owner debt
- Sends notifications at 100⭐, 300⭐, 500⭐ thresholds
- Auto-disables bot at 500⭐ + 3 days without payment

## Deployment Info
- **Platform:** Railway
- **Logs:** `railway logs -n 100`
- **Build:** `railway logs --build -n 20`
- **Status:** `railway status`
