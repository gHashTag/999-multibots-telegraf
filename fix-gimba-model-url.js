#!/usr/bin/env node
/**
 * Fix GIMBA model_url format: version → owner/name:version
 */

require('dotenv').config()
const { createClient } = require('@supabase/supabase-js')

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

const TRIGGER_WORD = 'NEURO_SAGE'
const MODEL_NAME = 'gimba'
const VERSION_HASH = 'febfcf7ea0d1011d66badf8bc7599b19290cc4077b12e827c3aaf10dcd9f7c61'
const CORRECT_MODEL_URL = `ghashtag/${MODEL_NAME}:${VERSION_HASH}`

async function fixModelUrl() {
  console.log('🔧 Исправление model_url для GIMBA модели...\n')

  // Update model_url format
  const { data, error } = await supabase
    .from('model_trainings')
    .update({
      model_url: CORRECT_MODEL_URL
    })
    .eq('trigger_word', TRIGGER_WORD)
    .eq('status', 'SUCCESS')
    .select()

  if (error) {
    console.error('❌ Ошибка обновления:', error.message)
    return
  }

  console.log('✅ model_url обновлен для записей:', data.length)
  data.forEach(record => {
    console.log(`  - Telegram ID: ${record.telegram_id}`)
    console.log(`    Model: ${record.model_name}`)
    console.log(`    Trigger: ${record.trigger_word}`)
    console.log(`    OLD URL: ${VERSION_HASH.substring(0, 20)}...`)
    console.log(`    NEW URL: ${CORRECT_MODEL_URL}`)
    console.log()
  })

  // Verify
  const { data: models } = await supabase
    .from('model_trainings')
    .select('telegram_id, model_name, trigger_word, model_url')
    .eq('trigger_word', TRIGGER_WORD)
    .eq('status', 'SUCCESS')

  console.log('\n✅ Проверка: GIMBA модели с правильным URL:')
  models.forEach(m => {
    console.log(`  - User ${m.telegram_id}: ${m.model_url}`)
  })
}

fixModelUrl().then(() => process.exit(0))
