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

// Render Functions (complete module)
export * from './render'

// Existing Functions (already in telegraf)
export { generateAIReelsFunction } from './existing/generateAIReelsFunction'
export { generateAdvancedLoopingVideoFunction } from './existing/generateAdvancedLoopingVideoFunction'
export { generateModelTrainingFunction } from './existing/generateModelTrainingFunction'

// Test Functions (development and testing)
export { testSimpleFunction } from './test'

// Helper functions for all Inngest functions
export const getAllFunctions = () => [
  // Content functions
  analyzeCompetitorReelsFunction,
  extractTopContentFunction,
  findCompetitorsFunction,
  generateContentScriptsFunction,
  generateDetailedScriptFunction,
  generateScenarioClipsFunction,

  // Instagram functions
  instagramScraperV2Function,
  instagramScraperV2SimpleFunction,

  // Monitoring functions
  criticalErrorMonitorFunction,
  logMonitorFunction,

  // Training functions
  modelTrainingV2Function,
  morphImagesFunction,

  // Generation functions
  neuroImageGenerationFunction,

  // Payment functions
  paymentProcessingFunction,

  // Broadcast functions
  broadcastMessageFunction,

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
]
