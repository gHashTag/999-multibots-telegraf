# Quick Reference: Duplication Fix Action Items

## CRITICAL: wizardHelpers Not Being Used
**Status**: Created but never imported
**Impact**: ~400 lines of duplicated validation code

### Affected Wizard Files (No wizardHelpers Import):
```
/src/scenes/avatarBrainWizard/index.ts
/src/scenes/textToImageWizard/index.ts
/src/scenes/improvePromptWizard/index.ts
/src/scenes/balanceScene/index.ts
/src/scenes/instagramParserScene/index.ts
/src/scenes/imageUpscalerWizard/index.ts
/src/scenes/imageToPromptWizard/index.ts
/src/scenes/textToVideoWizard/index.ts
/src/scenes/textToSpeechWizard/index.ts
/src/scenes/selectModelWizard/index.ts
/src/scenes/neuroPhotoWizardV2/index.ts
/src/scenes/neuroPhotoWizard/index.ts (with 18+ console.log)
/src/scenes/trainFluxModelWizard/index.ts
/src/scenes/lipSyncWizard/index.ts
/src/scenes/morphingWizard/index.ts
/src/scenes/voiceAvatarWizard/index.ts
/src/scenes/instagramScrapingWizard/index.ts
/src/scenes/uploadVideoScene/index.ts
/src/scenes/uploadTrainFluxModelScene/index.ts
/src/scenes/cancelPredictionsWizard/index.ts
```

### Action
Replace manual validation with middleware:
```typescript
// BEFORE (Lines 27-30)
if (!ctx.from?.id) {
  await sendGenericErrorMessage(ctx, isRu)
  return ctx.scene.leave()
}

// AFTER (Using middleware)
import { validateUser } from '@/middleware/wizardHelpers'

const step = new Composer<MyContext>()
  .use(validateUser)
  .on('text', async ctx => { ... })
```

---

## HIGH: console.log → logger Migration

### Files Needing Replacement (Priority Order):

**1. neuroPhotoWizard/index.ts** (18+ occurrences)
   - Lines: 35, 42, 48, 55, 161, 164, 176, 179, 182, 197, 200, 201, 211, 218...

**2. textToImageWizard/index.ts** (9 occurrences)
   - Lines: 25, 40, 76, 84, 100, 122, 132, 161, 176

**3. handleMenu.ts** (8+ occurrences)
   - Lines: 39, 61, 73, 75, 77, 79, 92, 94, 96, 98

**4. trainFluxModelWizard/index.ts** (5+ occurrences)
   - Lines: 52, 53, 56, 72, 78

**5. lipSyncWizard/index.ts** (5 occurrences)
   - Lines: 74, 152, 315, 343, 368

**6. selectModelWizard/index.ts** (4 occurrences)
   - Lines: 52, 97, 119, 136

**7-22. Other scene files** (15+ more files with 2-5 occurrences each)

### Action
```typescript
import { logger } from '@/utils/enhancedLogger'

// Replace
console.log('CASE: text_to_image STEP 1', ctx.from?.id)

// With
logger.info('[textToImageWizard] Step 1 started', {
  telegramId: ctx.from?.id,
  step: 1
})
```

---

## MEDIUM: Balance Operations Consolidation

### Files Using Manual Balance Operations:
```
/src/scenes/improvePromptWizard/index.ts (Line 258)
/src/scenes/textToImageWizard/index.ts (Lines 114, 232)
/src/scenes/instagramParserScene/index.ts (Lines 151, 171)
/src/scenes/balanceScene/index.ts (Lines 169, 172)
/src/scenes/fluxKontextScene/index.ts (Line 6)
/src/scenes/checkBalanceScene.ts (Line 700 - commented)
```

### Action
Replace with `BalanceOperationProcessor`:
```typescript
// BEFORE
const userBalance = await getUserBalance(ctx.from.id.toString())
const newBalance = userBalance - price
await updateUserBalance(
  ctx.from.id.toString(),
  newBalance,
  PaymentType.MONEY_OUTCOME,
  'Text to Image'
)

// AFTER
import { BalanceOperationProcessor } from '@/price/helpers/BalanceOperationProcessor'
await BalanceOperationProcessor.processOperation({
  telegram_id: ctx.from.id,
  paymentAmount: price,
  is_ru: isRu,
  bot_name: ctx.botInfo?.username || 'unknown',
  ctx,
  service_type: ModeEnum.TextToImage,
})
```

---

## Language Detection Consolidation

### Current State
- 205 declarations: `const isRu = isRussianFromState(ctx)`
- 305 total usages
- Found in 60+ functions across 40+ files

### Problematic Variants
1. Using old `isRussian(ctx)` instead of `isRussianFromState(ctx)`:
   - trainFluxModelWizard/index.ts (Line 19)

2. Multiple declarations in same file (should extract to function):
   - avatarTransformScene/index.ts (5 redeclarations)
   - menuScene/index.ts (3 redeclarations)

### Action (Optional - Lower Priority)
Consider wrapper middleware:
```typescript
// Instead of repeating in every step
const withLanguage = (handler: (ctx: MyContext, isRu: boolean) => Promise<void>) => 
  async (ctx: MyContext) => {
    const isRu = isRussianFromState(ctx)
    return handler(ctx, isRu)
  }
```

---

## Code Quality Metrics

### Current State
```
Total files analyzed: 80+
Console.log occurrences: 1735 (271 files)
Files importing logger: 24 scenes only
Files with wizardHelpers: 0 (CRITICAL!)
Try blocks in scenes: 162
Error handling patterns: ~40 variations
Balance operation patterns: 20+ variations
Language detection declarations: 205
```

### After Fixes (Projected)
```
console.log occurrences: <100 (only for CLI tools)
Files using logger: 65+
Files using wizardHelpers: 20+
Try blocks: 162 (same, but cleaner error handling)
Standardized patterns: 3 (balance, error, validation)
LOC reduction: ~1250 lines
Maintenance burden: -40%
```

---

## Testing Checklist After Fixes

For each wizard fixed:
- [ ] Scene still enters correctly
- [ ] Validation still catches errors
- [ ] Error messages still display
- [ ] Language switching still works
- [ ] Balance deductions still work
- [ ] Logger output is structured and searchable

---

## Summary of Unused Code

1. **wizardHelpers.ts** - 275 lines created, 0 lines used
2. **BalanceOperationProcessor.ts** - 80 lines created, <50% utilized
3. **Validation patterns** - Duplicated 20+ times instead of using helpers
4. **Console statements** - Should be in logger (1735 occurrences total)

