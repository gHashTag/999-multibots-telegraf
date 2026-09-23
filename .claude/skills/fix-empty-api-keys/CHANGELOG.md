# Changelog: Fix Empty API Keys Skill

## 2025-11-12 - Initial Release

### Problem Solved

Empty API keys in render-riddle payload:

```json
{
  "eleven_labs_api_key": "", // ❌ Empty
  "avatar_settings": {
    "heygen": {
      "api_key": "" // ❌ Empty
    }
  }
}
```

### Root Cause

API keys existed in Infisical but were not loaded into `process.env` at application startup because they were missing from the loading list in `src/index.ts`.

### Solution Implemented

1. **Code Changes:**
   - Added missing keys to `src/index.ts` (lines 409-412):
     - `ELEVENLABS_API_KEY`
     - `HEYGEN_COCOAGE_API_KEY`
     - `HEYGEN_HAIM_API_KEY`
     - `HEDRA_API_KEY`

2. **Diagnostic Tool:**
   - Created `scripts/check-infisical-keys.ts` for quick diagnosis

3. **Documentation:**
   - `HEYGEN_KEYS_FIX.md` - Detailed fix guide
   - `.claude/skills/fix-empty-api-keys/SKILL.md` - Reusable skill
   - `.claude/skills/fix-empty-api-keys/resources/quick-fix.md` - 30-second emergency fix

### Files Created

```
.claude/skills/fix-empty-api-keys/
├── SKILL.md              # Main skill documentation
├── README.md             # Quick overview
├── CHANGELOG.md          # This file
└── resources/
    └── quick-fix.md      # Emergency fix guide
```

### Related Changes

- Updated `CLAUDE.md` with new skill in skills list
- Created diagnostic script in `scripts/check-infisical-keys.ts`

### Impact

✅ **Before:** Empty keys → render-server fails → no video generation
✅ **After:** Valid keys → render-server succeeds → video generated

### Manual Steps Required

User must add missing HeyGen keys to Infisical:

- `HEYGEN_COCOAGE_API_KEY` → Infisical dev/prod environment
- `HEYGEN_HAIM_API_KEY` → Infisical dev/prod environment

### Testing

```bash
# Verify fix
npx tsx scripts/infisical/check-infisical-keys.ts

# Expected output:
# ✅ ELEVENLABS_API_KEY: ... (51 символов)
# ✅ HEYGEN_COCOAGE_API_KEY: ... (длина символов)
# ✅ HEYGEN_HAIM_API_KEY: ... (длина символов)
# ✅ HEDRA_API_KEY: ... (11 символов)
```

### References

- Issue discovered: 2025-11-12
- User report: "Ключ не передается. Раньше передавался."
- Example payload: render-riddle job `telegram-144022504-1762883521450`

---

**Status:** ✅ Skill Active
**Maintenance:** Update if new AI providers added
**Contact:** Check `.claude/skills/fix-empty-api-keys/SKILL.md` for latest version
