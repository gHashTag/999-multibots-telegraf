#!/usr/bin/env node

const axios = require('axios');
require('dotenv').config();

const API_KEY = process.env.KIE_AI_API_KEY;
const BASE_URL = 'https://api.kie.ai/api/v1';

async function testModel(modelName, hasImage = false) {
  console.log(`\n🧪 Testing model: ${modelName} (${hasImage ? 'image-to-video' : 'text-to-video'})`);
  
  const requestData = {
    model: modelName,
    prompt: "A beautiful sunset over the ocean",
    aspectRatio: "16:9",
    enableFallback: false,
    enableTranslation: true,
  };
  
  if (hasImage) {
    requestData.imageUrls = ["https://example.com/test.jpg"];
  }
  
  try {
    const response = await axios.post(`${BASE_URL}/veo/generate`, requestData, {
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
        'Content-Type': 'application/json',
      },
      timeout: 10000,
    });
    
    console.log(`✅ Model ${modelName} works!`);
    console.log(`   Response code: ${response.data.code}`);
    console.log(`   Message: ${response.data.msg}`);
    if (response.data.data) {
      console.log(`   Task ID: ${response.data.data.taskId}`);
    }
    return true;
  } catch (error) {
    console.log(`❌ Model ${modelName} failed!`);
    if (error.response) {
      console.log(`   Error code: ${error.response.status}`);
      console.log(`   Error message: ${JSON.stringify(error.response.data)}`);
    } else {
      console.log(`   Error: ${error.message}`);
    }
    return false;
  }
}

async function main() {
  console.log('🔍 Testing KIE AI model support...\n');
  console.log(`API Key: ${API_KEY ? 'Found' : 'Missing!'}`);
  
  if (!API_KEY) {
    console.error('❌ KIE_AI_API_KEY not found in environment!');
    process.exit(1);
  }
  
  // Test different model variations
  const models = [
    'veo3',
    'veo3_fast',
    'veo-3',
    'veo-3-fast',
    'veo3-fast',
  ];
  
  console.log('\n=== TEXT-TO-VIDEO TESTS ===');
  for (const model of models) {
    await testModel(model, false);
    await new Promise(resolve => setTimeout(resolve, 1000)); // Rate limiting
  }
  
  console.log('\n=== IMAGE-TO-VIDEO TESTS ===');
  for (const model of models) {
    await testModel(model, true);
    await new Promise(resolve => setTimeout(resolve, 1000)); // Rate limiting
  }
  
  console.log('\n✅ Testing complete!');
}

main().catch(console.error);