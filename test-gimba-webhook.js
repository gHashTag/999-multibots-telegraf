#!/usr/bin/env node
/**
 * Test GIMBA webhook delivery in production
 * Tests that webhook endpoint works and updates model_trainings correctly
 */

const https = require('https');

// Webhook payload matching Replicate's format
const webhookPayload = {
  id: 'htxjdzxvzhrme0ct2ym8th35jc', // Existing training ID for user 7912847443
  status: 'succeeded',
  model: 'ostris/flux-dev-lora-trainer:4ffd32160efd92e956d39c5338a9b8fbafca58e03f791f6d8011f3e20e8ea6fa',
  version: '4ffd32160efd92e956d39c5338a9b8fbafca58e03f791f6d8011f3e20e8ea6fa',
  input: {
    input_images: 'https://test.com/images.zip',
    trigger_word: 'NEURO_SAGE',
    steps: 1000
  },
  output: {
    version: 'febfcf7ea0d1011d66badf8bc7599b19290cc4077b12e827c3aaf10dcd9f7c61',
    weights: 'https://replicate.delivery/pbxt/test-weights.tar'
  },
  created_at: '2025-10-25T10:00:00.000Z',
  started_at: '2025-10-25T10:01:00.000Z',
  completed_at: '2025-10-25T10:30:00.000Z'
};

const data = JSON.stringify(webhookPayload);

const options = {
  hostname: '999-agents.site',
  port: 443,
  path: '/api/webhooks/replicate',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': data.length,
    'User-Agent': 'Webhooks/1.77.0 (sender-test)'
  }
};

console.log('🚀 Sending test webhook to production...\n');
console.log('📦 Payload:', JSON.stringify(webhookPayload, null, 2));
console.log('\n🌐 Endpoint: https://999-agents.site/api/webhooks/replicate\n');

const req = https.request(options, (res) => {
  console.log(`✅ HTTP Status: ${res.statusCode}`);
  console.log(`📋 Headers:`, res.headers);

  let responseBody = '';
  res.on('data', (chunk) => {
    responseBody += chunk;
  });

  res.on('end', () => {
    console.log('\n📨 Response Body:', responseBody);

    try {
      const parsed = JSON.parse(responseBody);
      console.log('\n📊 Parsed Response:', JSON.stringify(parsed, null, 2));
    } catch (e) {
      console.log('\n⚠️  Could not parse response as JSON');
    }

    if (res.statusCode === 200) {
      console.log('\n✅ Webhook delivered successfully!');
      console.log('\n🔍 Next: Check database to verify model_url was updated');
      console.log('   Expected model_url: ghashtag/gimba:febfcf7ea0d1011d66badf8bc7599b19290cc4077b12e827c3aaf10dcd9f7c61');
    } else {
      console.log(`\n❌ Webhook failed with status ${res.statusCode}`);
    }
  });
});

req.on('error', (error) => {
  console.error('❌ Request error:', error);
});

req.write(data);
req.end();
