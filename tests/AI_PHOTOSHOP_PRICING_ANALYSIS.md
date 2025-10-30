# 🚨 AI PHOTOSHOP PRICING DISCREPANCY ANALYSIS

## Problem Statement

User reports inconsistent pricing for AI Photoshop:
- **Menu shows**: 5⭐
- **Selection shows**: 37⭐
- **Actually charges**: 12⭐

## Root Cause: Hardcoded Values vs Calculated Values

### ❌ THE PROBLEM: Hardcoded values in welcome message don't match calculated prices

**File**: `src/scenes/aiPhotoshopScene/index.ts` (lines 814-818)

```typescript
// HARDCODED VALUES IN WELCOME MESSAGE (WRONG!)
🎭 *SeeDream-4* - Генерация и трансформация (5⭐, до 10 фото)
🍌 *Nano Banana* - ИИ редактирование Gemini 2.5 (7⭐, до 3 фото)
🚀 *FLUX Kontext Max* - Профессиональное (13⭐, 1 фото)
🎨 *Qwen Image Edit Plus* - Продвинутое (5⭐, до 10 фото)
```

### ✅ ACTUAL CALCULATED VALUES from AI_PHOTOSHOP_PRICING.models

```
seedream             → 4⭐  (welcome message shows 5⭐)  ❌ -1 star difference
nano_banana          → 5⭐  (welcome message shows 7⭐)  ❌ -2 stars difference
flux_kontext_pro     → 7⭐  (welcome message shows 13⭐) ❌ -6 stars difference!
qwen_edit_plus       → 4⭐  (welcome message shows 5⭐)  ❌ -1 star difference
flux_multi_kontext   → 4⭐
seededit_3           → 7⭐
qwen_image_edit      → 3⭐
```

## Calculation Formula

```typescript
calculateFinalPriceInStars(baseCostUSD, starCost=0.016, markup=2.4)

Step 1: basePriceInStars = baseCostUSD / 0.016
Step 2: finalPriceWithMarkup = basePriceInStars * 2.4
Step 3: Math.floor(finalPriceWithMarkup)
```

### Examples:

**SeeDream-4** ($0.03 base):
- $0.03 / $0.016 = 1.875 stars
- 1.875 * 2.4 = 4.5 stars
- Math.floor(4.5) = **4⭐** (but welcome message says 5⭐)

**Nano Banana** ($0.039 base):
- $0.039 / $0.016 = 2.4375 stars
- 2.4375 * 2.4 = 5.85 stars
- Math.floor(5.85) = **5⭐** (but welcome message says 7⭐)

**FLUX Kontext Pro** ($0.05 base):
- $0.05 / $0.016 = 3.125 stars
- 3.125 * 2.4 = 7.5 stars
- Math.floor(7.5) = **7⭐** (but welcome message says 13⭐!)

## Total "All Models" Cost

**Calculated total**: 34⭐ (sum of all 7 models)
- seedream (4) + nano_banana (5) + flux_multi_kontext (4) + qwen_edit_plus (4) + flux_kontext_pro (7) + seededit_3 (7) + qwen_image_edit (3) = **34⭐**

**User reported**: 37⭐ shown on selection
- **Likely cause**: Some models being counted incorrectly or quality multiplier being applied

## Mystery Values Explained

### 37⭐ (Selection shows)
Possible causes:
1. **Quality multiplier applied prematurely** (1K/2K/4K multipliers from lines 76-80)
2. **Bug in callback handler** for model selection
3. **Incorrect sum calculation** in selection keyboard

### 12⭐ (Actually charged)
This doesn't match any single model price or common combinations:
- Not flux_kontext_pro (7⭐)
- Not nano_banana (5⭐)
- Not seedream + flux_kontext_pro (4 + 7 = 11⭐)
- **Likely**: Some custom calculation or multiple models being charged

## Fix Required

### 1. Update hardcoded values in welcome message (lines 814-818, 833-836)

**Current (WRONG)**:
```typescript
🎭 *SeeDream-4* - Генерация и трансформация (5⭐, до 10 фото)
🍌 *Nano Banana* - ИИ редактирование Gemini 2.5 (7⭐, до 3 фото)
🚀 *FLUX Kontext Max* - Профессиональное (13⭐, 1 фото)
🎨 *Qwen Image Edit Plus* - Продвинутое (5⭐, до 10 фото)
```

**Should be (CORRECT)**:
```typescript
🎭 *SeeDream-4* - Генерация и трансформация (${AI_PHOTOSHOP_PRICING.models.seedream}⭐, до 10 фото)
🍌 *Nano Banana* - ИИ редактирование Gemini 2.5 (${AI_PHOTOSHOP_PRICING.models.nano_banana}⭐, до 3 фото)
🚀 *FLUX Kontext Max* - Профессиональное (${AI_PHOTOSHOP_PRICING.models.flux_kontext_pro}⭐, 1 фото)
🎨 *Qwen Image Edit Plus* - Продвинутое (${AI_PHOTOSHOP_PRICING.models.qwen_edit_plus}⭐, до 10 фото)
```

Or dynamically:
```typescript
🎭 *SeeDream-4* - Генерация и трансформация (4⭐, до 10 фото)
🍌 *Nano Banana* - ИИ редактирование Gemini 2.5 (5⭐, до 3 фото)
🚀 *FLUX Kontext Max* - Профессиональное (7⭐, 1 фото)
🎨 *Qwen Image Edit Plus* - Продвинутое (4⭐, до 10 фото)
```

### 2. Investigate "37⭐" appearance
- Search for where this value is displayed in selection handlers
- Check callback handlers for `ai_photoshop_model_*` actions
- Verify quality multiplier application logic

### 3. Investigate "12⭐" actual charge
- Search payment processing code for AI Photoshop
- Check `processAllModelsWithMultipleImages` function
- Verify star deduction logic in transaction handlers

## Action Items

1. ✅ **Created test file**: `tests/check-ai-photoshop-prices.ts`
2. ⚠️ **Fix welcome message**: Update hardcoded values to match calculated prices
3. ⚠️ **Find 37⭐**: Search codebase for where this value appears
4. ⚠️ **Find 12⭐**: Check actual charging logic
5. ⚠️ **Test fix**: Verify all prices match across menu, selection, and charging

## Files Affected

- `src/scenes/aiPhotoshopScene/index.ts` (lines 38-121: pricing config, lines 814-818 & 833-836: welcome message)
- `src/interfaces/paidServices.ts` (lines 256-269: calculateFinalPriceInStars function)
- `src/services/processAllModelsWithMultipleImages.ts` (payment processing)

## Recommendations

1. **Never hardcode prices in UI text** - always use calculated values from `AI_PHOTOSHOP_PRICING.models`
2. **Use template literals with price variables** for consistency
3. **Add validation tests** to ensure UI prices match calculation prices
4. **Centralize ALL pricing logic** in `AI_PHOTOSHOP_PRICING` object
