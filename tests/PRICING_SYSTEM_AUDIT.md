# 🔍 PRICING SYSTEM AUDIT REPORT

**Generated**: 2025-01-30
**Project**: 999-agents-telegraf
**Audit Scope**: Complete pricing architecture analysis

---

## 📊 EXECUTIVE SUMMARY

The pricing system uses a centralized configuration approach with multiple pricing strategies:
- **Base Currency**: USD (provider costs)
- **User Currency**: Stars (Telegram Stars - 1⭐ = $0.016)
- **Markup**: 50% (1.5x multiplier on base costs)
- **Alternative Currency**: RUB (Russian Rubles, dynamic rate via Bybit API)

### ⚠️ CRITICAL FINDINGS

1. **Multiple calculation methods**: At least 4 different price calculation patterns found
2. **Hardcoded prices**: VEO-3 models and some other models bypass centralized pricing
3. **Inconsistent markup application**: Some models use direct star conversion, others use markup
4. **Legacy code**: Two pricing systems coexist (old + unified config)

---

## 🗂️ PRICING CONFIGURATION FILES

### 1. **Central Pricing Configuration** ✅
**File**: `/src/config/unified-pricing.config.ts`

**Purpose**: Single source of truth for all pricing constants

```typescript
// Core Constants
STAR_COST_USD = 0.016          // 1 star = $0.016 USD
MARKUP_MULTIPLIER = 1.5        // 50% markup on all services
DEFAULT_USD_TO_RUB_RATE = 85   // Fallback RUB rate

// Dynamic rate via Bybit API
getUsdToRubRate(): Promise<number>
```

**Conversion Functions**:
```typescript
usdToStars(baseCostUSD: number): number {
  const starsBeforeMarkup = baseCostUSD / STAR_COST_USD
  const starsWithMarkup = starsBeforeMarkup * MARKUP_MULTIPLIER
  return Math.floor(starsWithMarkup)
}

starsToUSD(stars: number): number
starsToRUB(stars: number): number
rubToStars(rub: number): number
```

**Dynamic Video Pricing**:
```typescript
VEO_MODELS_PRICING: {
  'veo3': {
    pricePerSecondUSD: 0.4,
    supportedDurations: [2, 4, 6, 8],
    defaultDuration: 8
  },
  'veo3_fast': {
    pricePerSecondUSD: 0.3,
    supportedDurations: [2, 4, 6, 8],
    defaultDuration: 4
  }
}

KIE_AI_MODELS_PRICING: {
  // Video models
  'veo3_fast': { pricePerSecondUSD: 0.08 },
  'veo3': { pricePerSecondUSD: 0.24 },
  'runway-aleph': { pricePerSecondUSD: 0.485 },
  'sora-2': { pricePerSecondUSD: 0.015 },
  'sora-2-pro': { pricePerSecondUSD: 0.045 },

  // Image models
  'kie-gpt-4o-image': { pricePerImageUSD: 0.1 },
  'kie-midjourney-v7': { pricePerImageUSD: 0.15 },

  // Music models
  'kie-suno-v3.5': { priceBaseUSD: 0.2 },
  'kie-suno-v4': { priceBaseUSD: 0.25 }
}
```

---

### 2. **Legacy Pricing Constants** ⚠️
**File**: `/src/price/constants/index.ts`

**Purpose**: Backward compatibility exports (imports from unified config)

```typescript
// Re-exports from unified config
export const starCost = STAR_COST_USD
export const interestRate = MARKUP_MULTIPLIER

// Legacy system config
export const SYSTEM_CONFIG = {
  starCost: STAR_COST_USD,
  interestRate: MARKUP_MULTIPLIER,
  currency: 'RUB',
  subscriptionBonus: 0.0,
  getRubRate: async () => await getCurrentRate()
}

// Voice conversation cost (hardcoded)
export const VOICE_CONVERSATION_COST = 0.5

// Digital avatar costs per step (in dollars)
export const DIGITAL_AVATAR_COSTS = {
  v1: 0.1,  // DigitalAvatarBody
  v2: 0.2   // DigitalAvatarBodyV2
}

// Subscription prices (hardcoded in RUB)
export const NEUROPHOTO_PRICE_RUB = 1110.0
export const NEUROVIDEO_PRICE_RUB = 2999.0
```

---

### 3. **Pricing Strategies** ✅
**File**: `/src/price/constants/pricingStrategies.ts`

**Purpose**: Define pricing strategy per service mode

```typescript
enum PricingStrategy {
  FIXED,           // Fixed price from BASE_COSTS
  FREE,            // Free (price = 0)
  MODEL_BASED,     // Price depends on modelId
  STEP_BASED       // Price depends on steps count
}

MODE_PRICING_STRATEGY: {
  [ModeEnum.NeuroPhoto]: PricingStrategy.FIXED,
  [ModeEnum.ImageToVideo]: PricingStrategy.MODEL_BASED,
  [ModeEnum.TextToVideo]: PricingStrategy.MODEL_BASED,
  [ModeEnum.DigitalAvatarBody]: PricingStrategy.STEP_BASED,
  [ModeEnum.StartScene]: PricingStrategy.FREE,
  // ... etc
}
```

---

### 4. **Video Models Pricing Configuration** ⚠️
**File**: `/src/modules/videoGenerator/config/models.config.ts`

**Purpose**: Video model configurations with per-model pricing

```typescript
VIDEO_MODELS_CONFIG: {
  'minimax': { basePrice: 0.5 },
  'haiper-video-2': { basePrice: 0.05 },
  'ray-v2': { basePrice: 0.18 },
  'wan-image-to-video': { basePrice: 0.25 },
  'kling-v1.6-pro': { basePrice: 0.098 },
  'kling-v2.1-standard': { basePrice: 0.05 },
  'kling-v2.1-pro': { basePrice: 0.09 },
  'seedance-1-pro': {
    basePrice: 0.03,
    priceByResolution: {
      '480p': 0.03,
      '1080p': 0.15
    }
  },
  'wan-2.2-t2v-fast': {
    basePrice: 0.03627,
    priceByResolution: {
      '480p': 0.0256,
      '720p': 0.03627,
      '1080p': 0.05547
    }
  },
  'veo3_fast': { basePrice: 0.64 },  // 🚨 HARDCODED
  'veo3': { basePrice: 3.23 },       // 🚨 HARDCODED
  'runway-aleph': { basePrice: 0.485 },
  'sora-2': { basePrice: 0.015 },
  'sora-2-pro': { basePrice: 0.045 }
}
```

**🚨 ISSUE**: `basePrice` is in **dollars per second**, but calculation logic varies:
- Some models multiply by duration (correct)
- Some models have hardcoded star values (VEO-3)

---

### 5. **Image Models Pricing** ✅
**File**: `/src/price/models/imageModelPrices.ts`

**Purpose**: Image model configurations with per-image pricing

```typescript
imageModelPrices: {
  'black-forest-labs/flux-1.1-pro': {
    costPerImage: calculateFinalImageCostInStars(0.04)
  },
  'black-forest-labs/flux-1.1-pro-ultra': {
    costPerImage: calculateFinalImageCostInStars(0.06)
  },
  'ideogram-ai/ideogram-v2': {
    costPerImage: calculateFinalImageCostInStars(0.08)
  },
  'luma/photon': {
    costPerImage: calculateFinalImageCostInStars(0.03)
  }
  // ... 28+ image models
}
```

**Calculation**:
```typescript
// File: /src/price/models/calculateFinalImageCostInStars.ts
function calculateFinalImageCostInStars(baseCost: number): number {
  const finalCostInDollars = baseCost * (1 + SYSTEM_CONFIG.interestRate)
  return Math.ceil(finalCostInDollars / SYSTEM_CONFIG.starCost)
}
```

**🚨 ISSUE**: Wrong markup application!
- Current: `baseCost * (1 + 1.5) = baseCost * 2.5` (150% markup)
- Should be: `baseCost * 1.5` (50% markup)

---

### 6. **Lip-Sync Models Pricing** ✅
**File**: `/src/config/lipsync-models.config.ts`

```typescript
LIPSYNC_MODELS: {
  'kling': {
    costPerSecond: 0.014,      // $0.014/sec
    isAvailable: false
  },
  'sync_v2': {
    costPerSecond: 0.05,       // $0.05/sec
    isAvailable: false
  },
  'veed_fabric': {
    costPerSecond: 0.216,      // $0.216/sec (720p only)
    isAvailable: true
  },
  'fal_veed_fabric': {
    costPerSecond: 0.1,        // $0.10/sec (480p)
    costPerSecond720p: 0.2,    // $0.20/sec (720p)
    costPerSecondStars480p: 9.375,   // ✅ Pre-calculated with markup
    costPerSecondStars720p: 18.75,   // ✅ Pre-calculated with markup
    isAvailable: true
  }
}
```

---

## 💰 PRICE CALCULATION METHODS

### Method 1: **Centralized USD → Stars** ✅ CORRECT
**Used by**: New video models (via unified-pricing.config.ts)

```typescript
// unified-pricing.config.ts
function usdToStars(baseCostUSD: number): number {
  const starsBeforeMarkup = baseCostUSD / STAR_COST_USD  // $0.02 / $0.016 = 1.25⭐
  const starsWithMarkup = starsBeforeMarkup * MARKUP_MULTIPLIER  // 1.25⭐ × 1.5 = 1.875⭐
  return Math.floor(starsWithMarkup)  // 1⭐
}

// Example:
// Provider cost: $0.02
// Stars before markup: 0.02 / 0.016 = 1.25⭐
// Stars with markup: 1.25 × 1.5 = 1.875⭐
// Final price: 1⭐ (floor)
```

### Method 2: **Video Model Calculation** ⚠️ MIXED
**Used by**: Video models (calculateFinalPrice)

```typescript
// /src/price/helpers/calculateFinalPrice.ts
function calculateFinalPrice(modelKey: string, selectedResolution?: string): number {
  // 🚨 HARDCODED EXCEPTIONS
  if (modelKey === 'veo3_fast') return 40  // Fixed 40⭐
  if (modelKey === 'veo3') return 120      // Fixed 120⭐
  if (modelKey === 'kling-v1.6-pro') return 60
  if (modelKey === 'minimax') return 50

  // Standard calculation
  let basePrice = modelConfig.basePrice  // $/sec

  // Check resolution pricing
  if (selectedResolution && modelConfig.priceByResolution) {
    basePrice = modelConfig.priceByResolution[selectedResolution]
  }

  // Calculate total cost
  const DEFAULT_VIDEO_DURATION_SECONDS = 5
  const totalBaseCostUSD = basePrice * DEFAULT_VIDEO_DURATION_SECONDS

  // Convert to stars
  const basePriceInStars = totalBaseCostUSD / SYSTEM_CONFIG.starCost
  const finalPriceWithMarkup = basePriceInStars * SYSTEM_CONFIG.interestRate
  return Math.floor(finalPriceWithMarkup)
}

// Example (haiper-video-2):
// basePrice: $0.05/sec
// totalBaseCostUSD: $0.05 × 5sec = $0.25
// basePriceInStars: $0.25 / $0.016 = 15.625⭐
// finalPriceWithMarkup: 15.625⭐ × 1.5 = 23.4375⭐
// Final: 23⭐
```

**🚨 ISSUES**:
1. Hardcoded star prices bypass centralized config
2. Mix of dynamic calculation and fixed values
3. No centralized registry of hardcoded prices

### Method 3: **Image Model Calculation** 🚨 WRONG
**Used by**: Image models

```typescript
// /src/price/models/calculateFinalImageCostInStars.ts
function calculateFinalImageCostInStars(baseCost: number): number {
  const finalCostInDollars = baseCost * (1 + SYSTEM_CONFIG.interestRate)
  return Math.ceil(finalCostInDollars / SYSTEM_CONFIG.starCost)
}

// 🚨 WRONG FORMULA!
// Current: baseCost * (1 + 1.5) = baseCost * 2.5 (150% markup)
// Correct: baseCost * 1.5 (50% markup)

// Example with $0.04 base cost:
// Current calculation:
//   finalCostInDollars = $0.04 × (1 + 1.5) = $0.04 × 2.5 = $0.10
//   stars = $0.10 / $0.016 = 6.25⭐ → 7⭐ (ceil)
//
// Correct calculation should be:
//   finalCostInDollars = $0.04 × 1.5 = $0.06
//   stars = $0.06 / $0.016 = 3.75⭐ → 4⭐ (ceil)
```

**💥 IMPACT**: All image models are **100% MORE EXPENSIVE** than intended!

### Method 4: **Kie.ai Special Pricing** ✅ CORRECT
**Used by**: Kie.ai video models (VEO-3, Sora-2, etc.)

```typescript
// /src/config/unified-pricing.config.ts
function calculateKieAiPriceInStars(modelId: string, duration?: number): number {
  const model = KIE_AI_MODELS_PRICING[modelId]

  if (model.pricePerSecondUSD) {
    const finalDuration = duration || model.defaultDuration || 5
    totalCostUSD = model.pricePerSecondUSD * finalDuration

    // 🎯 COMPETITIVE PRICING: NO MARKUP for video models
    if (modelId === 'veo3_fast' || modelId === 'veo3' || ...) {
      return Math.floor(totalCostUSD / STAR_COST_USD)  // No markup!
    }
  }

  // For other models, apply standard markup
  return usdToStars(totalCostUSD)
}

// Example (veo3_fast, 8 seconds):
// pricePerSecondUSD: $0.08
// totalCostUSD: $0.08 × 8sec = $0.64
// stars: $0.64 / $0.016 = 40⭐ (no markup!)
```

---

## 💳 PAYMENT PROCESSING FLOW

### 1. **Balance Deduction**
**File**: `/src/price/helpers/processBalanceOperation.ts`

```typescript
async function processBalanceOperation({
  telegram_id,
  paymentAmount,  // Amount in stars
  is_ru,
  bot_name
}): Promise<BalanceOperationResult> {
  // 1. Get current balance
  const currentBalance = await getUserBalance(telegram_id)

  // 2. Check sufficient funds
  if (currentBalance < paymentAmount) {
    return { success: false, error: 'Insufficient funds' }
  }

  // 3. Calculate new balance
  const newBalance = currentBalance - paymentAmount

  // 4. Update balance in DB
  await updateUserBalance(
    telegram_id,
    paymentAmount,
    PaymentType.MONEY_OUTCOME,
    'Payment operation',
    {
      bot_name,
      service_type: ctx.session.mode,
      modePrice: paymentAmount,
      currentBalance
    }
  )

  return { newBalance, success: true }
}
```

### 2. **Balance Update & Transaction Recording**
**File**: `/src/core/supabase/updateUserBalance.ts`

```typescript
async function updateUserBalance(
  telegram_id: string,
  amount: number,
  type: PaymentType,
  description?: string,
  metadata?: BalanceUpdateMetadata,
  cost_in_stars?: number
): Promise<boolean> {

  // Complex amount detection logic (90+ lines)
  // Tries to extract actual cost from:
  // 1. metadata.modePrice
  // 2. metadata.paymentAmount
  // 3. metadata.stars
  // 4. Balance difference calculation
  // 5. Hardcoded defaults for specific services

  // Create payment record
  const paymentRecord = {
    telegram_id: Number(telegram_id),
    amount: originalAmount,
    stars: safeAmount,  // Actual charged amount
    currency: Currency.XTR,
    status: PaymentStatus.COMPLETED,
    type: type,
    payment_method: 'System',
    description,
    metadata,
    bot_name,
    service_type,
    model_name,
    cost: calculateServiceCost(service_type, metadata, safeAmount)  // USD cost
  }

  // Insert into payments_v2 table
  await supabase.from('payments_v2').insert(paymentRecord)

  // Invalidate balance cache
  await invalidateBalanceCache(telegram_id)

  return true
}
```

**🚨 COMPLEXITY ISSUE**: 90+ lines of amount detection logic indicates design problems

---

## 🎯 PRICING BY SERVICE TYPE

### Image Generation Models
| Model | Provider Cost | Markup | Final Stars | File |
|-------|--------------|--------|-------------|------|
| FLUX 1.1 Pro | $0.04 | 150%❌ | 7⭐ | imageModelPrices.ts |
| FLUX 1.1 Pro Ultra | $0.06 | 150%❌ | 10⭐ | imageModelPrices.ts |
| Ideogram V2 | $0.08 | 150%❌ | 13⭐ | imageModelPrices.ts |
| Luma Photon | $0.03 | 150%❌ | 5⭐ | imageModelPrices.ts |
| Luma Photon Flash | $0.01 | 150%❌ | 2⭐ | imageModelPrices.ts |

**💥 BUG**: All image models use 150% markup instead of 50%!

### Video Generation Models
| Model | Provider Cost | Duration | Markup | Final Stars | Notes |
|-------|--------------|----------|--------|-------------|-------|
| Minimax | $0.5/sec | 5 sec | Hardcoded | 50⭐ | Fixed price |
| Haiper Video 2 | $0.05/sec | 5 sec | 50% | 23⭐ | Dynamic |
| Ray V2 | $0.18/sec | 5 sec | 50% | 84⭐ | Dynamic |
| Kling v1.6 Pro | $0.098/sec | 5 sec | Hardcoded | 60⭐ | Fixed price |
| Kling v2.1 Std | $0.05/sec | 5 sec | 50% | 23⭐ | Dynamic |
| Kling v2.1 Pro | $0.09/sec | 5 sec | 50% | 42⭐ | Dynamic |
| VEO-3 Fast | - | 8 sec | Hardcoded | 40⭐ | Fixed price |
| VEO-3 | - | 8 sec | Hardcoded | 120⭐ | Fixed price |
| Runway Aleph | $0.485/sec | 6 sec | 50% | 182⭐ | Dynamic |
| Sora 2 | $0.015/sec | 10 sec | **0%** | 9⭐ | No markup! |
| Sora 2 Pro | $0.045/sec | 10 sec | **0%** | 28⭐ | No markup! |

### Lip-Sync Models
| Model | Provider Cost | Resolution | Markup | Stars/sec | Available |
|-------|--------------|------------|--------|-----------|-----------|
| Kling | $0.014/sec | - | 50% | ~1.3⭐ | ❌ Disabled |
| Sync V2 | $0.05/sec | - | 50% | ~4.7⭐ | ❌ Disabled |
| Veed Fabric | $0.216/sec | 720p | Custom | 14⭐ | ✅ Active |
| Fal Veed (480p) | $0.10/sec | 480p | 50% | 9.375⭐ | ✅ Active |
| Fal Veed (720p) | $0.20/sec | 720p | 50% | 18.75⭐ | ✅ Active |

### Other Services
| Service | Base Cost | Type | Markup | Stars | File |
|---------|-----------|------|--------|-------|------|
| Voice Conversation | $0.5 | Fixed | N/A | 0.5⭐ | constants/index.ts |
| Digital Avatar v1 | $0.1/step | Per-step | 50% | ~9⭐ | constants/index.ts |
| Digital Avatar v2 | $0.2/step | Per-step | 50% | ~18⭐ | constants/index.ts |
| Neuro Photo | TBD | Fixed | TBD | TBD | pricingStrategies.ts |

### Subscriptions (in RUB)
| Subscription | Price RUB | Stars | Features |
|--------------|-----------|-------|----------|
| NEUROPHOTO | 1,110₽ | 476⭐ | Photo generation access |
| NEUROVIDEO | 2,999₽ | 1,303⭐ | Video generation access |

---

## 🔧 PRICE CALCULATION HELPERS

### Core Helper Functions
**File**: `/src/price/helpers/`

1. **calculateCost.ts** - Step-based costs (Digital Avatar)
2. **calculateCostInStars.ts** - Simple USD to stars conversion
3. **calculateFinalPrice.ts** - Video model pricing
4. **calculateServiceCost.ts** - Maps service type to USD cost
5. **calculateStars.ts** - Stars calculations
6. **processBalanceOperation.ts** - Balance deduction logic
7. **processBalanceVideoOperation.ts** - Video-specific balance logic
8. **validateAndCalculateImageModelPrice.ts** - Image model validation
9. **validateAndCalculateVideoModelPrice.ts** - Video model validation
10. **refundUser.ts** - Refund processing

---

## 🚨 IDENTIFIED ISSUES

### 🔴 CRITICAL Issues

1. **Image Model Markup Bug** (HIGH PRIORITY)
   - **Location**: `/src/price/models/calculateFinalImageCostInStars.ts`
   - **Issue**: `baseCost * (1 + 1.5)` instead of `baseCost * 1.5`
   - **Impact**: All image models cost 2.5x instead of 1.5x (100% overcharge)
   - **Fix**: Change formula to `baseCost * MARKUP_MULTIPLIER`

2. **Hardcoded Prices Bypass Centralized Config**
   - **Location**: `/src/price/helpers/calculateFinalPrice.ts`
   - **Issue**: VEO-3 models (40⭐, 120⭐), Kling v1.6 Pro (60⭐), Minimax (50⭐)
   - **Impact**: Cannot update prices centrally, inconsistent with pricing strategy
   - **Fix**: Move to unified-pricing.config.ts or calculate dynamically

3. **Inconsistent Markup Application**
   - Sora-2 models: 0% markup (competitive pricing)
   - Image models: 150% markup (bug)
   - Video models: 50% markup (correct)
   - Impact: Confusing pricing strategy

### 🟡 MEDIUM Issues

4. **Complex Amount Detection Logic**
   - **Location**: `/src/core/supabase/updateUserBalance.ts` (lines 71-215)
   - **Issue**: 90+ lines trying to extract payment amount from various sources
   - **Impact**: Hard to maintain, error-prone
   - **Fix**: Simplify by requiring explicit payment amount parameter

5. **Duplicate Pricing Configurations**
   - VEO models defined in both:
     - `/src/config/unified-pricing.config.ts` (VEO_MODELS_PRICING)
     - `/src/modules/videoGenerator/config/models.config.ts` (VIDEO_MODELS_CONFIG)
   - Impact: Risk of desynchronization

6. **Legacy Pricing System Coexistence**
   - Old system: `/src/price/priceCalculator.ts`
   - New system: `/src/config/unified-pricing.config.ts`
   - Impact: Confusion, potential bugs

### 🟢 LOW Issues

7. **Missing Price Validation**
   - No min/max price checks
   - No validation that prices are positive
   - Impact: Potential for pricing errors

8. **Hardcoded Subscription Prices**
   - **Location**: `/src/price/constants/index.ts`
   - `NEUROPHOTO_PRICE_RUB = 1110.0`
   - `NEUROVIDEO_PRICE_RUB = 2999.0`
   - Impact: Cannot adjust dynamically

9. **No Centralized Price Registry**
   - Prices scattered across multiple files
   - Hard to audit all prices
   - Impact: Difficult maintenance

---

## 📋 RECOMMENDATIONS

### ✅ IMMEDIATE Actions (Week 1)

1. **Fix Image Markup Bug**
   ```typescript
   // Before (WRONG):
   const finalCostInDollars = baseCost * (1 + SYSTEM_CONFIG.interestRate)

   // After (CORRECT):
   const finalCostInDollars = baseCost * SYSTEM_CONFIG.interestRate
   ```

2. **Centralize Hardcoded Prices**
   - Move VEO-3 models (40⭐, 120⭐) to `KIE_AI_MODELS_PRICING`
   - Move Kling v1.6 Pro (60⭐) to `VIDEO_MODELS_CONFIG.priceByDuration`
   - Create `FIXED_PRICES` constant in unified-pricing.config.ts

3. **Add Price Validation**
   ```typescript
   function validatePrice(price: number, modelName: string): void {
     if (price <= 0) throw new Error(`Invalid price for ${modelName}`)
     if (price > 10000) console.warn(`Suspiciously high price for ${modelName}`)
   }
   ```

### 🔧 SHORT-TERM Improvements (Month 1)

4. **Simplify Amount Detection**
   - Require explicit `paymentAmount` parameter
   - Remove 90-line detection logic
   - Add logging for amount source

5. **Create Price Registry**
   ```typescript
   // /src/price/registry/PriceRegistry.ts
   export const PRICE_REGISTRY = {
     images: imageModelPrices,
     videos: VIDEO_MODELS_CONFIG,
     lipsync: LIPSYNC_MODELS,
     kie: KIE_AI_MODELS_PRICING,
     subscriptions: {
       neurophoto: { rub: 1110, stars: 476 },
       neurovideo: { rub: 2999, stars: 1303 }
     }
   }
   ```

6. **Consolidate Pricing Logic**
   - Single `calculatePrice()` function
   - Deprecate old calculation methods
   - Consistent markup application

### 🎯 LONG-TERM Strategy (Quarter 1)

7. **Implement Dynamic Pricing**
   - Load prices from database
   - Admin panel for price updates
   - A/B testing for pricing optimization

8. **Add Price Analytics**
   - Track which models are used most
   - Monitor revenue per model
   - Identify underpriced/overpriced services

9. **Create Price Documentation**
   - API documentation for pricing functions
   - User-facing price transparency
   - Internal pricing decision log

---

## 📊 PRICING ARCHITECTURE DIAGRAM

```
┌─────────────────────────────────────────────────────────────┐
│              UNIFIED PRICING CONFIG (Central)               │
│  /src/config/unified-pricing.config.ts                     │
│                                                             │
│  Constants:                                                 │
│  • STAR_COST_USD = 0.016                                   │
│  • MARKUP_MULTIPLIER = 1.5                                 │
│  • USD_TO_RUB_RATE (dynamic)                               │
│                                                             │
│  Functions:                                                 │
│  • usdToStars()          ← ✅ CORRECT                      │
│  • starsToUSD()                                            │
│  • calculateKieAiPriceInStars()                            │
└─────────────────────────────────────────────────────────────┘
              ↓                ↓                 ↓
    ┌─────────────┐  ┌──────────────┐  ┌─────────────────┐
    │   IMAGES    │  │    VIDEOS    │  │    LIP-SYNC     │
    │             │  │              │  │                 │
    │ imageModel  │  │ VIDEO_MODELS │  │ LIPSYNC_MODELS │
    │ Prices.ts   │  │ _CONFIG      │  │                 │
    │             │  │              │  │  costPerSecond  │
    │ costPerImage│  │ basePrice    │  │  (480p/720p)    │
    │             │  │ ($/sec)      │  │                 │
    │ ❌ BUG:     │  │              │  │                 │
    │ 150% markup │  │ ⚠️ Mixed:    │  │ ✅ Correct      │
    │ instead of  │  │ Hardcoded +  │  │ pricing         │
    │ 50%         │  │ Dynamic      │  │                 │
    └─────────────┘  └──────────────┘  └─────────────────┘
              ↓                ↓                 ↓
    ┌──────────────────────────────────────────────────────┐
    │          PAYMENT PROCESSING                          │
    │                                                      │
    │  processBalanceOperation()                          │
    │         ↓                                           │
    │  updateUserBalance()                                │
    │         ↓                                           │
    │  INSERT INTO payments_v2                            │
    │         ↓                                           │
    │  invalidateBalanceCache()                           │
    └──────────────────────────────────────────────────────┘
```

---

## 🔍 FILES INVENTORY

### Pricing Configuration (Core)
1. ✅ `/src/config/unified-pricing.config.ts` - Central pricing config
2. ⚠️ `/src/price/constants/index.ts` - Legacy constants
3. ✅ `/src/price/constants/pricingStrategies.ts` - Mode strategies

### Model Pricing (Specific)
4. ⚠️ `/src/modules/videoGenerator/config/models.config.ts` - Video models
5. 🚨 `/src/price/models/imageModelPrices.ts` - Image models (BUG)
6. 🚨 `/src/price/models/calculateFinalImageCostInStars.ts` - Image calc (BUG)
7. ✅ `/src/config/lipsync-models.config.ts` - Lip-sync models

### Price Calculation Helpers
8. ⚠️ `/src/price/helpers/calculateFinalPrice.ts` - Video price calc (hardcoded)
9. ✅ `/src/price/helpers/calculateCostInStars.ts` - Simple conversion
10. ⚠️ `/src/price/helpers/calculateServiceCost.ts` - Service cost mapping
11. ✅ `/src/price/helpers/validateAndCalculateImageModelPrice.ts`
12. ✅ `/src/price/helpers/validateAndCalculateVideoModelPrice.ts`

### Payment Processing
13. ✅ `/src/price/helpers/processBalanceOperation.ts` - Balance deduction
14. 🚨 `/src/core/supabase/updateUserBalance.ts` - DB update (complex)
15. ✅ `/src/core/supabase/getUserBalance.ts` - Balance retrieval
16. ✅ `/src/price/helpers/refundUser.ts` - Refund logic

### UI/Display
17. `/src/price/helpers/sendCostMessage.ts`
18. `/src/price/helpers/sendBalanceMessage.ts`
19. `/src/price/helpers/sendInsufficientStarsMessage.ts`
20. `/src/helpers/videoModelKeyboard.ts`

---

## 📈 METRICS TO TRACK

After implementing fixes, monitor:
1. **Revenue Impact**: Total revenue change after image markup fix
2. **Price Consistency**: Number of hardcoded prices vs centralized
3. **Calculation Errors**: Payment amount mismatch frequency
4. **User Satisfaction**: Complaints about pricing
5. **Model Usage**: Distribution of usage across price tiers

---

## ✅ TESTING CHECKLIST

Before deploying pricing fixes:
- [ ] Test image model pricing calculation
- [ ] Test video model pricing (all models)
- [ ] Test lip-sync pricing (480p and 720p)
- [ ] Test balance deduction flow
- [ ] Test insufficient funds scenario
- [ ] Test refund processing
- [ ] Test subscription pricing
- [ ] Test RUB conversion with dynamic rates
- [ ] Test hardcoded price removal
- [ ] Test negative price scenarios
- [ ] Run existing pricing tests
- [ ] Add regression tests for bugs fixed

---

## 🎯 SUCCESS CRITERIA

The pricing system will be considered fixed when:
1. ✅ Image markup uses 50% (not 150%)
2. ✅ All hardcoded prices moved to centralized config
3. ✅ Single source of truth for each price
4. ✅ Consistent markup application across all services
5. ✅ Payment amount detection simplified
6. ✅ All prices validated (positive, reasonable ranges)
7. ✅ Documentation updated
8. ✅ Tests pass at 100%
9. ✅ No pricing-related user complaints for 1 month
10. ✅ Code review approved by 2+ developers

---

## 📞 CONTACTS

For questions about this audit:
- **Pricing System Owner**: [TBD]
- **Finance Team**: [TBD]
- **Development Lead**: [TBD]

---

**Audit Completed**: 2025-01-30
**Next Review**: After fixes implemented (estimated 2 weeks)
