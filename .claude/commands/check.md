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

### 2. Bot Status (all bots)

A bot on our own Bot API server (`BOT_API_LOCAL_BOTS`) must never be asked on
the cloud -- that request logs it back in there and splits its updates -- so
the host comes from the bot service's own variables, per token, and such a bot
is skipped (deployment/telegram-bot-api/README.md):

```bash
KV=$(railway variables --service 999-multibots-telegraf --kv 2>/dev/null)
CLOUD=$(node -p 'require("./scripts/lib/telegram-api.cjs").CLOUD_API_ROOT')
for i in $(seq 1 20); do
  TOKEN=$(printf '%s\n' "$KV" | grep "^BOT_TOKEN_${i}=" | cut -d= -f2-)
  [ -n "$TOKEN" ] || continue
  ROOT=$(printf '%s\n' "$KV" | BOT_API_TOKEN="$TOKEN" node scripts/lib/telegram-api.cjs api-root --env-from-stdin 2>/dev/null)
  if [ "$ROOT" != "$CLOUD" ]; then
    echo "BOT_${i}: on our own Bot API server, or the config is unreadable -- skipped"
    continue
  fi
  curl -s "${ROOT}/bot${TOKEN}/getMe" | python3 -c "import json,sys; d=json.load(sys.stdin); print(f'BOT_{'"$i"'}: {d[\"result\"][\"username\"]}' if d.get('ok') else f'BOT_{'"$i"'}: INVALID')"
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
