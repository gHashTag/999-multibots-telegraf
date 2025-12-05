/**
 * ДИАГНОСТИКА ПЕРЕМЕННЫХ INNGEST
 * Проверяет все возможные варианты имен переменных и их загрузку
 */

const { getInfisicalSecrets } = require('../dist/core/infisical');
const fs = require('fs');

async function checkInngestVariables() {
  console.log('\n🔍 ДИАГНОСТИКА ПЕРЕМЕННЫХ INNGEST');
  console.log('='.repeat(60));

  // Все возможные варианты имен переменных
  const possibleNames = [
    // Новые стандартные имена (то что мы ищем)
    'INNGEST_EVENT_KEY',
    'INNGEST_SIGNING_KEY',

    // Старые имена с BOT_ prefix
    'BOT_INNGEST_EVENT_KEY',
    'BOT_INNGEST_SIGNING_KEY',

    // Тестовые варианты
    'INNGEST_EVENT_TEST_KEY',
    'INNGEST_TEST_SIGNING_KEY',
    'BOT_INNGEST_EVENT_TEST_KEY',
    'BOT_INNGEST_TEST_SIGNING_KEY',

    // Render варианты (из кэша)
    'RENDER_INNGEST_EVENT_KEY',
    'RENDER_INNGEST_SIGNING_KEY',

    // Варианты с разным регистром
    'inngest_event_key',
    'inngest_signing_key',
    'Inngest_Event_Key',
    'Inngest_Signing_Key',
  ];

  const found = [];
  const notFound = [];

  console.log('\n📋 Проверяем все возможные варианты имен:\n');

  for (const name of possibleNames) {
    try {
      // Пытаемся загрузить секреты и найти нужную переменную
      const secrets = await getInfisicalSecrets();
      const value = secrets[name];

      if (value) {
        found.push({
          name,
          preview: value.substring(0, 10) + '...***',
          length: value.length
        });
        console.log(`✅ ${name}: "${value.substring(0, 10)}...***"`);
      } else {
        notFound.push(name);
        console.log(`❌ ${name}: не найден`);
      }
    } catch (error) {
      notFound.push(name);
      console.log(`⚠️ ${name}: ошибка загрузки - ${error.message}`);
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('\n📊 РЕЗУЛЬТАТЫ:');
  console.log(`Найдено: ${found.length} переменных`);
  console.log(`Не найдено: ${notFound.length} вариантов`);

  if (found.length > 0) {
    console.log('\n✅ НАЙДЕННЫЕ ПЕРЕМЕННЫЕ:');
    found.forEach(item => {
      console.log(`  • ${item.name}: "${item.preview}" (${item.length} символов)`);
    });
  }

  if (notFound.length > 0) {
    console.log('\n❌ НЕ НАЙДЕННЫЕ ПЕРЕМЕННЫЕ:');
    notFound.forEach(name => {
      console.log(`  • ${name}`);
    });
  }

  // Проверяем process.env
  console.log('\n🔍 ПРОВЕРКА process.env:');
  const envVars = [
    'INNGEST_EVENT_KEY',
    'INNGEST_SIGNING_KEY',
    'BOT_INNGEST_EVENT_KEY',
    'BOT_INNGEST_SIGNING_KEY',
    'RENDER_INNGEST_EVENT_KEY',
    'RENDER_INNGEST_SIGNING_KEY'
  ];

  envVars.forEach(name => {
    const value = process.env[name];
    if (value) {
      console.log(`✅ process.env.${name}: "${value.substring(0, 10)}...***"`);
    } else {
      console.log(`❌ process.env.${name}: undefined`);
    }
  });

  // Рекомендации
  console.log('\n' + '='.repeat(60));
  console.log('\n🎯 РЕКОМЕНДАЦИИ:');

  if (found.length === 0) {
    console.log('\n❌ КРИТИЧНО: Ни одна переменная INNGEST не найдена!');
    console.log('\n📋 ДЕЙСТВИЯ:');
    console.log('1. Добавьте в Infisical PRODUCTION environment:');
    console.log('   • INNGEST_EVENT_KEY');
    console.log('   • INNGEST_SIGNING_KEY');
    console.log('\n2. Или используйте существующие из development:');
    console.log('   • Скопируйте значения из dev в prod');
    console.log('\n3. Убедитесь что environment = prod в Infisical');
  } else if (found.length === 1) {
    console.log('\n⚠️ НАЙДЕНА ТОЛЬКО ОДНА переменная!');
    console.log('Нужны ОБА ключа: EVENT_KEY и SIGNING_KEY');
  } else if (found.length >= 2) {
    console.log('\n✅ НАЙДЕНЫ НЕОБХОДИМЫЕ ПЕРЕМЕННЫЕ!');
    console.log('Проблема может быть в коде - проверим client.ts');
  }

  // Сохраняем отчёт в файл
  const report = {
    timestamp: new Date().toISOString(),
    found,
    notFound,
    processEnv: envVars.reduce((acc, name) => {
      acc[name] = process.env[name] ? 'set' : 'undefined';
      return acc;
    }, {})
  };

  fs.writeFileSync('inngest-diagnostic-report.json', JSON.stringify(report, null, 2));
  console.log('\n📄 Отчёт сохранён в: inngest-diagnostic-report.json');

  console.log('\n' + '='.repeat(60));
}

checkInngestVariables().catch(console.error);
