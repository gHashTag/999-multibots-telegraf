# Fix Empty API Keys Skill

Automatically fixes empty API keys (ElevenLabs, HeyGen, Hedra) in render-riddle payloads.

## Quick Start

```bash
# Diagnose the problem
npx tsx scripts/infisical/check-infisical-keys.ts

# Follow the skill guide
cat .claude/skills/fix-empty-api-keys/SKILL.md
```

## Files

- `SKILL.md` - Main skill documentation with step-by-step fix
- `resources/quick-fix.md` - Emergency 30-second fix guide

## When This Skill Activates

- User reports: "ключ не передается"
- Logs show: `"eleven_labs_api_key": ""`
- Payload contains empty API keys despite keys existing in Infisical

## Related

- **Diagnostic Script:** `/scripts/infisical/check-infisical-keys.ts`
- **Documentation:** `/HEYGEN_KEYS_FIX.md`
- **Config:** `/src/index.ts` (lines 394-413)
