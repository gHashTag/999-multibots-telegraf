#!/usr/bin/env node
/**
 * Find GIMBA model training and add it to user 7912847443
 */

require('dotenv').config()
const { createClient } = require('@supabase/supabase-js')

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://yuukfqcsdhkyxegfwlcb.supabase.co'
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

const TARGET_USER_ID = '7912847443'

async function findGimbaTraining() {
  console.log('🔍 Searching for ALL model trainings in database...\n')

  const { data: trainings, error } = await supabase
    .from('model_trainings')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(100)

  if (error) {
    console.error('❌ Error searching database:', error.message)
    return
  }

  if (!trainings || trainings.length === 0) {
    console.log('⚠️ No trainings found in last 24 hours')
    return
  }

  console.log(`✅ Found ${trainings.length} training(s) in last 24 hours:\n`)

  trainings.forEach((training, index) => {
    console.log(`📦 Training #${index + 1}:`)
    console.log(`  ID: ${training.id}`)
    console.log(`  Replicate Training ID: ${training.replicate_training_id}`)
    console.log(`  Model Name: ${training.model_name}`)
    console.log(`  Trigger Word: ${training.trigger_word}`)
    console.log(`  Status: ${training.status}`)
    console.log(`  Telegram ID: ${training.telegram_id}`)
    console.log(`  Created: ${training.created_at}`)
    console.log(`  Model URL: ${training.model_url}`)
    console.log(`  Weights: ${training.weights}`)
    console.log(`  Bot: ${training.bot_name}`)
    console.log('')
  })

  // Get the most recent successful training
  const successfulTraining = trainings.find(t => t.status === 'succeeded' || t.status === 'processing')

  if (!successfulTraining) {
    console.log('⚠️ No successful GIMBA training found')
    return successfulTraining || trainings[0]
  }

  console.log('🎯 Using this training for webhook:', successfulTraining.replicate_training_id)
  return successfulTraining
}

async function main() {
  const training = await findGimbaTraining()

  if (!training) {
    console.log('\n❌ No GIMBA training found')
    process.exit(1)
  }

  console.log('\n📋 Next steps:')
  console.log(`1. Use training ID: ${training.replicate_training_id}`)
  console.log(`2. Create model training record for user ${TARGET_USER_ID}`)
  console.log(`3. Send webhook notification about completed training`)
  console.log(`\n💡 Model details:`)
  console.log(`  - Model Name: ${training.model_name}`)
  console.log(`  - Trigger Word: ${training.trigger_word}`)
  console.log(`  - Weights URL: ${training.weights}`)
}

main().then(() => process.exit(0))
