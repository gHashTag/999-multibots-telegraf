#!/usr/bin/env node

const axios = require('axios');
const { performance } = require('perf_hooks');

// Ваш продакшн сервер
const PRODUCTION_URL = 'https://999-multibots-telegraf-u14194.vm.elestio.app';

const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const BLUE = '\x1b[34m';
const RESET = '\x1b[0m';

console.log(`${BLUE}🚀 ТЕСТИРОВАНИЕ ВАШЕГО ПРОДАКШН API${RESET}`);
console.log(`${BLUE}🌐 Сервер: ${PRODUCTION_URL}${RESET}\n`);

const testResults = {
  total: 0,
  passed: 0,
  failed: 0,
  errors: []
};

// Вспомогательная функция для тестирования
async function runTest(testName, testFn) {
  console.log(`${YELLOW}⏳ ${testName}${RESET}`);
  testResults.total++;
  
  try {
    const startTime = performance.now();
    await testFn();
    const endTime = performance.now();
    const duration = Math.round(endTime - startTime);
    
    console.log(`${GREEN}✅ ${testName} (${duration}ms)${RESET}`);
    testResults.passed++;
  } catch (error) {
    console.log(`${RED}❌ ${testName}${RESET}`);
    console.log(`   ${RED}Ошибка: ${error.message}${RESET}`);
    testResults.failed++;
    testResults.errors.push({ test: testName, error: error.message });
  }
}

// Тест 1: Проверка доступности сервера
async function testServerAlive() {
  const response = await axios.get(PRODUCTION_URL, {
    timeout: 10000,
    validateStatus: (status) => status < 500 // 404 это нормально для корня
  });
  
  console.log(`   🌐 Сервер отвечает, статус: ${response.status}`);
}

// Тест 2: Проверка health endpoint
async function testHealthEndpoint() {
  const response = await axios.get(`${PRODUCTION_URL}/api/health`, {
    timeout: 10000
  });
  
  if (response.status !== 200) {
    throw new Error(`Expected status 200, got ${response.status}`);
  }
  
  console.log(`   ❤️ Health status: ${response.data.status}`);
}

// Тест 3: Проверка статуса Dart AI интеграции
async function testDartAIStatus() {
  const response = await axios.get(`${PRODUCTION_URL}/api/dart-ai/status`, {
    timeout: 10000
  });
  
  if (response.status !== 200) {
    throw new Error(`Expected status 200, got ${response.status}`);
  }
  
  if (!response.data.success) {
    throw new Error('Dart AI status indicates failure');
  }
  
  console.log(`   🔧 API configured: ${response.data.data.configured}`);
  console.log(`   🔑 API key present: ${response.data.data.api_key_present}`);
}

// Тест 4: Получение пространств
async function testGetSpaces() {
  const response = await axios.get(`${PRODUCTION_URL}/api/dart-ai/spaces`, {
    timeout: 15000
  });
  
  if (response.status !== 200) {
    throw new Error(`Expected status 200, got ${response.status}`);
  }
  
  if (!response.data.success) {
    throw new Error(`API returned error: ${response.data.error || 'unknown error'}`);
  }
  
  const spaces = response.data.data;
  console.log(`   📋 Найдено пространств: ${spaces.length}`);
  
  if (spaces.length > 0) {
    console.log(`   📝 Первое пространство: "${spaces[0].name}" (ID: ${spaces[0].id})`);
  }
  
  return spaces;
}

// Тест 5: Получение задач из первого пространства
async function testGetTasks(spaces) {
  if (spaces.length === 0) {
    console.log('   ⚠️ Нет пространств для тестирования задач');
    return { spaceId: null, tasks: [] };
  }
  
  const spaceId = spaces[0].id;
  const response = await axios.get(`${PRODUCTION_URL}/api/dart-ai/tasks/${spaceId}`, {
    timeout: 15000
  });
  
  if (response.status !== 200) {
    throw new Error(`Expected status 200, got ${response.status}`);
  }
  
  if (!response.data.success) {
    throw new Error(`API returned error: ${response.data.error || 'unknown error'}`);
  }
  
  const tasks = response.data.data;
  console.log(`   📋 Задач в пространстве: ${tasks.length}`);
  
  if (tasks.length > 0) {
    console.log(`   📝 Первая задача: "${tasks[0].title}"`);
  }
  
  return { spaceId, tasks };
}

// Тест 6: Создание тестовой задачи
async function testCreateTask(spaceId) {
  if (!spaceId) {
    throw new Error('No space ID available for creating task');
  }
  
  const testTask = {
    title: `🧪 Продакшн тест ${Date.now()}`,
    description: '🧪 Создано тестом продакшн API',
    status: 'todo',
    priority: 'medium',
    tags: ['prod-test', 'api-integration'],
  };
  
  const response = await axios.post(`${PRODUCTION_URL}/api/dart-ai/tasks/${spaceId}`, testTask, {
    timeout: 15000,
    headers: {
      'Content-Type': 'application/json'
    }
  });
  
  if (response.status !== 201) {
    throw new Error(`Expected status 201, got ${response.status}`);
  }
  
  if (!response.data.success) {
    throw new Error(`Task creation failed: ${response.data.error || 'unknown error'}`);
  }
  
  const createdTask = response.data.data;
  console.log(`   ✅ Создана задача: ${createdTask.id}`);
  console.log(`   📝 Название: "${createdTask.title}"`);
  
  return createdTask;
}

// Тест 7: Получение созданной задачи
async function testGetTask(spaceId, taskId) {
  const response = await axios.get(`${PRODUCTION_URL}/api/dart-ai/tasks/${spaceId}/${taskId}`, {
    timeout: 15000
  });
  
  if (response.status !== 200) {
    throw new Error(`Expected status 200, got ${response.status}`);
  }
  
  if (!response.data.success) {
    throw new Error(`Get task failed: ${response.data.error || 'unknown error'}`);
  }
  
  const task = response.data.data;
  console.log(`   📄 Получена задача: "${task.title}"`);
  console.log(`   📊 Статус: ${task.status}`);
}

// Тест 8: Удаление тестовой задачи (очистка)
async function testDeleteTask(spaceId, taskId) {
  const response = await axios.delete(`${PRODUCTION_URL}/api/dart-ai/tasks/${spaceId}/${taskId}`, {
    timeout: 15000
  });
  
  if (response.status !== 200) {
    throw new Error(`Expected status 200, got ${response.status}`);
  }
  
  if (!response.data.success) {
    throw new Error(`Delete task failed: ${response.data.error || 'unknown error'}`);
  }
  
  console.log(`   🗑️ Тестовая задача удалена`);
}

// Тест 9: GitHub интеграция
async function testGitHubIntegration() {
  const githubIssue = {
    issue: {
      number: 999,
      title: '🧪 Продакшн тест GitHub интеграции',
      body: '🧪 Тестирование создания задачи из GitHub Issue в продакшне',
      labels: ['prod-test', 'github-integration'],
      repository: 'gHashTag/ai-server'
    }
  };
  
  const response = await axios.post(`${PRODUCTION_URL}/api/dart-ai/github-issue`, githubIssue, {
    timeout: 15000,
    headers: {
      'Content-Type': 'application/json'
    }
  });
  
  if (response.status !== 201) {
    throw new Error(`Expected status 201, got ${response.status}`);
  }
  
  if (!response.data.success) {
    throw new Error(`GitHub integration failed: ${response.data.error || 'unknown error'}`);
  }
  
  console.log(`   🐙 GitHub задача создана: ${response.data.data.id}`);
  console.log(`   📝 Название: "${response.data.data.title}"`);
  
  return response.data.data;
}

// Основная функция тестирования
async function runAllTests() {
  try {
    let spaces, taskData, createdTask, githubTask;
    
    // Базовые тесты инфраструктуры
    await runTest('🌐 Проверка доступности продакшн сервера', testServerAlive);
    await runTest('❤️ Проверка health endpoint', testHealthEndpoint);
    await runTest('🔧 Проверка статуса Dart AI интеграции', testDartAIStatus);
    
    // Тесты основной функциональности
    await runTest('📋 Получение списка пространств', async () => {
      spaces = await testGetSpaces();
    });
    
    await runTest('📋 Получение задач из пространства', async () => {
      taskData = await testGetTasks(spaces);
    });
    
    // CRUD тесты (если есть пространства)
    if (taskData.spaceId) {
      await runTest('➕ Создание тестовой задачи', async () => {
        createdTask = await testCreateTask(taskData.spaceId);
      });
      
      if (createdTask) {
        await runTest('📄 Получение созданной задачи', async () => {
          await testGetTask(taskData.spaceId, createdTask.id);
        });
        
        await runTest('🗑️ Удаление тестовой задачи', async () => {
          await testDeleteTask(taskData.spaceId, createdTask.id);
        });
      }
    }
    
    // Тест GitHub интеграции
    await runTest('🐙 Тестирование GitHub интеграции', async () => {
      githubTask = await testGitHubIntegration();
    });
    
    // Очистка GitHub задачи (если создалась)
    if (githubTask && spaces.length > 0) {
      await runTest('🧹 Очистка GitHub тестовой задачи', async () => {
        await testDeleteTask(spaces[0].id, githubTask.id);
      });
    }
    
  } catch (error) {
    console.log(`${RED}💥 Критическая ошибка: ${error.message}${RESET}`);
    testResults.failed++;
    testResults.errors.push({ test: 'Critical Error', error: error.message });
  }
  
  // Вывод результатов
  console.log(`\n${BLUE}📊 РЕЗУЛЬТАТЫ ТЕСТИРОВАНИЯ ПРОДАКШН API${RESET}`);
  console.log('='.repeat(60));
  console.log(`🌐 Сервер: ${PRODUCTION_URL}`);
  console.log(`📊 Всего тестов: ${testResults.total}`);
  console.log(`${GREEN}✅ Успешно: ${testResults.passed}${RESET}`);
  console.log(`${RED}❌ Провалено: ${testResults.failed}${RESET}`);
  
  const successRate = testResults.total > 0 ? Math.round((testResults.passed / testResults.total) * 100) : 0;
  console.log(`📈 Процент успеха: ${successRate}%`);
  
  if (testResults.failed === 0) {
    console.log(`\n${GREEN}🎉 ВСЕ ТЕСТЫ ПРОШЛИ УСПЕШНО!${RESET}`);
    console.log(`${GREEN}🚀 ПРОДАКШН API ПОЛНОСТЬЮ РАБОТАЕТ!${RESET}`);
    console.log(`${GREEN}✨ Dart AI Task Manager готов к использованию!${RESET}`);
    process.exit(0);
  } else {
    console.log(`\n${RED}❌ ОБНАРУЖЕНЫ ПРОБЛЕМЫ В ПРОДАКШНЕ:${RESET}`);
    testResults.errors.forEach(({ test, error }) => {
      console.log(`   ${RED}• ${test}: ${error}${RESET}`);
    });
    
    console.log(`\n${YELLOW}💡 РЕКОМЕНДАЦИИ:${RESET}`);
    if (testResults.errors.some(e => e.error.includes('Network Error') || e.error.includes('timeout'))) {
      console.log(`   ${YELLOW}• Проверьте доступность продакшн сервера${RESET}`);
    }
    if (testResults.errors.some(e => e.error.includes('404'))) {
      console.log(`   ${YELLOW}• Убедитесь, что Dart AI маршруты развернуты на продакшне${RESET}`);
    }
    if (testResults.errors.some(e => e.error.includes('401') || e.error.includes('403'))) {
      console.log(`   ${YELLOW}• Проверьте настройки DART_AI_API_KEY на продакшн сервере${RESET}`);
    }
    
    process.exit(1);
  }
}

// Запуск тестирования
console.log(`${BLUE}Начинаем тестирование продакшн API...${RESET}\n`);
runAllTests().catch((error) => {
  console.log(`${RED}💥 Фатальная ошибка: ${error.message}${RESET}`);
  console.log(`${RED}Stack trace: ${error.stack}${RESET}`);
  process.exit(1);
});