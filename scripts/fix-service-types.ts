import { supabase } from '@/core/supabase/client'

/**
 * Universal fixer for service_type field.
 * - Finds ALL transactions with service_type NULL or 'unknown' (status COMPLETED)
 * - Tries to infer proper service_type from description
 * - Updates the record
 */
async function inferServiceType(description: string): Promise<string> {
  const desc = description.toLowerCase()

  if (desc.includes('video generation')) {
    if (desc.includes('kling')) return 'kling_video'
    if (desc.includes('minimax')) return 'minimax_video'
    if (desc.includes('haiper')) return 'haiper_video'
    if (desc.includes('runway')) return 'runway_video'
    if (desc.includes('luma')) return 'luma_video'
    return 'video_generation'
  }

  if (desc.includes('image') || desc.includes('изображение'))
    return 'image_generation'
  if (desc.includes('text') || desc.includes('текст')) return 'text_processing'
  if (desc.includes('voice') || desc.includes('голос'))
    return 'voice_processing'

  return 'unknown'
}

export async function fixServiceTypes() {
  console.log('🔧 Scanning payments_v2 for NULL or unknown service_type...')

  const { data: badTxs, error } = await supabase
    .from('payments_v2')
    .select('id, description, service_type')
    .eq('status', 'COMPLETED')
    .or('service_type.is.null,service_type.eq.unknown')

  if (error) {
    console.error('❌ Error fetching transactions:', error)
    process.exit(1)
  }

  if (!badTxs || badTxs.length === 0) {
    console.log('✅ No transactions with NULL / unknown service_type found.')
    return
  }

  console.log(`📊 Found ${badTxs.length} problematic transactions.`)

  let updated = 0
  for (const tx of badTxs) {
    const newType = await inferServiceType(tx.description)
    if (tx.service_type === newType) continue

    const { error: updErr } = await supabase
      .from('payments_v2')
      .update({ service_type: newType })
      .eq('id', tx.id)

    if (updErr) {
      console.error(`   ⚠️  Failed to update id=${tx.id}:`, updErr.message)
    } else {
      updated++
    }
  }

  console.log(`\n✅ Updated ${updated} transactions.`)
}

// run directly
if (require.main === module) {
  fixServiceTypes().then(() => process.exit(0))
}
