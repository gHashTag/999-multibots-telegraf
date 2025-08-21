#!/usr/bin/env node

/**
 * Тест API сервера для генерации вертикального видео 9:16
 */

const https = require('https');
const http = require('http');

// URL из конфига (видим в логах)
// const API_URL = 'https://d8dc81a4a0aa.ngrok.apify_api_gveJRh0LmSZSOxnZvQVp2MKYSfj3au2mmDed'; // не работает
const API_URL = 'https://ai-server-u14194.vm.elestio.app'; // основной сервер

console.log('🧪 Тест API сервера для генерации видео 9:16');
console.log('📡 API URL:', API_URL);

/**
 * Тест данные для Veo 3 Fast с вертикальным соотношением сторон
 */
const testPayload = {
  prompt: "A majestic shaman dancing around a sacred fire in a mystical forest at night",
  model: "kie-veo-3-fast", // Модель из логов
  aspectRatio: "9:16",      // Вертикальное соотношение
  duration: 5,              // 5 секунд
  userId: "test-user-144022504"
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
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname + url.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
        'User-Agent': 'VideoTest/1.0'
      }
    };

    const request = (url.protocol === 'https:' ? https : http).request(options, (res) => {
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
 * Основная функция тестирования
 */
async function runTest() {
  try {
    console.log('\n🚀 Начинаем тест...');
    console.log('📋 Тест данные:', JSON.stringify(testPayload, null, 2));
    
    // Тестируем разные эндпоинты
    const endpoints = [
      '/generate-video',
      '/api/generate-video', 
      '/text-to-video',
      '/api/text-to-video',
      '/video/generate'
    ];

    for (const endpoint of endpoints) {
      console.log(`\n📡 Тестируем эндпоинт: ${endpoint}`);
      
      try {
        const result = await makeRequest(endpoint, testPayload);
        
        console.log(`✅ Статус: ${result.statusCode}`);
        console.log('📄 Ответ:', result.data);
        
        if (result.statusCode === 200 || result.statusCode === 201) {
          console.log('🎉 УСПЕХ! Сервер отвечает на эндпоинт:', endpoint);
          
          // Если есть ID задачи, попробуем проверить статус
          if (result.data && (result.data.id || result.data.taskId || result.data.jobId)) {
            const taskId = result.data.id || result.data.taskId || result.data.jobId;
            console.log('🔍 ID задачи:', taskId);
            
            // Проверяем статус через некоторое время
            console.log('⏳ Ждем 3 секунды и проверяем статус...');
            setTimeout(async () => {
              try {
                const statusResult = await makeRequest(`/status/${taskId}`, {});
                console.log('📊 Статус задачи:', statusResult.data);
              } catch (statusError) {
                console.log('⚠️  Не удалось проверить статус:', statusError.message);
              }
            }, 3000);
          }
          
          return; // Выходим после первого успешного эндпоинта
        } else {
          console.log(`❌ Неуспешный статус: ${result.statusCode}`);
        }
        
      } catch (error) {
        console.log(`❌ Ошибка запроса: ${error.message}`);
      }
    }
    
    console.log('\n💔 Ни один эндпоинт не работает. Возможные проблемы:');
    console.log('1. Сервер не запущен или недоступен');
    console.log('2. Неправильный URL API');
    console.log('3. Требуется аутентификация');
    console.log('4. Другие настройки безопасности');
    
  } catch (error) {
    console.error('💥 Критическая ошибка:', error);
  }
}

// Сначала попробуем простой ping
async function pingServer() {
  console.log('\n🏓 Проверяем доступность сервера...');
  
  try {
    const result = await makeRequest('/health', {});
    console.log('✅ Сервер отвечает на /health:', result);
  } catch (error) {
    console.log('❌ /health недоступен:', error.message);
  }

  try {
    const result = await makeRequest('/', {});
    console.log('✅ Корневой путь отвечает:', result);
  } catch (error) {
    console.log('❌ Корневой путь недоступен:', error.message);
  }
}

// Запускаем тесты
async function main() {
  await pingServer();
  await runTest();
}

main().catch(console.error);