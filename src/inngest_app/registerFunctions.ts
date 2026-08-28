/**
 * Register All Inngest Functions
 * Centralized registration for all migrated functions from ai-server
 */

import { serve } from 'inngest/express'
import { inngest } from './inngestClient'
import { logger } from '@/utils/logger'

// Content Functions
import { analyzeCompetitorReels } from './functions/content/analyzeCompetitorReels'
import { extractTopContent } from './functions/content/extractTopContent'
import { findCompetitors } from './functions/content/findCompetitors'
import { generateContentScripts } from './functions/content/generateContentScripts'
import { generateDetailedScript } from './functions/content/generateDetailedScript'
import { generateScenarioClips } from './functions/content/generateScenarioClips'

// Instagram Functions - disabled: missing schema exports in @/core/instagram/schemas
// import { instagramScraperV2 } from './functions/instagram/instagramScraper-v2'
// import { instagramReelsTest } from './functions/instagram/instagramScraper-v2-simple'

// Monitoring Functions
import {
  criticalErrorMonitor,
  healthCheck,
} from './functions/monitoring/criticalErrorMonitor'
import {
  logMonitor,
  triggerLogMonitor,
} from './functions/monitoring/logMonitor'

// Training Functions
import { modelTrainingV2 } from './functions/training/modelTrainingV2'
import { morphImages } from './functions/training/morphImages'

// Generation Functions
import { neuroImageGeneration } from './functions/generation/neuroImageGeneration'

// Payment Functions
import { processPayment } from './functions/payments/paymentProcessing'

// Broadcast Functions
import { broadcastMessage } from './functions/broadcast/broadcastMessage'

// Callback Functions
import { aiReelsCallbackFunction } from './functions/ai-reels-callback'

// Render Functions
import { renderFunction } from './functions/render/render'
import { renderAvatarVideoFunction } from './functions/render/renderAvatarVideo'
import { renderRiddleFunction } from './functions/render/renderRiddle'

// Analytics Functions
import { dailySalesAdvisor } from './functions/analytics/dailySalesAdvisor'
import { skillDetector } from './functions/analytics/skillDetector'

// Existing Functions
import { generateAIReelsFunction } from './functions/existing/generateAIReelsFunction'
import { generateAdvancedLoopingVideoFunction } from './functions/existing/generateAdvancedLoopingVideoFunction'
import { generateModelTrainingFunction } from './functions/existing/generateModelTrainingFunction'

const allFunctionsRaw = [
  // Content (6)
  analyzeCompetitorReels,
  extractTopContent,
  findCompetitors,
  generateContentScripts,
  generateDetailedScript,
  generateScenarioClips,

  // Instagram (2) - disabled: missing schema exports
  // instagramScraperV2,
  // instagramReelsTest,

  // Monitoring (4)
  criticalErrorMonitor,
  healthCheck,
  logMonitor,
  triggerLogMonitor,

  // Training (2)
  modelTrainingV2,
  morphImages,

  // Generation (1)
  neuroImageGeneration,

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

  // Analytics (2)
  dailySalesAdvisor,
  skillDetector,

  // Existing (3)
  generateAIReelsFunction,
  generateAdvancedLoopingVideoFunction,
  generateModelTrainingFunction,
]

export const allInngestFunctions = allFunctionsRaw.filter((f, index) => {
  if (!f) {
    logger.warn(
      `⚠️ [INNGEST] Function at index ${index} is undefined - skipping`
    )
    return false
  }
  return true
})

logger.info('🚀 [INNGEST] Registering functions', {
  count: allInngestFunctions.length,
  functions: allInngestFunctions.map(f => f.name || 'unnamed'),
})

export const inngestHandler = serve({
  client: inngest,
  functions: allInngestFunctions,
})

export function getFunctionStatus() {
  return {
    total: allInngestFunctions.length,
    names: allInngestFunctions.map(f => f.name || 'unnamed'),
  }
}

export { allInngestFunctions as functions }
