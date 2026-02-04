/**
 * Master Index - All Inngest Functions
 * Complete migration from ai-server
 * Fully isolated, no external dependencies
 */

// Content Functions
export { analyzeCompetitorReels } from './content/analyzeCompetitorReels'
export { extractTopContent } from './content/extractTopContent'
export { findCompetitors } from './content/findCompetitors'
export { generateContentScripts as generateContentScriptsFunction } from './content/generateContentScripts'
// TODO: Fix TypeScript errors in these modules
// export { generateDetailedScript as generateDetailedScriptFunction } from './content/generateDetailedScript'
// export { generateScenarioClips as generateScenarioClipsFunction } from './content/generateScenarioClips'

// Instagram Functions - temporarily disabled due to TypeScript errors
// export { instagramScraperV2 as instagramScraperV2Function } from './instagram/instagramScraper-v2'
// export { instagramScraperV2Simple as instagramScraperV2SimpleFunction } from './instagram/instagramScraper-v2-simple'

// Monitoring Functions - temporarily disabled due to TypeScript errors
// export { criticalErrorMonitor as criticalErrorMonitorFunction } from './monitoring/criticalErrorMonitor'
// export { logMonitor as logMonitorFunction } from './monitoring/logMonitor'

// Training Functions
// export { modelTrainingV2 as modelTrainingV2Function } from './training/modelTrainingV2'
export { morphImagesFunction } from './training/morphImages'
import { morphImagesFunction } from './training/morphImages'

// Generation Functions - temporarily disabled
// export { neuroImageGeneration as neuroImageGenerationFunction } from './generation/neuroImageGeneration'

// Payment Functions - temporarily disabled
// export { processPayment as paymentProcessingFunction } from './payments/paymentProcessing'

// Broadcast Functions
export { broadcastMessage as broadcastMessageFunction } from './broadcast/broadcastMessage'

// Callback Functions
export { aiReelsCallbackFunction } from './ai-reels-callback'

// Render Functions - temporarily disabled due to TypeScript errors
// export * from './render'

// Existing Functions - temporarily disabled
// export { createGenerateAIReelsFunction as generateAIReelsFunction } from './existing/generateAIReelsFunction'
export { generateAdvancedLoopingVideo as generateAdvancedLoopingVideoFunction } from './existing/generateAdvancedLoopingVideoFunction'
export { generateModelTraining as generateModelTrainingFunction } from './generateModelTraining'

// Test Functions
export { testSimpleFunction } from './testSimpleFunction'
export { testSimpleMessageFunction } from './testSimpleMessageFunction'
export { testAdvancedLoopFunction } from './testAdvancedLoopFunction'

// Helper functions for all Inngest functions - simplified version
import { analyzeCompetitorReels } from './content/analyzeCompetitorReels'
import { extractTopContent } from './content/extractTopContent'
import { findCompetitors } from './content/findCompetitors'
import { generateContentScripts } from './content/generateContentScripts'
import { broadcastMessage } from './broadcast/broadcastMessage'
import { aiReelsCallbackFunction } from './ai-reels-callback'
import { generateAdvancedLoopingVideo } from './existing/generateAdvancedLoopingVideoFunction'
import { generateModelTraining } from './generateModelTraining'
import { testSimpleFunction } from './testSimpleFunction'
import { testSimpleMessageFunction } from './testSimpleMessageFunction'
import { testAdvancedLoopFunction } from './testAdvancedLoopFunction'

export const getAllFunctions = () => [
  analyzeCompetitorReels,
  extractTopContent,
  findCompetitors,
  generateContentScripts,
  morphImagesFunction,
  broadcastMessage,
  aiReelsCallbackFunction,
  generateAdvancedLoopingVideo,
  generateModelTraining,
  testSimpleFunction,
  testSimpleMessageFunction,
  testAdvancedLoopFunction,
]

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
