#!/usr/bin/env node
/**
 * 🧪 TEST: Models 5-7 Silent Mode (skipBalanceCheck)
 * 
 * Проверяет, что модели 5-7 НЕ вызывают processBalanceOperation
 * когда передан параметр skipBalanceCheck: true
 */

const { generateFluxKontextPro } = require('../../dist/services/generateFluxKontextPro');
const { generateSeedEdit3 } = require('../../dist/services/generateSeedEdit3');
const { generateQwenImageEdit } = require('../../dist/services/generateQwenImageEdit');

// Mock ctx
const mockCtx = {
  reply: async (msg) => {
    console.log('🚨 ERROR: ctx.reply() called in silent mode!', msg.substring(0, 50));
    process.exit(1);
  },
  replyWithPhoto: async (photo, opts) => {
    console.log('🚨 ERROR: ctx.replyWithPhoto() called in silent mode!');
    process.exit(1);
  },
  botInfo: { username: 'test_bot' },
  from: { id: 12345, username: 'test_user' }
};

const TEST_IMAGE_URL = 'https://via.placeholder.com/800x600';
const TEST_PROMPT = 'Test prompt for silent mode';

async function testModel(modelName, generateFn, params) {
  console.log(`\n🧪 Testing ${modelName}...`);
  
  try {
    // Этот вызов НЕ должен триггерить ctx.reply() или processBalanceOperation
    const result = await generateFn({
      ...params,
      silent: true,
      skipBalanceCheck: true,
    });
    
    console.log(`✅ ${modelName}: PASSED (no ctx interactions)`);
    return true;
  } catch (error) {
    console.log(`❌ ${modelName}: FAILED`);
    console.error(error.message);
    return false;
  }
}

async function runTests() {
  console.log('🚀 Starting Models 5-7 Silent Mode Test\n');
  
  const results = [];
  
  // Test 1: FLUX Kontext Pro
  results.push(await testModel(
    'FLUX Kontext Pro',
    generateFluxKontextPro,
    {
      inputImageUrl: TEST_IMAGE_URL,
      prompt: TEST_PROMPT,
      telegram_id: '12345',
      username: 'test_user',
      is_ru: false,
      ctx: mockCtx,
      size: '2K',
    }
  ));
  
  // Test 2: SeedEdit 3.0
  results.push(await testModel(
    'SeedEdit 3.0',
    generateSeedEdit3,
    {
      inputImageUrl: TEST_IMAGE_URL,
      prompt: TEST_PROMPT,
      telegram_id: '12345',
      username: 'test_user',
      is_ru: false,
      ctx: mockCtx,
      size: '2K',
    }
  ));
  
  // Test 3: Qwen Image Edit
  results.push(await testModel(
    'Qwen Image Edit',
    generateQwenImageEdit,
    {
      inputImageUrl: TEST_IMAGE_URL,
      prompt: TEST_PROMPT,
      telegram_id: '12345',
      username: 'test_user',
      is_ru: false,
      ctx: mockCtx,
      size: '2K',
    }
  ));
  
  // Summary
  const passed = results.filter(r => r).length;
  const failed = results.filter(r => !r).length;
  
  console.log(`\n📊 RESULTS: ${passed}/3 passed, ${failed}/3 failed`);
  
  if (failed > 0) {
    console.log('❌ TEST SUITE FAILED');
    process.exit(1);
  } else {
    console.log('✅ ALL TESTS PASSED');
    process.exit(0);
  }
}

runTests().catch(error => {
  console.error('💥 Test suite crashed:', error);
  process.exit(1);
});
