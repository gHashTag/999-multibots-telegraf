#!/usr/bin/env node

/**
 * Скрипт для диагностики видео сервера и API
 * Проверяет все аспекты системы генерации видео
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');

// Конфигурация
const API_SERVER_URL = 'https://ai-server-production-production-8e2d.up.railway.app';
const SECRET_API_KEY = process.env.SECRET_API_KEY || 'test-key';

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
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logSection(title) {
  console.log('\n' + '='.repeat(60));
  log(`${title}`, 'bold');
  console.log('='.repeat(60));
}

function logTest(testName, status, details = '') {
  const statusIcon = status === 'PASS' ? '✅' : status === 'FAIL' ? '❌' : '⚠️';
  const statusColor = status === 'PASS' ? 'green' : status === 'FAIL' ? 'red' : 'yellow';
  
  log(`${statusIcon} ${testName}`, statusColor);
  if (details) {
    log(`   ${details}`, 'cyan');
  }
}

async function checkServerHealth() {
  logSection('🏥 ПРОВЕРКА ЗДОРОВЬЯ СЕРВЕРА');
  
  try {
    const response = await axios.get(`${API_SERVER_URL}/health`, {
      timeout: 10000
    });
    
    logTest('Доступность сервера', 'PASS', `Статус: ${response.status}`);
    logTest('Время ответа', 'PASS', `${Date.now() - Date.now()} мс`);
    
    if (response.data) {
      log(`   Ответ: ${JSON.stringify(response.data)}`, 'blue');
    }
    
    return true;
  } catch (error) {
    logTest('Доступность сервера', 'FAIL', `Ошибка: ${error.message}`);
    return false;
  }
}

async function checkVideoEndpoint() {
  logSection('🎬 ПРОВЕРКА ENDPOINT ГЕНЕРАЦИИ ВИДЕО');
  
  const testPayload = {
    prompt: "test video generation",
    videoModel: "kie-veo-3-fast",
    aspectRatio: "9:16",
    duration: 5,
    telegram_id: "test_user_123",
    username: "test_user",
    is_ru: true,
    bot_name: "test_bot"
  };
  
  try {
    log('📤 Отправка тестового запроса...', 'yellow');
    log(`   Payload: ${JSON.stringify(testPayload, null, 2)}`, 'cyan');
    
    const response = await axios.post(`${API_SERVER_URL}/generate/text-to-video`, testPayload, {
      headers: {
        'Content-Type': 'application/json',
        'x-secret-key': SECRET_API_KEY
      },
      timeout: 30000
    });
    
    logTest('Endpoint доступен', 'PASS', `Статус: ${response.status}`);
    logTest('Формат ответа', 'PASS', `Content-Type: ${response.headers['content-type']}`);
    
    log(`   Ответ: ${JSON.stringify(response.data)}`, 'blue');
    
    // Проверяем формат ответа
    if (response.data.success !== undefined) {
      logTest('Структура ответа', 'PASS', 'Содержит поле success');
    } else if (response.data.message) {
      logTest('Структура ответа', 'WARN', 'Содержит message, но нет success');
    } else {
      logTest('Структура ответа', 'FAIL', 'Неожиданная структура ответа');
    }
    
    return response.data;
  } catch (error) {
    logTest('Endpoint генерации видео', 'FAIL', `Ошибка: ${error.message}`);
    
    if (error.response) {
      log(`   HTTP статус: ${error.response.status}`, 'red');
      log(`   Ответ сервера: ${JSON.stringify(error.response.data)}`, 'red');
    }
    
    return null;
  }
}

async function checkVideoStatusEndpoint(jobId = 'test-job-id') {
  logSection('🔍 ПРОВЕРКА ENDPOINT СТАТУСА ВИДЕО');
  
  try {
    const response = await axios.get(`${API_SERVER_URL}/generate/text-to-video/status/${jobId}`, {
      headers: {
        'x-secret-key': SECRET_API_KEY
      },
      timeout: 10000
    });
    
    logTest('Status endpoint доступен', 'PASS', `Статус: ${response.status}`);
    log(`   Ответ: ${JSON.stringify(response.data)}`, 'blue');
    
    return response.data;
  } catch (error) {
    if (error.response && error.response.status === 404) {
      logTest('Status endpoint', 'WARN', 'Job ID не найден (ожидаемо для тестового ID)');
    } else {
      logTest('Status endpoint', 'FAIL', `Ошибка: ${error.message}`);
    }
    
    return null;
  }
}

async function checkEnvironmentVariables() {
  logSection('🌍 ПРОВЕРКА ПЕРЕМЕННЫХ ОКРУЖЕНИЯ');
  
  const requiredVars = [
    'SECRET_API_KEY',
    'API_SERVER_URL',
    'LOCAL_SERVER_URL'
  ];
  
  const optionalVars = [
    'BOT_TOKEN_1',
    'SUPABASE_URL',
    'OPENAI_API_KEY'
  ];
  
  // Проверяем обязательные переменные
  for (const varName of requiredVars) {
    const value = process.env[varName];
    if (value) {
      logTest(`${varName}`, 'PASS', `Установлена (${value.length} символов)`);
    } else {
      logTest(`${varName}`, 'FAIL', 'Не установлена');
    }
  }
  
  // Проверяем опциональные переменные
  log('\n📋 Опциональные переменные:', 'yellow');
  for (const varName of optionalVars) {
    const value = process.env[varName];
    if (value) {
      logTest(`${varName}`, 'PASS', `Установлена (${value.length} символов)`);
    } else {
      logTest(`${varName}`, 'WARN', 'Не установлена');
    }
  }
}

async function checkConfigFiles() {
  logSection('📁 ПРОВЕРКА КОНФИГУРАЦИОННЫХ ФАЙЛОВ');
  
  const configFiles = [
    '.env',
    'src/config/index.ts',
    'package.json',
    'tsconfig.json'
  ];
  
  for (const file of configFiles) {
    const filePath = path.resolve(process.cwd(), file);
    
    try {
      const stats = fs.statSync(filePath);
      logTest(`${file}`, 'PASS', `Размер: ${stats.size} байт, изменен: ${stats.mtime.toISOString()}`);
    } catch (error) {
      if (error.code === 'ENOENT') {
        logTest(`${file}`, 'WARN', 'Файл не найден');
      } else {
        logTest(`${file}`, 'FAIL', `Ошибка: ${error.message}`);
      }
    }
  }
}

async function checkNetworkConnectivity() {
  logSection('🌐 ПРОВЕРКА СЕТЕВОГО ПОДКЛЮЧЕНИЯ');
  
  const endpoints = [
    'https://google.com',
    'https://api.telegram.org',
    'https://openai.com',
    API_SERVER_URL
  ];
  
  for (const endpoint of endpoints) {
    try {
      const startTime = Date.now();
      await axios.head(endpoint, { timeout: 5000 });
      const endTime = Date.now();
      
      logTest(`${endpoint}`, 'PASS', `Время ответа: ${endTime - startTime} мс`);
    } catch (error) {
      logTest(`${endpoint}`, 'FAIL', `Ошибка: ${error.message}`);
    }
  }
}

async function checkVideoModels() {
  logSection('🤖 ПРОВЕРКА ДОСТУПНЫХ МОДЕЛЕЙ ВИДЕО');
  
  try {
    // Попробуем получить список моделей
    const response = await axios.get(`${API_SERVER_URL}/models`, {
      headers: {
        'x-secret-key': SECRET_API_KEY
      },
      timeout: 10000
    });
    
    logTest('Endpoint моделей', 'PASS', `Найдено ${response.data.length || 0} моделей`);
    
    if (response.data && Array.isArray(response.data)) {
      response.data.forEach(model => {
        log(`   📹 ${model.name || model.id}: ${model.description || 'Нет описания'}`, 'blue');
      });
    }
    
  } catch (error) {
    if (error.response && error.response.status === 404) {
      logTest('Endpoint моделей', 'WARN', 'Endpoint не найден (возможно не реализован)');
    } else {
      logTest('Endpoint моделей', 'FAIL', `Ошибка: ${error.message}`);
    }
  }
}

async function runSystemDiagnostics() {
  logSection('💻 СИСТЕМНАЯ ДИАГНОСТИКА');
  
  // Проверка Node.js версии
  logTest('Node.js версия', 'PASS', process.version);
  
  // Проверка памяти
  const memUsage = process.memoryUsage();
  logTest('Использование памяти', 'PASS', 
    `RSS: ${Math.round(memUsage.rss / 1024 / 1024)}MB, Heap: ${Math.round(memUsage.heapUsed / 1024 / 1024)}MB`);
  
  // Проверка времени работы
  logTest('Время работы скрипта', 'PASS', `${Math.round(process.uptime())} секунд`);
  
  // Проверка рабочей директории
  logTest('Рабочая директория', 'PASS', process.cwd());
  
  // Проверка платформы
  logTest('Платформа', 'PASS', `${process.platform} ${process.arch}`);
}

async function main() {
  log('🚀 ДИАГНОСТИКА ВИДЕО СЕРВЕРА НАЧАТА', 'bold');
  log(`⏰ Время: ${new Date().toISOString()}`, 'cyan');
  
  try {
    // Загружаем переменные окружения
    require('dotenv').config();
    
    // Выполняем все проверки
    await runSystemDiagnostics();
    await checkEnvironmentVariables();
    await checkConfigFiles();
    await checkNetworkConnectivity();
    await checkServerHealth();
    await checkVideoEndpoint();
    await checkVideoStatusEndpoint();
    await checkVideoModels();
    
    logSection('✅ ДИАГНОСТИКА ЗАВЕРШЕНА');
    log('Проверьте результаты выше для выявления проблем', 'green');
    
  } catch (error) {
    logSection('❌ КРИТИЧЕСКАЯ ОШИБКА');
    log(`Ошибка выполнения диагностики: ${error.message}`, 'red');
    log(`Stack trace: ${error.stack}`, 'red');
    process.exit(1);
  }
}

// Запускаем диагностику
if (require.main === module) {
  main().catch(console.error);
}

module.exports = {
  checkServerHealth,
  checkVideoEndpoint,
  checkVideoStatusEndpoint,
  checkEnvironmentVariables,
  checkConfigFiles,
  checkNetworkConnectivity,
  checkVideoModels,
  runSystemDiagnostics
};