#!/usr/bin/env node

const http = require('http');

console.log('🔍 Тестирование порта 3000...\n');

const options = {
  hostname: 'localhost',
  port: 3000,
  path: '/health',
  method: 'GET',
  timeout: 5000
};

console.log('📡 Отправка GET запроса на http://localhost:3000/health');

const req = http.request(options, (res) => {
  console.log(`✅ Статус: ${res.statusCode}`);
  console.log(`📋 Заголовки:`, res.headers);

  let data = '';
  res.on('data', (chunk) => {
    data += chunk;
  });

  res.on('end', () => {
    console.log(`📄 Тело ответа: ${data}`);
    console.log('\n🎉 Сервер на порту 3000 РАБОТАЕТ!');
    process.exit(0);
  });
});

req.on('error', (err) => {
  console.log(`❌ Ошибка соединения: ${err.message}`);
  console.log('💡 Сервер не отвечает на порту 3000');
  process.exit(1);
});

req.on('timeout', () => {
  console.log('⏱️ Таймаут запроса (5 секунд)');
  req.destroy();
  process.exit(1);
});

req.end();
