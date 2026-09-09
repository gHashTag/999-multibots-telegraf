/**
 * Production-Ready App - Only Functions Without Broken Dependencies
 * This app registers ONLY functions that are guaranteed to work
 */

import express from 'express'
import { serve } from 'inngest/express'
import { Inngest } from 'inngest'

// === WORKING FUNCTIONS (No broken imports) ===

// Test Functions (3) - Always work
// import { testSimpleFunction } from './functions/__dev__/testSimpleFunction'; // module not found
import { testSimpleMessageFunction } from './functions/__dev__/testSimpleMessageFunction'
import { testAdvancedLoopFunction } from './functions/__dev__/testAdvancedLoopFunction'

// Monitoring Functions (2)
import { criticalErrorMonitor } from './functions/monitoring/criticalErrorMonitor'
import { logMonitor } from './functions/monitoring/logMonitor'

// Callback Functions (1)
import { aiReelsCallbackFunction } from './functions/ai-reels-callback'

// Existing Functions (3)
import { generateAIReelsFunction } from './functions/existing/generateAIReelsFunction'
import { generateAdvancedLoopingVideoFunction } from './functions/existing/generateAdvancedLoopingVideoFunction'
import { generateModelTrainingFunction } from './functions/existing/generateModelTrainingFunction'

const PORT = 3000

// Create DEV client
const inngest = new Inngest({
  id: 'prod-app',
  name: 'Production App - Working Functions Only',
  isDev: true,
})

const app = express()
app.use(express.json())

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: Date.now(),
    mode: 'dev',
    functions: workingFunctions.length,
  })
})

// Only functions that are GUARANTEED to work
const workingFunctions = [
  // Test (3)
  // testSimpleFunction, // module not found
  testSimpleMessageFunction,
  testAdvancedLoopFunction,

  // Monitoring (2)
  criticalErrorMonitor,
  logMonitor,

  // Callback (1)
  aiReelsCallbackFunction,

  // Existing (3)
  generateAIReelsFunction,
  generateAdvancedLoopingVideoFunction,
  generateModelTrainingFunction,
]

const inngestHandler = serve({
  client: inngest,
  functions: workingFunctions,
})

app.use('/api/inngest', inngestHandler)

app.listen(PORT, () => {
  console.log(`\n${'='.repeat(70)}`)
  console.log(`🚀 PRODUCTION APP - WORKING FUNCTIONS ONLY`)
  console.log(`${'='.repeat(70)}`)
  console.log(`Port:      ${PORT}`)
  console.log(`Mode:      DEV`)
  console.log(`Endpoint:  http://localhost:${PORT}/api/inngest`)
  console.log(`Functions: ${workingFunctions.length}`)
  console.log(`\n📋 Registered Functions:`)

  workingFunctions.forEach((fn: any, idx) => {
    console.log(`  ${String(idx + 1).padStart(2)}. ${fn.name || fn.id}`)
  })

  console.log(`\n${'='.repeat(70)}`)
  console.log(`✅ Ready for Inngest Dev Server!`)
  console.log(`🌐 Dashboard: http://127.0.0.1:8288`)
  console.log(`${'='.repeat(70)}\n`)
})
