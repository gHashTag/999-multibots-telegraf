#!/usr/bin/env node

const axios = require('axios');
require('dotenv').config();

const API_URL = process.env.API_SERVER_URL || 'https://ai-server-production-production-8e2d.up.railway.app';
const SECRET_KEY = process.env.API_SECRET_KEY || 'your-secret-key';

async function testVeo3Generation() {
  console.log('🔍 Testing VEO3 generation and status endpoints...\n');
  
  try {
    // Test 1: Generate VEO3 video
    console.log('1️⃣ Testing VEO3 generation endpoint...');
    const generateResponse = await axios.post(
      `${API_URL}/generate/veo3-video`,
      {
        model: 'veo3_fast',
        prompt: 'A beautiful sunset over mountains',
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
    
    console.log('✅ Generation response:', {
      success: generateResponse.data.success,
      jobId: generateResponse.data.jobId,
      message: generateResponse.data.message,
      hasVideoUrl: !!generateResponse.data.videoUrl
    });
    
    if (generateResponse.data.jobId) {
      const jobId = generateResponse.data.jobId;
      
      // Test 2: Check status
      console.log('\n2️⃣ Testing VEO3 status endpoint...');
      console.log(`   Checking status for jobId: ${jobId}`);
      
      // Wait a bit before checking status
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      const statusResponse = await axios.get(
        `${API_URL}/generate/veo3-video/status/${jobId}`,
        {
          headers: {
            'x-secret-key': SECRET_KEY
          }
        }
      );
      
      console.log('✅ Status response:', {
        success: statusResponse.data.success,
        status: statusResponse.data.status,
        hasVideoUrl: !!statusResponse.data.videoUrl,
        message: statusResponse.data.message,
        error: statusResponse.data.error
      });
      
      // Test 3: Try the regular status endpoint for comparison
      console.log('\n3️⃣ Testing regular status endpoint (for comparison)...');
      try {
        const regularStatusResponse = await axios.get(
          `${API_URL}/generate/text-to-video/status/${jobId}`,
          {
            headers: {
              'x-secret-key': SECRET_KEY
            }
          }
        );
        
        console.log('✅ Regular status response:', {
          success: regularStatusResponse.data.success,
          status: regularStatusResponse.data.status,
          hasVideoUrl: !!regularStatusResponse.data.videoUrl
        });
      } catch (error) {
        console.log('❌ Regular status endpoint error (expected):', error.response?.status);
      }
    }
    
    console.log('\n✅ All tests completed successfully!');
    
  } catch (error) {
    console.error('\n❌ Test failed:', {
      endpoint: error.config?.url,
      status: error.response?.status,
      error: error.response?.data || error.message
    });
  }
}

// Run the test
testVeo3Generation();