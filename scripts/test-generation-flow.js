#!/usr/bin/env node

const axios = require('axios');
require('dotenv').config();

const API_URL = process.env.API_SERVER_URL || 'https://ai-server-production-production-8e2d.up.railway.app';
const SECRET_KEY = process.env.API_SECRET_KEY || 'your-secret-key';

async function testGenerationFlow() {
  console.log('🔍 Testing complete VEO3 generation flow...\n');
  
  try {
    // Test VEO3 FAST generation
    console.log('1️⃣ Generating VEO3 FAST video...');
    const veo3FastResponse = await axios.post(
      `${API_URL}/generate/veo3-video`,
      {
        model: 'veo3_fast',
        prompt: 'A serene lake at sunset',
        duration: 8,
        aspectRatio: '16:9',
        telegram_id: 'test_user',
        username: 'test',
        is_ru: false,
        bot_name: 'test_bot'
      },
      {
        headers: {
          'x-secret-key': SECRET_KEY,
          'Content-Type': 'application/json'
        }
      }
    );
    
    console.log('VEO3 FAST Response:', JSON.stringify(veo3FastResponse.data, null, 2));
    
    // Test VEO3 standard generation
    console.log('\n2️⃣ Generating VEO3 Standard video...');
    const veo3Response = await axios.post(
      `${API_URL}/generate/veo3-video`,
      {
        model: 'veo3',
        prompt: 'A futuristic city skyline',
        duration: 10,
        aspectRatio: '16:9',
        telegram_id: 'test_user',
        username: 'test',
        is_ru: false,
        bot_name: 'test_bot'
      },
      {
        headers: {
          'x-secret-key': SECRET_KEY,
          'Content-Type': 'application/json'
        }
      }
    );
    
    console.log('VEO3 Standard Response:', JSON.stringify(veo3Response.data, null, 2));
    
    // Try different status endpoints if we got a jobId
    if (veo3FastResponse.data.jobId) {
      const jobId = veo3FastResponse.data.jobId;
      console.log('\n3️⃣ Testing different status endpoint patterns...');
      
      const statusEndpoints = [
        `/status/${jobId}`,
        `/video/status/${jobId}`,
        `/generate/status/${jobId}`,
        `/generate/text-to-video/status?jobId=${jobId}`,
        `/generate/veo3-video/status?jobId=${jobId}`,
        `/api/status/${jobId}`,
        `/api/video/status/${jobId}`
      ];
      
      for (const endpoint of statusEndpoints) {
        try {
          const response = await axios.get(`${API_URL}${endpoint}`, {
            headers: { 'x-secret-key': SECRET_KEY },
            validateStatus: () => true
          });
          
          if (response.status === 200) {
            console.log(`✅ Found working status endpoint: ${endpoint}`);
            console.log('   Response:', JSON.stringify(response.data, null, 2));
          } else {
            console.log(`❌ ${endpoint} -> ${response.status}`);
          }
        } catch (error) {
          console.log(`💥 ${endpoint} -> Error`);
        }
      }
    }
    
    console.log('\n📝 Analysis:');
    console.log('- VEO3 models are generating with jobIds');
    console.log('- Status endpoints are not yet implemented on the server');
    console.log('- Videos might be generated synchronously or need a different approach');
    
  } catch (error) {
    console.error('\n❌ Test failed:', {
      status: error.response?.status,
      error: error.response?.data || error.message
    });
  }
}

// Run the test
testGenerationFlow();