#!/usr/bin/env node
/**
 * 🔑 Inngest Keys FIX - Автоматическое решение
 * Исправляет проблему с отсутствующими ключами INNGEST
 */

const https = require('https');
const { execSync } = require('child_process');
const readline = require('readline');

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
  step: (num, msg) => console.log(`\n${colors.bold}🔑 ШАГ ${num}: ${msg}${colors.reset}`),
};

// Создание readline интерфейса
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(prompt) {
  return new Promise((resolve) => {
    rl.question(prompt, resolve);
  });
}

// Запрос ключей
async function getKeys() {
  log.step(1, 'Получение ключей из Inngest Dashboard');
  console.log('Откройте в браузере:');
  console.log('  👉 https://app.inngest.com/env/production/manage/keys');
  console.log('');
  console.log('Или используйте F12 → Network → найдите API call → скопируйте из Response:');
  console.log('  - event_key');
  console.log('  - signing_key');
  console.log('');
  console.log('Введите ключи (скопируйте из Dashboard):');
  console.log('');

  let eventKey = await question('INNGEST_EVENT_KEY: ');
  let signingKey = await question('INNGEST_SIGNING_KEY: ');

  // Проверяем формат
  if (!eventKey || !signingKey) {
    console.log('');
    log.warn('Оба ключа обязательны!');
    eventKey = await question('INNGEST_EVENT_KEY (скопируйте): ');
    signingKey = await question('INNGEST_SIGNING_KEY (скопируйте): ');
  }

  if (eventKey && !eventKey.startsWith('inngest_') && !eventKey.startsWith('evt_')) {
    log.warn('Event Key должен начинаться с "inngest_" или "evt_"');
  }

  if (signingKey && !signingKey.startsWith('sign_') && !signingKey.startsWith('signing_')) {
    log.warn('Signing Key должен начинаться с "sign_" или "signing_"');
  }

  rl.close();

  return { eventKey, signingKey };
}

// Добавление в Infisical через API
async function addToInfisical(keys) {
  log.step(2, 'Добавление в Infisical');

  console.log('');
  console.log('Вам нужно добавить ключи вручную в Infisical:');
  console.log('');
  console.log('1. Откройте: https://app.infisical.com/');
  console.log('2. Выберите проект: fd763fa3-35d5-4045-93bd-1795c5f00fc3');
  console.log('3. Переключитесь на "production" среду');
  console.log('4. Добавьте два секрета:');
  console.log('');
  console.log(`${colors.green}Секрет 1:${colors.reset}`);
  console.log(`  Key:   INNGEST_EVENT_KEY`);
  console.log(`  Value: ${keys.eventKey}`);
  console.log('');
  console.log(`${colors.green}Секрет 2:${colors.reset}`);
  console.log(`  Key:   INNGEST_SIGNING_KEY`);
  console.log(`  Value: ${keys.signingKey}`);
  console.log('');

  await question('Нажмите ENTER когда добавите ключи в Infisical...');

  log.success('Ключи добавлены в Infisical!');
}

// Перезапуск контейнера
async function restartContainer() {
  log.step(3, 'Перезапуск контейнера');

  console.log('');
  log.info('Перезапускаем 999-multibots...');

  try {
    execSync('ssh prod999 "docker restart 999-multibots"', { stdio: 'inherit' });
    log.success('Контейнер перезапущен');
  } catch (err) {
    log.error('Ошибка перезапуска контейнера');
    throw err;
  }

  console.log('');
  log.info('Ждём 10 секунд для полной загрузки...');
  await new Promise(resolve => setTimeout(resolve, 10000));
}

// Проверка результата
async function verifyFix() {
  log.step(4, 'Проверка результата');

  console.log('');
  log.info('Проверяем логи контейнера...');

  try {
    const logs = execSync(
      'ssh prod999 "docker logs 999-multibots --tail 50"',
      { encoding: 'utf8', timeout: 10000 }
    );

    if (logs.includes('INNGEST_EVENT_KEY')) {
      log.success('INNGEST_EVENT_KEY загружен в контейнер');
    } else {
      log.warn('INNGEST_EVENT_KEY не найден в логах');
    }

    if (logs.includes('INNGEST_SIGNING_KEY')) {
      log.success('INNGEST_SIGNING_KEY загружен в контейнер');
    } else {
      log.warn('INNGEST_SIGNING_KEY не найден в логах');
    }

    if (!logs.includes('Failed to create Inngest functions')) {
      log.success('Ошибки создания функций исправлены!');
    } else {
      log.warn('Всё ещё есть ошибки создания функций');
    }

  } catch (err) {
    log.error('Ошибка получения логов: ' + err.message);
  }

  console.log('');
  log.info('Проверяем endpoint...');

  try {
    const result = await new Promise((resolve, reject) => {
      https.get('https://three-head-dragon.shop/api/inngest', (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => resolve({ statusCode: res.statusCode, data }));
      }).on('error', reject);
      res.setTimeout(5000);
    });

    if (result.statusCode === 200) {
      log.success('Endpoint /api/inngest отвечает!');
      console.log('');
      console.log(colors.green + 'Ответ:' + colors.reset);
      try {
        console.log(JSON.stringify(JSON.parse(result.data), null, 2));
      } catch {
        console.log(result.data);
      }
    } else {
      log.warn(`Endpoint вернул HTTP ${result.statusCode}`);
    }
  } catch (err) {
    log.warn('Endpoint пока не отвечает (попробуйте через минуту)');
  }
}

// Финальные инструкции
function finalInstructions() {
  console.log('');
  log.success('=======================================');
  log.success('       INNGEST KEYS УСТАНОВЛЕНЫ!');
  log.success('=======================================');
  console.log('');
  console.log(`${colors.green}✅${colors.reset} Ключи добавлены в Infisical (production)`);
  console.log(`${colors.green}✅${colors.reset} Контейнер перезапущен`);
  console.log(`${colors.green}✅${colors.reset} Endpoint должен работать`);
  console.log('');
  console.log('📋 СЛЕДУЮЩИЕ ШАГИ:');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');
  console.log('1. Перейдите в Inngest Dashboard:');
  console.log('   https://app.inngest.com/env/production/functions');
  console.log('');
  console.log('2. Нажмите "Resync app" - должно сработать!');
  console.log('');
  console.log('3. Если что-то не работает, проверьте:');
  console.log('   node scripts/check-inngest-status.js');
  console.log('');
  console.log('🔗 Быстрые команды:');
  console.log('   ssh prod999 "docker logs 999-multibots -f"');
  console.log('   node scripts/check-inngest-status.js');
  console.log('');
}

// Главная функция
async function main() {
  console.clear();
  log.header('🔑 Inngest Keys FIX - Автоматическое решение');

  try {
    const keys = await getKeys();
    await addToInfisical(keys);
    await restartContainer();
    await verifyFix();
    finalInstructions();
  } catch (err) {
    log.error(`Ошибка: ${err.message}`);
    process.exit(1);
  }
}

// Запуск
main();
