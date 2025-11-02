# Bot ↔ Inngest Function Migration Summary

## Quick Reference Table

### 🔴 Critical Migrations (High Priority)

| Bot Scene | Business Logic | Inngest Function | Status | Effort |
|-----------|----------------|------------------|--------|---------|
| `neuroPhotoWizardV2` | Neuro photo generation | `neuroImageGenerationFunction` | ❌ Not integrated | 2-3 days |
| `textToImageWizard` | Text-to-image generation | `neuroImageGenerationFunction` | ❌ Not integrated | 2 days |
| `aiReelsWizard` | AI Reels creation | `generateAIReelsFunction` | ❌ Not integrated | 3-4 days |
| `aiReelsRenderWizard` | AI Reels rendering | `renderFunction` | ❌ Not integrated | 2-3 days |
| `instagramScrapingWizard` | Instagram scraping | `instagramScraperV2Function` | ❌ Not integrated | 3-4 days |
| `textToVideoWizard` | Text-to-video | `generateAdvancedLoopingVideoFunction` | ❌ Not integrated | 3 days |
| `imageToVideoWizard` | Image-to-video | `generateAdvancedLoopingVideoFunction` | ❌ Not integrated | 3 days |
| `paymentScene` | Payment processing | `paymentProcessingFunction` | ❌ Not integrated | 4-5 days |
| `digitalAvatarBodyWizardV2` | Avatar video | `renderAvatarVideoFunction` | ❌ Not integrated | 3 days |

### 🟡 Important Migrations (Medium Priority)

| Bot Scene | Business Logic | Inngest Function | Status | Effort |
|-----------|----------------|------------------|--------|---------|
| `morphingWizard` | Image morphing | `morphImagesFunction` | ❌ Not integrated | 2 days |
| `trainFluxModelWizard` | Model training | `modelTrainingV2Function` | ❌ Not integrated | 3-4 days |
| `createUserScene` | User creation | New function needed | ❌ None | 2-3 days |
| `balanceScene` | Balance calculation | New function needed | ❌ None | 2 days |
| `subscriptionScene` | Subscription logic | New function needed | ❌ None | 3 days |

### 🟢 Already in Inngest (No Action Needed)

| Inngest Function | Bot Scene | Status | Notes |
|------------------|-----------|--------|-------|
| `analyzeCompetitorReelsFunction` | ❌ None | ✅ Available | Add bot integration |
| `extractTopContentFunction` | ❌ None | ✅ Available | Add bot integration |
| `findCompetitorsFunction` | ❌ None | ✅ Available | Add bot integration |
| `generateContentScriptsFunction` | ❌ None | ✅ Available | Add bot integration |
| `generateDetailedScriptFunction` | ❌ None | ✅ Available | Add bot integration |
| `generateScenarioClipsFunction` | ❌ None | ✅ Available | Add bot integration |
| `criticalErrorMonitorFunction` | ❌ None | ✅ Available | Add to bot error handling |
| `logMonitorFunction` | ❌ None | ✅ Available | Add to bot error handling |
| `broadcastMessageFunction` | ❌ None | ✅ Available | Admin feature |
| `renderRiddleFunction` | ❌ None | ✅ Available | Game feature |

### 🟦 Keep in Bot (UI Logic Only)

| Bot Scene | Reason | Migration |
|-----------|--------|-----------|
| `menuScene` | Navigation UI | ❌ No |
| `helpScene` | Static help content | ❌ No |
| `sizeWizard` | Size selection UI | ❌ No |
| `selectModelWizard` | Model selection UI | ❌ No |
| `videoDurationScene` | Duration selection UI | ❌ No |

---

## Code Overlap Analysis

### Duplicated Functionality

```
┌─────────────────────────────────────────────────────────────┐
│ BOT SCENES (47 scenes)                                      │
│                                                             │
│ Image Generation: neuroPhoto*, textToImage*                 │
│ │                                                             │
│ └─ Calls external APIs directly                             │
│    (generateNeuroPhotoHybrid, generateTextToImageDirect)    │
└─────────────────────────────────────────────────────────────┘
                            ↕️ DUPLICATE
┌─────────────────────────────────────────────────────────────┐
│ INNGEST FUNCTIONS (22 functions)                            │
│                                                             │
│ Image Generation: neuroImageGenerationFunction              │
│ │                                                             │
│ └─ Has same business logic                                  │
│    (but bot doesn't use it!)                               │
└─────────────────────────────────────────────────────────────┘
```

### Current Architecture Problems

1. **Code Duplication**: Same logic in bot + Inngest
2. **API Calls**: Bot calls external APIs directly (should use Inngest)
3. **Error Handling**: Inconsistent between bot and Inngest
4. **No Reuse**: Inngest functions exist but unused by bot
5. **Maintenance**: Changes need to be made in 2 places

### Recommended Architecture

```
┌─────────────────────────────────────────────────────────────┐
│ BOT SCENES (47 scenes) - UI Only                           │
│                                                             │
│ Image Generation: neuroPhoto*, textToImage*                 │
│ │                                                             │
│ └─ Send event to Inngest:                                   │
│    await sendInngestEvent('generation/neuro-image', {...}) │
└─────────────────────────────────────────────────────────────┘
                            ↕️ ASYNC EVENTS
┌─────────────────────────────────────────────────────────────┐
│ INNGEST FUNCTIONS (22 functions) - Business Logic          │
│                                                             │
│ Image Generation: neuroImageGenerationFunction              │
│ │                                                             │
│ └─ Process asynchronously, update database, send webhook    │
└─────────────────────────────────────────────────────────────┘
```

---

## Migration Checklist

### Phase 1: Core Image Generation (Week 1-2)

- [ ] Review `neuroImageGenerationFunction` implementation
- [ ] Update `neuroPhotoWizardV2` to send Inngest event
- [ ] Update `textToImageWizard` to send Inngest event
- [ ] Add status tracking for image generation
- [ ] Test image generation flow
- [ ] Remove duplicate API calls from bot

**Estimated Effort**: 5-7 days

### Phase 2: AI Reels (Week 3)

- [ ] Review `generateAIReelsFunction` implementation
- [ ] Review `renderFunction` implementation
- [ ] Update `aiReelsWizard` to send Inngest event
- [ ] Update `aiReelsRenderWizard` to send Inngest event
- [ ] Add status tracking for reels
- [ ] Test AI Reels flow
- [ ] Remove duplicate rendering code

**Estimated Effort**: 5-7 days

### Phase 3: Instagram & Payment (Week 4-5)

- [ ] Review `instagramScraperV2Function` implementation
- [ ] Update `instagramScrapingWizard` to use Inngest
- [ ] Review `paymentProcessingFunction` implementation
- [ ] Update payment scenes to use Inngest
- [ ] Add webhook handlers for payment status
- [ ] Test Instagram scraping flow
- [ ] Test payment flows

**Estimated Effort**: 8-10 days

### Phase 4: Video Generation (Week 6)

- [ ] Review `generateAdvancedLoopingVideoFunction` implementation
- [ ] Update `textToVideoWizard` to use Inngest
- [ ] Update `imageToVideoWizard` to use Inngest
- [ ] Add status tracking for video generation
- [ ] Test video generation flow

**Estimated Effort**: 5-6 days

### Phase 5: Advanced Features (Week 7-8)

- [ ] Integrate model training with Inngest
- [ ] Integrate avatar video with Inngest
- [ ] Add monitoring functions
- [ ] Optimize and clean up code
- [ ] Final testing and documentation

**Estimated Effort**: 10-12 days

---

## Implementation Examples

### Example 1: Neuro Photo Migration

**Before (Current)**:
```typescript
// src/scenes/neuroPhotoWizardV2/index.ts
export const neuroPhotoConversationStep = async (ctx: MyContext) => {
  // ...
  const result = await generateNeuroPhotoHybrid({
    prompt: text,
    userModel: userModel,
    telegramId: telegramId,
    // ...
  })
  await ctx.replyWithPhoto(result.imageUrl)
}
```

**After (Recommended)**:
```typescript
// src/scenes/neuroPhotoWizardV2/index.ts
import { sendInngestEvent } from '@/inngest_app/inngestClient'

export const neuroPhotoConversationStep = async (ctx: MyContext) => {
  // ...
  const eventId = await sendInngestEvent('generation/neuro-image', {
    prompt: text,
    userModel: userModel,
    telegramId: telegramId,
    // ...
  })

  await ctx.reply(
    '⏳ Generating image...',
    {
      reply_markup: {
        inline_keyboard: [[
          { text: '🔄 Check Status', callback_data: `status_${eventId}` }
        ]]
      }
    }
  )
}
```

### Example 2: AI Reels Migration

**Before (Current)**:
```typescript
// src/scenes/lipSyncWizard/ai-reels-wizard.ts
async function createAIReels(params) {
  // Complex rendering logic in bot
  const result = await renderAIReels(params)
  return result
}
```

**After (Recommended)**:
```typescript
// src/scenes/lipSyncWizard/ai-reels-wizard.ts
import { sendInngestEvent } from '@/inngest_app/inngestClient'

async function createAIReels(params) {
  // Send to Inngest
  const eventId = await sendInngestEvent('video/generate-ai-reels', params)
  return { eventId, status: 'processing' }
}
```

### Example 3: Payment Integration

**Before (Current)**:
```typescript
// src/scenes/paymentScene/index.ts
async function processPayment(amount, method) {
  // Payment logic in bot
  const result = await processStripePayment(amount)
  await updateUserBalance(userId, amount)
}
```

**After (Recommended)**:
```typescript
// src/scenes/paymentScene/index.ts
import { sendInngestEvent } from '@/inngest_app/inngestClient'

async function processPayment(amount, method) {
  // Send to Inngest
  const eventId = await sendInngestEvent('payments/process', {
    amount,
    method,
    userId,
    // ...
  })
  return { eventId, status: 'processing' }
}
```

---

## Testing Strategy

### Unit Tests
- Test Inngest functions with mock data
- Test bot scene UI logic
- Test event sending/receiving

### Integration Tests
- Test bot → Inngest communication
- Test webhook delivery
- Test database updates

### E2E Tests
- Test complete user flows
- Test error scenarios
- Test performance benchmarks

### Load Tests
- Test Inngest function scalability
- Test webhook reliability
- Test error recovery

---

## Monitoring & Observability

### Logging
- Add structured logging to Inngest functions
- Log bot → Inngest events
- Log webhook responses

### Metrics
- Function execution time
- Error rates
- Webhook delivery success
- Queue depths

### Alerts
- Function failures
- High latency
- Webhook failures
- Payment errors

---

## Rollback Plan

### Feature Flags
- Use feature flags for each migration
- Quick rollback if issues arise

### Parallel Running
- Keep old bot logic during migration
- Switch to Inngest gradually
- Compare results

### Backup Strategy
- Backup database before migration
- Keep old code in git tags
- Document rollback steps

---

## Success Criteria

### Technical
- [ ] 80% of bot business logic migrated to Inngest
- [ ] 90% reduction in duplicate code
- [ ] 50% improvement in response time
- [ ] 90% test coverage

### Business
- [ ] Zero downtime during migration
- [ ] All existing features work
- [ ] New features easier to add
- [ ] Better error handling

### Team
- [ ] Team trained on Inngest
- [ ] Documentation complete
- [ ] Best practices documented
- [ ] Easy to maintain

---

*Generated: 2025-11-02*
*Total Items: 47 bot scenes, 22 Inngest functions*
*Critical Migrations: 9*
*Estimated Total Effort: 6-8 weeks*
