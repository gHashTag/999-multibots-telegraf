#!/usr/bin/env node

import axios from 'axios'

const SERVER_URL = 'https://ai-server-production-production-8e2d.up.railway.app'

async function testEndpoints() {
  console.log('🔍 Testing AI Server Endpoints...\n')
  
  const endpoints = [
    { method: 'GET', path: '/' },
    { method: 'GET', path: '/health' },
    { method: 'GET', path: '/api/test' },
    { method: 'POST', path: '/generate/text-to-video' },
    { method: 'POST', path: '/api/generate/text-to-video' },
    { method: 'POST', path: '/api/video/generate' },
    { method: 'POST', path: '/video/generate' },
    { method: 'POST', path: '/api/v1/text-to-video' },
    { method: 'POST', path: '/v1/text-to-video' },
    { method: 'POST', path: '/text-to-video' },
    { method: 'POST', path: '/generate-video' },
    { method: 'POST', path: '/api/generate-video' },
    { method: 'POST', path: '/kie/text-to-video' },
    { method: 'POST', path: '/api/kie/text-to-video' },
  ]
  
  for (const endpoint of endpoints) {
    try {
      const url = `${SERVER_URL}${endpoint.path}`
      
      const response = await axios({
        method: endpoint.method,
        url,
        headers: {
          'Content-Type': 'application/json',
        },
        data: endpoint.method === 'POST' ? {} : undefined,
        validateStatus: () => true, // Принимаем любые статусы
        timeout: 5000,
      })
      
      const status = response.status
      let statusEmoji = '❌'
      if (status === 200) statusEmoji = '✅'
      else if (status === 404) statusEmoji = '🚫'
      else if (status >= 400 && status < 500) statusEmoji = '⚠️'
      else if (status >= 500) statusEmoji = '💥'
      
      console.log(`${statusEmoji} ${endpoint.method} ${endpoint.path} - Status: ${status}`)
      
      // Если не 404, выводим дополнительную информацию
      if (status !== 404) {
        if (typeof response.data === 'object') {
          console.log(`   Response: ${JSON.stringify(response.data).substring(0, 100)}...`)
        } else {
          console.log(`   Response: ${String(response.data).substring(0, 100)}...`)
        }
      }
    } catch (error: any) {
      console.log(`💀 ${endpoint.method} ${endpoint.path} - Error: ${error.message}`)
    }
  }
  
  console.log('\n📝 Summary:')
  console.log('✅ = Success (200)')
  console.log('⚠️ = Client Error (4xx)')
  console.log('💥 = Server Error (5xx)')
  console.log('🚫 = Not Found (404)')
  console.log('💀 = Connection Error')
}

testEndpoints().catch(console.error)