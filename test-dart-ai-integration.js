#!/usr/bin/env node

const axios = require('axios');
const { performance } = require('perf_hooks');

const API_BASE_URL = 'http://localhost:2999';
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const BLUE = '\x1b[34m';
const RESET = '\x1b[0m';

console.log(`${BLUE}🧪 ЗАПУСК ИНТЕГРАЦИОННЫХ ТЕСТОВ DART AI${RESET}\n`);

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

// Тест 1: Проверка статуса API
async function testApiStatus() {
  const response = await axios.get(`${API_BASE_URL}/api/dart-ai/status`);
  
  if (response.status !== 200) {
    throw new Error(`Expected status 200, got ${response.status}`);
  }
  
  if (!response.data.success) {
    throw new Error('API status response indicates failure');
  }
  
  console.log(`   📊 API configured: ${response.data.data.configured}`);
  console.log(`   🔑 API key present: ${response.data.data.api_key_present}`);
}

// Тест 2: Получение списка пространств
async function testGetSpaces() {
  const response = await axios.get(`${API_BASE_URL}/api/dart-ai/spaces`);
  
  if (response.status !== 200) {
    throw new Error(`Expected status 200, got ${response.status}`);
  }
  
  if (!response.data.success) {
    throw new Error('Get spaces response indicates failure');
  }
  
  const spaces = response.data.data;
  console.log(`   📋 Найдено пространств: ${spaces.length}`);
  
  if (spaces.length > 0) {
    console.log(`   📝 Первое пространство: ${spaces[0].name}`);
  }
  
  return spaces;
}

// Тест 3: Получение задач из первого пространства
async function testGetTasks(spaces) {
  if (spaces.length === 0) {
    throw new Error('No spaces available for testing tasks');
  }
  
  const spaceId = spaces[0].id;
  const response = await axios.get(`${API_BASE_URL}/api/dart-ai/tasks/${spaceId}`);
  
  if (response.status !== 200) {
    throw new Error(`Expected status 200, got ${response.status}`);
  }
  
  if (!response.data.success) {
    throw new Error('Get tasks response indicates failure');
  }
  
  const tasks = response.data.data;
  console.log(`   📋 Найдено задач в пространстве: ${tasks.length}`);
  
  if (tasks.length > 0) {
    console.log(`   📝 Первая задача: ${tasks[0].title}`);
  }
  
  return { spaceId, tasks };
}

// Тест 4: Создание тестовой задачи
async function testCreateTask(spaceId) {
  const testTask = {
    title: `🧪 Тестовая задача ${Date.now()}`,
    description: '🧪 Создано интеграционным тестом',
    status: 'todo',
    priority: 'medium',
    tags: ['test', 'integration'],
  };
  
  const response = await axios.post(`${API_BASE_URL}/api/dart-ai/tasks/${spaceId}`, testTask);
  
  if (response.status !== 201) {
    throw new Error(`Expected status 201, got ${response.status}`);
  }
  
  if (!response.data.success) {
    throw new Error('Create task response indicates failure');
  }
  
  const createdTask = response.data.data;
  console.log(`   ✅ Создана задача с ID: ${createdTask.id}`);
  console.log(`   📝 Название: ${createdTask.title}`);
  
  return createdTask;
}

// Тест 5: Получение созданной задачи
async function testGetTask(spaceId, taskId) {
  const response = await axios.get(`${API_BASE_URL}/api/dart-ai/tasks/${spaceId}/${taskId}`);
  
  if (response.status !== 200) {
    throw new Error(`Expected status 200, got ${response.status}`);
  }
  
  if (!response.data.success) {
    throw new Error('Get task response indicates failure');
  }
  
  const task = response.data.data;
  console.log(`   📝 Получена задача: ${task.title}`);
  console.log(`   📊 Статус: ${task.status}`);
  
  return task;
}

// Тест 6: Обновление задачи
async function testUpdateTask(spaceId, taskId) {
  const updates = {
    status: 'in_progress',
    description: '🧪 Обновлено интеграционным тестом',
    tags: ['test', 'integration', 'updated']
  };
  
  const response = await axios.put(`${API_BASE_URL}/api/dart-ai/tasks/${spaceId}/${taskId}`, updates);
  
  if (response.status !== 200) {
    throw new Error(`Expected status 200, got ${response.status}`);
  }
  
  if (!response.data.success) {
    throw new Error('Update task response indicates failure');
  }
  
  const updatedTask = response.data.data;
  console.log(`   ✅ Обновлена задача: ${updatedTask.title}`);
  console.log(`   📊 Новый статус: ${updatedTask.status}`);
  
  return updatedTask;
}

// Тест 7: Удаление тестовой задачи
async function testDeleteTask(spaceId, taskId) {
  const response = await axios.delete(`${API_BASE_URL}/api/dart-ai/tasks/${spaceId}/${taskId}`);
  
  if (response.status !== 200) {
    throw new Error(`Expected status 200, got ${response.status}`);
  }
  
  if (!response.data.success) {
    throw new Error('Delete task response indicates failure');
  }
  
  console.log(`   🗑️ Задача удалена успешно`);
}

// Тест 8: Создание задачи из GitHub Issue
async function testCreateGithubIssue() {
  const githubIssue = {
    issue: {
      number: 999,
      title: '🧪 Test GitHub Issue Integration',
      body: '🧪 This is a test issue created by integration test',
      labels: ['test', 'integration', 'high'],
      repository: 'gHashTag/ai-server'
    },
    spaceId: 'default'
  };
  
  const response = await axios.post(`${API_BASE_URL}/api/dart-ai/github-issue`, githubIssue);
  
  if (response.status !== 201) {
    throw new Error(`Expected status 201, got ${response.status}`);
  }
  
  if (!response.data.success) {
    throw new Error('Create GitHub issue task response indicates failure');
  }
  
  const createdTask = response.data.data;
  console.log(`   ✅ Создана задача из GitHub Issue: ${createdTask.id}`);
  console.log(`   📝 Название: ${createdTask.title}`);
  
  return createdTask;
}

// Основная функция тестирования
async function runAllTests() {
  try {
    let spaces, taskData, createdTask;
    
    // Базовые тесты API
    await runTest('🔍 Проверка статуса API', testApiStatus);
    await runTest('📋 Получение списка пространств', async () => {
      spaces = await testGetSpaces();
    });
    
    if (spaces && spaces.length > 0) {
      await runTest('📋 Получение задач из пространства', async () => {
        taskData = await testGetTasks(spaces);
      });
      
      // CRUD тесты для задач
      await runTest('➕ Создание тестовой задачи', async () => {
        createdTask = await testCreateTask(taskData.spaceId);
      });
      
      if (createdTask) {
        await runTest('📄 Получение созданной задачи', async () => {
          await testGetTask(taskData.spaceId, createdTask.id);
        });
        
        await runTest('📝 Обновление задачи', async () => {
          await testUpdateTask(taskData.spaceId, createdTask.id);
        });
        
        await runTest('🗑️ Удаление тестовой задачи', async () => {
          await testDeleteTask(taskData.spaceId, createdTask.id);
        });
      }
    }
    
    // Дополнительные тесты интеграции
    await runTest('🐙 Создание задачи из GitHub Issue', testCreateGithubIssue);
    
  } catch (error) {
    console.log(`${RED}💥 Критическая ошибка в тестах: ${error.message}${RESET}`);
    testResults.failed++;
    testResults.errors.push({ test: 'Critical Error', error: error.message });
  }
  
  // Вывод результатов
  console.log(`\n${BLUE}📊 РЕЗУЛЬТАТЫ ТЕСТИРОВАНИЯ${RESET}`);
  console.log('='.repeat(50));
  console.log(`📊 Всего тестов: ${testResults.total}`);
  console.log(`${GREEN}✅ Успешно: ${testResults.passed}${RESET}`);
  console.log(`${RED}❌ Провалено: ${testResults.failed}${RESET}`);
  
  if (testResults.failed === 0) {
    console.log(`\n${GREEN}🎉 ВСЕ ТЕСТЫ ПРОШЛИ УСПЕШНО!${RESET}`);
    console.log(`${GREEN}🚀 Dart AI API полностью интегрирован и работает!${RESET}`);
    process.exit(0);
  } else {
    console.log(`\n${RED}❌ ОБНАРУЖЕНЫ ПРОБЛЕМЫ:${RESET}`);
    testResults.errors.forEach(({ test, error }) => {
      console.log(`   ${RED}• ${test}: ${error}${RESET}`);
    });
    process.exit(1);
  }
}

// Запуск тестирования
runAllTests().catch((error) => {
  console.log(`${RED}💥 Фатальная ошибка: ${error.message}${RESET}`);
  process.exit(1);
});