# Face Swap Scene Integration Guide

## Overview
This document provides step-by-step instructions for integrating the Face Swap wizard scene into the Telegram bot.

## Files Created

### 1. Face Swap Wizard Scene
**Location:** `/Users/playra/999-agents-telegraf/src/scenes/faceSwapWizard/index.ts`

**Status:** ✅ Created

**Features:**
- 3-step wizard flow for face swapping
- Step 1: Request target image (person whose face will be replaced)
- Step 2: Request swap image (face to swap in)
- Step 3: Process face swap and return result
- Proper error handling and user feedback
- Balance checking and charging (1 star cost)
- Russian and English language support
- Help and cancel handlers

---

## Manual Integration Steps Required

### Step 1: Update PaidServiceEnum

**File:** `src/interfaces/paidServices.ts`

**Action:** Add `FaceSwap` enum value

**Line ~10** (after `ImageUpscaler`):
```typescript
  ImageUpscaler = 'image_upscaler', // Увеличение качества изображений
  FaceSwap = 'face_swap', // Замена лица на изображении  // ← ADD THIS LINE
```

**Line ~75** (after `ImageUpscaler` config):
```typescript
    [PaidServiceEnum.ImageUpscaler]: {
      name: 'Увеличение качества',
      pricingType: PricingType.SIMPLE,
      baseCostUSD: 0.04,
      description: 'Увеличение качества изображений с помощью ИИ',
      category: 'image',
    },
    // ← ADD THIS BLOCK
    [PaidServiceEnum.FaceSwap]: {
      name: 'Замена лица',
      pricingType: PricingType.SIMPLE,
      baseCostUSD: 0.01, // Себестоимость Replicate face-swap модели
      description: 'Замена лица на изображении с помощью ИИ',
      category: 'image',
    },
```

---

### Step 2: Update ModeEnum

**File:** `src/interfaces/modes.ts`

**Action:** Add `FaceSwap` mode

**Line ~8** (after `ImageUpscaler`):
```typescript
  ImageUpscaler = PaidServiceEnum.ImageUpscaler,
  FaceSwap = PaidServiceEnum.FaceSwap,  // ← ADD THIS LINE
  KlingVideo = PaidServiceEnum.KlingVideo,
```

---

### Step 3: Export Face Swap Wizard

**File:** `src/scenes/index.ts`

**Action:** Add export statement

**Line ~3** (after `imageUpscalerWizard`):
```typescript
export * from './imageUpscalerWizard'
export * from './faceSwapWizard'  // ← ADD THIS LINE
export * from './emailWizard'
```

---

### Step 4: Import Face Swap Wizard

**File:** `src/registerCommands.ts`

**Action:** Add to imports list

**Line ~48** (in the import block, after `imageUpscalerWizard`):
```typescript
import {
  avatarBrainWizard,
  textToVideoWizard,
  neuroPhotoWizard,
  neuroPhotoWizardV2,
  imageToPromptWizard,
  imageUpscalerWizard,
  faceSwapWizard,  // ← ADD THIS LINE
  improvePromptWizard,
  // ... rest of imports
} from './scenes'
```

---

### Step 5: Register Scene in Stage

**File:** `src/registerCommands.ts`

**Action:** Add to stage array

**Line ~123** (after `imageUpscalerWizard`):
```typescript
export const stage = new Scenes.Stage<MyContext>([
  startScene,
  menuScene,
  // ...
  imageUpscalerWizard,
  faceSwapWizard,  // ← ADD THIS LINE
  improvePromptWizard,
  // ... rest of scenes
])
```

---

## Verification Steps

After making the changes above, verify the integration:

### 1. TypeScript Compilation
```bash
cd /Users/playra/999-agents-telegraf
npm run build
```

**Expected:** No TypeScript errors

### 2. Check Scene Export
```bash
grep -r "faceSwapWizard" src/scenes/index.ts
```

**Expected:** `export * from './faceSwapWizard'`

### 3. Check Registration
```bash
grep -r "faceSwapWizard" src/registerCommands.ts
```

**Expected:** Import and stage registration

### 4. Runtime Test
```bash
# In Telegram bot, try accessing face swap scene
# Should respond with:
# "🎭 Замена лица - Шаг 1/2
#  📸 Отправьте первое изображение..."
```

---

## Testing the Scene

### Manual Testing Flow:

1. **Start the scene** (you'll need to add menu button or command)
2. **Send first image** (target person)
   - Expected: Confirmation and request for second image
3. **Send second image** (face to swap)
   - Expected: Processing message
   - Expected: Result image with caption showing:
     - Processing time
     - Cost (1 ⭐)
     - Remaining balance
4. **Verify balance deduction**
   - Check user balance before and after
   - Should be reduced by 1 star

### Edge Cases to Test:

1. **Insufficient balance**
   - User with 0 stars
   - Expected: Error message about low balance

2. **Invalid images**
   - Text instead of photo
   - Expected: Error message requesting image

3. **Cancel mid-flow**
   - Send /cancel during wizard
   - Expected: Wizard exits, returns to main menu

4. **Help command**
   - Send /help during wizard
   - Expected: Help message displayed

---

## Integration with Main Menu

To make Face Swap accessible from the main menu, you'll need to:

### Option 1: Add to existing menu
**File:** `src/menu/mainMenu.ts`

Add button in appropriate category (likely alongside ImageUpscaler):
```typescript
Markup.button.callback(
  isRu ? '🎭 Замена лица' : '🎭 Face Swap',
  `mode:${ModeEnum.FaceSwap}`
)
```

### Option 2: Add command
**File:** `src/registerCommands.ts`

Add command handler:
```typescript
bot.command('faceswap', async (ctx) => {
  await ctx.scene.enter(ModeEnum.FaceSwap)
})
```

---

## Cost Configuration

Current configuration:
- **Base cost (USD):** $0.01 (Replicate API cost)
- **Final price (Stars):** 1 ⭐ (with 50% markup)
- **Category:** Image processing
- **Pricing type:** Simple (fixed price)

To adjust pricing, edit `/Users/playra/999-agents-telegraf/src/interfaces/paidServices.ts`:
```typescript
[PaidServiceEnum.FaceSwap]: {
  baseCostUSD: 0.01,  // ← Adjust this value
  // Markup is applied automatically via calculateFinalPriceInStars()
}
```

---

## Architecture Diagram

```
User Request
    ↓
faceSwapWizard Scene (UI Layer)
    ├─ Step 0: Request target image
    ├─ Step 1: Request swap image
    └─ Step 2: Process & charge
         ↓
generateFaceSwap Service (Business Logic)
         ↓
Replicate API (External Provider)
         ↓
Result returned to user
```

---

## Dependencies

The scene uses the following existing services:
- `@/services/generateFaceSwap` - Face swap business logic
- `@/core/supabase` - User balance management
- `@/helpers/centralizedLanguage` - Language detection
- `@/menu` - Keyboard helpers and error messages
- `@/handlers/handleHelpCancel` - Help/cancel handlers
- `@/utils/logger` - Logging

No additional dependencies need to be installed.

---

## Troubleshooting

### Issue: "ModeEnum.FaceSwap does not exist"
**Solution:** Ensure steps 1 and 2 are completed (PaidServiceEnum and ModeEnum updated)

### Issue: "Cannot find module './faceSwapWizard'"
**Solution:** Ensure step 3 is completed (export added to scenes/index.ts)

### Issue: "faceSwapWizard is not defined"
**Solution:** Ensure step 4 is completed (import added to registerCommands.ts)

### Issue: Scene not responding
**Solution:**
1. Check scene is registered in stage (step 5)
2. Rebuild TypeScript: `npm run build`
3. Restart bot

---

## Related Documentation

- **Face Swap Service:** `docs/FACESWAP_INTEGRATION.md`
- **Replicate Provider:** `src/services/UniversalProviderManager.ts`
- **Scene Patterns:** `src/scenes/imageUpscalerWizard/index.ts` (similar pattern)

---

**Last Updated:** 2025-01-20
**Status:** ✅ Ready for integration
**Author:** Claude Code - Telegram Scene Builder Agent
