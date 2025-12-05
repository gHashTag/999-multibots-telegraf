#!/usr/bin/env node

const https = require('https');

console.log('='.repeat(70));
console.log('🔍 ПРОВЕРКА ROBOKASSA СЕКРЕТОВ');
console.log('='.repeat(70));
console.log('');

// URL для тестирования платежа
const testPaymentUrl = 'http://188.137.250.69:3001/scenes/balance-topup';

console.log('📋 Создаем тестовый платеж на 1 рубль...');
console.log(`   URL: ${testPaymentUrl}`);
console.log('');

const postData = JSON.stringify({
  action: 'test_robokassa_secrets',
  amount: 1
});

const options = {
  hostname: '188.137.250.69',
  port: 3001,
  path: '/api/test-secrets',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(postData)
  }
};

console.log('🚀 Отправляем запрос...');

const req = https.request(options, (res) => {
  let data = '';

  res.on('data', (chunk) => {
    data += chunk;
  });

  res.on('end', () => {
    console.log(`✅ Статус ответа: ${res.statusCode}`);
    console.log('');

    try {
      const parsed = JSON.parse(data);
      console.log('📊 ОТВЕТ СЕРВЕРА:');
      console.log(JSON.stringify(parsed, null, 2));
      console.log('');

      if (parsed.credentials) {
        console.log('🔐 ПРОВЕРКА CREDENTIALS:');
        console.log(`   MERCHANT_LOGIN: ${parsed.credentials.merchantLogin || 'НЕ НАЙДЕН'}`);
        console.log(`   PASSWORD_1: ${parsed.credentials.password1 || 'НЕ НАЙДЕН'}`);
        console.log(`   PASSWORD_2: ${parsed.credentials.password2 || 'НЕ НАЙДЕН'}`);
        console.log('');

        if (parsed.credentials.password1 && parsed.credentials.password1.length > 0) {
          console.log('✅ Статус: SECRETS ЗАГРУЖЕНЫ!');
        } else {
          console.log('❌ Статус: SECRETS НЕ ЗАГРУЖЕНЫ!');
        }
      }

      if (parsed.url) {
        console.log('');
        console.log('🧪 ТЕСТОВЫЙ URL:');
        console.log(parsed.url);
        console.log('');
        console.log('🌐 Откройте URL в браузере для проверки');
      }

    } catch (e) {
      console.log('❌ Ошибка парсинга ответа:');
      console.log(data);
    }

    console.log('');
    console.log('='.repeat(70));
    console.log('ПРОВЕРКА ЗАВЕРШЕНА');
    console.log('='.repeat(70));
  });
});

req.on('error', (error) => {
  console.log(`❌ Ошибка запроса: ${error.message}`);
  console.log('');
  console.log('Попробуйте:');
  console.log('1. Убедиться, что сервер доступен: curl http://188.137.250.69:3001/health');
  console.log('2. Проверить логи: ssh prod999 "docker logs 999-multibots --tail 100"');
});

req.write(postData);
req.end();
