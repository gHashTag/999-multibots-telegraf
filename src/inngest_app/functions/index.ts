/**
 * Master Index - All Inngest Functions
 * Complete migration from ai-server
 * Fully isolated, no external dependencies
 */

// Content Functions - TEMPORARILY DISABLED due to broken imports
// export { analyzeCompetitorReels as analyzeCompetitorReelsFunction } from './content/analyzeCompetitorReels'
// export { extractTopContent as extractTopContentFunction } from './content/extractTopContent'
// export { findCompetitors as findCompetitorsFunction } from './content/findCompetitors'
// export { generateContentScripts as generateContentScriptsFunction } from './content/generateContentScripts'
// export { generateDetailedScript as generateDetailedScriptFunction } from './content/generateDetailedScript'
// export { generateScenarioClips as generateScenarioClipsFunction } from './content/generateScenarioClips'

// Instagram Functions - TEMPORARILY DISABLED due to broken imports
// export { instagramScraperV2 as instagramScraperV2Function } from './instagram/instagramScraper-v2'
// export { instagramReelsTest as instagramScraperV2SimpleFunction } from './instagram/instagramScraper-v2-simple'

// Monitoring Functions
export {
  criticalErrorMonitor as criticalErrorMonitorFunction,
  healthCheck as healthCheckFunction,
} from './monitoring/criticalErrorMonitor'
export {
  logMonitor as logMonitorFunction,
  triggerLogMonitor as triggerLogMonitorFunction,
} from './monitoring/logMonitor'

// Training Functions
export { generateModelTraining as generateModelTrainingOriginalFunction } from './training/generateModelTraining'
// TEMPORARILY DISABLED due to broken imports
// export { modelTrainingV2 as modelTrainingV2Function } from './training/modelTrainingV2'
// export { morphImages as morphImagesFunction } from './training/morphImages'

// Generation Functions
export { neuroImageGeneration as neuroImageGenerationFunction } from './generation/neuroImageGeneration'

// Payment Functions - TEMPORARILY DISABLED due to broken imports
// export { processPayment as paymentProcessingFunction } from './payments/paymentProcessing'

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

// Helper Functions - TEMPORARILY DISABLED due to broken imports
// export { videoUploadHelper } from './video-upload-helper'
// export { wan25Helpers } from './wan25-helpers'

// Import render functions explicitly
import {
  renderFunction,
  renderAvatarVideoFunction,
  renderRiddleFunction,
} from './render'

// Import all other functions for getAllFunctions
// TEMPORARILY DISABLED due to broken imports
// import { analyzeCompetitorReels } from './content/analyzeCompetitorReels'
// import { extractTopContent } from './content/extractTopContent'
// import { findCompetitors } from './content/findCompetitors'
// import { generateContentScripts } from './content/generateContentScripts'
// import { generateDetailedScript } from './content/generateDetailedScript'
// import { generateScenarioClips } from './content/generateScenarioClips'
// import { instagramScraperV2 } from './instagram/instagramScraper-v2'
// import { instagramReelsTest as instagramScraperV2Simple } from './instagram/instagramScraper-v2-simple'
import {
  criticalErrorMonitor,
  healthCheck,
} from './monitoring/criticalErrorMonitor'
import { logMonitor, triggerLogMonitor } from './monitoring/logMonitor'
import { generateModelTraining } from './training/generateModelTraining'
// TEMPORARILY DISABLED due to broken imports
// import { modelTrainingV2 } from './training/modelTrainingV2'
// import { morphImages } from './training/morphImages'
import { neuroImageGeneration } from './generation/neuroImageGeneration'
// TEMPORARILY DISABLED due to broken imports
// import { processPayment } from './payments/paymentProcessing'
import { broadcastMessage } from './broadcast/broadcastMessage'
import { aiReelsCallbackFunction } from './ai-reels-callback'
import { generateAIReelsFunction } from './existing/generateAIReelsFunction'
import { generateAdvancedLoopingVideoFunction } from './existing/generateAdvancedLoopingVideoFunction'
import { generateModelTrainingFunction } from './existing/generateModelTrainingFunction'
// TEMPORARILY DISABLED due to broken imports
// import { videoUploadHelper } from './video-upload-helper'
// import { wan25Helpers } from './wan25-helpers'

// Helper functions for all Inngest functions
export const getAllFunctions = () => {
  // Return array with all Inngest function exports, filtering out undefined
  const allFunctions = [
    // Content Functions - TEMPORARILY DISABLED
    // analyzeCompetitorReels,
    // extractTopContent,
    // findCompetitors,
    // generateContentScripts,
    // generateDetailedScript,
    // generateScenarioClips,
    // Instagram Functions - TEMPORARILY DISABLED
    // instagramScraperV2,
    // instagramScraperV2Simple,
    // Monitoring Functions
    criticalErrorMonitor,
    healthCheck,
    logMonitor,
    triggerLogMonitor,
    // Training Functions
    generateModelTraining,
    // TEMPORARILY DISABLED
    // modelTrainingV2,
    // morphImages,
    // Generation Functions
    neuroImageGeneration,
    // Payment Functions - TEMPORARILY DISABLED
    // processPayment,
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
    // Helper Functions - TEMPORARILY DISABLED
    // videoUploadHelper,
    // wan25Helpers,
  ]

  // Filter out undefined functions
  return allFunctions.filter(fn => fn !== undefined && fn !== null)
}

export const getFunctionById = (id: string) => {
  const all = getAllFunctions()
  return all.find((f: any) => f.id === id)
}

export const getFunctionsByCategory = (category: string) => {
  const all = getAllFunctions()
  return all.filter((f: any) => f.category === category)
}

export const getFunctionStats = () => {
  const all = getAllFunctions()
  const byCategory: Record<string, number> = {}

  all.forEach((f: any) => {
    const category = f.category || 'uncategorized'
    byCategory[category] = (byCategory[category] || 0) + 1
  })

  return {
    total: all.length,
    by_category: byCategory,
  }
}
