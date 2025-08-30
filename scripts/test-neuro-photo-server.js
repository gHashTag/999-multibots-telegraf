#!/usr/bin/env node

/**
 * Test script to verify neuro-photo requests are going to the production server
 * This script simulates a neuro-photo request and logs the server response
 */

const axios = require('axios');
require('dotenv').config();

const API_SERVER_URL = process.env.API_SERVER_URL || 'https://ai-server-production-production-8e2d.up.railway.app';
const SECRET_API_KEY = process.env.SECRET_API_KEY || 'ETlvZ7b7v3gkEpUp1NETlvZ7b7v3gkEpUp1N';

async function testNeuroPhotoServer() {
  console.log('🧪 Testing Neuro-Photo Server Connection');
  console.log('=====================================');
  console.log(`📡 Server URL: ${API_SERVER_URL}`);
  console.log(`🔑 API Key: ${SECRET_API_KEY ? '***SET***' : 'NOT SET'}`);
  console.log('');

  const testPayload = {
    prompt: 'Test prompt for server verification',
    model_url: 'test-model-url',
    num_images: 1,
    telegram_id: '144022504', // Admin ID for testing
    username: 'test_user',
    is_ru: true,
    bot_name: 'clip_maker_neuro_bot',
    exact_cost_per_image: 7.5,
    exact_total_cost: 7.5,
    user_model: {
      id: 'test-model-id',
      model_name: 'Test Model'
    },
    aspect_ratio: null
  };

  try {
    console.log('📤 Sending test request to server...');
    console.log(`   URL: ${API_SERVER_URL}/generate/neuro-photo`);
    console.log('');

    const response = await axios.post(
      `${API_SERVER_URL}/generate/neuro-photo`,
      testPayload,
      {
        headers: {
          'Content-Type': 'application/json',
          'x-secret-key': SECRET_API_KEY,
        },
        timeout: 10000, // 10 second timeout for testing
        validateStatus: () => true // Don't throw on any status code
      }
    );

    console.log('📥 Server Response:');
    console.log('   Status:', response.status, response.statusText);
    console.log('   Headers:', JSON.stringify(response.headers, null, 2));
    
    if (response.data) {
      console.log('   Data:', JSON.stringify(response.data, null, 2));
    }

    if (response.status >= 200 && response.status < 300) {
      console.log('');
      console.log('✅ SUCCESS: Server is responding correctly!');
      console.log('   Neuro-photo requests are being routed to the production server.');
    } else if (response.status === 401) {
      console.log('');
      console.log('⚠️  WARNING: Server returned 401 Unauthorized');
      console.log('   The server is reachable but API key may be invalid.');
      console.log('   This is expected if the server requires a different key.');
    } else if (response.status === 404) {
      console.log('');
      console.log('❌ ERROR: Server returned 404 Not Found');
      console.log('   The /generate/neuro-photo endpoint may not exist on the server.');
    } else {
      console.log('');
      console.log('⚠️  WARNING: Server returned unexpected status:', response.status);
    }

  } catch (error) {
    console.log('❌ ERROR: Failed to connect to server');
    console.log('');
    
    if (error.code === 'ECONNREFUSED') {
      console.log('   Connection refused - server may be down');
    } else if (error.code === 'ETIMEDOUT') {
      console.log('   Connection timeout - server may be slow or unreachable');
    } else if (error.response) {
      console.log('   Server error:', error.response.status, error.response.statusText);
      console.log('   Response:', error.response.data);
    } else {
      console.log('   Error:', error.message);
    }

    console.log('');
    console.log('🔧 Troubleshooting:');
    console.log('   1. Check if the server is running on Railway');
    console.log('   2. Verify the API_SERVER_URL in .env file');
    console.log('   3. Check production logs with: railway logs --tail');
  }

  console.log('');
  console.log('=====================================');
  console.log('Test completed.');
}

// Run the test
testNeuroPhotoServer().catch(console.error);