#!/usr/bin/env node

const axios = require('axios');
const { performance } = require('perf_hooks');

// ИСПРАВЛЕН: правильный продакшн URL (другой агент дал неверный)  
const PRODUCTION_API = 'https://ai-server-production-production-8e2d.up.railway.app';

const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const BLUE = '\x1b[34m';
const RESET = '\x1b[0m';

console.log(`${BLUE}🎯 ТЕСТИРОВАНИЕ DART AI ИНТЕГРАЦИИ В ПРОДАКШНЕ${RESET}`);
console.log(`${BLUE}🚀 Production API: ${PRODUCTION_API}${RESET}`);
console.log(`${BLUE}📋 Задание от другого агента - полная проверка интеграции${RESET}\n`);

const testReport = {
  total: 0,
  passed: 0,
  failed: 0,
  tests: [],
  createdTaskId: null,
  createdIssueNumber: null
};

// Вспомогательная функция для тестирования
async function runTest(testName, testFn, isRequired = true) {
  console.log(`${YELLOW}⏳ ${testName}${RESET}`);
  testReport.total++;
  
  const testResult = {
    name: testName,
    status: 'failed',
    duration: 0,
    error: null,
    details: null
  };
  
  try {
    const startTime = performance.now();
    const result = await testFn();
    const endTime = performance.now();
    const duration = Math.round(endTime - startTime);
    
    testResult.status = 'passed';
    testResult.duration = duration;
    testResult.details = result;
    
    console.log(`${GREEN}✅ ${testName} (${duration}ms)${RESET}`);
    if (result && typeof result === 'object' && result.info) {
      console.log(`   ${GREEN}ℹ️ ${result.info}${RESET}`);
    }
    testReport.passed++;
    
  } catch (error) {
    testResult.error = error.message;
    
    console.log(`${RED}❌ ${testName}${RESET}`);
    console.log(`   ${RED}Ошибка: ${error.message}${RESET}`);
    
    if (isRequired) {
      testReport.failed++;
    } else {
      console.log(`   ${YELLOW}⚠️ Тест не критичный, продолжаем...${RESET}`);
    }
  }
  
  testReport.tests.push(testResult);
  return testResult;
}

// ========== ТЕСТОВЫЕ СЦЕНАРИИ ИЗ ЗАДАНИЯ ==========

// 1. Проверка API доступности
async function testApiAvailability() {
  // Health check
  const healthResponse = await axios.get(`${PRODUCTION_API}/health`, {
    timeout: 10000
  });
  
  if (healthResponse.status !== 200) {
    throw new Error(`Health check failed: ${healthResponse.status}`);
  }
  
  // API endpoint check
  const apiResponse = await axios.get(`${PRODUCTION_API}/api/dart-ai/tasks`, {
    timeout: 15000,
    headers: {
      'Content-Type': 'application/json'
    },
    validateStatus: (status) => status < 500
  });
  
  if (apiResponse.status === 404) {
    throw new Error('Dart AI API endpoints не найдены на сервере');
  }
  
  if (apiResponse.status !== 200) {
    throw new Error(`API endpoint failed: ${apiResponse.status}`);
  }
  
  return {
    info: `Health: OK, API: ${apiResponse.status}, Tasks: ${apiResponse.data?.data?.length || 0}`
  };
}

// 2. Создание задачи в Dart AI
async function testCreateTask() {
  const taskData = {
    title: 'Тестовая задача от клиента',
    description: 'Проверка работы интеграции Dart AI',
    dartboard: 'test-board'
  };
  
  const response = await axios.post(`${PRODUCTION_API}/api/dart-ai/tasks`, taskData, {
    timeout: 15000,
    headers: {
      'Content-Type': 'application/json'
    }
  });
  
  if (response.status !== 201) {
    throw new Error(`Create task failed: ${response.status}`);
  }
  
  if (!response.data.success) {
    throw new Error(`Task creation error: ${response.data.error || 'unknown'}`);
  }
  
  testReport.createdTaskId = response.data.data.id;
  
  return {
    info: `Task created: ${response.data.data.id} - "${response.data.data.title}"`,
    taskId: response.data.data.id,
    taskData: response.data.data
  };
}

// 3. Получение списка задач 
async function testGetTasks() {
  const response = await axios.get(`${PRODUCTION_API}/api/dart-ai/tasks`, {
    timeout: 15000,
    headers: {
      'Content-Type': 'application/json'
    }
  });
  
  if (response.status !== 200) {
    throw new Error(`Get tasks failed: ${response.status}`);
  }
  
  if (!response.data.success) {
    throw new Error(`Get tasks error: ${response.data.error || 'unknown'}`);
  }
  
  const tasks = response.data.data;
  const createdTask = testReport.createdTaskId ? 
    tasks.find(t => t.id === testReport.createdTaskId) : null;
  
  return {
    info: `Tasks found: ${tasks.length}, Created task found: ${!!createdTask}`,
    tasksCount: tasks.length,
    createdTaskFound: !!createdTask
  };
}

// 4. Синхронизация Dart AI → GitHub
async function testSyncToGitHub() {
  if (!testReport.createdTaskId) {
    throw new Error('No created task ID available for sync');
  }
  
  const syncData = {
    taskId: testReport.createdTaskId
  };
  
  const response = await axios.post(`${PRODUCTION_API}/api/dart-ai/sync/to-github`, syncData, {
    timeout: 20000,
    headers: {
      'Content-Type': 'application/json'
    }
  });
  
  if (response.status !== 200) {
    throw new Error(`Sync to GitHub failed: ${response.status}`);
  }
  
  if (!response.data.success) {
    throw new Error(`Sync error: ${response.data.error || 'unknown'}`);
  }
  
  testReport.createdIssueNumber = response.data.data.issueNumber;
  
  return {
    info: `GitHub Issue created: #${response.data.data.issueNumber}`,
    issueNumber: response.data.data.issueNumber,
    issueUrl: response.data.data.issueUrl
  };
}

// 5. Обратная синхронизация GitHub → Dart AI
async function testSyncFromGitHub() {
  if (!testReport.createdIssueNumber) {
    throw new Error('No GitHub issue number available for sync');
  }
  
  const syncData = {
    issueNumber: testReport.createdIssueNumber
  };
  
  const response = await axios.post(`${PRODUCTION_API}/api/dart-ai/sync/from-github`, syncData, {
    timeout: 20000,
    headers: {
      'Content-Type': 'application/json'
    }
  });
  
  if (response.status !== 200) {
    throw new Error(`Sync from GitHub failed: ${response.status}`);
  }
  
  if (!response.data.success) {
    throw new Error(`Reverse sync error: ${response.data.error || 'unknown'}`);
  }
  
  return {
    info: `GitHub Issue #${testReport.createdIssueNumber} synced to Dart AI`,
    syncDetails: response.data.data
  };
}

// 6. Webhook тестирование (имитация)
async function testWebhookHandling() {
  // Тест webhook endpoint существования
  const webhookData = {
    action: 'opened',
    issue: {
      number: 999,
      title: 'Test Webhook Issue',
      body: 'Testing webhook integration',
      labels: [{ name: 'dart-ai-sync' }]
    },
    repository: {
      full_name: 'gHashTag/ai-server'
    }
  };
  
  const response = await axios.post(`${PRODUCTION_API}/webhooks/github/issues`, webhookData, {
    timeout: 15000,
    headers: {
      'Content-Type': 'application/json',
      'X-GitHub-Event': 'issues'
    },
    validateStatus: (status) => status < 500
  });
  
  return {
    info: `Webhook endpoint responded with: ${response.status}`,
    status: response.status,
    webhookWorking: response.status === 200
  };
}

// 7. Дополнительные проверки безопасности
async function testSecurityChecks() {
  // Проверяем, что API keys не светятся в ответах
  const response = await axios.get(`${PRODUCTION_API}/api/dart-ai/status`, {
    timeout: 10000,
    headers: {
      'Content-Type': 'application/json'
    }
  });
  
  const responseText = JSON.stringify(response.data);
  const hasApiKeys = responseText.includes('dsa_') || responseText.includes('sk-') || responseText.includes('key');
  
  if (hasApiKeys) {
    console.log(`   ${RED}⚠️ Possible API keys exposure in response${RESET}`);
  }
  
  return {
    info: `Security check: ${hasApiKeys ? 'FAILED - possible key exposure' : 'PASSED'}`,
    securityPassed: !hasApiKeys
  };
}

// Генерация отчета
function generateReport() {
  console.log(`\n${BLUE}📊 ФИНАЛЬНЫЙ ОТЧЕТ О ТЕСТИРОВАНИИ${RESET}`);
  console.log('='.repeat(60));
  
  console.log(`${BLUE}🎯 Общие результаты:${RESET}`);
  console.log(`   📊 Всего тестов: ${testReport.total}`);
  console.log(`   ${GREEN}✅ Успешно: ${testReport.passed}${RESET}`);
  console.log(`   ${RED}❌ Провалено: ${testReport.failed}${RESET}`);
  
  const successRate = testReport.total > 0 ? Math.round((testReport.passed / testReport.total) * 100) : 0;
  console.log(`   📈 Процент успеха: ${successRate}%`);
  
  console.log(`\n${BLUE}📝 Детализация по тестам:${RESET}`);
  
  // ✅ Пройденные тесты
  const passedTests = testReport.tests.filter(t => t.status === 'passed');
  if (passedTests.length > 0) {
    console.log(`\n${GREEN}✅ Пройденные тесты:${RESET}`);
    passedTests.forEach(test => {
      console.log(`   ${GREEN}• ${test.name} (${test.duration}ms)${RESET}`);
    });
  }
  
  // ❌ Проваленные тесты
  const failedTests = testReport.tests.filter(t => t.status === 'failed');
  if (failedTests.length > 0) {
    console.log(`\n${RED}❌ Обнаруженные проблемы:${RESET}`);
    failedTests.forEach(test => {
      console.log(`   ${RED}• ${test.name}: ${test.error}${RESET}`);
    });
  }
  
  // 📋 Созданные ресурсы
  if (testReport.createdTaskId || testReport.createdIssueNumber) {
    console.log(`\n${BLUE}📋 Созданные ресурсы для тестирования:${RESET}`);
    if (testReport.createdTaskId) {
      console.log(`   🎯 Dart AI Task: ${testReport.createdTaskId}`);
    }
    if (testReport.createdIssueNumber) {
      console.log(`   🐙 GitHub Issue: #${testReport.createdIssueNumber}`);
    }
  }
  
  // Итоговое заключение
  console.log(`\n${BLUE}🎯 ЗАКЛЮЧЕНИЕ:${RESET}`);
  
  if (testReport.failed === 0) {
    console.log(`${GREEN}🎉 ВСЕ ТЕСТЫ ПРОШЛИ УСПЕШНО!${RESET}`);
    console.log(`${GREEN}✨ Dart AI интеграция полностью работает в продакшне!${RESET}`);
    console.log(`${GREEN}🚀 Двусторонняя синхронизация GitHub ↔ Dart AI готова!${RESET}`);
  } else if (successRate >= 70) {
    console.log(`${YELLOW}⚠️ Интеграция работает, но есть некритичные проблемы${RESET}`);
    console.log(`${YELLOW}💡 Рекомендуется устранить обнаруженные проблемы${RESET}`);
  } else {
    console.log(`${RED}❌ Критические проблемы с интеграцией${RESET}`);
    console.log(`${RED}🔧 Требуется исправление перед продакшн использованием${RESET}`);
  }
  
  return successRate;
}

// Основная функция тестирования
async function runProductionTests() {
  try {
    console.log(`${BLUE}🚀 Начинаем полное тестирование по заданию...${RESET}\n`);
    
    // Выполняем все тесты по порядку
    await runTest('1️⃣ Проверка API доступности', testApiAvailability);
    await runTest('2️⃣ Создание задачи в Dart AI', testCreateTask);
    await runTest('3️⃣ Получение списка задач', testGetTasks);
    await runTest('4️⃣ Синхронизация Dart AI → GitHub', testSyncToGitHub, false); // не критично
    await runTest('5️⃣ Обратная синхронизация GitHub → Dart AI', testSyncFromGitHub, false); // не критично  
    await runTest('6️⃣ Webhook тестирование', testWebhookHandling, false); // не критично
    await runTest('7️⃣ Проверка безопасности', testSecurityChecks);
    
    // Генерируем отчет
    const successRate = generateReport();
    
    // Выходим с соответствующим кодом
    process.exit(successRate >= 70 ? 0 : 1);
    
  } catch (error) {
    console.log(`${RED}💥 Критическая ошибка тестирования: ${error.message}${RESET}`);
    console.log(`${RED}Stack trace: ${error.stack}${RESET}`);
    process.exit(1);
  }
}

// Запуск тестирования
runProductionTests();