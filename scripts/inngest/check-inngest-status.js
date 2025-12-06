#!/usr/bin/env node
/**
 * ✅ Inngest Status Checker
 * Проверяет состояние Inngest интеграции и webhook endpoints
 */

const https = require('https');
const { execSync } = require('child_process');

// Цвета
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  bold: '\x1b[1m',
};

const log = {
  info: (msg) => console.log(`${colors.blue}ℹ️  ${msg}${colors.reset}`),
  success: (msg) => console.log(`${colors.green}✅ ${msg}${colors.reset}`),
  warn: (msg) => console.log(`${colors.yellow}⚠️  ${msg}${colors.reset}`),
  error: (msg) => console.log(`${colors.red}❌ ${msg}${colors.reset}`),
  header: (msg) => console.log(`\n${colors.cyan}${colors.bold}${msg}${colors.reset}\n`),
};

// Проверка endpoint через HTTP
function checkEndpoint(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve({ statusCode: res.statusCode, data: json });
        } catch (err) {
          resolve({ statusCode: res.statusCode, data: data });
        }
      });
    });

    req.on('error', (err) => {
      reject(err);
    });

    req.setTimeout(5000, () => {
      req.destroy();
      reject(new Error('Timeout'));
    });
  });
}

// Проверка логов контейнера
function checkContainerLogs() {
  try {
    const logs = execSync(
      'ssh prod999 "docker logs 999-multibots --tail 100"',
      { encoding: 'utf8', timeout: 10000 }
    );

    const lines = logs.split('\n');

    // Ищем важные строки
    const inngestLines = lines.filter(line =>
      line.includes('Inngest') ||
      line.includes('INNGEST_EVENT_KEY') ||
      line.includes('INNGEST_SIGNING_KEY') ||
      line.includes('hasEventKey') ||
      line.includes('hasSigningKey') ||
      line.includes('Failed to create Inngest')
    );

    return {
      found: inngestLines.length > 0,
      lines: inngestLines,
      all: logs
    };
  } catch (err) {
    return {
      found: false,
      error: err.message,
      lines: [],
      all: ''
    };
  }
}

// Главная функция
async function main() {
  log.header('🔍 Inngest Integration Status Check');

  // 1. Проверка контейнера
  log.info('Проверка контейнера...');
  try {
    const containerStatus = execSync(
      'ssh prod999 "docker ps --filter name=999-multibots --format \\"{{.Status}}\\""',
      { encoding: 'utf8', timeout: 5000 }
    ).trim();

    if (containerStatus.includes('Up')) {
      log.success(`Контейнер запущен: ${containerStatus}`);
    } else {
      log.error(`Контейнер не работает: ${containerStatus}`);
    }
  } catch (err) {
    log.error(`Ошибка проверки контейнера: ${err.message}`);
  }

  // 2. Проверка логов
  log.info('\nПроверка логов на предмет Inngest...');
  const logs = checkContainerLogs();

  if (logs.found) {
    log.success(`Найдено ${logs.lines.length} релевантных строк в логах:`);
    logs.lines.slice(-10).forEach(line => {
      if (line.includes('Failed')) {
        console.log(`  ${colors.red}${line}${colors.reset}`);
      } else if (line.includes('hasEventKey') || line.includes('hasSigningKey')) {
        console.log(`  ${colors.green}${line}${colors.reset}`);
      } else {
        console.log(`  ${colors.blue}${line}${colors.reset}`);
      }
    });
  } else if (logs.error) {
    log.error(`Ошибка получения логов: ${logs.error}`);
  } else {
    log.warn('В логах не найдено упоминаний Inngest');
  }

  // 3. Проверка endpoint
  log.info('\nПроверка /api/inngest endpoint...');
  try {
    const result = await checkEndpoint('https://three-head-dragon.shop/api/inngest');

    if (result.statusCode === 200) {
      log.success(`Endpoint отвечает (HTTP ${result.statusCode})`);

      if (result.data.hasEventKey !== undefined) {
        if (result.data.hasEventKey) {
          log.success('Event Key: загружен');
        } else {
          log.error('Event Key: НЕ НАЙДЕН');
        }

        if (result.data.hasSigningKey) {
          log.success('Signing Key: загружен');
        } else {
          log.error('Signing Key: НЕ НАЙДЕН');
        }

        if (result.data.functionsFound !== undefined) {
          log.info(`Функций зарегистрировано: ${result.data.functionsFound}`);
        }
      }

      console.log('\n' + colors.cyan + 'Ответ endpoint:' + colors.reset);
      console.log(JSON.stringify(result.data, null, 2));
    } else {
      log.error(`Endpoint вернул HTTP ${result.statusCode}`);
      console.log(result.data);
    }
  } catch (err) {
    log.error(`Ошибка подключения к endpoint: ${err.message}`);
    log.info('Возможные причины:');
    log.info('  1. Контейнер не запущен');
    log.info('  2. Проблемы с сетью/DNS');
    log.info('  3. SSL сертификат');
  }

  // 4. Рекомендации
  log.info('\n' + '='.repeat(60));
  log.header('📋 Рекомендации');

  const needsKeys = logs.lines.some(line =>
    line.includes('We couldn\'t find an event key') ||
    line.includes('Failed to create Inngest functions')
  );

  if (needsKeys) {
    log.warn('Требуется добавить Inngest ключи!');
    log.info('Следуйте инструкции: INNGEST_KEYS_SETUP.md');
    console.log('\n' + colors.yellow + 'Быстрые ссылки:' + colors.reset);
    console.log('  Inngest Dashboard: https://app.inngest.com/env/production/manage/keys');
    console.log('  Infisical: https://app.infisical.com/');
    console.log('  Руководство: cat INNGEST_KEYS_SETUP.md\n');
  } else if (logs.found && logs.lines.some(line => line.includes('hasEventKey') && line.includes('true'))) {
    log.success('Inngest настроен правильно!');
    log.info('Попробуйте "Resync App" в Inngest Dashboard');
  }

  console.log('\n' + '='.repeat(60) + '\n');
}

// Запуск
main().catch((err) => {
  log.error(`Критическая ошибка: ${err.message}`);
  process.exit(1);
});
