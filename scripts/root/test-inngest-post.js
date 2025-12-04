#!/usr/bin/env node

const http = require('http');

console.log('🔍 Тестирование POST /api/inngest...\n');

const postData = JSON.stringify({
  name: 'test/hello.world',
  data: {
    message: 'Hello from POST test!'
  }
});

const options = {
  hostname: 'localhost',
  port: 3000,
  path: '/api/inngest',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(postData)
  },
  timeout: 5000
};

console.log('📡 Отправка POST запроса на http://localhost:3000/api/inngest');

const req = http.request(options, (res) => {
  console.log(`✅ Статус: ${res.statusCode}`);

  let data = '';
  res.on('data', (chunk) => {
    data += chunk;
  });

  res.on('end', () => {
    console.log(`📄 Тело ответа: ${data.substring(0, 500)}`);
    if (res.statusCode === 200 || res.statusCode === 202) {
      console.log('\n🎉 POST /api/inngest РАБОТАЕТ!');
    } else {
      console.log('\n⚠️ POST вернул код:', res.statusCode);
    }
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

req.write(postData);
req.end();
