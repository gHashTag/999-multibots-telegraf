# Quick Fix: Empty API Keys

## 🚨 Emergency Fix (30 seconds)

```bash
# 1. Check what's missing
npx tsx scripts/infisical/check-infisical-keys.ts

# 2. If keys exist in Infisical but not loading:
#    → Edit src/index.ts line ~396
#    → Add missing keys to apiKeys array

# 3. Restart
npm run dev

# 4. Verify
npx tsx scripts/infisical/check-infisical-keys.ts
```

## 📋 Checklist

- [ ] Run diagnostic: `npx tsx scripts/infisical/check-infisical-keys.ts`
- [ ] Identify missing keys (❌ НЕ НАЙДЕН)
- [ ] Add to `src/index.ts` apiKeys array (if keys exist in Infisical)
- [ ] Or add to Infisical Dashboard (if keys completely missing)
- [ ] Restart application
- [ ] Verify all keys show ✅
- [ ] Test video generation

## 🔑 Required Keys

Must be in Infisical AND loaded in `src/index.ts`:

- `ELEVENLABS_API_KEY` - Voice generation
- `HEYGEN_COCOAGE_API_KEY` - HeyGen Cocoage avatars (template 2)
- `HEYGEN_HAIM_API_KEY` - HeyGen Haim avatars (other templates)
- `HEDRA_API_KEY` - Hedra lip-sync

## 🎯 Success Check

Payload should show:

```json
{
  "eleven_labs_api_key": "sk_...", // ✅ Not empty
  "avatar_settings": {
    "heygen": {
      "api_key": "..." // ✅ Not empty
    }
  }
}
```
