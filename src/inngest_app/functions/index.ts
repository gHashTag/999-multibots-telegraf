/**
 * Master Index - All Inngest Functions
 * Complete migration from ai-server
 * Fully isolated, no external dependencies
 */

// Content Functions
export { analyzeCompetitorReels as analyzeCompetitorReelsFunction } from './content/analyzeCompetitorReels'
export { extractTopContent as extractTopContentFunction } from './content/extractTopContent'
export { findCompetitors as findCompetitorsFunction } from './content/findCompetitors'
export { generateContentScripts as generateContentScriptsFunction } from './content/generateContentScripts'
export { generateDetailedScript as generateDetailedScriptFunction } from './content/generateDetailedScript'
export { generateScenarioClips as generateScenarioClipsFunction } from './content/generateScenarioClips'

// Instagram Functions
export { instagramScraperV2 as instagramScraperV2Function } from './instagram/instagramScraper-v2'
export { instagramReelsTest as instagramScraperV2SimpleFunction } from './instagram/instagramScraper-v2-simple'

// Monitoring Functions
export { criticalErrorMonitor as criticalErrorMonitorFunction } from './monitoring/criticalErrorMonitor'
export { logMonitor as logMonitorFunction } from './monitoring/logMonitor'

// Training Functions
export { modelTrainingV2 as modelTrainingV2Function } from './training/modelTrainingV2'
export { morphImages as morphImagesFunction } from './training/morphImages'

// Generation Functions
export { neuroImageGeneration as neuroImageGenerationFunction } from './generation/neuroImageGeneration'

// Payment Functions
export { processPayment as paymentProcessingFunction } from './payments/paymentProcessing'

// Broadcast Functions
export { broadcastMessage as broadcastMessageFunction } from './broadcast/broadcastMessage'

// Callback Functions
export { aiReelsCallbackFunction } from './ai-reels-callback'

// Render Functions (complete module)
export * from './render'

// Existing Functions (already in telegraf)
export { generateAIReelsFunction } from './existing/generateAIReelsFunction'
export { generateAdvancedLoopingVideoFunction } from './existing/generateAdvancedLoopingVideoFunction'
export { generateModelTrainingFunction } from './existing/generateModelTrainingFunction'

// Helper Functions
export { videoUploadHelper } from './video-upload-helper'
export { wan25Helpers } from './wan25-helpers'

// Import render functions explicitly
import { renderFunction, renderAvatarVideoFunction, renderRiddleFunction } from './render'

// Import all other functions for getAllFunctions
import { analyzeCompetitorReels } from './content/analyzeCompetitorReels'
import { extractTopContent } from './content/extractTopContent'
import { findCompetitors } from './content/findCompetitors'
import { generateContentScripts } from './content/generateContentScripts'
import { generateDetailedScript } from './content/generateDetailedScript'
import { generateScenarioClips } from './content/generateScenarioClips'
import { instagramScraperV2 } from './instagram/instagramScraper-v2'
import { instagramReelsTest as instagramScraperV2Simple } from './instagram/instagramScraper-v2-simple'
import { criticalErrorMonitor } from './monitoring/criticalErrorMonitor'
import { logMonitor } from './monitoring/logMonitor'
import { modelTrainingV2 } from './training/modelTrainingV2'
import { morphImages } from './training/morphImages'
import { neuroImageGeneration } from './generation/neuroImageGeneration'
import { processPayment } from './payments/paymentProcessing'
import { broadcastMessage } from './broadcast/broadcastMessage'
import { aiReelsCallbackFunction } from './ai-reels-callback'
import { generateAIReelsFunction } from './existing/generateAIReelsFunction'
import { generateAdvancedLoopingVideoFunction } from './existing/generateAdvancedLoopingVideoFunction'
import { generateModelTrainingFunction } from './existing/generateModelTrainingFunction'
import { videoUploadHelper } from './video-upload-helper'
import { wan25Helpers } from './wan25-helpers'

// Helper functions for all Inngest functions
export const getAllFunctions = () => {
  // Return array with all Inngest function exports, filtering out undefined
  const allFunctions = [
    // Content Functions
    analyzeCompetitorReels,
    extractTopContent,
    findCompetitors,
    generateContentScripts,
    generateDetailedScript,
    generateScenarioClips,
    // Instagram Functions
    instagramScraperV2,
    instagramScraperV2Simple,
    // Monitoring Functions
    criticalErrorMonitor,
    logMonitor,
    // Training Functions
    modelTrainingV2,
    morphImages,
    // Generation Functions
    neuroImageGeneration,
    // Payment Functions
    processPayment,
    // Broadcast Functions
    broadcastMessage,
    // Callback Functions
    aiReelsCallbackFunction,
    // Render Functions
    renderFunction,
    renderAvatarVideoFunction,
    renderRiddleFunction,
    // Existing Functions
    generateAIReelsFunction,
    generateAdvancedLoopingVideoFunction,
    generateModelTrainingFunction,
    // Helper Functions
    videoUploadHelper,
    wan25Helpers,
  ]

  // Filter out undefined functions
  return allFunctions.filter(fn => fn !== undefined && fn !== null)
}

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
