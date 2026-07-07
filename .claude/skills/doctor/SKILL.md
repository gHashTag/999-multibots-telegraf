---
name: doctor
description: Daily production health check for the multi-bot Telegram platform on Railway. Diagnoses bot availability, deployment health, provider status, billing/debt, and critical errors.
---

# 🩺 /doctor — Production Health Diagnostic

## When to Use This Skill

Invoke `/doctor` (or load this skill) when:
- A user says "бот не отвечает" / "bot is not responding"
- Daily autonomous monitoring fires (`/loop 1d /doctor`)
- Before/after deployment to confirm production is healthy
- Suspicious errors appear in Railway logs
- Provider or payment flows behave oddly

## Quick Diagnosis — Run These Checks in Order

### 1. Railway deployment status
```bash
railway deployment list 2>&1 | head -10
railway status 2>&1 | head -10
```
Expected: latest deployment is `SUCCESS` and health returns `200`.

### 2. Health endpoint
```bash
BASE="https://999-multibots-telegraf-production-2008.up.railway.app"
curl -s "$BASE/health"
curl -s "$BASE/api/health"
```
Expected: `{"status":"UP", ...}` with HTTP 200.

### 3. Bot token validity & webhook conflict
For each `BOT_TOKEN_1` … `BOT_TOKEN_10`:
```bash
TOKEN=$(railway variables --json 2>&1 | python3 -c "import sys,json; print(json.load(sys.stdin)['BOT_TOKEN_N'])")
curl -s "https://api.telegram.org/bot${TOKEN}/getMe"
curl -s "https://api.telegram.org/bot${TOKEN}/getWebhookInfo"
```
Expected: `getMe.ok == true` and `webhook_url` is empty (polling mode).
If `webhook_url` is set → delete it:
```bash
curl -s -X POST "https://api.telegram.org/bot${TOKEN}/deleteWebhook?drop_pending_updates=true"
```
If `pending_update_count` > 50 → possible 409 conflict or downtime backlog.

### 4. Provider health
```bash
curl -s "$BASE/api/providers"
```
Expected: all essential providers `healthy: true` or `status: "up"`. Investigate `fal`, `replicate`, `openai`, `elevenlabs`, `heygen` first.

### 5. Billing / platform debt
```bash
curl -s "$BASE/api/billing"
```
Expected: no owner has debt > 500⭐ for more than 3 days. Auto-disable threshold: 500⭐.

### 6. Recent errors in Railway logs
```bash
railway logs --lines 200 2>&1 | grep -iE "error|❌|CRITICAL|fail|unhandled|rejection|409|conflict" | tail -30
```

## Decision Matrix

| Symptom | Likely Cause | Action |
|---------|--------------|--------|
| Health non-200 | Container crash / port misconfig | Check `railway logs -d`, verify `PORT`/`API_PORT`, restart |
| Bot 409 Conflict | Two instances polling same token | Stop old deploy, delete webhook, redeploy single replica |
| Bot token INVALID | Token revoked in @BotFather | Update `BOT_TOKEN_N` in Railway vars, redeploy |
| Provider DOWN | API key empty, rate limit, outage | Check Infisical secret, balance, provider status page |
| Debt > 500⭐ | Unpaid platform fees | Notify owner; bot may auto-disable |
| Webhook URL set | Previous webhook not cleaned | `deleteWebhook?drop_pending_updates=true` |

## Common Fixes

### Fix 409 Conflict (duplicate polling)
1. Ensure only ONE Railway replica: `numReplicas = 1` in `railway.toml`.
2. Delete webhooks for all tokens (script above).
3. Stop any local dev / old Fly.io instance.
4. Redeploy: `railway up`.

### Fix stale BASE_WEBHOOK_URL
If `BASE_WEBHOOK_URL` still points to old Fly.io URL:
```bash
railway variables --set "BASE_WEBHOOK_URL=https://999-multibots-telegraf-production-2008.up.railway.app"
```

### Fix missing Inngest webhook
Update Inngest Cloud endpoint to:
```text
https://999-multibots-telegraf-production-2008.up.railway.app/api/inngest
```

## Output Template

When `/doctor` runs, report results using this structure:

```
🩺 /doctor — <timestamp>
✅ / ⚠️ / ❌ Deployment: <status>
✅ / ⚠️ / ❌ Health: <HTTP code> <JSON summary>
✅ / ⚠️ / ❌ Bots: N/10 healthy
✅ / ⚠️ / ❌ Providers: <list any down>
✅ / ⚠️ / ❌ Billing: total debt X⭐, owners above threshold: ...
✅ / ⚠️ / ❌ Errors (last hour): count / none
Action items:
1. ...
2. ...
```

## Related Resources

- Railway dashboard: https://railway.com/project/564d9ebd-7aa8-44fe-93ec-e0b03c87158d
- Production URL: https://999-multibots-telegraf-production-2008.up.railway.app
- Fly.io backup (currently suspended): `flyctl status --app 999-multibots-telegraf`
- See also: [[autonomous-monitor]], [[error-recovery-debugging]], [[production-deployment]]
