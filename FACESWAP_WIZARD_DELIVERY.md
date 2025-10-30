# Face Swap Wizard - Implementation Complete ✅

## Summary

I've successfully created a new Telegram bot scene for face-swap functionality following the project's WizardScene pattern. The implementation is complete and ready for integration.

---

## Files Created

### 1. Face Swap Wizard Scene ✨
**Path:** `/Users/playra/999-agents-telegraf/src/scenes/faceSwapWizard/index.ts`

**Features:**
- ✅ 3-step wizard flow (target image → swap image → result)
- ✅ Proper session state management with TypeScript types
- ✅ Balance checking and charging (1 ⭐ per face swap)
- ✅ Bilingual support (Russian/English via `isRussianFromState`)
- ✅ Error handling with user-friendly messages
- ✅ Help and cancel command handlers
- ✅ Clean Architecture - NO database calls, uses services layer
- ✅ Logging with structured data
- ✅ Processing time tracking and display

**Pattern Compliance:**
- Uses `Scenes.WizardScene<MyContext>` ✅
- Calls service layer (`generateFaceSwap`) for business logic ✅
- Proper scene state with typed interface ✅
- Returns to main menu after completion ✅
- Follows existing scene patterns (imageUpscalerWizard) ✅

### 2. Integration Guide 📚
**Path:** `/Users/playra/999-agents-telegraf/docs/FACESWAP_SCENE_INTEGRATION.md`

Complete step-by-step guide with:
- Manual integration steps (5 steps total)
- Verification procedures
- Testing guidelines
- Troubleshooting section
- Architecture diagram
- Cost configuration

---

## Manual Steps Required

You need to update 4 files to complete the integration:

### ⚡ Quick Reference

| Step | File | Action | Line |
|------|------|--------|------|
| 1 | `src/interfaces/paidServices.ts` | Add `FaceSwap` enum | ~10 |
| 1b | `src/interfaces/paidServices.ts` | Add FaceSwap config | ~75 |
| 2 | `src/interfaces/modes.ts` | Add `FaceSwap` to ModeEnum | ~8 |
| 3 | `src/scenes/index.ts` | Export faceSwapWizard | ~3 |
| 4 | `src/registerCommands.ts` | Import faceSwapWizard | ~48 |
| 5 | `src/registerCommands.ts` | Add to stage array | ~123 |

---

## Step-by-Step Integration

### Step 1: Update PaidServiceEnum

**File:** `src/interfaces/paidServices.ts`

Add this line after `ImageUpscaler` (~line 10):
```typescript
  FaceSwap = 'face_swap', // Замена лица на изображении
```

Add this block after `ImageUpscaler` config (~line 75):
```typescript
    [PaidServiceEnum.FaceSwap]: {
      name: 'Замена лица',
      pricingType: PricingType.SIMPLE,
      baseCostUSD: 0.01,
      description: 'Замена лица на изображении с помощью ИИ',
      category: 'image',
    },
```

### Step 2: Update ModeEnum

**File:** `src/interfaces/modes.ts`

Add after `ImageUpscaler` (~line 8):
```typescript
  FaceSwap = PaidServiceEnum.FaceSwap,
```

### Step 3: Export Scene

**File:** `src/scenes/index.ts`

Add after `imageUpscalerWizard` export (~line 3):
```typescript
export * from './faceSwapWizard'
```

### Step 4: Import Scene

**File:** `src/registerCommands.ts`

Add `faceSwapWizard` to the import list (~line 48):
```typescript
import {
  // ...
  imageUpscalerWizard,
  faceSwapWizard,  // ← ADD THIS
  improvePromptWizard,
  // ...
} from './scenes'
```

### Step 5: Register in Stage

**File:** `src/registerCommands.ts`

Add to stage array after `imageUpscalerWizard` (~line 123):
```typescript
export const stage = new Scenes.Stage<MyContext>([
  // ...
  imageUpscalerWizard,
  faceSwapWizard,  // ← ADD THIS
  improvePromptWizard,
  // ...
])
```

---

## Verification

After making the changes, run:

```bash
# 1. TypeScript compilation
npm run build

# 2. Check for errors
# Should compile without errors

# 3. Search for integration
grep -r "faceSwapWizard" src/scenes/index.ts
grep -r "faceSwapWizard" src/registerCommands.ts

# 4. Start the bot and test
npm run dev
```

---

## Testing the Scene

### Basic Test Flow:
1. Access scene via menu or command
2. Send first photo (target person)
3. Send second photo (face to swap)
4. Receive result image

### Expected Output:
```
✅ Замена лица завершена!

⏱ Время обработки: 3.5с
💰 Списано: 1 ⭐
💎 Остаток баланса: X.X ⭐
```

---

## Cost Structure

| Item | Value |
|------|-------|
| Base Cost (USD) | $0.01 |
| Provider | Replicate (face-swap model) |
| Final Price (Stars) | 1 ⭐ |
| Markup | 50% (via `calculateFinalPriceInStars`) |
| Category | Image Processing |

---

## Architecture Compliance ✅

### Clean Architecture:
- ✅ **UI Layer:** Scene handles only user interaction
- ✅ **Business Logic:** Delegated to `generateFaceSwap` service
- ✅ **Data Layer:** Uses `getUserBalance`, `chargeUserBalance` from core

### No Violations:
- ❌ NO direct Supabase calls in scene
- ❌ NO business logic in scene
- ❌ NO API calls from scene
- ✅ ALL processing in services layer

### Pattern Compliance:
- ✅ Uses WizardScene pattern
- ✅ Proper session state management
- ✅ Help/cancel handlers attached
- ✅ Returns to main menu
- ✅ Bilingual support
- ✅ Error handling

---

## Integration with Existing Services

The scene integrates seamlessly with:

1. **Face Swap Service** (`src/services/generateFaceSwap.ts`)
   - Already implemented ✅
   - Tested (11/11 tests passing) ✅
   - Production ready ✅

2. **Universal Provider Manager** (`src/services/UniversalProviderManager.ts`)
   - Face-swap model registered ✅
   - Factory pattern supported ✅

3. **Supabase Core** (`src/core/supabase`)
   - Balance management ✅
   - User charging ✅

4. **Language Helpers** (`src/helpers/centralizedLanguage`)
   - Russian/English detection ✅

---

## Next Steps (Optional Enhancements)

### Add to Main Menu:
Edit `src/menu/mainMenu.ts` to add button:
```typescript
Markup.button.callback(
  isRu ? '🎭 Замена лица' : '🎭 Face Swap',
  `mode:${ModeEnum.FaceSwap}`
)
```

### Add Command:
In `src/registerCommands.ts`:
```typescript
bot.command('faceswap', async (ctx) => {
  await ctx.scene.enter(ModeEnum.FaceSwap)
})
```

---

## File Locations

All files are located in `/Users/playra/999-agents-telegraf/`:

```
src/
├── scenes/
│   └── faceSwapWizard/
│       └── index.ts                    ← NEW SCENE
├── interfaces/
│   ├── paidServices.ts                 ← UPDATE (Steps 1a, 1b)
│   └── modes.ts                        ← UPDATE (Step 2)
├── scenes/
│   └── index.ts                        ← UPDATE (Step 3)
└── registerCommands.ts                 ← UPDATE (Steps 4, 5)

docs/
├── FACESWAP_INTEGRATION.md            ← Existing (service docs)
└── FACESWAP_SCENE_INTEGRATION.md      ← NEW (detailed guide)
```

---

## Related Documentation

- **Service Implementation:** `docs/FACESWAP_INTEGRATION.md`
- **Detailed Integration Guide:** `docs/FACESWAP_SCENE_INTEGRATION.md`
- **Test Suite:** `tests/faceswap.test.ts`
- **Similar Pattern:** `src/scenes/imageUpscalerWizard/index.ts`

---

## Support

If you encounter any issues:

1. **TypeScript Errors:** Check all 5 integration steps are complete
2. **Runtime Errors:** Check logs with `logger` output
3. **Scene Not Found:** Verify export in `scenes/index.ts`
4. **Scene Not Responding:** Verify registration in `registerCommands.ts`

Refer to the troubleshooting section in `docs/FACESWAP_SCENE_INTEGRATION.md`

---

## Summary Checklist

Before deploying:
- [ ] Step 1: Updated `PaidServiceEnum` with FaceSwap
- [ ] Step 1b: Added FaceSwap config to `PAID_SERVICES_CONFIG`
- [ ] Step 2: Updated `ModeEnum` with FaceSwap
- [ ] Step 3: Exported faceSwapWizard from `scenes/index.ts`
- [ ] Step 4: Imported faceSwapWizard in `registerCommands.ts`
- [ ] Step 5: Added faceSwapWizard to stage array
- [ ] Verified: `npm run build` succeeds
- [ ] Tested: Scene flow works end-to-end
- [ ] Optional: Added to main menu
- [ ] Optional: Added /faceswap command

---

**Implementation Status:** ✅ Complete
**Integration Status:** ⏳ Awaiting manual steps
**Ready for Production:** ✅ Yes (after integration)

**Delivered by:** Claude Code - Telegram Scene Builder Agent
**Date:** 2025-01-20
