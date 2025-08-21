#!/usr/bin/env node

/**
 * Тест ПРАВИЛЬНОГО API эндпоинта для генерации видео
 */

const https = require('https');

const API_URL = 'https://ai-server-u14194.vm.elestio.app';

console.log('🔍 ДИАГНОСТИКА БЭКЕНДА - Тест правильного эндпоинта');
console.log('📡 API URL:', API_URL);

/**
 * Правильные тест данные из кода generateTextToVideo.ts
 */
const correctPayload = {
  prompt: "A majestic shaman dancing around a sacred fire in a mystical forest at night",
  videoModel: "kie-veo-3-fast",
  duration: 5,
  aspectRatio: "9:16",
  telegram_id: "144022504",
  username: "neuro_sage",
  is_ru: true,
  bot_name: "clip_maker_neuro_bot"
};

/**
 * Отправка POST запроса
 */
function makeRequest(path, data) {
  return new Promise((resolve, reject) => {
    const url = new URL(API_URL + path);
    const postData = JSON.stringify(data);
    
    const options = {
      hostname: url.hostname,
      port: url.port || 443,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
        'User-Agent': 'TelegramBot/1.0',
        // Возможно нужен API ключ
        'Authorization': `Bearer ${process.env.SECRET_API_KEY || 'test-key'}`
      }
    };

    const request = https.request(options, (res) => {
      let responseData = '';
      
      res.on('data', (chunk) => {
        responseData += chunk;
      });
      
      res.on('end', () => {
        try {
          const parsedData = JSON.parse(responseData);
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            data: parsedData
          });
        } catch (parseError) {
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            data: responseData,
            parseError: parseError.message
          });
        }
      });
    });

    request.on('error', (error) => {
      reject(error);
    });

    request.write(postData);
    request.end();
  });
}

/**
 * Главный тест
 */
async function testCorrectEndpoint() {
  const CORRECT_ENDPOINT = '/generate/text-to-video'; // Из generateTextToVideo.ts:100

  console.log('\n🎯 Тестируем ПРАВИЛЬНЫЙ эндпоинт:', CORRECT_ENDPOINT);
  console.log('📋 Payload:', JSON.stringify(correctPayload, null, 2));

  try {
    const result = await makeRequest(CORRECT_ENDPOINT, correctPayload);
    
    console.log(`\n📊 РЕЗУЛЬТАТ:`);
    console.log(`Status: ${result.statusCode}`);
    console.log(`Response:`, result.data);
    
    if (result.statusCode === 200 || result.statusCode === 201 || result.statusCode === 202) {
      console.log('\n🎉 УСПЕХ! API сервер работает правильно!');
      
      if (result.data && result.data.jobId) {
        console.log(`📝 Job ID: ${result.data.jobId}`);
        console.log('🔄 Можно проверить статус генерации...');
      }
      
      return true;
    } else if (result.statusCode === 404) {
      console.log('\n❌ ПРОБЛЕМА: API эндпоинт не найден (404)');
      console.log('🔧 Возможные причины:');
      console.log('   1. Сервер не настроен правильно');
      console.log('   2. API не развернут');
      console.log('   3. Неправильный путь в nginx конфигурации');
    } else if (result.statusCode === 401 || result.statusCode === 403) {
      console.log('\n🔐 ПРОБЛЕМА: Аутентификация (401/403)');
      console.log('🔧 Нужно проверить API ключи и авторизацию');
    } else if (result.statusCode === 500) {
      console.log('\n💥 ПРОБЛЕМА: Ошибка сервера (500)');
      console.log('🔧 Нужно проверить логи сервера');
    } else {
      console.log(`\n⚠️  НЕОЖИДАННЫЙ STATUS CODE: ${result.statusCode}`);
    }

  } catch (error) {
    console.log('\n💥 КРИТИЧЕСКАЯ ОШИБКА:', error.message);
    console.log('🔧 Возможные причины:');
    console.log('   1. Сервер полностью недоступен');
    console.log('   2. Проблемы с сетью');
    console.log('   3. DNS проблемы');
  }

  return false;
}

// Дополнительная диагностика
async function serverDiagnostics() {
  console.log('\n🔍 ДОПОЛНИТЕЛЬНАЯ ДИАГНОСТИКА:');
  
  // Проверяем базовую доступность сервера
  try {
    const healthResult = await makeRequest('/health', {});
    console.log(`Health endpoint (GET): ${healthResult.statusCode}`);
  } catch (e) {
    console.log('Health endpoint недоступен');
  }

  try {
    const rootResult = await makeRequest('/', {});
    console.log(`Root endpoint (GET): ${rootResult.statusCode}`);
  } catch (e) {
    console.log('Root endpoint недоступен');
  }
}

// Запускаем тесты
async function main() {
  await serverDiagnostics();
  const success = await testCorrectEndpoint();
  
  if (success) {
    console.log('\n✅ ВЕРДИКТ: БЭКЕНД РАБОТАЕТ! Можно интегрировать в wizard.');
  } else {
    console.log('\n❌ ВЕРДИКТ: ПРОБЛЕМА В БЭКЕНДЕ. Нужно исправить сервер.');
  }
}

main().catch(console.error);