---
name: check
description: Quick health check of Railway production deployment
---

## Railway Production Health Check

### 1. Health Endpoints
```bash
BASE="https://999-multibots-telegraf-production-2008.up.railway.app"
curl -s "$BASE/health"
curl -s "$BASE/api/health"
```

### 2. Bot Status (all 10 bots)
Check each bot token from `/tmp/railway_secrets.txt`:
```bash
for i in 1 2 3 4 5 6 7 8 9 10; do
  TOKEN=$(grep "^BOT_TOKEN_${i}=" /tmp/railway_secrets.txt | head -1 | sed "s/^BOT_TOKEN_${i}='//;s/'$//")
  curl -s "https://api.telegram.org/bot${TOKEN}/getMe" | python3 -c "import json,sys; d=json.load(sys.stdin); print(f'BOT_{'"$i"'}: {d[\"result\"][\"username\"]}' if d.get('ok') else f'BOT_{'"$i"'}: INVALID')"
done
```

### 3. Provider Health
```bash
curl -s "$BASE/api/providers"
```

### 4. Railway Logs (errors only)
```bash
railway logs -n 100 2>&1 | grep -iE "error|CRITICAL|fail" | grep -v "Supabase.*успешно|уведомлений" | tail -10
```

### 5. Billing Status
```bash
curl -s "$BASE/api/billing" | python3 -c "import json,sys; d=json.load(sys.stdin); [print(f'{b[\"bot_name\"]}: debt={b[\"debt\"]:.0f}⭐') for b in d.get('bots',[])]"
```

### 6. Payment Endpoint
```bash
curl -s "$BASE/api/payment-success"
```

## Diagnosis Rules

### CRITICAL:
- Health returns non-200 → Railway container crashed
- Bot token INVALID → Token expired, update in Railway vars
- Provider DOWN → Check balance, notify admin

### WARNING:
- Debt > 500⭐ → Owner needs to pay
- Fal.ai exhausted → Need to top up fal.ai balance
- railway logs errors → Investigate

### OK:
- Health UP + all bots valid + no errors → Production healthy

## Deployment Info
- **Platform:** Railway (railway.com)
- **App URL:** https://999-multibots-telegraf-production-2008.up.railway.app
- **Project:** aware-art (564d9ebd-7aa8-44fe-93ec-e0b03c87158d)
- **Deploy:** Push to `main` branch → auto-deploy
- **Logs:** `railway logs -n 100`
