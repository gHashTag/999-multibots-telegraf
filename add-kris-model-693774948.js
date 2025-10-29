#!/usr/bin/env node
require('dotenv').config()
const { createClient } = require('@supabase/supabase-js')

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://yuukfqcsdhkyxegfwlcb.supabase.co'
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

const TRAINING_DATA = {
  telegram_id: '693774948',
  model_name: 'kris',
  trigger_word: 'KRIS',
  zip_url: 'manual-upload',  // Required field
  replicate_training_id: 'kris-training-693774948',
  status: 'SUCCESS',
  result: 'SUCCESS',
  model_url: 'ghashtag/kris:82a5773f76ee200d067f932b8ad88a9d64e018894296a1610465fd0441ec476e',
  api: 'replicate',
  bot_name: 'AI_STARS_bot',
  steps: 1000,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString()
}

async function main() {
  console.log('Creating training record for user 693774948...')
  
  const { data, error } = await supabase
    .from('model_trainings')
    .insert(TRAINING_DATA)
    .select()

  if (error) {
    console.error('Error:', error.message)
    process.exit(1)
  }

  console.log('Success!')
  console.log('Model name: kris')
  console.log('Trigger word: KRIS')
  console.log('Model URL:', data[0].model_url)
  console.log('\nUser 693774948 can now use this model in Neurophoto!')
}

main().then(() => process.exit(0))
