#!/usr/bin/env node

const axios = require('axios');

// ВАШ внешний API сервер
const EXTERNAL_API_URL = 'https://ai-server-production-production-8e2d.up.railway.app';

const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const BLUE = '\x1b[34m';
const RESET = '\x1b[0m';

console.log(`${BLUE}🔧 ТЕСТИРОВАНИЕ ПОДКЛЮЧЕНИЯ К ВНЕШНЕМУ API СЕРВЕРУ${RESET}`);
console.log(`${BLUE}🚀 Внешний сервер: ${EXTERNAL_API_URL}${RESET}\n`);

// Тестируем DartAIService из нашего кода
async function testDartAIService() {
  try {
    console.log(`${YELLOW}📦 Тестирование DartAIService...${RESET}`);
    
    // Загружаем наш сервис
    process.env.NODE_ENV = 'test'; // Чтобы избежать проблем с загрузкой
    require('ts-node/register');
    
    const { DartAIService } = require('./src/services/dart-ai.service.ts');
    const dartAI = new DartAIService();
    
    console.log(`${GREEN}✅ DartAIService загружен${RESET}`);
    console.log(`   🌐 Base URL: ${EXTERNAL_API_URL}`);
    
    // Проверяем isConfigured
    const isConfigured = dartAI.isConfigured();
    console.log(`   ⚙️ Configured: ${isConfigured}`);
    
    return dartAI;
    
  } catch (error) {
    console.log(`${RED}❌ Ошибка загрузки DartAIService: ${error.message}${RESET}`);
    throw error;
  }
}

// Проверяем доступные эндпоинты на внешнем сервере
async function checkAvailableEndpoints() {
  console.log(`${YELLOW}🔍 Проверка доступных эндпоинтов на внешнем сервере...${RESET}`);
  
  const endpointsToCheck = [
    '/',
    '/health', 
    '/api/health',
    '/api/dart-ai/status',
    '/api/dart-ai/spaces',
    '/dart-ai/status', // Может быть без /api префикса
    '/dart-ai/spaces'
  ];
  
  const workingEndpoints = [];
  const notFoundEndpoints = [];
  
  for (const endpoint of endpointsToCheck) {
    try {
      const response = await axios.get(`${EXTERNAL_API_URL}${endpoint}`, {
        timeout: 10000,
        validateStatus: (status) => status < 500
      });
      
      if (response.status === 200) {
        console.log(`${GREEN}✅ ${endpoint} - Status: ${response.status}${RESET}`);
        workingEndpoints.push(endpoint);
      } else if (response.status === 404) {
        console.log(`${YELLOW}🔍 ${endpoint} - Status: 404 (Not Found)${RESET}`);
        notFoundEndpoints.push(endpoint);
      } else {
        console.log(`${YELLOW}⚠️ ${endpoint} - Status: ${response.status}${RESET}`);
      }
      
    } catch (error) {
      console.log(`${RED}❌ ${endpoint} - Error: ${error.message}${RESET}`);
      notFoundEndpoints.push(endpoint);
    }
  }
  
  console.log(`\n${BLUE}📊 РЕЗУЛЬТАТЫ ПРОВЕРКИ ЭНДПОИНТОВ:${RESET}`);
  console.log(`${GREEN}✅ Работающие: ${workingEndpoints.length}${RESET}`);
  console.log(`${RED}❌ Недоступные: ${notFoundEndpoints.length}${RESET}`);
  
  if (workingEndpoints.length > 0) {
    console.log(`\n${GREEN}🎉 РАБОТАЮЩИЕ ЭНДПОИНТЫ:${RESET}`);
    workingEndpoints.forEach(endpoint => {
      console.log(`   ${GREEN}• ${endpoint}${RESET}`);
    });
  }
  
  if (notFoundEndpoints.some(ep => ep.includes('dart-ai'))) {
    console.log(`\n${RED}⚠️ DART AI ЭНДПОИНТЫ НЕ НАЙДЕНЫ!${RESET}`);
    console.log(`${YELLOW}💡 Возможные причины:${RESET}`);
    console.log(`   ${YELLOW}• Dart AI маршруты не развернуты на внешнем сервере${RESET}`);
    console.log(`   ${YELLOW}• Другой путь к эндпоинтам${RESET}`);
    console.log(`   ${YELLOW}• API еще не готов на внешнем сервере${RESET}`);
  }
  
  return workingEndpoints;
}

// Тестируем методы DartAI сервиса с реальными вызовами
async function testDartAIMethods(dartAI) {
  console.log(`\n${YELLOW}🧪 Тестирование методов DartAI сервиса...${RESET}`);
  
  try {
    // Тест получения пространств
    console.log(`${YELLOW}⏳ Получение пространств...${RESET}`);
    const spaces = await dartAI.getSpaces();
    
    console.log(`${GREEN}✅ getSpaces() работает!${RESET}`);
    console.log(`   📋 Пространств найдено: ${spaces.length}`);
    
    if (spaces.length > 0) {
      console.log(`   📝 Первое: "${spaces[0].name}" (${spaces[0].id})`);
      
      // Тест получения задач
      try {
        console.log(`${YELLOW}⏳ Получение задач из первого пространства...${RESET}`);
        const tasks = await dartAI.getTasks(spaces[0].id);
        
        console.log(`${GREEN}✅ getTasks() работает!${RESET}`);
        console.log(`   📋 Задач найдено: ${tasks.length}`);
        
        if (tasks.length > 0) {
          console.log(`   📝 Первая: "${tasks[0].title}"`);
        }
        
      } catch (taskError) {
        console.log(`${RED}❌ getTasks() ошибка: ${taskError.message}${RESET}`);
      }
    }
    
    return true;
    
  } catch (error) {
    console.log(`${RED}❌ getSpaces() ошибка: ${error.message}${RESET}`);
    
    if (error.message.includes('404')) {
      console.log(`${YELLOW}💡 Это означает, что Dart AI эндпоинты не найдены на внешнем сервере${RESET}`);
    }
    
    return false;
  }
}

// Главная функция тестирования
async function runTests() {
  try {
    // 1. Проверяем доступные эндпоинты
    const workingEndpoints = await checkAvailableEndpoints();
    
    // 2. Тестируем DartAI Service
    const dartAI = await testDartAIService();
    
    // 3. Тестируем методы сервиса
    const methodsWork = await testDartAIMethods(dartAI);
    
    // Итоги
    console.log(`\n${BLUE}🎯 ИТОГИ ТЕСТИРОВАНИЯ:${RESET}`);
    
    if (workingEndpoints.length > 0 && methodsWork) {
      console.log(`${GREEN}🎉 ВСЕ РАБОТАЕТ! Dart AI интеграция готова!${RESET}`);
    } else if (workingEndpoints.length > 0 && !methodsWork) {
      console.log(`${YELLOW}⚠️ Внешний сервер работает, но Dart AI эндпоинты недоступны${RESET}`);
      console.log(`${YELLOW}💡 Нужно развернуть Dart AI маршруты на внешнем сервере${RESET}`);
    } else {
      console.log(`${RED}❌ Проблемы с подключением к внешнему серверу${RESET}`);
    }
    
  } catch (error) {
    console.log(`${RED}💥 Критическая ошибка тестирования: ${error.message}${RESET}`);
  }
}

// Запуск тестов
runTests().catch(error => {
  console.log(`${RED}💥 Фатальная ошибка: ${error.message}${RESET}`);
  process.exit(1);
});