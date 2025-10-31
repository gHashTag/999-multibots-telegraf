/**
 * Test Supabase Storage upload separately
 */

import { createClient } from '@supabase/supabase-js'
import { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } from '../src/config'

async function testSupabaseUpload() {
  console.log('🧪 Testing Supabase Storage upload...\n')

  console.log('📋 Configuration:')
  console.log('- Supabase URL:', SUPABASE_URL)
  console.log('- Service key present:', !!SUPABASE_SERVICE_ROLE_KEY)
  console.log()

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error('❌ Supabase credentials not set!')
    process.exit(1)
  }

  try {
    const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    // Create test audio buffer
    const testAudioBuffer = Buffer.from('test audio data')
    const fileName = `lipsync-audio/test/${Date.now()}.mp3`

    console.log('🚀 Uploading test file:', fileName)
    const startTime = Date.now()

    const { data: uploadData, error: uploadError } = await serviceClient.storage
      .from('images')
      .upload(fileName, testAudioBuffer, {
        contentType: 'audio/mpeg',
        upsert: false,
      })

    if (uploadError) {
      throw new Error(`Upload failed: ${uploadError.message}`)
    }

    const duration = Date.now() - startTime
    console.log(`✅ Upload successful! (${(duration / 1000).toFixed(2)}s)`)
    console.log('- Path:', uploadData.path)
    console.log()

    // Get public URL
    const { data: urlData } = serviceClient.storage
      .from('images')
      .getPublicUrl(fileName)

    console.log('🌐 Public URL:', urlData.publicUrl)
    console.log()

    // Clean up
    console.log('🧹 Cleaning up test file...')
    await serviceClient.storage.from('images').remove([fileName])
    console.log('✅ Cleanup complete')
    console.log()

    console.log('✅ Supabase Storage is working correctly!')
  } catch (error) {
    console.error('❌ Supabase Storage failed:')
    console.error(error)
    process.exit(1)
  }
}

testSupabaseUpload()
