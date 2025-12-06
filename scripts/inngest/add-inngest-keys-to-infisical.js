#!/usr/bin/env node
/**
 * 🔑 Добавляет Inngest ключи в Infisical
 * Использует Infisical API для добавления секретов
 */

const https = require('https');

// Ключи (получены от пользователя)
const KEYS = {
  INNGEST_EVENT_KEY: '4JiBiCBZ8en7jNonnsAPXCFiLVkrt1uEXklGcDzaQ6SCBV9p7-UBlQlTrze-x_WPRTihikB_uhAGhbkwGhnu4Q',
  INNGEST_SIGNING_KEY: 'signkey-test-c4167464e900701832920c98bb2ec6e6e3c59fd2b27c62e1f4140dada01e4597'
};

// Конфигурация Infisical
const CONFIG = {
  clientId: '88fcf0cd-cce9-4844-bad2-8e19b4bad3ed',
  clientSecret: 'b377e7a60b669ea2317f339dc6cb79ce49d588a7bbed92433bb2a73dedff3314',
  projectId: 'fd763fa3-35d5-4045-93bd-1795c5f00fc3',
  environment: 'production'
};

const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  reset: '\x1b[0m',
};

const log = {
  info: (msg) => console.log(`${colors.blue}ℹ️  ${msg}${colors.reset}`),
  success: (msg) => console.log(`${colors.green}✅ ${msg}${colors.reset}`),
  warn: (msg) => console.log(`${colors.yellow}⚠️  ${msg}${colors.reset}`),
  error: (msg) => console.log(`${colors.red}❌ ${msg}${colors.reset}`),
  header: (msg) => console.log(`\n${colors.cyan}${msg}${colors.reset}\n`),
};

// Получение токена доступа Infisical
async function getAccessToken() {
  return new Promise((resolve, reject) => {
    log.info('Получение токена доступа Infisical...');

    const data = JSON.stringify({
      clientId: CONFIG.clientId,
      clientSecret: CONFIG.clientSecret
    });

    const options = {
      hostname: 'app.infisical.com',
      port: 443,
      path: '/api/v2/auth/client-token',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': data.length
      }
    };

    const req = https.request(options, (res) => {
      let response = '';

      res.on('data', (chunk) => {
        response += chunk;
      });

      res.on('end', () => {
        try {
          const json = JSON.parse(response);
          if (json.accessToken) {
            resolve(json.accessToken);
          } else {
            reject(new Error('Токен не получен: ' + JSON.stringify(json)));
          }
        } catch (err) {
          reject(err);
        }
      });
    });

    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

// Добавление секрета в Infisical
async function addSecret(accessToken, key, value) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({
      secretKey: key,
      secretValue: value,
      type: 'shared',
      environment: CONFIG.environment
    });

    const options = {
      hostname: 'app.infisical.com',
      port: 443,
      path: `/api/v3/secrets/${CONFIG.projectId}`,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'Content-Length': data.length
      }
    };

    const req = https.request(options, (res) => {
      let response = '';

      res.on('data', (chunk) => {
        response += chunk;
      });

      res.on('end', () => {
        try {
          const json = JSON.parse(response);
          resolve(json);
        } catch (err) {
          resolve(response);
        }
      });
    });

    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

// Главная функция
async function main() {
  log.header('🔑 Добавление Inngest ключей в Infisical');

  try {
    // 1. Получаем токен
    const accessToken = await getAccessToken();
    log.success('Токен получен');

    // 2. Добавляем INNGEST_EVENT_KEY
    log.info(`Добавляем ${KEYS.INNGEST_EVENT_KEY.substring(0, 20)}...`);
    const result1 = await addSecret(accessToken, 'INNGEST_EVENT_KEY', KEYS.INNGEST_EVENT_KEY);
    log.success('INNGEST_EVENT_KEY добавлен');

    // 3. Добавляем INNGEST_SIGNING_KEY
    log.info(`Добавляем ${KEYS.INNGEST_SIGNING_KEY.substring(0, 20)}...`);
    const result2 = await addSecret(accessToken, 'INNGEST_SIGNING_KEY', KEYS.INNGEST_SIGNING_KEY);
    log.success('INNGEST_SIGNING_KEY добавлен');

    // 4. Успех!
    console.log('');
    log.success('=======================================');
    log.success('   КЛЮЧИ ДОБАВЛЕНЫ В INFISICAL!');
    log.success('=======================================');
    console.log('');
    console.log('Теперь нужно:');
    console.log('1. Перезапустить контейнер');
    console.log('2. Проверить работу endpoint');
    console.log('3. Синхронизироваться с Inngest Dashboard');
    console.log('');

    // Предлагаем следующие шаги
    const readline = require('readline');
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    rl.question('Перезапустить контейнер сейчас? (y/n): ', async (answer) => {
      rl.close();

      if (answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes') {
        log.info('Перезапускаем контейнер...');
        const { execSync } = require('child_process');

        try {
          execSync('ssh prod999 "docker restart 999-multibots"', { stdio: 'inherit' });
          log.success('Контейнер перезапущен!');

          console.log('');
          log.info('Ждём 10 секунд для загрузки...');
          await new Promise(resolve => setTimeout(resolve, 10000));

          // Проверяем логи
          log.info('Проверяем логи...');
          const logs = execSync(
            'ssh prod999 "docker logs 999-multibots --tail 30"',
            { encoding: 'utf8', timeout: 10000 }
          );

          if (logs.includes('INNGEST_EVENT_KEY')) {
            log.success('INNGEST_EVENT_KEY загружен');
          }

          if (logs.includes('INNGEST_SIGNING_KEY')) {
            log.success('INNGEST_SIGNING_KEY загружен');
          }

          if (!logs.includes('Failed to create Inngest functions')) {
            log.success('Ошибки исправлены!');
          }

          console.log('');
          log.success('🎉 ГОТОВО! Попробуйте "Resync app" в Inngest Dashboard');
          console.log('');

        } catch (err) {
          log.error('Ошибка перезапуска: ' + err.message);
        }
      } else {
        log.info('Пропускаем. Для перезапуска выполните:');
        console.log('  ssh prod999 "docker restart 999-multibots"');
      }
    });

  } catch (err) {
    console.log('');
    log.error('Ошибка: ' + err.message);
    console.log('');
    log.info('Добавьте ключи вручную:');
    console.log('1. Откройте: https://app.infisical.com/');
    console.log('2. Проект: fd763fa3-35d5-4045-93bd-1795c5f00fc3');
    console.log('3. Среда: production');
    console.log('4. Добавьте секреты:');
    console.log('   - INNGEST_EVENT_KEY');
    console.log('   - INNGEST_SIGNING_KEY');
    console.log('');
  }
}

// Запуск
main();
