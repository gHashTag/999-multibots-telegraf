#!/usr/bin/env node
/**
 * Test GIMBA webhook for user 144022504
 */

const https = require('https');

const webhookPayload = {
  id: 'htxjdzxvzhrme0ct2ym8th35jc-playra', // Training ID for user 144022504
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

console.log('🚀 Sending webhook for user 144022504...\n');

const req = https.request(options, (res) => {
  console.log(`✅ HTTP Status: ${res.statusCode}`);

  let responseBody = '';
  res.on('data', (chunk) => {
    responseBody += chunk;
  });

  res.on('end', () => {
    console.log('📨 Response:', responseBody);
    if (res.statusCode === 200) {
      console.log('✅ Webhook delivered for user 144022504!');
    }
  });
});

req.on('error', (error) => {
  console.error('❌ Error:', error);
});

req.write(data);
req.end();
