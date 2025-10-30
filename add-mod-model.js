#!/usr/bin/env node
/**
 * Add 'mod' model for user 404348060
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const MODEL_URL = 'ghashtag/mod:a4089d204bb2b65b662ecb096405426a80a2110c1e08aa70a65bb08e8f04e623';

async function addModel() {
  console.log('📦 Adding "mod" model for user 404348060...\n');

  // Insert model training record
  const { data, error } = await supabase
    .from('model_trainings')
    .insert({
      telegram_id: '404348060',
      model_name: 'mod',
      trigger_word: 'TOK', // Default trigger word
      model_url: MODEL_URL,
      zip_url: 'https://manual-upload', // Required field
      status: 'SUCCESS',
      result: 'SUCCESS',
      api: 'replicate',
      bot_name: 'AI_STARS_bot', // Default bot (can be updated if user specifies)
      replicate_training_id: 'manual-mod-404348060',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .select();

  if (error) {
    console.error('❌ Error:', error.message);
    return;
  }

  console.log('✅ Model added successfully!');
  console.log('  User: 404348060');
  console.log('  Model: mod');
  console.log('  URL:', MODEL_URL);
  console.log('  Trigger: TOK');
  console.log('  Bot: AI_STARS_bot (можно изменить если нужен другой бот)');
}

addModel().then(() => process.exit(0));
