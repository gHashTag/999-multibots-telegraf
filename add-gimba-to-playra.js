#!/usr/bin/env node
/**
 * Add GIMBA model to playra (144022504)
 */

require('dotenv').config()
const { createClient } = require('@supabase/supabase-js')

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

const USER_ID = '144022504'
const TRAINING_ID = 'htxjdzxvzhrme0ct2ym8th35jc-playra'
const MODEL_NAME = 'gimba'
const TRIGGER_WORD = 'NEURO_SAGE'
const MODEL_VERSION = 'febfcf7ea0d1011d66badf8bc7599b19290cc4077b12e827c3aaf10dcd9f7c61'
const WEIGHTS_URL = `https://replicate.delivery/pbxt/gimba-${MODEL_VERSION}-weights.tar`

async function addModel() {
  console.log('📦 Adding GIMBA model to playra (144022504)...\n')

  const trainingRecord = {
    telegram_id: parseInt(USER_ID),
    model_name: MODEL_NAME,
    trigger_word: TRIGGER_WORD,
    replicate_training_id: TRAINING_ID,
    status: 'SUCCESS',
    result: 'SUCCESS',
    api: 'replicate',
    bot_name: 'AI_STARS_bot',
    steps: 1000,
    gender: 'female',
    zip_url: 'https://replicate.training/htxjdzxvzhrme0ct2ym8th35jc/input.zip',
    model_url: MODEL_VERSION,
    weights: WEIGHTS_URL,
    created_at: new Date().toISOString()
  }

  const { data, error } = await supabase
    .from('model_trainings')
    .insert(trainingRecord)
    .select()

  if (error) {
    console.error('❌ Error creating record:', error.message)
    return
  }

  console.log('✅ Model added successfully!')
  console.log(JSON.stringify(data[0], null, 2))

  // Verify
  const { data: models } = await supabase
    .from('model_trainings')
    .select('*')
    .eq('telegram_id', parseInt(USER_ID))
    .eq('status', 'SUCCESS')
    .eq('api', 'replicate')

  console.log(`\n✅ User ${USER_ID} now has ${models?.length || 0} active model(s):`)
  if (models && models.length > 0) {
    models.forEach(m => {
      console.log(`  - ${m.model_name} (${m.trigger_word}) - Status: ${m.status}`)
    })
  }
}

addModel().then(() => process.exit(0))
