#!/usr/bin/env node

const axios = require('axios');
require('dotenv').config();

const API_URL = process.env.API_SERVER_URL || 'https://ai-server-production-production-8e2d.up.railway.app';
const SECRET_KEY = process.env.API_SECRET_KEY || 'your-secret-key';

async function testAvailableEndpoints() {
  console.log('🔍 Testing available server endpoints...\n');
  
  const endpoints = [
    { method: 'GET', path: '/' },
    { method: 'GET', path: '/health' },
    { method: 'GET', path: '/api' },
    { method: 'POST', path: '/generate/text-to-video' },
    { method: 'POST', path: '/generate/veo3-video' },
    { method: 'GET', path: '/generate/text-to-video/status/test' },
    { method: 'GET', path: '/generate/veo3-video/status/test' },
    { method: 'GET', path: '/status/test' },
    { method: 'GET', path: '/video/status/test' },
  ];
  
  for (const endpoint of endpoints) {
    try {
      const config = {
        headers: {
          'x-secret-key': SECRET_KEY,
          'Content-Type': 'application/json'
        },
        validateStatus: () => true // Don't throw on any status
      };
      
      let response;
      if (endpoint.method === 'GET') {
        response = await axios.get(`${API_URL}${endpoint.path}`, config);
      } else {
        response = await axios.post(`${API_URL}${endpoint.path}`, {}, config);
      }
      
      const status = response.status;
      const statusText = 
        status === 200 ? '✅' :
        status === 404 ? '❌' :
        status === 401 ? '🔒' :
        status === 500 ? '💥' :
        '⚠️';
      
      console.log(`${statusText} ${endpoint.method} ${endpoint.path} -> ${status}`);
      
      // If successful, show some response info
      if (status === 200) {
        const data = response.data;
        if (typeof data === 'object') {
          console.log(`   Response keys: ${Object.keys(data).join(', ')}`);
        }
      }
    } catch (error) {
      console.log(`💥 ${endpoint.method} ${endpoint.path} -> Error: ${error.message}`);
    }
  }
  
  console.log('\n📝 Summary:');
  console.log('- VEO3 generation endpoint exists: /generate/veo3-video');
  console.log('- Status endpoint should be: /generate/text-to-video/status/{jobId}');
  console.log('- All models use the same status endpoint');
}

// Run the test
testAvailableEndpoints();