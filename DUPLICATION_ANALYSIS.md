# Code Duplication Analysis Report
## Multibots Telegraf Project

### Executive Summary
Found **5 major duplication patterns** affecting **80+ files** with opportunity to reduce code by **1000+ lines**.

---

## PRIORITY 1: Console Logging Not Using Logger (HIGH IMPACT)

### Status
- **40 files** still use `console.log/console.error` instead of centralized logger
- **24 scenes** import logger but **17 more don't even import it**
- **Opportunity**: Standardize on `enhancedLogger` for structured logging

### Files with Console.log in Wizard Scenes:

1. **textToImageWizard/index.ts** (9 occurrences)
   - Lines: 25, 40, 76, 84, 100, 122, 132, 161, 176
   - Pattern: `console.log('CASE: text_to_image STEP X')`

2. **neuroPhotoWizard/index.ts** (18+ occurrences)
   - Lines: 35, 42, 48, 55, 161, 164, 176, 179, 182, 197, 200, 201, 211, 218...
   - Pattern: Mix of debugging and tracing

3. **trainFluxModelWizard/index.ts** (5+ occurrences)
   - Lines: 52-54, 56-58, 72, 78-79
   - Pattern: `console.log('Fetched targetUserId from ctx.from')`

4. **lipSyncWizard/index.ts** (5 occurrences)
   - Lines: 74, 152, 315, 343, 368
   - Pattern: `console.error('❌ Ошибка валидации видео:', error)`

5. **selectModelWizard/index.ts** (4 occurrences)
   - Lines: 52, 97, 119, 136
   - Pattern: `console.error('Error creating model selection menu:', error)`

**Other wizard files affected (15+)**:
- neuroPhotoWizardV2/index.ts
- textToVideoWizard/index.ts
- textToSpeechWizard/index.ts
- voiceAvatarWizard/index.ts
- instagramScrapingWizard/index.ts
- imageUpscalerWizard/index.ts
- imageToPromptWizard/index.ts

### Handler Files with console.log:
- handleMenu.ts (Lines: 39, 61, 73-80, 92-99)
- handleTextToVideoDirect.ts (Multiple debug statements)
- paymentHandlers/index.ts (Multiple instances)
- adminCommands.ts (Multiple instances)

### Recommendation
Replace all `console.log/console.error` with logger from `/src/utils/enhancedLogger.ts`:
```typescript
// Before
console.log('CASE: text_to_image STEP 1', ctx.from?.id)

// After
logger.info('[textToImageWizard] Step 1 started', {
  telegramId: ctx.from?.id,
  step: 1
})
```

---

## PRIORITY 2: wizardHelpers Middleware Not Being Used (CRITICAL)

### Status
- **Middleware created**: `/src/middleware/wizardHelpers.ts` (275 lines)
- **Import count in scenes**: **0** (ZERO files import it!)
- **Affected validation logic**: ~20+ wizard files manually repeating checks

### Unused Helper Functions:
1. `validateUser()` - checks `!ctx.from?.id`
2. `validateTextMessage()` - checks `!message || !('text' in message)`
3. `validatePhotoMessage()` - checks `!message || !('photo' in message)`
4. `validateVideoMessage()` - checks `!message || !('video' in message)`
5. `validateUserAndText()` - combined validation
6. `isRussianFromState()` - language detection
7. `handleWizardError()` - centralized error handling
8. `createWizardEnterHandler()` - standardized entry

### Examples of Duplication Being Handled:

**textToImageWizard/index.ts** (Lines 27-30):
```typescript
if (!ctx.from?.id) {
  await sendGenericErrorMessage(ctx, isRu)
  return ctx.scene.leave()
}
```
Should use: `validateUser()` middleware

**textToImageWizard/index.ts** (Lines 78-81):
```typescript
if (!message || !('text' in message)) {
  await sendGenericErrorMessage(ctx, isRu)
  return ctx.scene.leave()
}
```
Should use: `validateTextMessage()` middleware

**imageToVideoWizard/index.ts** (Similar patterns)
**neuroPhotoWizard/index.ts** (Lines 27-30 pattern)

### Recommendation
Integrate wizardHelpers into all 20+ wizard files:
```typescript
import {
  validateUser,
  validateTextMessage,
  validateUserAndText,
  isRussianFromState,
  handleWizardError
} from '@/middleware/wizardHelpers'

// Then use in scene:
const handleModelSelection = new Composer<MyContext>()
  .use(validateUser)
  .use(validateTextMessage)
  .on('text', async ctx => {
    const isRu = isRussianFromState(ctx)
    // ... rest of logic
  })
```

---

## PRIORITY 3: Repeated Language Detection Pattern (HIGH IMPACT)

### Status
- **205 declarations** of `const isRu = isRussian*(...)`
- **305 total usages** across scenes
- **Duplication**: Pattern repeated instead of using centralized state

### Pattern Details:
```typescript
// Found in ~60+ different functions
const isRu = isRussianFromState(ctx)
```

### Affected Files (Sample):
1. **menuScene/index.ts** (Lines: 387, 430, 549)
2. **avatarTransformScene/index.ts** (Lines: 140, 392, 466, 614, 898)
3. **checkBalanceScene.ts** (Lines: 347, 680)
4. **avatarBrainWizard/index.ts** (Lines: 22, 33, 48, 66)
5. **instagramParserScene/index.ts** (Line 34)

### Alternative Pattern Found:
Some files use deprecated `isRussian()` instead of `isRussianFromState()`:
- trainFluxModelWizard/index.ts (Line 19)

### Recommendation
Create a context hook or compose middleware to automatically inject language:
```typescript
// Rather than repeating in every step:
export const textToImageWizard = new Scenes.WizardScene<MyContext>(
  'text_to_image',
  withLanguage(async (ctx, isRu) => {
    // isRu is injected automatically
  })
)
```

---

## PRIORITY 4: Balance Operation Duplication (MEDIUM IMPACT)

### Status
- **getUserBalance() + updateUserBalance()** patterns found 20+ times
- **Centralized processor exists**: `BalanceOperationProcessor.ts` (80 lines)
- **Not being used** in many wizard files

### Pattern Found:
```typescript
// Repeated in: improvePromptWizard, textToImageWizard, instagramParserScene, etc.
const currentBalance = await getUserBalance(userId.toString())
// ... validation ...
await updateUserBalance(userId, newBalance, PaymentType.MONEY_OUTCOME, description)
```

### Files with Manual Balance Operations:
1. **improvePromptWizard/index.ts** (Line 258)
2. **textToImageWizard/index.ts** (Lines 114, 232)
3. **instagramParserScene/index.ts** (Lines 151, 171)
4. **balanceScene/index.ts** (Lines 169, 172)
5. **fluxKontextScene/index.ts** (Line 6)

### Recommendation
Use `BalanceOperationProcessor.processOperation()` instead:
```typescript
// Before (repeated in 20+ places)
const userBalance = await getUserBalance(ctx.from.id.toString())
const newBalance = userBalance - price
await updateUserBalance(
  ctx.from.id.toString(),
  newBalance,
  PaymentType.MONEY_OUTCOME,
  'Text to Image generation'
)

// After (unified)
await BalanceOperationProcessor.processOperation({
  telegram_id: ctx.from.id,
  paymentAmount: price,
  is_ru: isRu,
  bot_name: ctx.botInfo?.username || 'unknown',
  ctx,
  service_type: ModeEnum.TextToImage
})
```

---

## PRIORITY 5: Repeated Error Handling in Try-Catch (MEDIUM IMPACT)

### Status
- **162 try blocks** in scenes alone
- **Repeated pattern**: try/catch with same error message to user
- **No centralized error handler** being used consistently

### Pattern Example:
Found in multiple files:
```typescript
try {
  // operation
} catch (error) {
  console.error('❌ Error:', error)
  await sendGenericErrorMessage(ctx, isRu)
  return ctx.scene.leave()
}
```

### Files with Repetitive Error Handling:
1. **handleTextToVideoDirect.ts** (5 catch blocks, Lines: 59, 208, 302, 448, 514)
2. **paymentHandlers/index.ts** (Lines: 23, 332, 366)
3. **selectModelWizard/index.ts** (Line 51)
4. **lipSyncWizard/index.ts** (Lines: 45, 73, 88)

### Recommendation
Use existing `handleWizardError()` from wizardHelpers:
```typescript
try {
  await generateImage(...)
} catch (error) {
  await handleWizardError(ctx, error as Error, 'textToImage')
  return
}
```

---

## PRIORITY 6: Model Selection & Keyboard Creation Duplication

### Status
- **Repeated pattern**: Filter models → Map to buttons → Create keyboard (Lines 20-31)
- **Found in**: selectModelWizard, textToImageWizard, imageToVideoWizard, etc.
- **Opportunity**: Extract to helper function

### Example - selectModelWizard/index.ts (Lines 18-43):
```typescript
const buttons: ReturnType<typeof Markup.button.text>[][] = []
for (let i = 0; i < models.length; i += 3) {
  const row: ReturnType<typeof Markup.button.text>[] = []
  if (models[i]) row.push(Markup.button.text(models[i].name))
  if (models[i + 1]) row.push(Markup.button.text(models[i + 1].name))
  if (models[i + 2]) row.push(Markup.button.text(models[i + 2].name))
  buttons.push(row)
}
buttons.push([/* cancel/help buttons */])
const keyboard = Markup.keyboard(buttons).resize().oneTime()
```

### Similar Pattern in:
- textToImageWizard/index.ts (Lines 33-60)
- neuroPhotoWizard/index.ts (Similar grid creation)
- morphingWizard/index.ts (Similar grid creation)

### Recommendation
Create helper:
```typescript
// helpers/keyboard-helpers.ts
export function createModelKeyboard(
  models: Model[],
  isRu: boolean,
  itemsPerRow: number = 3
) {
  const buttons = []
  for (let i = 0; i < models.length; i += itemsPerRow) {
    const row = []
    for (let j = 0; j < itemsPerRow; j++) {
      if (models[i + j]) row.push(Markup.button.text(models[i + j].name))
    }
    buttons.push(row)
  }
  buttons.push([
    Markup.button.text(isRu ? 'Справка' : 'Help'),
    Markup.button.text(isRu ? 'Отмена' : 'Cancel')
  ])
  return Markup.keyboard(buttons).resize().oneTime()
}
```

---

## Summary Table

| Pattern | Impact | Files | LOC Saved | Priority |
|---------|--------|-------|-----------|----------|
| console.log → logger | High | 40 | ~200 | 1 |
| Use wizardHelpers | Critical | 20+ | ~400 | 2 |
| Language detection | High | 60+ | ~300 | 3 |
| Balance operations | Medium | 20 | ~150 | 4 |
| Error handling | Medium | 20+ | ~100 | 5 |
| Keyboard creation | Low | 5 | ~100 | 6 |
| **TOTAL** | - | **165+** | **~1250** | - |

---

## Implementation Roadmap

1. **Week 1**: Replace all console.log → logger (40 files, 1-2 hours)
2. **Week 2**: Integrate wizardHelpers middleware (20+ files, 2-3 hours)
3. **Week 3**: Consolidate balance operations (20 files, 1-2 hours)
4. **Week 4**: Extract keyboard helpers (5 files, 1 hour)
5. **Week 5**: Cleanup & testing

---

## Next Steps
- [ ] Create task to migrate console.log statements
- [ ] Create task to integrate wizardHelpers into all scenes
- [ ] Review and standardize error handling
- [ ] Extract keyboard creation to helpers
