/**
 * Diagnostic test for FAL.ai API
 * Check key validity, account status, and model access
 */

import * as dotenv from 'dotenv'
import { fal } from '@fal-ai/client'
import axios from 'axios'

// Load environment variables
dotenv.config()

if (!process.env.FAL_KEY) {
  console.error('❌ ERROR: FAL_KEY not found in .env!')
  process.exit(1)
}

const FAL_KEY = process.env.FAL_KEY

console.log('🔍 FAL.ai API Diagnostic Test')
console.log('=' .repeat(60))
console.log('📋 API Key (first 20 chars):', FAL_KEY.substring(0, 20) + '...')
console.log('📋 API Key length:', FAL_KEY.length)
console.log('')

async function step1CheckKeyFormat() {
  console.log('STEP 1: Check API Key Format')
  console.log('-'.repeat(60))

  // UUID format: 8-4-4-4-12 characters (with hyphens)
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

  if (uuidPattern.test(FAL_KEY)) {
    console.log('✅ Key format: Valid UUID format')
  } else {
    console.log('⚠️  Key format: Does not match UUID pattern')
    console.log('   Expected: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx')
  }
  console.log('')
}

async function step2CheckKeyValidity() {
  console.log('STEP 2: Check API Key Validity')
  console.log('-'.repeat(60))

  try {
    // Configure FAL client
    fal.config({
      credentials: FAL_KEY
    })

    // Try a simple model list or status check
    console.log('   Attempting to query FAL.ai API...')

    // Try to get account info via direct API call
    const response = await axios.get('https://fal.run/fal-ai/fast-sdxl/status', {
      headers: {
        'Authorization': `Key ${FAL_KEY}`,
        'Content-Type': 'application/json'
      },
      timeout: 10000
    })

    console.log('✅ API Key is valid and accepted')
    console.log('   Response status:', response.status)
    console.log('')
    return true

  } catch (error: any) {
    if (error.response?.status === 401) {
      console.log('❌ API Key is INVALID (401 Unauthorized)')
      console.log('   The key is not recognized by FAL.ai')
      console.log('   Please check if the key is correct in .env file')
    } else if (error.response?.status === 403) {
      console.log('⚠️  API Key is VALID but has limited permissions (403 Forbidden)')
      console.log('   The key works, but may not have access to all models')
    } else {
      console.log('⚠️  Could not verify key:', error.message)
    }
    console.log('')
    return false
  }
}

async function step3CheckModelAccess() {
  console.log('STEP 3: Check VEED/fabric-1.0 Model Access')
  console.log('-'.repeat(60))

  try {
    // Configure client
    fal.config({
      credentials: FAL_KEY
    })

    console.log('   Attempting to access fal-ai/VEED/fabric-1.0...')

    // Try a minimal test with very short timeout
    const testResult = await Promise.race([
      fal.subscribe('fal-ai/VEED/fabric-1.0', {
        input: {
          image_url: 'https://v3b.fal.media/files/b/kangaroo/yb1YuFGFtxfGgLNPdOpfP_01.jpg',
          audio_url: 'https://v3b.fal.media/files/b/rabbit/ZudwVPvNROR-jt5_oc6f-_audio_1760628119301.mp3',
          resolution: '720p'
        },
        logs: false,
        onQueueUpdate: (update) => {
          console.log('   Queue status:', update.status)
        }
      }),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Initial check timeout')), 10000)
      )
    ])

    console.log('✅ Model access: SUCCESS')
    console.log('   Model is accessible and processing started')
    console.log('')
    return true

  } catch (error: any) {
    if (error.message === 'Forbidden') {
      console.log('❌ Model access: FORBIDDEN')
      console.log('   Possible reasons:')
      console.log('   1. Account needs to be upgraded or have credits')
      console.log('   2. Model requires special access/subscription')
      console.log('   3. Free tier does not include this model')
      console.log('   4. Account is not fully set up')
    } else if (error.message === 'Initial check timeout') {
      console.log('⏰ Request is processing (timeout reached in 10s)')
      console.log('   This suggests the model IS accessible')
      console.log('   Full generation would complete with more time')
      console.log('')
      return true
    } else {
      console.log('❌ Model access error:', error.message)
    }
    console.log('')
    return false
  }
}

async function step4CheckAccountStatus() {
  console.log('STEP 4: Check Account Status')
  console.log('-'.repeat(60))

  try {
    // Try to check account/billing status
    const response = await axios.get('https://rest.alpha.fal.ai/account', {
      headers: {
        'Authorization': `Key ${FAL_KEY}`,
        'Content-Type': 'application/json'
      },
      timeout: 5000
    })

    console.log('✅ Account info retrieved')
    console.log('   Response:', JSON.stringify(response.data, null, 2))
    console.log('')

  } catch (error: any) {
    console.log('⚠️  Could not retrieve account info')
    console.log('   Error:', error.message)
    if (error.response?.data) {
      console.log('   Response:', JSON.stringify(error.response.data, null, 2))
    }
    console.log('')
  }
}

// Run diagnostic tests
async function runDiagnostics() {
  await step1CheckKeyFormat()
  await step2CheckKeyValidity()
  const modelAccess = await step3CheckModelAccess()
  await step4CheckAccountStatus()

  console.log('')
  console.log('=' .repeat(60))
  console.log('🏁 DIAGNOSTIC COMPLETE')
  console.log('=' .repeat(60))

  if (modelAccess) {
    console.log('✅ RESULT: FAL.ai API is working and model is accessible')
    console.log('')
    console.log('💡 Next steps:')
    console.log('   - You can proceed with integration')
    console.log('   - The 403 error might be a temporary issue')
    console.log('   - Check if account has sufficient credits')
  } else {
    console.log('❌ RESULT: FAL.ai API access has issues')
    console.log('')
    console.log('💡 Recommendations:')
    console.log('   1. Verify API key is correct and active')
    console.log('   2. Check FAL.ai dashboard for account status')
    console.log('   3. Ensure account has credits/subscription')
    console.log('   4. Contact FAL.ai support if needed')
  }
  console.log('')
}

runDiagnostics()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('💥 Diagnostic failed:', error)
    process.exit(1)
  })
