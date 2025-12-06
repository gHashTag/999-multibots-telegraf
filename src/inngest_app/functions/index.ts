/**
 * Master Index - All Inngest Functions
 * Complete migration from ai-server
 * Fully isolated, no external dependencies
 */

// Content Functions
export { analyzeCompetitorReels } from './content/analyzeCompetitorReels'
export { extractTopContent } from './content/extractTopContent'
export { findCompetitors } from './content/findCompetitors'
export { generateContentScriptsFunction } from './content/generateContentScripts'
export { generateDetailedScriptFunction } from './content/generateDetailedScript'
export { generateScenarioClipsFunction } from './content/generateScenarioClips'

// Instagram Functions
export { instagramScraperV2Function } from './instagram/instagramScraper-v2'
export { instagramScraperV2Simple as instagramScraperV2SimpleFunction } from './instagram/instagramScraper-v2-simple'

// Monitoring Functions
export { criticalErrorMonitorFunction } from './monitoring/criticalErrorMonitor'
export { logMonitorFunction } from './monitoring/logMonitor'

// Training Functions
export { modelTrainingV2Function } from './training/modelTrainingV2'
export { morphImagesFunction } from './training/morphImages'
import { morphImagesFunction } from './training/morphImages'

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
export { generateAdvancedLoopingVideo as generateAdvancedLoopingVideoFunction } from './existing/generateAdvancedLoopingVideoFunction'
export { generateModelTraining as generateModelTrainingFunction } from './generateModelTraining'

// Test Functions
export { testSimpleFunction } from './testSimpleFunction'
export { testSimpleMessageFunction } from './testSimpleMessageFunction'
export { testAdvancedLoopFunction } from './testAdvancedLoopFunction'

// Helper Functions
export { videoUploadHelper } from './video-upload-helper'
export { wan25Helpers } from './wan25-helpers'

// Import all functions for getAllFunctions
import { analyzeCompetitorReels } from './content/analyzeCompetitorReels'
import { extractTopContent } from './content/extractTopContent'
import { findCompetitors } from './content/findCompetitors'
import { generateContentScriptsFunction } from './content/generateContentScripts'
import { generateDetailedScriptFunction } from './content/generateDetailedScript'
import { generateScenarioClipsFunction } from './content/generateScenarioClips'
import { instagramScraperV2Function } from './instagram/instagramScraper-v2'
import { instagramScraperV2Simple as instagramScraperV2SimpleFunction } from './instagram/instagramScraper-v2-simple'
import { criticalErrorMonitorFunction } from './monitoring/criticalErrorMonitor'
import { logMonitorFunction } from './monitoring/logMonitor'
import { modelTrainingV2Function } from './training/modelTrainingV2'
import { neuroImageGenerationFunction } from './generation/neuroImageGeneration'
import { paymentProcessingFunction } from './payments/paymentProcessing'
import { broadcastMessageFunction } from './broadcast/broadcastMessage'
import { aiReelsCallbackFunction } from './ai-reels-callback'
import { renderFunction, renderAvatarVideoFunction, renderRiddleFunction } from './render'
import { generateAIReelsFunction } from './existing/generateAIReelsFunction'
import { generateAdvancedLoopingVideo as generateAdvancedLoopingVideoFunction } from './existing/generateAdvancedLoopingVideoFunction'
import { generateModelTraining as generateModelTrainingFunction } from './generateModelTraining'
import { testSimpleFunction } from './testSimpleFunction'
import { testSimpleMessageFunction } from './testSimpleMessageFunction'
import { testAdvancedLoopFunction } from './testAdvancedLoopFunction'
import { videoUploadHelper } from './video-upload-helper'
import { wan25Helpers } from './wan25-helpers'

// Helper functions for all Inngest functions
export const getAllFunctions = () => [
  analyzeCompetitorReels,
  extractTopContent,
  findCompetitors,
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
