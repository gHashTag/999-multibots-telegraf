#!/usr/bin/env node

const axios = require('axios');

// ВАШ основной API сервер на Railway
const RAILWAY_SERVER = 'https://ai-server-production-production-8e2d.up.railway.app';

const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const BLUE = '\x1b[34m';
const RESET = '\x1b[0m';

console.log(`${BLUE}🚀 ТЕСТИРОВАНИЕ RAILWAY API СЕРВЕРА${RESET}`);
console.log(`${BLUE}🚂 Railway: ${RAILWAY_SERVER}${RESET}\n`);

async function quickApiTest() {
  const tests = [
    {
      name: '🌐 Проверка доступности Railway сервера',
      url: RAILWAY_SERVER,
      method: 'GET'
    },
    {
      name: '❤️ Health endpoint', 
      url: `${RAILWAY_SERVER}/api/health`,
      method: 'GET'
    },
    {
      name: '🔧 Dart AI Status',
      url: `${RAILWAY_SERVER}/api/dart-ai/status`,
      method: 'GET'
    },
    {
      name: '📋 Dart AI Spaces',
      url: `${RAILWAY_SERVER}/api/dart-ai/spaces`,
      method: 'GET'
    }
  ];

  let passed = 0;
  let failed = 0;

  for (const test of tests) {
    try {
      console.log(`${YELLOW}⏳ ${test.name}${RESET}`);
      
      const response = await axios({
        method: test.method,
        url: test.url,
        timeout: 10000,
        validateStatus: (status) => status < 500
      });
      
      console.log(`${GREEN}✅ ${test.name} - Status: ${response.status}${RESET}`);
      
      if (response.data) {
        if (test.url.includes('status') && response.data.data) {
          console.log(`   🔧 Configured: ${response.data.data.configured}`);
          console.log(`   🔑 API Key: ${response.data.data.api_key_present}`);
        } else if (test.url.includes('spaces') && response.data.data) {
          console.log(`   📋 Spaces found: ${response.data.data.length}`);
        } else if (test.url.includes('health')) {
          console.log(`   ❤️ Status: ${response.data.status || 'OK'}`);
        }
      }
      
      passed++;
      
    } catch (error) {
      console.log(`${RED}❌ ${test.name} - Error: ${error.message}${RESET}`);
      failed++;
    }
    
    console.log(''); // Пустая строка для разделения
  }

  console.log(`${BLUE}📊 РЕЗУЛЬТАТЫ:${RESET}`);
  console.log(`${GREEN}✅ Успешно: ${passed}${RESET}`);
  console.log(`${RED}❌ Провалено: ${failed}${RESET}`);

  if (passed > failed) {
    console.log(`\n${GREEN}🎉 RAILWAY API РАБОТАЕТ!${RESET}`);
    
    if (passed === tests.length) {
      console.log(`${GREEN}✨ ВСЕ ТЕСТЫ ПРОШЛИ! DART AI ИНТЕГРАЦИЯ РАБОТАЕТ!${RESET}`);
    }
  } else {
    console.log(`\n${RED}⚠️ ЕСТЬ ПРОБЛЕМЫ С API${RESET}`);
  }
}

// Дополнительный тест - создание задачи
async function testCreateTask() {
  try {
    console.log(`${BLUE}🧪 ДОПОЛНИТЕЛЬНЫЙ ТЕСТ - СОЗДАНИЕ ЗАДАЧИ${RESET}\n`);
    
    // Сначала получаем spaces
    const spacesResponse = await axios.get(`${RAILWAY_SERVER}/api/dart-ai/spaces`, {
      timeout: 15000
    });
    
    if (!spacesResponse.data.success || spacesResponse.data.data.length === 0) {
      console.log(`${YELLOW}⚠️ Нет доступных пространств для создания задачи${RESET}`);
      return;
    }
    
    const spaceId = spacesResponse.data.data[0].id;
    console.log(`${BLUE}📋 Используем пространство: ${spacesResponse.data.data[0].name} (${spaceId})${RESET}`);
    
    // Создаем тестовую задачу
    const taskData = {
      title: `🧪 Railway API Test ${Date.now()}`,
      description: '🧪 Тестовая задача для проверки Railway интеграции',
      status: 'todo',
      priority: 'medium',
      tags: ['railway-test', 'api-integration']
    };
    
    console.log(`${YELLOW}⏳ Создание тестовой задачи...${RESET}`);
    
    const createResponse = await axios.post(`${RAILWAY_SERVER}/api/dart-ai/tasks/${spaceId}`, taskData, {
      headers: {
        'Content-Type': 'application/json'
      },
      timeout: 15000
    });
    
    if (createResponse.data.success) {
      console.log(`${GREEN}✅ ЗАДАЧА СОЗДАНА УСПЕШНО!${RESET}`);
      console.log(`   🆔 ID: ${createResponse.data.data.id}`);
      console.log(`   📝 Title: ${createResponse.data.data.title}`);
      
      // Попробуем удалить тестовую задачу
      try {
        await axios.delete(`${RAILWAY_SERVER}/api/dart-ai/tasks/${spaceId}/${createResponse.data.data.id}`, {
          timeout: 10000
        });
        console.log(`${GREEN}🧹 Тестовая задача удалена${RESET}`);
      } catch (deleteError) {
        console.log(`${YELLOW}⚠️ Не удалось удалить тестовую задачу: ${deleteError.message}${RESET}`);
      }
      
    } else {
      console.log(`${RED}❌ Ошибка создания задачи: ${createResponse.data.error}${RESET}`);
    }
    
  } catch (error) {
    console.log(`${RED}❌ Ошибка тестирования создания задачи: ${error.message}${RESET}`);
  }
}

// Запуск всех тестов
async function runAllTests() {
  await quickApiTest();
  await testCreateTask();
  
  console.log(`\n${BLUE}🎯 ЗАКЛЮЧЕНИЕ:${RESET}`);
  console.log(`${BLUE}Если тесты прошли успешно, значит ваша интеграция Dart AI готова к использованию!${RESET}`);
}

runAllTests().catch((error) => {
  console.log(`${RED}💥 Критическая ошибка: ${error.message}${RESET}`);
  process.exit(1);
});