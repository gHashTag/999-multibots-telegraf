#!/usr/bin/env tsx
import axios from 'axios'
import dotenv from 'dotenv'

dotenv.config()

const API_KEY = process.env.KIE_AI_API_KEY!
const BASE_URL = 'https://api.kie.ai/api/v1'
const TEST_TASK_ID = '1a5ae90964526d61687678b07abb4d6f' // Latest task from user

async function testEndpoints() {
  console.log('🧪 Testing Sora status endpoints with existing taskId:\n')
  console.log(`TaskID: ${TEST_TASK_ID}\n`)
  
  const endpoints = [
    `/jobs/taskStatus`,
    `/jobs/soraStatus`, 
    `/sora/taskStatus`,
    `/soraText2video/taskStatus`,
    `/v1/jobs/taskStatus`
  ]
  
  for (const endpoint of endpoints) {
    try {
      const url = endpoint.startsWith('/v1/') 
        ? `https://api.kie.ai/api${endpoint}`
        : `${BASE_URL}${endpoint}`
        
      console.log(`Trying: ${url}`)
      const response = await axios.get(url, {
        params: { taskId: TEST_TASK_ID },
        headers: {
          'Authorization': `Bearer ${API_KEY}`,
          'Content-Type': 'application/json'
        },
        timeout: 10000
      })
      
      console.log(`✅ SUCCESS: code=${response.data.code}, status=${response.data.data?.status}\n`)
    } catch (error: any) {
      const status = error.response?.status || 'unknown'
      const message = error.response?.data?.msg || error.message
      console.log(`❌ FAILED: ${status} - ${message}\n`)
    }
  }
}

testEndpoints()
