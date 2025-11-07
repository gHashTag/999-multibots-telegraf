#!/usr/bin/env tsx
import axios from 'axios'
import dotenv from 'dotenv'

dotenv.config()

const API_KEY = process.env.KIE_AI_API_KEY!
const BASE_URL = 'https://api.kie.ai/api/v1'

async function test() {
  console.log('🎬 Step 1: Creating Sora 2 task...\n')
  
  try {
    const createResponse = await axios.post(
      `${BASE_URL}/jobs/soraText2video`,
      {
        prompt: 'A beautiful sunset',
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
    
    console.log('Response:', JSON.stringify(createResponse.data, null, 2))
    console.log('\n✅ Task created successfully!')
    
    const taskId = createResponse.data.data?.taskId
    if (taskId) {
      console.log(`\nTaskID: ${taskId}`)
      console.log('\n📌 Now check Kie.ai dashboard or docs for correct status endpoint')
    }
    
  } catch (error: any) {
    console.error('❌ Error:', error.response?.data || error.message)
  }
}

test()
