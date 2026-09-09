/**
 * Minimal Test App for Inngest MCP Testing
 * Registers only working functions without external dependencies
 */

import express from 'express'
import { serve } from 'inngest/express'
import { Inngest } from 'inngest'

// Import only working test functions
import { testSimpleFunction } from './functions/__dev__/testSimpleFunction'
import { testSimpleMessageFunction } from './functions/__dev__/testSimpleMessageFunction'
import { testAdvancedLoopFunction } from './functions/__dev__/testAdvancedLoopFunction'

const PORT = 3000

// Create DEV client for local testing
const inngest = new Inngest({
  id: 'test-app',
  name: 'Test App for MCP',
  isDev: true, // CRITICAL: Enable dev mode
})

const app = express()

app.use(express.json())

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: Date.now(), mode: 'dev' })
})

// Register Inngest functions
const testFunctions = [
  testSimpleFunction,
  testSimpleMessageFunction,
  testAdvancedLoopFunction,
]

const inngestHandler = serve({
  client: inngest,
  functions: testFunctions,
})

app.use('/api/inngest', inngestHandler)

app.listen(PORT, () => {
  console.log(`[TEST APP] Server started on port ${PORT}`)
  console.log(`[TEST APP] Mode: DEV`)
  console.log(
    `[TEST APP] Inngest endpoint: http://localhost:${PORT}/api/inngest`
  )
  console.log(`[TEST APP] Registered functions: ${testFunctions.length}`)
  testFunctions.forEach((fn: any) => {
    console.log(`  - ${fn.name || fn.id}`)
  })
  console.log(`[TEST APP] Ready to receive events!`)
})
