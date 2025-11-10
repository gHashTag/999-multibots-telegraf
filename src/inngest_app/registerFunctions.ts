/**
 * Register All Inngest Functions
 * Centralized registration for all migrated functions from ai-server
 */

import { serve } from 'inngest/express'
import { inngest } from './inngestClient'
import { logger } from '@/utils/logger'

// Import all functions - will need to fix imports after creating proper exports
// Content Functions
import { analyzeCompetitorReelsFunction } from './functions/content/analyzeCompetitorReels'
import { extractTopContentFunction } from './functions/content/extractTopContent'
import { findCompetitorsFunction } from './functions/content/findCompetitors'
import { generateContentScriptsFunction } from './functions/content/generateContentScripts'
import { generateDetailedScriptFunction } from './functions/content/generateDetailedScript'
import { generateScenarioClipsFunction } from './functions/content/generateScenarioClips'

// Instagram Functions
import { instagramScraperV2Function } from './functions/instagram/instagramScraper-v2'
import { instagramScraperV2SimpleFunction } from './functions/instagram/instagramScraper-v2-simple'

// Monitoring Functions
import { criticalErrorMonitorFunction } from './functions/monitoring/criticalErrorMonitor'
import { logMonitorFunction } from './functions/monitoring/logMonitor'

// Training Functions
import { modelTrainingV2Function } from './functions/training/modelTrainingV2'
import { morphImagesFunction } from './functions/training/morphImages'

// Generation Functions
import { neuroImageGenerationFunction } from './functions/generation/neuroImageGeneration'

// Payment Functions
import { paymentProcessingFunction } from './functions/payments/paymentProcessing'

// Broadcast Functions
import { broadcastMessageFunction } from './functions/broadcast/broadcastMessage'

// Callback Functions
import { aiReelsCallbackFunction } from './functions/ai-reels-callback'

// Render Functions
import { renderFunction } from './functions/render/render'
import { renderAvatarVideoFunction } from './functions/render/renderAvatarVideo'
import { renderRiddleFunction } from './functions/render/renderRiddle'

// Existing Functions
import { generateAIReelsFunction } from './functions/existing/generateAIReelsFunction'
import { generateAdvancedLoopingVideoFunction } from './functions/existing/generateAdvancedLoopingVideoFunction'
import { generateModelTrainingFunction } from './functions/existing/generateModelTrainingFunction'

// Collect all functions (raw array with potential undefined values)
const allFunctionsRaw = [
  // Content (6)
  analyzeCompetitorReelsFunction,
  extractTopContentFunction,
  findCompetitorsFunction,
  generateContentScriptsFunction,
  generateDetailedScriptFunction,
  generateScenarioClipsFunction,

  // Instagram (2)
  instagramScraperV2Function,
  instagramScraperV2SimpleFunction,

  // Monitoring (2)
  criticalErrorMonitorFunction,
  logMonitorFunction,

  // Training (2)
  modelTrainingV2Function,
  morphImagesFunction,

  // Generation (1)
  neuroImageGenerationFunction,

  // Payment (1)
  paymentProcessingFunction,

  // Broadcast (1)
  broadcastMessageFunction,

  // Callback (1)
  aiReelsCallbackFunction,

  // Render (3)
  renderFunction,
  renderAvatarVideoFunction,
  renderRiddleFunction,

  // Existing (3)
  generateAIReelsFunction,
  generateAdvancedLoopingVideoFunction,
  generateModelTrainingFunction,
]

// Filter out undefined functions and log warnings
export const allInngestFunctions = allFunctionsRaw.filter((f, index) => {
  if (!f) {
    logger.warn(`⚠️ [INNGEST] Function at index ${index} is undefined - skipping`)
    return false
  }
  return true
})

// Log all registered functions
logger.info('🚀 [INNGEST] Registering functions', {
  count: allInngestFunctions.length,
  functions: allInngestFunctions.map(f => f.name || 'unnamed'),
})

// Create the Inngest handler for Express (v3 syntax)
export const inngestHandler = serve({
  client: inngest,
  functions: allInngestFunctions,
})

// Helper to check function registration
export function getFunctionStatus(): {
  total: number
  names: string[]
  categories: Record<string, number>
} {
  return {
    total: allInngestFunctions.length,
    names: allInngestFunctions.map(f => f.name || 'unnamed'),
    categories: {
      content: 6,
      instagram: 2,
      monitoring: 2,
      training: 2,
      generation: 1,
      payment: 1,
      broadcast: 1,
      callback: 1,
      render: 3,
      existing: 3,
    },
  }
}

// Export for testing
export { allInngestFunctions as functions }