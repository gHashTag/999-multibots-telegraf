#!/usr/bin/env node
/**
 * Fix GIMBA model status: succeeded → SUCCESS
 */

require('dotenv').config()
const { createClient } = require('@supabase/supabase-js')
const https = require('https')

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

const TRAINING_ID = 'htxjdzxvzhrme0ct2ym8th35jc'

async function fixStatus() {
  console.log('🔧 Fixing GIMBA model status...\n')

  // Update status from 'succeeded' to 'SUCCESS'
  const { data, error } = await supabase
    .from('model_trainings')
    .update({
      status: 'SUCCESS',
      result: 'SUCCESS',
      api: 'replicate'
    })
    .eq('replicate_training_id', TRAINING_ID)
    .select()

  if (error) {
    console.error('❌ Error updating status:', error.message)
    return
  }

  console.log('✅ Status updated successfully!')
  console.log(JSON.stringify(data[0], null, 2))
  console.log('')

  // Verify with getActiveUserModelsByType logic
  const { data: models } = await supabase
    .from('model_trainings')
    .select('*')
    .eq('telegram_id', 7912847443)
    .eq('status', 'SUCCESS')
    .eq('api', 'replicate')

  console.log(`\n✅ User 7912847443 now has ${models?.length || 0} active model(s):`)
  if (models && models.length > 0) {
    models.forEach(m => {
      console.log(`  - ${m.model_name} (${m.trigger_word}) - Status: ${m.status}`)
    })
  }
}

fixStatus().then(() => process.exit(0))
