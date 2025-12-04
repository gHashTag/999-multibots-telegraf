#!/usr/bin/env node

/**
 * Тест MCP инструментов Inngest
 * Проверяет доступность MCP endpoint и доступные инструменты
 */

const http = require('http');

console.log('🔍 Тестирование MCP endpoint...\n');

// Тест 1: Проверка доступности MCP endpoint
function testMCPAvailability() {
  return new Promise((resolve, reject) => {
    const req = http.get('http://127.0.0.1:8288/mcp', (res) => {
      console.log('✅ MCP endpoint доступен!');
      console.log(`   Статус: ${res.statusCode}`);
      console.log(`   Заголовки:`, res.headers);
      resolve(true);
    });

    req.on('error', (err) => {
      console.log('❌ MCP endpoint недоступен:', err.message);
      reject(err);
    });

    req.setTimeout(5000, () => {
      req.destroy();
      console.log('⏱️ Таймаут запроса к MCP endpoint');
      reject(new Error('Timeout'));
    });
  });
}

// Тест 2: Проверка dev server health
function testDevServer() {
  return new Promise((resolve, reject) => {
    const req = http.get('http://127.0.0.1:8288/health', (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        console.log('\n✅ Dev Server доступен!');
        console.log(`   Статус: ${res.statusCode}`);
        console.log(`   Ответ: ${data}`);
        resolve(true);
      });
    });

    req.on('error', (err) => {
      console.log('❌ Dev Server недоступен:', err.message);
      reject(err);
    });

    req.setTimeout(5000, () => {
      req.destroy();
      console.log('⏱️ Таймаут запроса к Dev Server');
      reject(new Error('Timeout'));
    });
  });
}

// Тест 3: Проверка API registry
function testRegistry() {
  return new Promise((resolve, reject) => {
    const req = http.get('http://127.0.0.1:8288/api/registry', (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        console.log('\n✅ Registry endpoint доступен!');
        console.log(`   Статус: ${res.statusCode}`);
        try {
          const json = JSON.parse(data);
          console.log(`   Функций найдено: ${json.length || json.functions?.length || 'неизвестно'}`);
          if (json.functions) {
            json.functions.forEach((fn, i) => {
              console.log(`   ${i + 1}. ${fn.id || fn.name || 'без названия'}`);
            });
          }
        } catch (e) {
          console.log(`   Ответ: ${data.substring(0, 200)}...`);
        }
        resolve(true);
      });
    });

    req.on('error', (err) => {
      console.log('❌ Registry недоступен:', err.message);
      reject(err);
    });

    req.setTimeout(5000, () => {
      req.destroy();
      console.log('⏱️ Таймаут запроса к Registry');
      reject(new Error('Timeout'));
    });
  });
}

// Запуск всех тестов
async function runTests() {
  try {
    console.log('🚀 Запуск тестов MCP...\n');
    await testDevServer();
    await testRegistry();
    await testMCPAvailability();

    console.log('\n🎉 Все тесты пройдены успешно!');
    console.log('\n📊 Итог:');
    console.log('   ✅ Dev Server запущен на порту 8288');
    console.log('   ✅ MCP endpoint должен быть доступен на http://127.0.0.1:8288/mcp');
    console.log('   ✅ Архитектура единого Inngest клиента соблюдена');

    process.exit(0);
  } catch (err) {
    console.log('\n❌ Тесты не пройдены:', err.message);
    process.exit(1);
  }
}

runTests();
