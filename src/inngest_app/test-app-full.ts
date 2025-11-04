/**
 * Full Test App - ALL Working Inngest Functions
 * Registers all functions that don't have broken dependencies
 */

import express from 'express';
import { serve } from 'inngest/express';
import { Inngest } from 'inngest';

// Test Functions (always work)
import { testSimpleFunction } from './functions/testSimpleFunction';
import { testSimpleMessageFunction } from './functions/testSimpleMessageFunction';
import { testAdvancedLoopFunction } from './functions/testAdvancedLoopFunction';

// Monitoring Functions
import { criticalErrorMonitorFunction } from './functions/monitoring/criticalErrorMonitor';
import { logMonitorFunction } from './functions/monitoring/logMonitor';

// Generation Functions
import { neuroImageGenerationFunction } from './functions/generation/neuroImageGeneration';

// Payment Functions
import { paymentProcessingFunction } from './functions/payments/paymentProcessing';

// Broadcast Functions
import { broadcastMessageFunction } from './functions/broadcast/broadcastMessage';

// Callback Functions
import { aiReelsCallbackFunction } from './functions/ai-reels-callback';

// Render Functions
import { renderFunction, renderAvatarVideoFunction, renderRiddleFunction } from './functions/render';

// Training Functions
import { modelTrainingV2Function } from './functions/training/modelTrainingV2';
// morphImagesFunction has broken imports

// Existing Functions
import { generateAIReelsFunction } from './functions/existing/generateAIReelsFunction';
import { generateAdvancedLoopingVideoFunction } from './functions/existing/generateAdvancedLoopingVideoFunction';
import { generateModelTrainingFunction } from './functions/existing/generateModelTrainingFunction';

// Helper Functions
import { videoUploadHelper } from './functions/video-upload-helper';
import { wan25Helpers } from './functions/wan25-helpers';

// Content Functions - excluding ones with broken imports
import { extractTopContentFunction } from './functions/content/extractTopContent';
import { generateContentScriptsFunction } from './functions/content/generateContentScripts';
import { generateDetailedScriptFunction } from './functions/content/generateDetailedScript';
import { generateScenarioClipsFunction } from './functions/content/generateScenarioClips';
// analyzeCompetitorReelsFunction has broken imports
// findCompetitorsFunction has broken imports

// Instagram Functions
import { instagramScraperV2SimpleFunction } from './functions/instagram/instagramScraper-v2-simple';
// instagramScraperV2Function has broken imports

const PORT = 3000;

// Create DEV client
const inngest = new Inngest({
  id: 'full-test-app',
  name: 'Full Test App - All Functions',
  isDev: true,
});

const app = express();
app.use(express.json());

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: Date.now(),
    mode: 'dev',
    functions: allFunctions.length
  });
});

// Register ALL working functions
const allFunctions = [
  // Test (3)
  testSimpleFunction,
  testSimpleMessageFunction,
  testAdvancedLoopFunction,

  // Monitoring (2)
  criticalErrorMonitorFunction,
  logMonitorFunction,

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

  // Training (1)
  modelTrainingV2Function,

  // Existing (3)
  generateAIReelsFunction,
  generateAdvancedLoopingVideoFunction,
  generateModelTrainingFunction,

  // Helper (2)
  videoUploadHelper,
  wan25Helpers,

  // Content (4)
  extractTopContentFunction,
  generateContentScriptsFunction,
  generateDetailedScriptFunction,
  generateScenarioClipsFunction,

  // Instagram (1)
  instagramScraperV2SimpleFunction,
];

const inngestHandler = serve({
  client: inngest,
  functions: allFunctions,
});

app.use('/api/inngest', inngestHandler);

app.listen(PORT, () => {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`🚀 FULL TEST APP STARTED`);
  console.log(`${'='.repeat(60)}`);
  console.log(`Port: ${PORT}`);
  console.log(`Mode: DEV`);
  console.log(`Endpoint: http://localhost:${PORT}/api/inngest`);
  console.log(`Functions: ${allFunctions.length}`);
  console.log(`\n📋 Registered Functions:`);

  allFunctions.forEach((fn: any, idx) => {
    console.log(`  ${idx + 1}. ${fn.name || fn.id}`);
  });

  console.log(`\n${'='.repeat(60)}`);
  console.log(`✅ Ready to receive events!`);
  console.log(`🌐 Dashboard: http://127.0.0.1:8288`);
  console.log(`${'='.repeat(60)}\n`);
});
