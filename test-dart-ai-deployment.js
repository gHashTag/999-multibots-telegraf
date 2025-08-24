#!/usr/bin/env node

/**
 * Тест развертывания Dart AI API
 * Проверяет доступность всех эндпоинтов после развертывания
 */

const axios = require('axios');
const https = require('https');

const BASE_URL = 'https://999-multibots-u14194.vm.elestio.app';

// Настройки для игнорирования SSL (у Elestio истек сертификат)
const client = axios.create({
  baseURL: BASE_URL,
  timeout: 10000,
  httpsAgent: new https.Agent({
    rejectUnauthorized: false // Игнорируем SSL для тестирования
  })
});

async function testEndpoint(method, endpoint, data = null) {
  try {
    console.log(`🧪 Testing ${method.toUpperCase()} ${endpoint}`);
    
    const config = {
      method: method.toLowerCase(),
      url: endpoint,
    };
    
    if (data && (method.toLowerCase() === 'post' || method.toLowerCase() === 'put')) {
      config.data = data;
    }
    
    const response = await client(config);
    
    console.log(`✅ ${method.toUpperCase()} ${endpoint} - Status: ${response.status}`);
    console.log(`   Response:`, JSON.stringify(response.data, null, 2).substring(0, 200) + '...');
    
    return { success: true, status: response.status, data: response.data };
  } catch (error) {
    if (error.response) {
      console.log(`❌ ${method.toUpperCase()} ${endpoint} - Status: ${error.response.status}`);
      console.log(`   Error:`, error.response.data || error.message);
      return { success: false, status: error.response.status, error: error.response.data };
    } else {
      console.log(`💥 ${method.toUpperCase()} ${endpoint} - Network Error: ${error.message}`);
      return { success: false, error: error.message };
    }
  }
}

async function runDeploymentTests() {
  console.log('🚀 Проверка развертывания Dart AI API');
  console.log(`🔗 Server: ${BASE_URL}`);
  console.log('=' .repeat(60));

  const results = {};

  // 1. Базовая проверка доступности
  console.log('\n📊 1. Проверка базовой доступности');
  results.health = await testEndpoint('GET', '/');

  // 2. Проверка API эндпоинтов Dart AI
  console.log('\n🎯 2. Dart AI API эндпоинты');
  
  // Spaces endpoints
  results.getSpaces = await testEndpoint('GET', '/api/dart-ai/spaces');
  
  // Tasks endpoints
  results.getTasks = await testEndpoint('GET', '/api/dart-ai/tasks/default');
  
  // Создание тестовой задачи
  const testTask = {
    title: 'Test Task from Deployment Test',
    description: 'This is a test task created during deployment verification',
    priority: 'medium',
    status: 'todo'
  };
  
  results.createTask = await testEndpoint('POST', '/api/dart-ai/tasks/default', testTask);
  
  // Если задача создалась, пробуем её получить и обновить
  if (results.createTask.success && results.createTask.data?.data?.id) {
    const taskId = results.createTask.data.data.id;
    console.log(`📝 Создана тестовая задача с ID: ${taskId}`);
    
    results.getTask = await testEndpoint('GET', `/api/dart-ai/tasks/default/${taskId}`);
    
    results.updateTask = await testEndpoint('PUT', `/api/dart-ai/tasks/default/${taskId}`, {
      status: 'in_progress',
      description: 'Updated during deployment test'
    });
    
    // Удаляем тестовую задачу
    results.deleteTask = await testEndpoint('DELETE', `/api/dart-ai/tasks/default/${taskId}`);
  }

  // 3. GitHub integration endpoints
  console.log('\n🐙 3. GitHub интеграция');
  const mockGitHubIssue = {
    issue: {
      title: 'Test GitHub Integration',
      body: 'Testing GitHub to Dart AI synchronization',
      number: 999,
      repository: 'test-repo',
      labels: ['bug', 'high-priority']
    },
    spaceId: 'default'
  };
  
  results.githubIssue = await testEndpoint('POST', '/api/dart-ai/github-issue', mockGitHubIssue);

  // 4. Bulk sync endpoint
  console.log('\n🔄 4. Bulk synchronization');
  const bulkTasks = [
    {
      title: 'Bulk Task 1',
      description: 'First bulk sync task',
      priority: 'low',
      status: 'todo'
    },
    {
      title: 'Bulk Task 2', 
      description: 'Second bulk sync task',
      priority: 'high',
      status: 'todo'
    }
  ];
  
  results.bulkSync = await testEndpoint('POST', '/api/dart-ai/bulk-sync', {
    tasks: bulkTasks,
    spaceId: 'default'
  });

  // 5. Итоговый отчет
  console.log('\n' + '=' .repeat(60));
  console.log('📋 ИТОГОВЫЙ ОТЧЕТ РАЗВЕРТЫВАНИЯ');
  console.log('=' .repeat(60));
  
  const successCount = Object.values(results).filter(r => r?.success).length;
  const totalCount = Object.keys(results).length;
  
  console.log(`✅ Успешные тесты: ${successCount}/${totalCount}`);
  
  if (successCount === totalCount) {
    console.log('🎉 ВСЕ ТЕСТЫ ПРОШЛИ! Dart AI API успешно развернут');
  } else {
    console.log('⚠️  Некоторые тесты не прошли. Проверьте детали выше.');
  }
  
  console.log('\n📊 Детализация результатов:');
  Object.entries(results).forEach(([test, result]) => {
    const status = result?.success ? '✅' : '❌';
    const statusCode = result?.status ? ` (${result.status})` : '';
    console.log(`  ${status} ${test}${statusCode}`);
  });
  
  return results;
}

// Запуск тестов
if (require.main === module) {
  runDeploymentTests()
    .then(() => {
      console.log('\n🏁 Тестирование завершено');
      process.exit(0);
    })
    .catch(error => {
      console.error('\n💥 Критическая ошибка при тестировании:', error);
      process.exit(1);
    });
}

module.exports = { runDeploymentTests };