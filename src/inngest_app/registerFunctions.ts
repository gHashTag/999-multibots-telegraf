/**
 * Register ALL Inngest Functions (COMPREHENSIVE VERSION)
 *
 * This file combines:
 * 1. Restored functions from deleted commit 189ebd65 (46 functions)
 * 2. Current active functions (webhookHealthGuard, kieAiWebhookMonitor, etc.)
 * 3. Proper integration with lazy-loading pattern
 */

import { inngest } from './client'
import { logger } from '@/utils/logger'

// ========== RESTORED FUNCTIONS ==========

// Content Functions (6)
import { analyzeCompetitorReels } from './functions/content/analyzeCompetitorReels'
import { extractTopContent } from './functions/content/extractTopContent'
import { findCompetitors } from './functions/content/findCompetitors'
import { generateContentScripts } from './functions/content/generateContentScripts'
import { generateDetailedScript } from './functions/content/generateDetailedScript'
import { generateScenarioClips } from './functions/content/generateScenarioClips'

// Instagram Functions (2)
import { instagramScraperV2 } from './functions/instagram/instagramScraper-v2'
import { instagramScraperV2Simple } from './functions/instagram/instagramScraper-v2-simple'

// Monitoring Functions (2)
import { criticalErrorMonitor } from './functions/monitoring/criticalErrorMonitor'
import { logMonitor } from './functions/monitoring/logMonitor'

// Training Functions (5)
import { modelTrainingV2 } from './functions/training/modelTrainingV2'
import { morphImagesFunction } from './functions/training/morphImages'
import {
  voiceTrainingStart,
  voiceTrainingCompleted,
} from './functions/training/voiceTrainingRVC'
import { checkStuckTrainings } from './functions/training/checkStuckTrainings'

// Generation Functions (2 - including restored version)
import { neuroImageGeneration } from './functions/generation/neuroImageGeneration'

// Welcome Avatar Generation (new user gift)
import { welcomeAvatarGeneration } from './functions/welcomeAvatarGeneration'

// Payment Functions (1)
import { processPayment } from './functions/payments/paymentProcessing'

// Broadcast Functions (1)
import { broadcastMessage } from './functions/broadcast/broadcastMessage'

// Callback Functions (1)
import { aiReelsCallbackFunction } from './functions/ai-reels-callback'

// Render Functions (3)
import { renderFunction } from './functions/render/render'
import { renderAvatarVideoFunction } from './functions/render/renderAvatarVideo'
import { renderRiddleFunction } from './functions/render/renderRiddle'

// Existing Functions (3)
import { generateAIReels } from './functions/existing/generateAIReelsFunction'
import { generateAdvancedLoopingVideo } from './functions/existing/generateAdvancedLoopingVideoFunction'
import { generateModelTraining } from './functions/generateModelTraining'
import { handleModelTrainingCompleted } from './functions/handleModelTrainingCompleted'

// ========== CURRENT ACTIVE FUNCTIONS ==========

// Import current KieAi webhook monitor functions (lazy factory)
import { createWebhookMonitorFunctions } from './functions/kieAiWebhookMonitor'

// Import current webhook health guard functions
import {
  webhookHealthCheck,
  validateWebhookBeforeGeneration,
  periodicWebhookHealthCheck,
} from './functions/webhookHealthGuard'

// ✅ FIX: Убраны дублирующиеся импорты - уже импортированы выше как restored versions
// Дубликаты функций с одинаковыми ID вызывают ошибки в Inngest!
// import { morphImages as currentMorphImages } from './functions/morphImages'
// import { neuroImageGeneration as currentNeuroImageGeneration } from './functions/neuroImageGeneration'
// import { generateModelTraining as currentGenerateModelTraining } from './functions/generateModelTraining'

/**
 * Factory function to create ALL Inngest functions (23 restored + 4 current = 27 unique)
 * This is called AFTER secrets are loaded from Infisical
 *
 * ⚠️ IMPORTANT: Функции с одинаковыми ID не должны дублироваться!
 * Inngest выбрасывает ошибку при дублировании ID.
 */
export function createAllInngestFunctions() {
  console.log('🔧 [INNGEST] Creating ALL Inngest functions (RESTORED + CURRENT)...')

  // Create Kie.ai webhook monitor functions using factory pattern
  const kieAiWebhookMonitorFunctions = createWebhookMonitorFunctions()
  console.log(
    `📋 Kie.ai webhook monitor functions: ${kieAiWebhookMonitorFunctions.length}`
  )

  // Webhook health guard functions (CRITICAL for video monitoring)
  const webhookHealthGuardFunctions = [
    webhookHealthCheck,
    validateWebhookBeforeGeneration,
    periodicWebhookHealthCheck,
  ]

  console.log(
    `📋 Webhook health guard functions: ${webhookHealthGuardFunctions.length}`
  )

  // RESTORED FUNCTIONS (22 functions)
  const restoredFunctions = [
    // Content (6)
    analyzeCompetitorReels,
    extractTopContent,
    findCompetitors,
    generateContentScripts,
    generateDetailedScript,
    generateScenarioClips,

    // Instagram (2)
    instagramScraperV2,
    instagramScraperV2Simple,

    // Monitoring (2)
    criticalErrorMonitor,
    logMonitor,

    // Training (5)
    modelTrainingV2,
    morphImagesFunction,
    voiceTrainingStart,
    voiceTrainingCompleted,
    checkStuckTrainings,

    // Generation (1)
    neuroImageGeneration,

    // Welcome Avatar (1) - free generation for new users
    welcomeAvatarGeneration,

    // Payment (1)
    processPayment,

    // Broadcast (1)
    broadcastMessage,

    // Callback (1)
    aiReelsCallbackFunction,

    // Render (3)
    renderFunction,
    renderAvatarVideoFunction,
    renderRiddleFunction,

    // Existing (4)
    generateAIReels,
    generateAdvancedLoopingVideo,
    generateModelTraining,
    handleModelTrainingCompleted,
  ]

  console.log(`📋 Restored functions: ${restoredFunctions.length}`)

  // CURRENT ACTIVE FUNCTIONS (4 functions)
  // ✅ FIX: Убраны дублирующиеся функции (morphImages, neuroImageGeneration, generateModelTraining)
  // Они уже включены в restoredFunctions с теми же ID!
  const currentActiveFunctions = [
    // Kie.ai monitor (1+ functions)
    ...kieAiWebhookMonitorFunctions,

    // Webhook health (3)
    ...webhookHealthGuardFunctions,
  ]

  console.log(`📋 Current active functions: ${currentActiveFunctions.length}`)

  // COMBINE ALL FUNCTIONS
  const allInngestFunctions = [
    ...restoredFunctions,
    ...currentActiveFunctions,
  ]

  console.log(
    `✅ [INNGEST] TOTAL Created ${allInngestFunctions.length} Inngest functions`
  )
  console.log(`   - Restored: ${restoredFunctions.length}`)
  console.log(`   - Current: ${currentActiveFunctions.length}`)

  return allInngestFunctions
}
