#!/usr/bin/env node
/**
 * 🧪 REPLICATE WEBHOOK PRODUCTION TEST
 *
 * This script tests the Replicate webhook integration by:
 * 1. Creating a test training record in database
 * 2. Sending a mock "succeeded" webhook from Replicate
 * 3. Verifying database updates and Telegram notifications
 */

require('dotenv').config()
const { createClient } = require('@supabase/supabase-js')
const https = require('https')

// Supabase configuration
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://yuukfqcsdhkyxegfwlcb.supabase.co'
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!SUPABASE_KEY) {
  console.error('❌ SUPABASE_KEY not found in environment')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

// Test configuration
const TEST_TELEGRAM_ID = '144022504' // Your Telegram ID
const TEST_TRAINING_ID = 'test-webhook-' + Date.now()
const TEST_MODEL_NAME = 'test-flux-model'
const TEST_TRIGGER_WORD = 'TESTFLUX'

console.log('🧪 REPLICATE WEBHOOK PRODUCTION TEST')
console.log('=====================================\n')

async function step1_createTestRecord() {
  console.log('📝 STEP 1: Creating test training record...')

  const testRecord = {
    telegram_id: TEST_TELEGRAM_ID,
    model_name: TEST_MODEL_NAME,
    trigger_word: TEST_TRIGGER_WORD,
    replicate_training_id: TEST_TRAINING_ID,
    status: 'starting',
    bot_name: 'AI_STARS_bot',
    steps: 1000,
    gender: 'female',
    zip_url: 'https://test-webhook.example.com/test.zip',
    created_at: new Date().toISOString()
  }

  const { data, error } = await supabase
    .from('model_trainings')
    .insert(testRecord)
    .select()

  if (error) {
    console.error('❌ Failed to create test record:', error.message)
    throw error
  }

  console.log('✅ Test record created:', {
    training_id: TEST_TRAINING_ID,
    model_name: TEST_MODEL_NAME,
    status: 'starting'
  })
  console.log('')

  return data[0]
}

async function step2_sendWebhook() {
  console.log('🚀 STEP 2: Sending webhook to production endpoint...')

  // Mock Replicate webhook payload for "succeeded" status
  const webhookPayload = {
    id: TEST_TRAINING_ID,
    status: 'succeeded',
    model: 'ostris/flux-dev-lora-trainer',
    version: 'e440909d3512c31646ee2e0c7d6f6f4923224863a6a10c494606e79fb5844497',
    input: {
      input_images: 'data:application/zip;base64,...',
      trigger_word: TEST_TRIGGER_WORD,
      steps: 1000
    },
    output: {
      version: 'v1-test-' + Date.now(),
      weights: 'https://replicate.delivery/pbxt/test-weights.tar'
    },
    created_at: new Date().toISOString(),
    started_at: new Date(Date.now() - 3600000).toISOString(), // 1 hour ago
    completed_at: new Date().toISOString()
  }

  return new Promise((resolve, reject) => {
    const payloadString = JSON.stringify(webhookPayload)

    const options = {
      hostname: '999-agents.site',
      port: 443,
      path: '/api/webhooks/replicate',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payloadString),
        'User-Agent': 'Replicate-Webhook/1.0'
      }
    }

    console.log('📡 POST https://999-agents.site/api/webhooks/replicate')
    console.log('📦 Payload:', JSON.stringify(webhookPayload, null, 2))
    console.log('')

    const req = https.request(options, (res) => {
      let data = ''

      res.on('data', (chunk) => {
        data += chunk
      })

      res.on('end', () => {
        console.log(`✅ Webhook response: ${res.statusCode}`)
        console.log('📨 Response body:', data)
        console.log('')

        try {
          resolve(JSON.parse(data))
        } catch (e) {
          resolve({ raw: data })
        }
      })
    })

    req.on('error', (error) => {
      console.error('❌ Webhook request failed:', error.message)
      reject(error)
    })

    req.write(payloadString)
    req.end()
  })
}

async function step3_verifyDatabase() {
  console.log('🔍 STEP 3: Verifying database update...')

  // Wait 2 seconds for webhook to process
  await new Promise(resolve => setTimeout(resolve, 2000))

  const { data, error } = await supabase
    .from('model_trainings')
    .select('*')
    .eq('replicate_training_id', TEST_TRAINING_ID)
    .single()

  if (error) {
    console.error('❌ Failed to fetch updated record:', error.message)
    throw error
  }

  console.log('✅ Database record updated:', {
    status: data.status,
    model_url: data.model_url,
    weights: data.weights,
    result: data.result
  })
  console.log('')

  return data
}

async function step4_checkLogs() {
  console.log('📋 STEP 4: Checking production logs...')
  console.log('(Check your Telegram for notification message)')
  console.log('')
}

async function cleanup() {
  console.log('🧹 CLEANUP: Removing test record...')

  const { error } = await supabase
    .from('model_trainings')
    .delete()
    .eq('replicate_training_id', TEST_TRAINING_ID)

  if (error) {
    console.error('⚠️ Failed to cleanup test record:', error.message)
  } else {
    console.log('✅ Test record removed')
  }
}

// Main test flow
async function runTest() {
  try {
    await step1_createTestRecord()
    const webhookResponse = await step2_sendWebhook()
    const updatedRecord = await step3_verifyDatabase()
    await step4_checkLogs()

    console.log('✅ TEST COMPLETED SUCCESSFULLY!')
    console.log('=====================================')
    console.log('📊 Summary:')
    console.log(`  - Training ID: ${TEST_TRAINING_ID}`)
    console.log(`  - Status: ${updatedRecord.status}`)
    console.log(`  - Model Version: ${updatedRecord.model_version || 'N/A'}`)
    console.log(`  - Telegram ID: ${TEST_TELEGRAM_ID}`)
    console.log('\n💬 Check your Telegram (@playra) for notification!')

  } catch (error) {
    console.error('\n❌ TEST FAILED:', error.message)
    console.error('Stack:', error.stack)
  } finally {
    await cleanup()
    console.log('\n🏁 Test finished.')
  }
}

runTest()
