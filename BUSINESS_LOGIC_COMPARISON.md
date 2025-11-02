# Business Logic Comparison: Bot vs Inngest Functions

## Overview

This document provides a comprehensive analysis of business logic functions in the Telegram bot compared to Inngest functions. The goal is to identify which business logic should be moved to Inngest and how to optimize the architecture.

---

## Current Statistics

- **Bot Scenes**: 47 scenes (registerCommands.ts)
- **Inngest Functions**: 22 functions (index.ts)
- **Overlap**: ~15% (limited integration between bot and Inngest)

---

## Bot Scenes Analysis

### 1. User Management & Navigation (5 scenes)

| Scene Name | File Path | Business Logic | Should Migrate to Inngest? |
|------------|-----------|----------------|---------------------------|
| `startScene` | `/scenes/startScene.ts` | User onboarding, creates users | ✅ Yes - User creation logic |
| `menuScene` | `/scenes/menuScene/index.ts` | Main navigation menu | ❌ No - UI logic |
| `helpScene` | `/scenes/helpScene/index.ts` | Help documentation | ❌ No - Static content |
| `inviteScene` | `/scenes/inviteScene/index.ts` | Referral system | ✅ Yes - Referral processing |
| `balanceScene` | `/scenes/balanceScene/index.ts` | Display user balance | ✅ Yes - Balance calculation |

### 2. Subscription & Payment (6 scenes)

| Scene Name | File Path | Business Logic | Should Migrate to Inngest? |
|------------|-----------|----------------|---------------------------|
| `subscriptionScene` | `/scenes/subscriptionScene/index.ts` | Subscription management | ✅ Yes - Payment processing |
| `subscriptionCheckScene` | `/scenes/subscriptionCheckScene.ts` | Verify subscription | ✅ Yes - Subscription validation |
| `paymentScene` | `/scenes/paymentScene/index.ts` | Payment UI flow | ❌ No - UI logic |
| `rublePaymentScene` | `/scenes/rublePaymentScene.ts` | RUB payment | ✅ Yes - Payment processing |
| `starPaymentScene` | `/scenes/starPaymentScene.ts` | Telegram Stars | ✅ Yes - Payment processing |
| `checkBalanceScene` | `/scenes/checkBalanceScene.ts` | Balance check | ✅ Yes - Balance validation |

**💡 Opportunity**: Inngest already has `paymentProcessingFunction` - integrate bot payments with it!

### 3. Image Generation (4 scenes)

| Scene Name | File Path | Business Logic | Current Implementation | Inngest Equivalent | Migration Priority |
|------------|-----------|----------------|----------------------|-------------------|-------------------|
| `neuroPhotoWizard` | `/scenes/neuroPhotoWizard/index.ts` | Generate images with trained models | Direct service calls | ❌ None | 🔴 High - Use neuroImageGenerationFunction |
| `neuroPhotoWizardV2` | `/scenes/neuroPhotoWizardV2/index.ts` | Advanced neuro photo (hybrid/multi) | Complex hybrid logic | ❌ None | 🔴 High - Create neuroImageGenerationV2 |
| `textToImageWizard` | `/scenes/textToImageWizard/index.ts` | Text-to-image generation | Direct service calls | ❌ None | 🔴 High - Use neuroImageGenerationFunction |
| `imageUpscalerWizard` | `/scenes/imageUpscalerWizard/index.ts` | Upscale images | Direct service calls | ❌ None | 🟡 Medium - Could use Inngest |

### 4. Image Processing (4 scenes)

| Scene Name | File Path | Business Logic | Current Implementation | Inngest Equivalent | Migration Priority |
|------------|-----------|----------------|----------------------|-------------------|-------------------|
| `faceSwapWizard` | `/scenes/faceSwapWizard/index.ts` | Face swapping | Direct service calls | ❌ None | 🟡 Medium - Create faceSwapFunction |
| `aiPhotoshopScene` | `/scenes/aiPhotoshopScene/index.ts` | AI photo editing | Direct service calls | ❌ None | 🟡 Medium - Create aiPhotoEditFunction |
| `improvePromptWizard` | `/scenes/improvePromptWizard/index.ts` | Prompt enhancement | Service call | ❌ None | 🟡 Medium - Could be Inngest |
| `morphingWizard` | `/scenes/morphingWizard/index.ts` | Image morphing | Service call | ✅ `morphImagesFunction` | 🟢 Low - Already exists! |

**💡 Opportunity**: `morphingWizard` should use `morphImagesFunction` from Inngest!

### 5. Video Generation (2 scenes)

| Scene Name | File Path | Business Logic | Current Implementation | Inngest Equivalent | Migration Priority |
|------------|-----------|----------------|----------------------|-------------------|-------------------|
| `textToVideoWizard` | `/scenes/textToVideoWizard/index.ts` | Text-to-video | Direct service calls | ❌ None | 🔴 High - Use existing functions |
| `imageToVideoWizard` | `/scenes/imageToVideoWizard/index.ts` | Image-to-video | Direct service calls | ❌ None | 🔴 High - Use existing functions |

**💡 Opportunity**: Bot has video generation but Inngest has `generateAdvancedLoopingVideoFunction` - integrate!

### 6. Audio & Voice (4 scenes)

| Scene Name | File Path | Business Logic | Should Migrate to Inngest? | Migration Priority |
|------------|-----------|----------------|---------------------------|-------------------|
| `voiceWizard` | `/scenes/voiceAvatarWizard/index.ts` | Voice processing | ✅ Yes - Create voiceFunction | 🟡 Medium |
| `textToSpeechWizard` | `/scenes/textToSpeechWizard/index.ts` | TTS generation | ✅ Yes - Create ttsFunction | 🟡 Medium |
| `videoTranscriptionWizard` | `/scenes/videoTranscriptionWizard/index.ts` | Video transcription | ✅ Yes - Create transcriptionFunction | 🟡 Medium |
| `lipSyncWizard` | `/scenes/lipSyncWizard/index.ts` | Lip sync generation | ✅ Yes - Create lipSyncFunction | 🔴 High |

### 7. AI Reels & Avatar (8 scenes)

| Scene Name | File Path | Business Logic | Current Implementation | Inngest Equivalent | Migration Priority |
|------------|-----------|----------------|----------------------|-------------------|-------------------|
| `aiReelsWizard` | `/scenes/lipSyncWizard/ai-reels-wizard.ts` | AI Reels creation | Complex wizard | ✅ `generateAIReelsFunction` | 🔴 High - Use Inngest! |
| `aiReelsEntryWizard` | `/scenes/lipSyncWizard/ai-reels-entry-wizard.ts` | AI Reels entry | Wizard UI | ❌ No - UI logic | 🟢 Low |
| `aiReelsRenderWizard` | `/scenes/lipSyncWizard/ai-reels-render-wizard.ts` | AI Reels rendering | Wizard UI | ✅ `renderFunction` | 🔴 High - Use Inngest! |
| `avatarTransformScene` | `/scenes/avatarTransformScene/index.ts` | Avatar transformation | Service call | ❌ None | 🟡 Medium |
| `avatarBrainWizard` | `/scenes/avatarBrainWizard/index.ts` | Avatar creation | Wizard | ❌ None | 🟡 Medium |
| `chatWithAvatarWizard` | `/scenes/chatWithAvatarWizard/index.ts` | Chat with avatar | Wizard | ❌ None | 🟡 Medium |
| `digitalAvatarBodyWizard` | `/scenes/digitalAvatarBodyWizard/index.ts` | Digital avatar body | Service call | ❌ None | 🟡 Medium |
| `digitalAvatarBodyWizardV2` | `/scenes/digitalAvatarBodyWizardV2/index.ts` | Digital avatar body v2 | Service call | ✅ `renderAvatarVideoFunction` | 🔴 High - Use Inngest! |

**💡 Critical**: `aiReels*` scenes should use Inngest `generateAIReelsFunction` and `renderFunction`!

### 8. Training & Models (4 scenes)

| Scene Name | File Path | Business Logic | Current Implementation | Inngest Equivalent | Migration Priority |
|------------|-----------|----------------|----------------------|-------------------|-------------------|
| `trainFluxModelWizard` | `/scenes/trainFluxModelWizard/index.ts` | Train Flux models | Direct API calls | ❌ None | 🟡 Medium |
| `uploadTrainFluxModelScene` | `/scenes/uploadTrainFluxModelScene/index.ts` | Upload training data | Direct upload | ❌ None | 🟡 Medium |
| `selectModelWizard` | `/scenes/selectModelWizard/index.ts` | Model selection | UI logic | ❌ No - UI | 🟢 Low |
| `neuroCoderScene` | `/scenes/neuroCoderScene/index.ts` | Neural coding | Service call | ❌ None | 🟡 Medium |

**💡 Opportunity**: Inngest has `modelTrainingV2Function` - integrate model training!

### 9. Instagram Integration (4 scenes)

| Scene Name | File Path | Business Logic | Current Implementation | Inngest Equivalent | Migration Priority |
|------------|-----------|----------------|----------------------|-------------------|-------------------|
| `instagramScrapingWizard` | `/scenes/instagramScrapingWizard/index.ts` | Instagram scraping | Direct API calls | ✅ `instagramScraperV2Function` | 🔴 High - Use Inngest! |
| `instagramParserScene` | `/scenes/instagramParserScene/index.ts` | Parse Instagram data | Service call | ❌ None | 🟡 Medium |
| `instagramParserWizard` | `/scenes/instagramParserWizard/index.ts` | Instagram parsing wizard | Wizard | ❌ None | 🟡 Medium |
| `veedFabricWizard` | `/scenes/lipSyncWizard/veed-fabric-wizard.ts` | Veed Fabric integration | Service call | ❌ None | 🟡 Medium |

**💡 Critical**: `instagramScrapingWizard` should use Inngest `instagramScraperV2Function`!

### 10. Utility & Navigation (7 scenes)

| Scene Name | File Path | Business Logic | Should Migrate to Inngest? |
|------------|-----------|----------------|---------------------------|
| `sizeWizard` | `/scenes/sizeWizard/index.ts` | Size selection | ❌ No - UI logic |
| `getRuBillWizard` | `/scenes/getRuBillWizard/index.ts` | Billing wizard | ✅ Yes - Billing logic |
| `levelQuestWizard` | `/scenes/levelQuestWizard/index.ts` | Quest system | ✅ Yes - Gamification logic |
| `uploadVideoScene` | `/scenes/uploadVideoScene/index.ts` | Video upload | ✅ Yes - Upload processing |
| `videoDurationScene` | `/scenes/videoDurationScene/index.ts` | Video duration | ❌ No - UI logic |
| `cancelPredictionsWizard` | `/scenes/cancelPredictionsWizard/index.ts` | Cancel predictions | ✅ Yes - Prediction management |
| `autoFixerConfigScene` | `/commands/autofixer/autofixer-config.scene.ts` | AutoFixer config | ✅ Yes - AutoFixer logic |

---

## Inngest Functions Analysis

### Content Functions (6 functions)
Purpose: Generate content for social media, analyze competitors

| Function Name | Event | Business Logic | Bot Scene Equivalent |
|---------------|-------|----------------|---------------------|
| `analyzeCompetitorReelsFunction` | `content/analyze-competitor-reels` | Analyze competitor reels | ❌ None in bot |
| `extractTopContentFunction` | `content/extract-top-content` | Extract top content | ❌ None in bot |
| `findCompetitorsFunction` | `content/find-competitors` | Find competitors | ❌ None in bot |
| `generateContentScriptsFunction` | `content/generate-content-scripts` | Generate scripts | ❌ None in bot |
| `generateDetailedScriptFunction` | `content/generate-detailed-script` | Generate detailed script | ❌ None in bot |
| `generateScenarioClipsFunction` | `content/generate-scenario-clips` | Generate scenario clips | ❌ None in bot |

**💡 Gap**: Bot has no content generation features despite having 6 Inngest functions for it!

### Instagram Functions (2 functions)

| Function Name | Event | Business Logic | Bot Scene Equivalent |
|---------------|-------|----------------|---------------------|
| `instagramScraperV2Function` | `instagram/scraper-v2` | Scraping Instagram | ❌ Bot has `instagramScrapingWizard` but doesn't use this! |
| `instagramScraperV2SimpleFunction` | `instagram/scraper-v2-simple` | Simple Instagram scraping | ❌ None in bot |

**💡 Critical Gap**: Bot reinvented the wheel - `instagramScrapingWizard` duplicates Inngest functions!

### Monitoring Functions (2 functions)

| Function Name | Event | Business Logic | Bot Scene Equivalent |
|---------------|-------|----------------|---------------------|
| `criticalErrorMonitorFunction` | `monitoring/critical-error` | Monitor critical errors | ❌ None in bot |
| `logMonitorFunction` | `monitoring/log-monitor` | Monitor logs | ❌ None in bot |

**💡 Opportunity**: Bot should use these for error monitoring!

### Training Functions (2 functions)

| Function Name | Event | Business Logic | Bot Scene Equivalent |
|---------------|-------|----------------|---------------------|
| `modelTrainingV2Function` | `training/model-v2` | Train ML models | ❌ Bot has `trainFluxModelWizard` but doesn't use this! |
| `morphImagesFunction` | `training/morph-images` | Morph images | ✅ `morphingWizard` should use this! |

**💡 Critical Gap**: Bot's `trainFluxModelWizard` duplicates `modelTrainingV2Function`!

### Generation Functions (1 function)

| Function Name | Event | Business Logic | Bot Scene Equivalent |
|---------------|-------|----------------|---------------------|
| `neuroImageGenerationFunction` | `generation/neuro-image` | Generate neuro images | ❌ Bot has `neuroPhotoWizard`, `textToImageWizard` but doesn't use this! |

**💡 Critical Gap**: All bot image generation scenes should use this function!

### Payment Functions (1 function)

| Function Name | Event | Business Logic | Bot Scene Equivalent |
|---------------|-------|----------------|---------------------|
| `paymentProcessingFunction` | `payments/process` | Process payments | ❌ Bot has 6 payment scenes but doesn't use this! |

**💡 Critical Gap**: All bot payment scenes should integrate with this function!

### Broadcast Functions (1 function)

| Function Name | Event | Business Logic | Bot Scene Equivalent |
|---------------|-------|----------------|---------------------|
| `broadcastMessageFunction` | `broadcast/message` | Broadcast messages | ❌ None in bot |

### Render Functions (3 functions)

| Function Name | Event | Business Logic | Bot Scene Equivalent |
|---------------|-------|----------------|---------------------|
| `renderFunction` | `render/main` | Render videos | ❌ Bot has `aiReelsRenderWizard` but doesn't use this! |
| `renderAvatarVideoFunction` | `render/avatar-video` | Render avatar videos | ❌ Bot has `digitalAvatarBody*` scenes but doesn't use this! |
| `renderRiddleFunction` | `render/riddle` | Render riddles | ❌ None in bot |

**💡 Critical Gap**: Bot's AI Reels scenes should use `renderFunction`!

### Existing Functions (3 functions)

| Function Name | Event | Business Logic | Bot Scene Equivalent |
|---------------|-------|----------------|---------------------|
| `generateAIReelsFunction` | `video/generate-ai-reels` | Generate AI reels | ❌ Bot has `aiReelsWizard` but doesn't use this! |
| `generateAdvancedLoopingVideoFunction` | `video/advanced-looping` | Generate looping videos | ❌ Bot has `textToVideoWizard`, `imageToVideoWizard` but doesn't use this! |
| `generateModelTrainingFunction` | `training/generate-model` | Generate model training | ❌ Bot has `trainFluxModelWizard` but doesn't use this! |

**💡 Critical Gap**: Bot's video generation is completely duplicated in Inngest!

### Test Functions (1 function)

| Function Name | Event | Business Logic | Bot Scene Equivalent |
|---------------|-------|----------------|---------------------|
| `testSimpleFunction` | N/A | Test function | ❌ None in bot |

---

## Critical Findings & Recommendations

### 🔴 High Priority Migrations

1. **Image Generation** → Inngest
   - Move: `neuroPhotoWizard`, `neuroPhotoWizardV2`, `textToImageWizard`
   - Use: `neuroImageGenerationFunction`
   - Benefit: Centralized image generation, better error handling, retries

2. **Instagram Scraping** → Inngest
   - Move: `instagramScrapingWizard` business logic
   - Use: `instagramScraperV2Function`
   - Benefit: Reduce API calls, better rate limiting

3. **AI Reels** → Inngest
   - Move: `aiReelsWizard`, `aiReelsRenderWizard` business logic
   - Use: `generateAIReelsFunction`, `renderFunction`
   - Benefit: Separated concerns, better rendering pipeline

4. **Video Generation** → Inngest
   - Move: `textToVideoWizard`, `imageToVideoWizard` business logic
   - Use: `generateAdvancedLoopingVideoFunction`
   - Benefit: Centralized video processing

5. **Payment Processing** → Inngest
   - Move: `subscriptionScene`, `rublePaymentScene`, `starPaymentScene` business logic
   - Use: `paymentProcessingFunction`
   - Benefit: Consistent payment handling, audit trail

### 🟡 Medium Priority Migrations

6. **Model Training** → Inngest
   - Move: `trainFluxModelWizard` business logic
   - Use: `modelTrainingV2Function`
   - Benefit: Asynchronous training, status tracking

7. **Avatar Video** → Inngest
   - Move: `digitalAvatarBody*` scenes business logic
   - Use: `renderAvatarVideoFunction`
   - Benefit: Better rendering pipeline

8. **User Management** → Inngest
   - Move: `createUserScene`, `balanceScene` business logic
   - Create: User management functions
   - Benefit: Consistent user operations

### 🟢 Low Priority (Keep in Bot)

- Menu navigation (`menuScene`)
- Help documentation (`helpScene`)
- Size selection (`sizeWizard`)
- UI flow management

---

## Migration Strategy

### Phase 1: Core Image & Video Generation (2-3 weeks)

**Goal**: Migrate the most-used features to Inngest

**Steps**:
1. Integrate `neuroPhotoWizardV2` with `neuroImageGenerationFunction`
2. Integrate `textToImageWizard` with `neuroImageGenerationFunction`
3. Integrate `aiReelsWizard` with `generateAIReelsFunction`
4. Integrate `aiReelsRenderWizard` with `renderFunction`
5. Test and validate

**Testing**:
- Unit tests for Inngest functions
- Integration tests for bot-Inngest communication
- Performance benchmarks

### Phase 2: Instagram & Payment Integration (2-3 weeks)

**Goal**: Migrate Instagram and payment features

**Steps**:
1. Refactor `instagramScrapingWizard` to use `instagramScraperV2Function`
2. Integrate payment scenes with `paymentProcessingFunction`
3. Add webhook handlers for payment status updates
4. Test payment flows

**Testing**:
- Payment integration tests
- Instagram scraping tests
- Webhook delivery tests

### Phase 3: Advanced Features (2-3 weeks)

**Goal**: Migrate advanced features

**Steps**:
1. Integrate model training with `modelTrainingV2Function`
2. Integrate avatar video with `renderAvatarVideoFunction`
3. Add monitoring functions to bot error handling
4. Test all integrations

### Phase 4: Optimization & Cleanup (1-2 weeks)

**Goal**: Optimize and clean up

**Steps**:
1. Remove duplicate code from bot scenes
2. Optimize bot scene flows (reduce API calls)
3. Add comprehensive logging
4. Create migration documentation
5. Final testing and deployment

---

## Architecture Recommendations

### 1. Bot Scene Pattern
**Current**: Scenes handle business logic + UI
**Recommended**: Scenes handle UI, Inngest handles business logic

```typescript
// BEFORE (Current)
const neuroPhotoWizard = new Scenes.WizardScene(
  'neuro_photo',
  async (ctx) => {
    // UI logic
  },
  async (ctx) => {
    // Business logic - API calls, processing
    await generateNeuroPhotoHybrid(params)
  }
)

// AFTER (Recommended)
const neuroPhotoWizard = new Scenes.WizardScene(
  'neuro_photo',
  async (ctx) => {
    // UI logic only
  },
  async (ctx) => {
    // Send to Inngest only
    await sendInngestEvent('generation/neuro-image', params)
    // Show "processing..." message
  }
)
```

### 2. Inngest Event Pattern
**Current**: Bot calls external APIs directly
**Recommended**: Bot sends events to Inngest

```typescript
// BEFORE (Current)
async function generateImage(prompt: string) {
  const result = await externalAPI.generate({ prompt })
  return result
}

// AFTER (Recommended)
async function generateImage(prompt: string) {
  await sendInngestEvent('generation/neuro-image', { prompt })
  // Return event ID for tracking
}
```

### 3. Status Tracking Pattern
**Current**: Bot polls for status
**Recommended**: Inngest sends updates via webhooks

```typescript
// Use Inngest's event tracking
const event = await sendInngestEvent('generation/neuro-image', params)

// Bot can check status
const status = await inngest.getEvent(event.ids[0])

// Or use Inngest webhooks for real-time updates
```

### 4. Error Handling Pattern
**Current**: Bot handles errors inline
**Recommended**: Use Inngest error monitoring

```typescript
// Add to bot error handlers
import { criticalErrorMonitorFunction } from '@/inngest/functions/monitoring/criticalErrorMonitor'

// On error
await sendInngestEvent('monitoring/critical-error', {
  error: error.message,
  context: { scene: 'neuro_photo', userId: ctx.from.id }
})
```

---

## Benefits of Migration

### For Development
- ✅ Reusable business logic across multiple bots
- ✅ Better error handling and retry logic
- ✅ Asynchronous processing for long operations
- ✅ Better logging and monitoring
- ✅ Easier testing and debugging

### For Users
- ✅ Faster response times (no blocking operations)
- ✅ Better error messages
- ✅ Ability to track job status
- ✅ More reliable operations

### For Maintenance
- ✅ Centralized logic (single source of truth)
- ✅ Easier to update business logic
- ✅ Better observability
- ✅ Reduced code duplication

---

## Risks & Mitigation

### Risk 1: Increased Complexity
**Mitigation**: Clear documentation, examples, and gradual migration

### Risk 2: Breaking Changes
**Mitigation**: Feature flags, parallel running during migration

### Risk 3: Performance Issues
**Mitigation**: Load testing, monitoring, optimization

### Risk 4: Learning Curve
**Mitigation**: Training sessions, code examples, documentation

---

## Success Metrics

- **Code Reduction**: Remove 30-40% duplicate business logic from bot scenes
- **Performance**: 50% reduction in bot response time for image/video generation
- **Reliability**: 90% reduction in errors related to long-running operations
- **Maintainability**: Single source of truth for all business logic
- **Testing**: 80%+ test coverage for Inngest functions

---

## Conclusion

The current architecture has significant duplication between bot scenes and Inngest functions. By migrating business logic to Inngest and keeping only UI logic in bot scenes, we can:

1. Reduce code duplication by 30-40%
2. Improve performance and reliability
3. Create a more maintainable architecture
4. Enable easier scaling and feature development

**Recommended next steps**:
1. Start with Phase 1 (Image & Video Generation)
2. Create integration guides for each migration
3. Set up monitoring and testing infrastructure
4. Execute migration in iterations with testing
5. Document learnings and best practices

---

*Generated: 2025-11-02*
*Total Scenes Analyzed: 47*
*Total Inngest Functions Analyzed: 22*
*Migration Priority Items: 8*
