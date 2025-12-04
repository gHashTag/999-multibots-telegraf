const http = require('http');

// Симулируем webhook от Replicate
const webhookData = {
  id: "72cfqpy61nrm80ctvz7ayx4cag",
  status: "succeeded",
  output: {
    version: "test-version-123",
    weights: "test-weights"
  }
};

const postData = JSON.stringify(webhookData);

const options = {
  hostname: '188.137.250.69',
  port: 3001,
  path: '/api/webhooks/replicate',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(postData)
  }
};

console.log('🧪 Тестирую webhook вручную...');
console.log('Отправляю:', webhookData);

const req = http.request(options, (res) => {
  console.log(`✅ Статус ответа: ${res.statusCode}`);
  console.log('Заголовки:', res.headers);
  
  let data = '';
  res.on('data', (chunk) => {
    data += chunk;
  });
  
  res.on('end', () => {
    console.log('Ответ:', data);
  });
});

req.on('error', (err) => {
  console.error('❌ Ошибка:', err.message);
});

req.write(postData);
req.end();
