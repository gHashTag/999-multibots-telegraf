#!/usr/bin/env node
/**
 * 🔑 Inngest Keys Extractor
 * Получает INNGEST_EVENT_KEY и INNGEST_SIGNING_KEY из Inngest Dashboard
 */

const https = require('https');
const { URL } = require('url');

// Цвета для консоли
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

const log = {
  info: (msg) => console.log(`${colors.blue}ℹ️  ${msg}${colors.reset}`),
  success: (msg) => console.log(`${colors.green}✅ ${msg}${colors.reset}`),
  warn: (msg) => console.log(`${colors.yellow}⚠️  ${msg}${colors.reset}`),
  error: (msg) => console.log(`${colors.red}❌ ${msg}${colors.reset}`),
  header: (msg) => console.log(`\n${colors.cyan}${msg}${colors.reset}\n`),
};

// Метод 1: Попытка получить ключи через Dashboard HTML
async function fetchFromDashboard() {
  return new Promise((resolve, reject) => {
    log.info('Попытка 1: Парсинг HTML с Dashboard...');

    const options = {
      hostname: 'app.inngest.com',
      port: 443,
      path: '/env/production/manage/keys',
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Node.js Script)',
        'Accept': 'text/html,application/xhtml+xml',
      },
    };

    const req = https.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        // Ищем ключи в HTML
        const eventKeyMatch = data.match(/INNGEST_EVENT_KEY['"]?\s*[:=]\s*['"]([^'"]+)['"]/i);
        const signingKeyMatch = data.match(/INNGEST_SIGNING_KEY['"]?\s*[:=]\s*['"]([^'"]+)['"]/i);

        if (eventKeyMatch && signingKeyMatch) {
          resolve({
            eventKey: eventKeyMatch[1],
            signingKey: signingKeyMatch[1],
            source: 'dashboard-html',
          });
        } else {
          reject(new Error('Ключи не найдены в HTML'));
        }
      });
    });

    req.on('error', (err) => {
      reject(err);
    });

    req.end();
  });
}

// Метод 2: Проверка локальных переменных
function checkLocalEnv() {
  log.info('Попытка 2: Проверка локальных переменных...');

  const eventKey = process.env.INNGEST_EVENT_KEY;
  const signingKey = process.env.INNGEST_SIGNING_KEY;

  if (eventKey && signingKey) {
    log.success('Найдены в process.env!');
    return {
      eventKey,
      signingKey,
      source: 'process.env',
    };
  }

  // Проверяем .env файл
  try {
    const fs = require('fs');
    const envContent = fs.readFileSync('.env', 'utf8');
    const envMatch = envContent.match(/INNGEST_EVENT_KEY=(.+)/);
    const signMatch = envContent.match(/INNGEST_SIGNING_KEY=(.+)/);

    if (envMatch && signMatch) {
      log.success('Найдены в .env файле!');
      return {
        eventKey: envMatch[1].trim(),
        signingKey: signMatch[1].trim(),
        source: '.env-file',
      };
    }
  } catch (err) {
    // Файл .env не найден
  }

  throw new Error('Не найдены в локальных переменных');
}

// Метод 3: Попытка получить через API
async function fetchFromAPI() {
  return new Promise((resolve, reject) => {
    log.info('Попытка 3: Запрос к Inngest API...');

    // Сначала пытаемся получить токен из cookies или localStorage
    // Это сложно без браузера, поэтому просто показываем инструкции

    log.warn('API метод требует аутентификации в браузере');
    log.info('Откройте в браузере: https://app.inngest.com/env/production/manage/keys');
    log.info('Откройте Developer Tools (F12)');
    log.info('В Console выполните:');
    log.info('  localStorage.getItem("session") или');
    log.info('  document.cookie');

    reject(new Error('Требуется ручная аутентификация'));
  });
}

// Главная функция
async function main() {
  log.header('🔑 Inngest Keys Extractor');

  const methods = [
    { name: 'Dashboard HTML', fn: fetchFromDashboard },
    { name: 'Локальные переменные', fn: checkLocalEnv },
    { name: 'API метод', fn: fetchFromAPI },
  ];

  for (const method of methods) {
    try {
      log.info(`Пробуем метод: ${method.name}`);
      const result = await method.fn();

      log.success(`Успешно получены ключи методом: ${result.source}`);
      console.log('\n' + '='.repeat(60));
      console.log('🔑 ВАШИ INNGEST KEYS:');
      console.log('='.repeat(60));
      console.log(`INNGEST_EVENT_KEY=${result.eventKey}`);
      console.log(`INNGEST_SIGNING_KEY=${result.signingKey}`);
      console.log('='.repeat(60) + '\n');

      console.log('📋 СЛЕДУЮЩИЕ ШАГИ:');
      console.log('1. Скопируйте ключи выше');
      console.log('2. Идите в Infisical: https://app.infisical.com/');
      console.log('3. Переключитесь на ПРОДАКШН среду');
      console.log('4. Добавьте два секрета:');
      console.log('   - INNGEST_EVENT_KEY');
      console.log('   - INNGEST_SIGNING_KEY');
      console.log('5. Перезапустите контейнер:');
      console.log('   ssh prod999 "docker restart 999-multibots"');
      console.log('');

      process.exit(0);
    } catch (err) {
      log.warn(`Метод ${method.name} не сработал: ${err.message}`);
    }
  }

  log.error('Все методы не сработали');
  log.info('Пожалуйста, получите ключи вручную с:');
  log.info('https://app.inngest.com/env/production/manage/keys');

  process.exit(1);
}

// Запуск
main().catch((err) => {
  log.error(`Критическая ошибка: ${err.message}`);
  process.exit(1);
});
