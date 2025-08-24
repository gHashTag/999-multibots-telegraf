#!/usr/bin/env node

const axios = require('axios');

const PRODUCTION_API = 'https://ai-server-production.up.railway.app';

async function checkEndpoints() {
  console.log('🔍 Проверяем что РЕАЛЬНО доступно на продакшн сервере...\n');
  
  const endpoints = [
    '/',
    '/health', 
    '/api',
    '/api/health',
    '/api/dart-ai',
    '/api/dart-ai/status',
    '/api/dart-ai/tasks',
    '/dart-ai',
    '/dart-ai/status',
    '/dart-ai/tasks',
    '/webhooks',
    '/webhooks/github',
    '/webhooks/github/issues'
  ];
  
  for (const endpoint of endpoints) {
    try {
      const response = await axios.get(`${PRODUCTION_API}${endpoint}`, {
        timeout: 10000,
        validateStatus: (status) => status < 500
      });
      
      if (response.status === 200) {
        console.log(`✅ ${endpoint} - Status: 200 ✅`);
        if (response.data) {
          const preview = JSON.stringify(response.data).substring(0, 100);
          console.log(`   📄 Response: ${preview}...`);
        }
      } else if (response.status === 404) {
        console.log(`❌ ${endpoint} - Status: 404 (Not Found)`);
      } else {
        console.log(`⚠️ ${endpoint} - Status: ${response.status}`);
      }
      
    } catch (error) {
      if (error.response?.status === 404) {
        console.log(`❌ ${endpoint} - Status: 404 (Not Found)`);
      } else {
        console.log(`💥 ${endpoint} - Error: ${error.message}`);
      }
    }
  }
  
  console.log('\n🎯 ВЫВОД:');
  console.log('Если все Dart AI эндпоинты возвращают 404,');
  console.log('значит API НЕ РАЗВЕРНУТ на продакшн сервере!');
}

checkEndpoints();