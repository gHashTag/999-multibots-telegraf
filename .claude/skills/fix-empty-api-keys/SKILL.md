---
name: 'Fix Empty API Keys in Payload'
description: 'Fixes empty API keys (ElevenLabs, HeyGen, Hedra) in render-riddle payload when secrets are not loaded from Infisical into process.env'
---

# Fix Empty API Keys in Payload

## When to Use This Skill

**Activate when:**

- User reports empty `eleven_labs_api_key` or `heygen.api_key` in payload
- Logs show `"eleven_labs_api_key": ""` or `"api_key": ""` in render-riddle event
- User mentions "ключ не передается" or "API key empty"
- Error: "ELEVENLABS_API_KEY not found in ENV"
- Payload contains empty fields despite keys existing in Infisical

**Example trigger messages:**

- "Почему мы не передали правильный ключ?"
- "Ключ не передается. Раньше передавался."
- "eleven_labs_api_key пустой в запросе"
- "Empty API keys in render-server payload"

## Quick Diagnosis

**Check if API keys are missing:**

```bash
# Run diagnostic script
npx tsx scripts/infisical/check-infisical-keys.ts
```

**Expected problems:**

```
✅ ELEVENLABS_API_KEY: sk_... (51 символов)
❌ HEYGEN_COCOAGE_API_KEY: НЕ НАЙДЕН  ← Missing!
❌ HEYGEN_HAIM_API_KEY: НЕ НАЙДЕН     ← Missing!
✅ HEDRA_API_KEY: ... (11 символов)
```

**Root cause:**

1. Keys exist in Infisical but not loaded into `process.env`
2. Key names missing from loading list in `src/index.ts`
3. Keys missing from Infisical completely

## Solution Steps

### Step 1: Check if keys exist in Infisical

```bash
# Check what keys are loaded from Infisical
npx tsx scripts/infisical/check-infisical-keys.ts
```

If keys show as ❌ НЕ НАЙДЕН → Go to Step 4
If keys show as ✅ but still empty in payload → Continue to Step 2

### Step 2: Add missing keys to loading list

**File:** `src/index.ts` (around line 396-413)

Add missing keys to the `apiKeys` array:

```typescript
const apiKeys = [
  'KIE_AI_API_KEY',
  'OPENROUTER_API_KEY',
  'REPLICATE_API_TOKEN',
  'APIFY_TOKEN',
  'GITHUB_TOKEN',
  'FAL_KEY',
  'BASE_WEBHOOK_URL',
  'RENDER_INNGEST_EVENT_KEY',
  'RENDER_INNGEST_SIGNING_KEY',
  'NGROK_AUTHTOKEN',
  // AI Avatar & Voice Generation Services
  'ELEVENLABS_API_KEY', // ✅ ElevenLabs для генерации голоса
  'HEYGEN_COCOAGE_API_KEY', // ✅ HeyGen Cocoage набор (шаблон 2)
  'HEYGEN_HAIM_API_KEY', // ✅ HeyGen Haim набор (другие шаблоны)
  'HEDRA_API_KEY', // ✅ Hedra lip-sync
]
```

### Step 3: Restart application

```bash
npm run dev
```

Check logs for successful loading:

```
✅ ELEVENLABS_API_KEY загружен
✅ HEYGEN_COCOAGE_API_KEY загружен
✅ HEYGEN_HAIM_API_KEY загружен
✅ HEDRA_API_KEY загружен
```

### Step 4: Add missing keys to Infisical (if needed)

If keys show as ❌ НЕ НАЙДЕН in diagnostic:

1. **Open Infisical Dashboard:**
   - URL: https://app.infisical.com
   - Project ID: `fd763fa3-35d5-4045-93bd-1795c5f00fc3`
   - Environment: `dev` (for development) or `prod` (for production)

2. **Add missing secrets:**

   **For HEYGEN_COCOAGE_API_KEY:**
   - Name: `HEYGEN_COCOAGE_API_KEY`
   - Value: [Your HeyGen API key for Cocoage avatars]
   - Path: `/` (root)

   **For HEYGEN_HAIM_API_KEY:**
   - Name: `HEYGEN_HAIM_API_KEY`
   - Value: [Your HeyGen API key for Haim avatars]
   - Path: `/` (root)

3. **Where to get HeyGen API keys:**
   - Check old `.env` files: `grep HEYGEN .env* 2>/dev/null`
   - Check production Infisical environment
   - HeyGen Dashboard: https://app.heygen.com → Settings → API Keys

4. **Restart and verify:**
   ```bash
   npm run dev
   npx tsx scripts/infisical/check-infisical-keys.ts
   ```

## Verification

**1. Check diagnostic script:**

```bash
npx tsx scripts/infisical/check-infisical-keys.ts
```

Expected output:

```
✅ ELEVENLABS_API_KEY: sk_... (51 символов)
✅ HEYGEN_COCOAGE_API_KEY: ... (длина символов)
✅ HEYGEN_HAIM_API_KEY: ... (длина символов)
✅ HEDRA_API_KEY: ... (11 символов)
```

**2. Check payload in logs:**

When creating AI Reels (template 2 with HeyGen), logs should show:

```
🎬 [AI REELS RENDER] FULL PAYLOAD DETAILS
eleven_labs_api_key_present: true
eleven_labs_api_key_prefix: sk_a6c2309...
avatar_settings:
  heygen:
    api_key_present: true
```

**3. Test generation:**

- Create AI Reels video through bot
- Check that render-server receives non-empty keys
- Verify video generation completes successfully

## Common Issues

### Issue 1: Keys exist in Infisical but still empty in payload

**Symptom:** `npx tsx scripts/infisical/check-infisical-keys.ts` shows ✅ but payload is empty

**Solution:** Keys not loaded into `process.env` - follow Step 2 to add them to loading list

### Issue 2: HEYGEN_COCOAGE_API_KEY not found

**Symptom:** Only HEYGEN_HAIM_API_KEY exists in Infisical

**Solution:**

- If using only one HeyGen account, duplicate the key:
  ```
  HEYGEN_COCOAGE_API_KEY = [same as HEYGEN_HAIM_API_KEY]
  ```
- Or update `heygen-avatars-config.ts` to use single key

### Issue 3: Keys work locally but not in production

**Symptom:** Dev works, production has empty keys

**Solution:**

1. Switch Infisical environment to `prod`:
   ```bash
   # In .env file
   INFISICAL_ENVIRONMENT=prod
   ```
2. Add keys to `prod` environment in Infisical
3. Redeploy application

### Issue 4: Voice IDs missing

**Symptom:** API keys present but voice_id is empty

**Solution:** Voice IDs have fallback values in `heygen-avatars-config.ts`:

- Cocoage: `2b2e1f15157b454487f1250ffe586d7a`
- Haim: `dc9cd149b0d741d6934a1d95e3f3ef00`

These are used automatically if not overridden in Infisical.

## Related Files

**Key files involved:**

- `src/index.ts` (lines 394-413) - Infisical loading logic
- `src/inngest_app/render-server-client.ts` (line 288) - Payload creation
- `src/scenes/lipSyncWizard/heygen-avatars-config.ts` - HeyGen configuration
- `src/scenes/lipSyncWizard/ai-reels-render-wizard.ts` - Scene that calls payload creation
- `scripts/infisical/check-infisical-keys.ts` - Diagnostic tool

**Configuration files:**

- `.env` - Infisical credentials (only 5 variables)
- Infisical Dashboard - All other secrets (50+ variables)

## Related Resources

- **Documentation:** `HEYGEN_KEYS_FIX.md` - Detailed fix documentation
- **Infisical Skill:** `.claude/skills/infisical-secrets/` - Secret management
- **Project Knowledge:** `.claude/skills/project-knowledge-base/` - Architecture info
- **Diagnostic Script:** `scripts/infisical/check-infisical-keys.ts` - Key checker

## Technical Background

**Why this happens:**

1. **Infisical-first architecture:** All secrets stored in Infisical cloud
2. **Process.env loading:** Secrets loaded at startup into `process.env`
3. **Missing keys:** If key not in loading list → not in `process.env` → empty in payload

**Architecture flow:**

```
Infisical Cloud
    ↓ (initInfisical)
Secret Cache (in memory)
    ↓ (getSecret + copy to process.env)
process.env
    ↓ (createRenderAvatarPayload)
Render Server Payload
```

**Key locations:**

- Cocoage API key: Used for template 2 (custom avatars)
- Haim API key: Used for other templates
- Voice IDs: Map avatars to voice models for speech synthesis

## Success Criteria

✅ All keys show as loaded in diagnostic script
✅ Payload contains non-empty `eleven_labs_api_key`
✅ Payload contains non-empty `avatar_settings.heygen.api_key` (when HeyGen selected)
✅ Video generation completes successfully
✅ Logs show key prefixes (not full keys for security)

## Prevention

**To prevent this issue in future:**

1. **Always add new API keys to loading list** in `src/index.ts`
2. **Run diagnostic after adding new services:** `npx tsx scripts/infisical/check-infisical-keys.ts`
3. **Document key requirements** when adding new AI providers
4. **Use diagnostic script in CI/CD** to catch missing keys early

## Version History

- **2025-11-12:** Initial version - Fixed empty ElevenLabs and HeyGen keys
- Added diagnostic script `check-infisical-keys.ts`
- Documented HeyGen Cocoage/Haim key separation

---

**Author:** Claude Code Agent
**Last Updated:** 2025-11-12
**Status:** Production-ready ✅
