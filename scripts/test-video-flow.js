#!/usr/bin/env node

/**
 * Скрипт для тестирования полного цикла генерации видео
 * Имитирует поведение бота и проследит весь процесс
 */

const axios = require('axios');
require('dotenv').config();

// Конфигурация
const API_SERVER_URL = process.env.API_SERVER_URL || 'https://ai-server-production-production-8e2d.up.railway.app';
const SECRET_API_KEY = process.env.SECRET_API_KEY;

// Цвета для консоли
const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  reset: '\x1b[0m',
  bold: '\x1b[1m'
};

function log(message, color = 'reset') {
  const timestamp = new Date().toISOString().substr(11, 12);
  console.log(`${colors.cyan}[${timestamp}]${colors.reset} ${colors[color]}${message}${colors.reset}`);
}

function logSection(title) {
  console.log('\n' + '='.repeat(80));
  log(`${title}`, 'bold');
  console.log('='.repeat(80));
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function testVideoGeneration() {
  logSection('🎬 ТЕСТИРОВАНИЕ ПОЛНОГО ЦИКЛА ГЕНЕРАЦИИ ВИДЕО');
  
  const testPayload = {
    prompt: "Beautiful sunset over mountains, cinematic quality",
    videoModel: "kie-veo-3-fast", 
    aspectRatio: "9:16",
    duration: 5,
    telegram_id: "test_diagnostic_user",
    username: "test_user",
    is_ru: true,
    bot_name: "diagnostic_bot"
  };
  
  log('📝 Параметры теста:', 'yellow');
  console.log(JSON.stringify(testPayload, null, 2));
  
  try {
    // Шаг 1: Отправка запроса на генерацию
    log('🚀 Шаг 1: Отправка запроса на генерацию видео...', 'blue');
    
    const startTime = Date.now();
    const response = await axios.post(`${API_SERVER_URL}/generate/text-to-video`, testPayload, {
      headers: {
        'Content-Type': 'application/json',
        'x-secret-key': SECRET_API_KEY
      },
      timeout: 30000
    });
    
    const requestTime = Date.now() - startTime;
    log(`✅ Запрос отправлен успешно (${requestTime}ms)`, 'green');
    log(`📋 Ответ сервера: ${JSON.stringify(response.data)}`, 'cyan');
    
    // Анализируем ответ
    const { success, message, jobId, videoUrl, error } = response.data;
    
    if (error) {
      log(`❌ Сервер вернул ошибку: ${error}`, 'red');
      return false;
    }
    
    if (videoUrl) {
      log('🎯 Видео готово сразу!', 'green');
      return await testVideoUrl(videoUrl);
    }
    
    if (jobId) {
      log(`🆔 Получен Job ID: ${jobId}`, 'yellow');
      return await monitorJobProgress(jobId);
    }
    
    if (message && message.includes('Processing')) {
      log('⏳ Генерация запущена, но без Job ID', 'yellow');
      log('⚠️  Проблема: Нет способа отследить прогресс без Job ID', 'red');
      return false;
    }
    
    log('❓ Неожиданный ответ сервера', 'red');
    return false;
    
  } catch (error) {
    log(`❌ Ошибка при отправке запроса: ${error.message}`, 'red');
    
    if (error.response) {
      log(`📊 HTTP статус: ${error.response.status}`, 'red');
      log(`📋 Тело ответа: ${JSON.stringify(error.response.data)}`, 'red');
      
      // Анализ конкретных ошибок
      if (error.response.status === 401) {
        log('🔐 Проблема с авторизацией - проверьте SECRET_API_KEY', 'red');
      } else if (error.response.status === 429) {
        log('⏱️  Превышен лимит запросов', 'red');
      } else if (error.response.status === 500) {
        log('🔥 Внутренняя ошибка сервера', 'red');
      }
    }
    
    return false;
  }
}

async function monitorJobProgress(jobId, maxAttempts = 20) {
  logSection(`🔍 МОНИТОРИНГ ПРОГРЕССА JOB: ${jobId}`);
  
  let attempts = 0;
  
  while (attempts < maxAttempts) {
    attempts++;
    
    try {
      log(`🔄 Попытка ${attempts}/${maxAttempts}: Проверка статуса...`, 'yellow');
      
      const response = await axios.get(`${API_SERVER_URL}/generate/text-to-video/status/${jobId}`, {
        headers: {
          'x-secret-key': SECRET_API_KEY
        },
        timeout: 10000
      });
      
      log(`📊 Ответ: ${JSON.stringify(response.data)}`, 'cyan');
      
      const { success, videoUrl, error, status, progress } = response.data;
      
      if (error) {
        log(`❌ Ошибка генерации: ${error}`, 'red');
        return false;
      }
      
      if (videoUrl) {
        log('🎉 Видео готово!', 'green');
        return await testVideoUrl(videoUrl);
      }
      
      if (status) {
        log(`📈 Статус: ${status}`, 'blue');
      }
      
      if (progress) {
        log(`📊 Прогресс: ${progress}%`, 'blue');
      }
      
      // Ждем перед следующей проверкой
      log('⏳ Ждем 10 секунд перед следующей проверкой...', 'yellow');
      await sleep(10000);
      
    } catch (error) {
      if (error.response && error.response.status === 404) {
        log(`❌ Job ID ${jobId} не найден`, 'red');
        return false;
      }
      
      log(`❌ Ошибка при проверке статуса: ${error.message}`, 'red');
      
      // Ждем перед повторной попыткой
      await sleep(5000);
    }
  }
  
  log(`⏰ Таймаут: Превышено максимальное количество попыток (${maxAttempts})`, 'red');
  return false;
}

async function testVideoUrl(videoUrl) {
  logSection(`🔗 ПРОВЕРКА ДОСТУПНОСТИ ВИДЕО: ${videoUrl}`);
  
  try {
    // Проверяем доступность URL
    log('🌐 Проверка доступности URL...', 'yellow');
    
    const headResponse = await axios.head(videoUrl, {
      timeout: 10000,
      maxRedirects: 5
    });
    
    log(`✅ URL доступен (HTTP ${headResponse.status})`, 'green');
    log(`📏 Content-Length: ${headResponse.headers['content-length'] || 'не указан'}`, 'cyan');
    log(`📋 Content-Type: ${headResponse.headers['content-type'] || 'не указан'}`, 'cyan');
    
    // Проверяем, можем ли скачать файл
    log('⬇️  Проба скачивания начала файла...', 'yellow');
    
    const partialResponse = await axios.get(videoUrl, {
      timeout: 15000,
      responseType: 'stream',
      headers: {
        'Range': 'bytes=0-1023' // Скачиваем первый килобайт
      }
    });
    
    log('✅ Файл доступен для скачивания', 'green');
    
    // Проверяем заголовки для Telegram Bot API
    const headers = headResponse.headers;
    
    if (headers['content-type'] && headers['content-type'].startsWith('video/')) {
      log('✅ Правильный Content-Type для видео', 'green');
    } else {
      log('⚠️  Неожиданный Content-Type', 'yellow');
    }
    
    if (headers['content-length']) {
      const sizeInMB = parseInt(headers['content-length']) / (1024 * 1024);
      log(`📏 Размер файла: ${sizeInMB.toFixed(2)} MB`, 'cyan');
      
      if (sizeInMB > 50) {
        log('⚠️  Файл слишком большой для Telegram (>50MB)', 'yellow');
      }
    }
    
    // Тестируем доступность для Telegram Bot API
    await testTelegramCompatibility(videoUrl);
    
    return true;
    
  } catch (error) {
    log(`❌ Ошибка при проверке видео URL: ${error.message}`, 'red');
    
    if (error.response) {
      log(`📊 HTTP статус: ${error.response.status}`, 'red');
      
      if (error.response.status === 403) {
        log('🔒 Доступ запрещен - возможна проблема с CORS или авторизацией', 'red');
      } else if (error.response.status === 404) {
        log('📂 Файл не найден', 'red');
      }
    }
    
    return false;
  }
}

async function testTelegramCompatibility(videoUrl) {
  logSection('🤖 ПРОВЕРКА СОВМЕСТИМОСТИ С TELEGRAM BOT API');
  
  try {
    // Симулируем запрос как делает Telegram Bot API
    const response = await axios.head(videoUrl, {
      timeout: 30000,
      headers: {
        'User-Agent': 'TelegramBot (like TwitterBot)',
        'Accept': '*/*'
      }
    });
    
    log('✅ URL доступен для Telegram Bot API', 'green');
    
    // Проверяем важные заголовки
    const requiredHeaders = ['content-type', 'content-length'];
    
    for (const header of requiredHeaders) {
      if (response.headers[header]) {
        log(`✅ Заголовок ${header}: ${response.headers[header]}`, 'green');
      } else {
        log(`⚠️  Отсутствует заголовок ${header}`, 'yellow');
      }
    }
    
    // Проверяем CORS заголовки
    const corsHeaders = ['access-control-allow-origin', 'access-control-allow-methods'];
    
    for (const header of corsHeaders) {
      if (response.headers[header]) {
        log(`🌐 CORS ${header}: ${response.headers[header]}`, 'blue');
      }
    }
    
    return true;
    
  } catch (error) {
    log(`❌ Проблема совместимости с Telegram: ${error.message}`, 'red');
    return false;
  }
}

async function main() {
  log('🚀 ЗАПУСК ТЕСТА ПОЛНОГО ЦИКЛА ГЕНЕРАЦИИ ВИДЕО', 'bold');
  
  if (!SECRET_API_KEY) {
    log('❌ Отсутствует SECRET_API_KEY в переменных окружения', 'red');
    process.exit(1);
  }
  
  log(`🔗 API Server: ${API_SERVER_URL}`, 'cyan');
  log(`🔑 Secret Key: ${SECRET_API_KEY.substring(0, 8)}...`, 'cyan');
  
  const success = await testVideoGeneration();
  
  logSection('📊 РЕЗУЛЬТАТ ТЕСТА');
  
  if (success) {
    log('✅ ТЕСТ ПРОЙДЕН: Система генерации видео работает корректно', 'green');
  } else {
    log('❌ ТЕСТ НЕ ПРОЙДЕН: Обнаружены проблемы в системе генерации видео', 'red');
    
    log('\n🔧 Возможные причины:', 'yellow');
    log('   1. Проблемы с API ключом или авторизацией', 'yellow');
    log('   2. Сервер не возвращает Job ID для отслеживания', 'yellow');
    log('   3. Проблемы с доступностью видео файлов', 'yellow');
    log('   4. Проблемы с CORS или заголовками', 'yellow');
    log('   5. Timeout или медленная генерация', 'yellow');
  }
}

if (require.main === module) {
  main().catch(console.error);
}