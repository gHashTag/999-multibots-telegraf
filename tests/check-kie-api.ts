#!/usr/bin/env tsx
import axios from 'axios'
import dotenv from 'dotenv'

dotenv.config()

const API_KEY = process.env.KIE_AI_API_KEY!

async function checkAPI() {
  console.log('🔍 Checking Kie.ai API availability...\n')
  
  // Test Veo endpoint (should work)
  try {
    console.log('Testing Veo 3 endpoint...')
    const veoResponse = await axios.post(
      'https://api.kie.ai/api/v1/jobs/googleVeo3',
      {
        prompt: 'A cat',
        aspectRatio: '16:9',
        duration: 8
      },
      {
        headers: {
          'Authorization': `Bearer ${API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    )
    console.log('✅ Veo 3 works! TaskID:', veoResponse.data.data?.taskId, '\n')
  } catch (error: any) {
    console.log('❌ Veo 3 failed:', error.response?.status, error.response?.data?.error || error.message, '\n')
  }
  
  // Test Sora endpoints
  const soraEndpoints = [
    '/jobs/soraText2video',
    '/jobs/sora-text-to-video',
    '/sora/text2video',
    '/openai/sora'
  ]
  
  for (const endpoint of soraEndpoints) {
    try {
      console.log(`Testing: ${endpoint}`)
      const response = await axios.post(
        `https://api.kie.ai/api/v1${endpoint}`,
        {
          prompt: 'A cat',
          aspectRatio: 'portrait',
          duration: 10
        },
        {
          headers: {
            'Authorization': `Bearer ${API_KEY}`,
            'Content-Type': 'application/json'
          }
        }
      )
      console.log(`✅ WORKS! TaskID: ${response.data.data?.taskId}\n`)
    } catch (error: any) {
      console.log(`❌ ${error.response?.status || 'ERROR'}: ${error.response?.data?.error || error.message}\n`)
    }
  }
}

checkAPI()
