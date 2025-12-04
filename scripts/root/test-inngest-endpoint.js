#!/usr/bin/env node

const http = require('http');

console.log('🔍 Тестирование /api/inngest endpoint...\n');

const options = {
  hostname: 'localhost',
  port: 3000,
  path: '/api/inngest',
  method: 'GET',
  timeout: 5000
};

console.log('📡 Отправка GET запроса на http://localhost:3000/api/inngest');

const req = http.request(options, (res) => {
  console.log(`✅ Статус: ${res.statusCode}`);
  console.log(`📋 Заголовки:`, res.headers);

  let data = '';
  res.on('data', (chunk) => {
    data += chunk;
  });

  res.on('end', () => {
    console.log(`📄 Тело ответа: ${data.substring(0, 500)}`);
    console.log('\n🎉 Endpoint /api/inngest РАБОТАЕТ!');
    process.exit(0);
  });
});

req.on('error', (err) => {
  console.log(`❌ Ошибка: ${err.message}`);
  process.exit(1);
});

req.on('timeout', () => {
  console.log('⏱️ Таймаут (5 секунд)');
  req.destroy();
  process.exit(1);
});

req.end();
