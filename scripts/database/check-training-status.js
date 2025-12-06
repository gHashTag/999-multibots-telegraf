#!/usr/bin/env node
/**
 * Check model training status for user 500889584
 */

const { createClient } = require('@supabase/supabase-js')

// Load env from .env file
require('dotenv').config()

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
)

async function checkTrainingStatus() {
  console.log('🔍 Checking training status for user 500889584...\n')

  const { data, error } = await supabase
    .from('model_trainings')
    .select('*')
    .eq('telegram_id', '500889584')
    .order('created_at', { ascending: false })
    .limit(5)

  if (error) {
    console.error('❌ Error:', error)
    return
  }

  if (!data || data.length === 0) {
    console.log('📭 No training records found for user 500889584')
    return
  }

  console.log(`✅ Found ${data.length} training record(s):\n`)

  data.forEach((training, index) => {
    console.log(`\n📦 Training #${index + 1}:`)
    console.log(`   Model Name: ${training.model_name}`)
    console.log(`   Status: ${training.status}`)
    console.log(`   Replicate ID: ${training.replicate_training_id || 'N/A'}`)
    console.log(`   Created: ${new Date(training.created_at).toLocaleString()}`)
    console.log(`   Steps: ${training.steps}`)
    console.log(`   Gender: ${training.gender}`)
    console.log(`   Model URL: ${training.model_url || 'Not ready yet'}`)
    if (training.error) {
      console.log(`   ❌ Error: ${training.error}`)
    }
  })
}

checkTrainingStatus()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Fatal error:', err)
    process.exit(1)
  })
