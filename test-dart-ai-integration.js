#!/usr/bin/env node

/**
 * Тест интеграции с Dart AI API
 * Проверяет доступность различных серверов для Dart AI
 */

const axios = require('axios');

const servers = [
  'https://999-multibots-u14194.vm.elestio.app',  // Наш продакшн сервер
  'https://ai-server-production-production-8e2d.up.railway.app',  // Railway сервер
];

async function testDartAIEndpoint(baseUrl) {
  console.log(`\n🔍 Тестирую сервер: ${baseUrl}`);
  
  try {
    // Проверяем базовую доступность
    const healthResponse = await axios.get(`${baseUrl}`, { 
      timeout: 10000,
      validateStatus: () => true  // Принимаем любой статус
    });
    
    console.log(`  ✅ Сервер отвечает: ${healthResponse.status} ${healthResponse.statusText}`);
    
    if (healthResponse.data && typeof healthResponse.data === 'string') {
      console.log(`  📄 Ответ: ${healthResponse.data.slice(0, 100)}...`);
    }

    // Проверяем Dart AI endpoints
    const endpoints = [
      '/api/dart-ai/spaces',
      '/api/dart-ai/tasks/default',
      '/api/dart-ai/health'
    ];

    for (const endpoint of endpoints) {
      try {
        const response = await axios.get(`${baseUrl}${endpoint}`, { 
          timeout: 5000,
          validateStatus: () => true
        });
        
        if (response.status === 200) {
          console.log(`  ✅ ${endpoint}: ${response.status} - Dart AI API работает!`);
        } else if (response.status === 404) {
          console.log(`  ❌ ${endpoint}: ${response.status} - Endpoint не найден`);
        } else {
          console.log(`  ⚠️  ${endpoint}: ${response.status} - ${response.statusText}`);
        }
      } catch (endpointError) {
        if (endpointError.code === 'ECONNABORTED') {
          console.log(`  ⏱️  ${endpoint}: Timeout`);
        } else {
          console.log(`  ❌ ${endpoint}: ${endpointError.message}`);
        }
      }
    }

  } catch (error) {
    if (error.code === 'ENOTFOUND') {
      console.log(`  ❌ Сервер не найден: ${error.message}`);
    } else if (error.code === 'ECONNABORTED') {
      console.log(`  ⏱️  Timeout соединения`);
    } else if (error.code === 'CERT_HAS_EXPIRED') {
      console.log(`  🔒 SSL сертификат истек`);
    } else {
      console.log(`  ❌ Ошибка: ${error.message}`);
    }
  }
}

async function main() {
  console.log('🚀 Тестирование интеграции Dart AI Task Manager');
  console.log('=' .repeat(60));
  
  for (const server of servers) {
    await testDartAIEndpoint(server);
  }
  
  console.log('\n' + '=' .repeat(60));
  console.log('📋 ЗАКЛЮЧЕНИЕ:');
  console.log('- Если видите 404 ошибки для /api/dart-ai/* - API не развернут');
  console.log('- Если видите 200 для /api/dart-ai/* - API работает!');
  console.log('- Если видите timeout/connection errors - сервер недоступен');
  console.log('\n🎯 Для деплоя на продакшн нужно либо:');
  console.log('  1. Мерджить cicd -> main (автоматический деплой)');
  console.log('  2. Или вручную запустить деплой из GitHub Actions');
}

main().catch(console.error);
