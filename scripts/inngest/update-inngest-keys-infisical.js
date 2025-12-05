#!/usr/bin/env node
/**
 * ОБНОВЛЕНИЕ КЛЮЧЕЙ INNGEST В INFISICAL
 * Автоматически обновляет переменные в production environment
 */

const https = require('https');

const NEW_EVENT_KEY = '4JiBiCBZ8en7jNonnsAPXCFiLVkrt1uEXklGcDzaQ6SCBV9p7-UBlQlTrze-x_WPRTihikB_uhAGhbkwGhnu4Q';
const NEW_SIGNING_KEY = 'signkey-test-c4167464e900701832920c98bb2ec6e6e3c59fd2b27c62e1f4140dada01e4597';

console.log('🔧 ОБНОВЛЕНИЕ КЛЮЧЕЙ INNGEST В INFISICAL');
console.log('='.repeat(60));

// Получаем credentials из Infisical
const clientId = process.env.INFISICAL_CLIENT_ID;
const clientSecret = process.env.INFISICAL_CLIENT_SECRET;
const projectId = process.env.INFISICAL_PROJECT_ID;

if (!clientId || !clientSecret || !projectId) {
  console.log('❌ Не найдены Infisical credentials в .env');
  console.log('Нужны:');
  console.log('  • INFISICAL_CLIENT_ID');
  console.log('  • INFISICAL_CLIENT_SECRET');
  console.log('  • INFISICAL_PROJECT_ID');
  process.exit(1);
}

console.log(`✅ Найдены Infisical credentials`);
console.log(`Project ID: ${projectId.substring(0, 8)}...`);

// Функция для обновления секрета
async function updateSecret(secretName, secretValue) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({
      type: 'shared',
      secretValue: secretValue,
      secretComment: `Auto-updated: ${new Date().toISOString()}`
    });

    const options = {
      hostname: 'api.infisical.com',
      port: 443,
      path: `/api/v3/secrets/raw/${secretName}?environmentSlug=prod&projectId=${projectId}`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Client ${clientId}:${clientSecret}`,
        'Content-Length': Buffer.byteLength(payload)
      }
    };

    console.log(`\n📤 Обновляем ${secretName}...`);

    const req = https.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        if (res.statusCode === 200 || res.statusCode === 201) {
          console.log(`✅ ${secretName} обновлён успешно`);
          resolve(data);
        } else {
          console.log(`❌ Ошибка обновления ${secretName}: ${res.statusCode}`);
          console.log(`Ответ: ${data}`);
          reject(new Error(`HTTP ${res.statusCode}: ${data}`));
        }
      });
    });

    req.on('error', (error) => {
      console.log(`❌ Ошибка сети: ${error.message}`);
      reject(error);
    });

    req.write(payload);
    req.end();
  });
}

// Основная функция
async function main() {
  try {
    console.log('\n🎯 Обновляем переменные в production environment...');

    await updateSecret('INNGEST_EVENT_KEY', NEW_EVENT_KEY);
    await updateSecret('INNGEST_SIGNING_KEY', NEW_SIGNING_KEY);

    console.log('\n' + '='.repeat(60));
    console.log('✅ ВСЕ ПЕРЕМЕННЫЕ ОБНОВЛЕНЫ!');
    console.log('\n📋 СЛЕДУЮЩИЕ ШАГИ:');
    console.log('1. Подождите 1-2 минуты для синхронизации Infisical');
    console.log('2. Перезапустите контейнер: docker restart 999-multibots');
    console.log('3. Проверьте логи - ошибки 404 должны исчезнуть');
    console.log('\n🔍 Для проверки используйте:');
    console.log('   curl http://188.137.250.69:3001/api/diagnostic/template2 | jq .envVars');

  } catch (error) {
    console.log('\n❌ ОШИБКА ОБНОВЛЕНИЯ:', error.message);
    process.exit(1);
  }
}

main();
