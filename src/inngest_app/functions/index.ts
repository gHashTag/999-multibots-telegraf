/**
 * Master Index - All Inngest Functions
 * Complete migration from ai-server
 * Fully isolated, no external dependencies
 */

// Content Functions
export { analyzeCompetitorReelsFunction } from './content/analyzeCompetitorReels'
export { extractTopContentFunction } from './content/extractTopContent'
export { findCompetitorsFunction } from './content/findCompetitors'
export { generateContentScriptsFunction } from './content/generateContentScripts'
export { generateDetailedScriptFunction } from './content/generateDetailedScript'
export { generateScenarioClipsFunction } from './content/generateScenarioClips'

// Instagram Functions
export { instagramScraperV2Function } from './instagram/instagramScraper-v2'
export { instagramScraperV2SimpleFunction } from './instagram/instagramScraper-v2-simple'

// Monitoring Functions
export { criticalErrorMonitorFunction } from './monitoring/criticalErrorMonitor'
export { logMonitorFunction } from './monitoring/logMonitor'

// Training Functions
export { modelTrainingV2Function } from './training/modelTrainingV2'
export { morphImagesFunction } from './training/morphImages'

// Generation Functions
export { neuroImageGenerationFunction } from './generation/neuroImageGeneration'

// Payment Functions
export { paymentProcessingFunction } from './payments/paymentProcessing'

// Broadcast Functions
export { broadcastMessageFunction } from './broadcast/broadcastMessage'

// Callback Functions
export { aiReelsCallbackFunction } from './ai-reels-callback'

// Render Functions (complete module)
export * from './render'

// Existing Functions (already in telegraf)
export { generateAIReelsFunction } from './existing/generateAIReelsFunction'
export { generateAdvancedLoopingVideoFunction } from './existing/generateAdvancedLoopingVideoFunction'
export { generateModelTrainingFunction } from './existing/generateModelTrainingFunction'

// Test Functions
export { testSimpleFunction } from './testSimpleFunction'
export { testSimpleMessageFunction } from './testSimpleMessageFunction'
export { testAdvancedLoopFunction } from './testAdvancedLoopFunction'

// Helper Functions
export { videoUploadHelper } from './video-upload-helper'
export { wan25Helpers } from './wan25-helpers'

// Helper functions for all Inngest functions
export const getAllFunctions = () => [
  analyzeCompetitorReelsFunction,
  extractTopContentFunction,
  findCompetitorsFunction,
  generateContentScriptsFunction,
  generateDetailedScriptFunction,
  generateScenarioClipsFunction,
  instagramScraperV2Function,
  instagramScraperV2SimpleFunction,
  criticalErrorMonitorFunction,
  logMonitorFunction,
  modelTrainingV2Function,
  morphImagesFunction,
  neuroImageGenerationFunction,
  paymentProcessingFunction,
  broadcastMessageFunction,
  aiReelsCallbackFunction,
  // Render functions
  renderFunction,
  renderAvatarVideoFunction,
  renderRiddleFunction,
  // Existing functions
  generateAIReelsFunction,
  generateAdvancedLoopingVideoFunction,
  generateModelTrainingFunction,
  // Test functions
  testSimpleFunction,
  testSimpleMessageFunction,
  testAdvancedLoopFunction,
  // Helper functions
  videoUploadHelper,
  wan25Helpers,
]

export const getFunctionById = (id: string) => {
  const all = getAllFunctions()
  return all.find((f) => f.id === id)
}

export const getFunctionsByCategory = (category: string) => {
  const all = getAllFunctions()
  return all.filter((f) => f.category === category)
}

export const getFunctionStats = () => {
  const all = getAllFunctions()
  const byCategory: Record<string, number> = {}

  all.forEach((f) => {
    const category = f.category || 'uncategorized'
    byCategory[category] = (byCategory[category] || 0) + 1
  })

  return {
    total: all.length,
    by_category: byCategory,
  }
}
