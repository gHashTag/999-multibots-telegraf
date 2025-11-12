---
name: "Mandatory Webhook Verification"
description: "CRITICAL: Webhook verification in deploy.sh - NEVER REMOVE! Explains why this check is mandatory and how it ensures webhook functionality before deployment completion."
---

# Mandatory Webhook Verification in deploy.sh

## ⚠️ CRITICAL RULE: NEVER REMOVE THIS CHECK

**Location**: `deploy.sh` - Step 6️⃣ "Webhook verification (CRITICAL CHECK)"

**Status**: **PERMANENT** - This check is MANDATORY and must NEVER be removed or commented out.

---

## 📋 Why This Check Exists

### User's Core Principle:
> **"Если она не собирается, значит, смысла в этом боте нет, потому что он работать не будет"**
>
> (Translation: "If it [webhook] doesn't work, then this bot is useless because it won't function")

### The Problem History:

**January 2025** - Critical deployment issue discovered:
1. ✅ Docker builds succeeded
2. ✅ Containers started successfully
3. ✅ Bots initialized and ran in polling mode
4. ❌ **But Veo 3 webhooks failed silently for HOURS**

**Root Cause**: Webhook endpoint was broken, but deployment reported "SUCCESS" because only container health was checked, not webhook functionality.

**Impact**:
- User wasted money on video generation (Veo 3 costs per request)
- Videos were generated successfully by provider
- Webhooks arrived but were processed incorrectly (wrong provider detection)
- Videos never delivered to users
- **Economic loss + poor user experience**

**User's Frustration** (direct quotes):
- "Почему не пришла?" (Why didn't it arrive?)
- "Я же экономлю деньги там" (I'm saving money there)
- "Почему он не работает до сих пор?" (Why doesn't it work still?)
- "Без webhook бот бесполезен" (Without webhook the bot is useless)

---

## 🎯 What This Check Does

### Step-by-Step Verification:

```bash
# 6️⃣ Webhook verification (CRITICAL CHECK)
```

1. **Sends Test Webhook**
   - POST to `/api/webhooks/kie-ai/video-callback`
   - Payload: Minimal Veo 3 / WAN 2.5 structure
   - Timeout: 10 seconds (prevents hanging)

2. **Checks HTTP Response**
   - Expected: 200 or 202 status code
   - If fails: ABORTS deployment with exit 1

3. **Verifies Provider Detection**
   - Checks logs for correct provider: `kie-wan`, `kie-veed`, or `kie-sora`
   - NOT `kie-ai` (old broken detection)
   - Ensures webhook routing logic works correctly

4. **Deployment Decision**
   - ✅ Webhook works → Deployment SUCCESSFUL
   - ❌ Webhook fails → Deployment ABORTED

---

## 🔬 Test Payload Structure

```json
{
  "code": 200,
  "msg": "Success",
  "successFlag": true,
  "taskId": "test-deployment-webhook-check",
  "resultUrl": "https://example.com/test.mp4",
  "data": {
    "videoUrl": "https://example.com/test.mp4"
  }
}
```

**Why this structure?**
- `successFlag: true` → Identifies as Veo 3 / WAN webhook (not Sora)
- `taskId + resultUrl` → Matches real Kie.ai WAN webhook format
- Should be detected as `'kie-wan'`, NOT `'kie-ai'`

---

## 🚨 What Happens If Check Fails

### Deployment Aborts Immediately:

```bash
❌ WEBHOOK CHECK FAILED! HTTP Code: XXX
❌ DEPLOYMENT ABORTED - Webhook не работает!
   Без webhook бот бесполезен. Проверьте логи:
   ssh prod999 'docker logs 999-multibots --tail 100'

exit 1
```

**Why abort?**
- Container may be running
- Bots may be in polling mode
- **BUT**: Video generation webhooks don't work
- **Result**: User loses money, videos never arrive
- **Solution**: Fix webhook BEFORE completing deployment

---

## ✅ Success Indicators

### When check passes:

```bash
✅ Webhook endpoint responded: HTTP 200
   Verifying webhook processing...
✅ Webhook provider correctly detected!

🔍 [UNIVERSAL VIDEO WEBHOOK] Provider detected {"provider":"kie-wan",...}
```

**Confirms**:
1. Endpoint is accessible
2. POST requests are processed
3. Provider detection logic works (kie-wan, not kie-ai!)
4. Webhook routing is correct

---

## 📝 Common Failure Scenarios

### 1. HTTP Timeout (>10 seconds)
**Symptom**: `HTTP_CODE: (empty)`
**Cause**: Server not responding, webhook endpoint down
**Fix**: Check container logs, ensure Express API started

### 2. HTTP 404 Not Found
**Symptom**: `HTTP_CODE: 404`
**Cause**: Webhook route not registered
**Fix**: Check `kie-ai-webhook.routes.ts` is loaded

### 3. HTTP 500 Internal Error
**Symptom**: `HTTP_CODE: 500`
**Cause**: Webhook processing crashed
**Fix**: Check logs for TypeScript errors, missing dependencies

### 4. Provider Detection Fails
**Symptom**: `Warning: Webhook provider detection unclear`
**Cause**: `detectVideoProvider()` returns wrong value
**Fix**: Verify `kie-ai-webhook.routes.ts:detectVideoProvider()` logic

---

## 🔧 Maintenance Guidelines

### ✅ ALLOWED Changes:

1. **Adjust timeout** (currently 10s)
   ```bash
   curl -s --max-time 15 ...  # Increase if network slow
   ```

2. **Update test payload** (if webhook structure changes)
   ```bash
   TEST_PAYLOAD='{ ... new structure ... }'
   ```

3. **Add more detailed logging**
   ```bash
   echo "   Detailed webhook response:"
   echo "$WEBHOOK_RESPONSE" | jq '.'
   ```

### ❌ FORBIDDEN Changes:

1. **Remove the entire check**
   ```bash
   # ❌ NEVER DO THIS:
   # Commenting out webhook verification
   ```

2. **Skip on errors**
   ```bash
   # ❌ NEVER DO THIS:
   if [ "$HTTP_CODE" != "200" ]; then
     echo "Warning, but continuing anyway..."  # NO!
   fi
   ```

3. **Disable for "quick deploys"**
   ```bash
   # ❌ NEVER DO THIS:
   if [ "$SKIP_WEBHOOK_CHECK" = "true" ]; then  # NO!
     echo "Skipping webhook verification..."
   fi
   ```

---

## 🎓 Key Lessons

### From the Veo 3 Incident:

1. **Container health ≠ Feature health**
   - Container running doesn't mean webhooks work
   - Must test actual functionality, not just liveness

2. **Silent failures are expensive**
   - User lost money on video generation
   - Hours wasted debugging
   - Poor user experience (videos never arrived)

3. **"Success" must mean "Working"**
   - Deployment success = ALL features work
   - Not just "container started"

4. **Provider detection is critical**
   - Wrong detection (`kie-ai` vs `kie-wan`) = wrong handler
   - Wrong handler = video not delivered
   - Must verify in every deployment

---

## 💡 Usage in CI/CD

### Integration with GitHub Actions:

```yaml
- name: Deploy to Production
  run: ./deploy.sh production
  # Will automatically run webhook verification
  # Fails the entire workflow if webhook broken
```

**Benefits**:
- Automated verification
- No manual testing needed
- Fast feedback (<15 seconds)
- Prevents bad deployments from reaching production

---

## 🔗 Related Files

1. **deploy.sh** (lines 253-322)
   - Step 6️⃣ Webhook verification implementation

2. **src/api_server/routes/kie-ai-webhook.routes.ts**
   - Webhook endpoint `/api/webhooks/kie-ai/video-callback`
   - `detectVideoProvider()` function (lines 355-384)
   - Provider routing logic (lines 237-290)

3. **WEBHOOK_BULLETPROOF_SYSTEM.md**
   - Webhook architecture documentation
   - Plan A/B fallback URL strategy
   - Health check system

---

## 📞 What To Do If Someone Tries To Remove It

### Response:

```
❌ STOP! This check is MANDATORY and can NEVER be removed.

Reason: "Без webhook бот бесполезен"

History: January 2025 - Veo 3 webhooks failed silently for hours,
causing money loss and poor UX. This check prevents that.

See: .claude/skills/mandatory-webhook-verification/SKILL.md

Status: PERMANENT - backed by user requirement
```

### Escalate To:
- Project owner decision
- Reference this SKILL document
- Review git history: commits 8bcea779, 6d9a72a5

---

## 📅 Last Updated

**Date**: 2025-01-12
**Version**: 1.0
**Status**: Production-critical, permanent requirement

---

## 🎯 Summary

> **Webhook verification is the LAST line of defense before declaring deployment successful.**
>
> Without it, we deploy broken webhooks, waste money, lose users.
>
> With it, we catch problems early and fix them BEFORE they cost money.
>
> **NEVER REMOVE THIS CHECK.**
