#!/usr/bin/env node
/**
 * Add GIMBA model to user 7912847443 via webhook
 */

require('dotenv').config()
const { createClient } = require('@supabase/supabase-js')
const https = require('https')

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://yuukfqcsdhkyxegfwlcb.supabase.co'
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

const USER_ID = '7912847443'
const TRAINING_ID = 'htxjdzxvzhrme0ct2ym8th35jc'
const MODEL_NAME = 'gimba'
const TRIGGER_WORD = 'NEURO_SAGE'
const MODEL_VERSION = 'febfcf7ea0d1011d66badf8bc7599b19290cc4077b12e827c3aaf10dcd9f7c61'
const WEIGHTS_URL = `https://replicate.delivery/pbxt/gimba-${MODEL_VERSION}-weights.tar`

async function createTrainingRecord() {
  console.log('📝 Creating training record in database...\n')

  const trainingRecord = {
    telegram_id: USER_ID,
    model_name: MODEL_NAME,
    trigger_word: TRIGGER_WORD,
    replicate_training_id: TRAINING_ID,
    status: 'starting',
    bot_name: 'AI_STARS_bot',
    steps: 1000,
    gender: 'female',
    zip_url: 'https://replicate.training/htxjdzxvzhrme0ct2ym8th35jc/input.zip',
    created_at: new Date().toISOString()
  }

  const { data, error } = await supabase
    .from('model_trainings')
    .insert(trainingRecord)
    .select()

  if (error) {
    console.error('❌ Failed to create training record:', error.message)
    throw error
  }

  console.log('✅ Training record created:', {
    id: data[0].id,
    training_id: TRAINING_ID,
    user: USER_ID,
    model: MODEL_NAME
  })
  console.log('')

  return data[0]
}

async function sendWebhook() {
  console.log('🚀 Sending webhook to production endpoint...\n')

  const webhookPayload = {
    id: TRAINING_ID,
    status: 'succeeded',
    model: 'ostris/flux-dev-lora-trainer',
    version: 'e440909d3512c31646ee2e0c7d6f6f4923224863a6a10c494606e79fb5844497',
    input: {
      input_images: 'data:application/zip;base64,...',
      trigger_word: TRIGGER_WORD,
      steps: 1000
    },
    output: {
      version: MODEL_VERSION,
      weights: WEIGHTS_URL
    },
    created_at: '2025-10-24T19:18:45.000Z', // 02:18:45 GMT+7
    started_at: '2025-10-24T19:18:45.238Z',
    completed_at: '2025-10-24T19:44:32.338Z' // +25m 47.3s
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
    console.log('📦 Payload:')
    console.log(JSON.stringify(webhookPayload, null, 2))
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
          resolve({ raw: data, statusCode: res.statusCode })
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

async function verifyDatabase() {
  console.log('🔍 Verifying database update...\n')

  await new Promise(resolve => setTimeout(resolve, 2000))

  const { data, error } = await supabase
    .from('model_trainings')
    .select('*')
    .eq('replicate_training_id', TRAINING_ID)
    .single()

  if (error) {
    console.error('❌ Failed to fetch updated record:', error.message)
    throw error
  }

  console.log('✅ Database record updated:')
  console.log(JSON.stringify({
    status: data.status,
    model_url: data.model_url,
    weights: data.weights,
    result: data.result
  }, null, 2))
  console.log('')

  return data
}

async function main() {
  try {
    console.log('🎯 Adding GIMBA model to user 7912847443')
    console.log('=====================================\n')

    await createTrainingRecord()
    const webhookResponse = await sendWebhook()
    const updatedRecord = await verifyDatabase()

    console.log('✅ TASK COMPLETED SUCCESSFULLY!')
    console.log('=====================================')
    console.log('📊 Summary:')
    console.log(`  - User: ${USER_ID}`)
    console.log(`  - Model: ghashtag/${MODEL_NAME}`)
    console.log(`  - Trigger Word: ${TRIGGER_WORD}`)
    console.log(`  - Version: ${MODEL_VERSION}`)
    console.log(`  - Status: ${updatedRecord.status}`)
    console.log('\n💬 Check user Telegram for notification!')

  } catch (error) {
    console.error('\n❌ TASK FAILED:', error.message)
    console.error('Stack:', error.stack)
  }
}

main().then(() => process.exit(0))
