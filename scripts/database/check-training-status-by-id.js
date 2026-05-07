const { createClient } = require('@supabase/supabase-js')
require('dotenv').config()

const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
)

async function checkTrainingStatus() {
  console.log(
    '🔍 Checking training status for ID: bwx6erm255rm80ctsf39cxzgec\n'
  )

  const { data, error } = await supabase
    .from('model_trainings')
    .select('*')
    .eq('replicate_training_id', 'bwx6erm255rm80ctsf39cxzgec')
    .single()

  if (error) {
    console.error('❌ Error:', error.message)
    return
  }

  if (!data) {
    console.log('📭 No training record found for this ID')
    return
  }

  console.log('✅ Training Record Found:\n')
  console.log(`   Model Name: ${data.model_name}`)
  console.log(`   Status: ${data.status}`)
  console.log(`   Replicate ID: ${data.replicate_training_id}`)
  console.log(`   Created: ${new Date(data.created_at).toLocaleString()}`)
  console.log(
    `   Updated: ${data.updated_at ? new Date(data.updated_at).toLocaleString() : 'N/A'}`
  )
  console.log(`   Steps: ${data.steps}`)
  console.log(`   Trigger Word: ${data.trigger_word}`)
  console.log(`   Model URL: ${data.model_url || 'Not ready yet'}`)
  if (data.error) {
    console.log(`   ❌ Error: ${data.error}`)
  }

  // Проверяем время с момента создания
  const created = new Date(data.created_at)
  const now = new Date()
  const elapsed = Math.floor((now - created) / 1000 / 60) // минуты
  console.log(
    `\n⏱️  Elapsed time: ${elapsed} minutes (~${(elapsed / 60).toFixed(1)} hours)`
  )

  if (data.status === 'processing' && elapsed > 120) {
    console.log('⚠️  Training is taking longer than expected (2+ hours)')
  }
}

checkTrainingStatus()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Fatal error:', err)
    process.exit(1)
  })
