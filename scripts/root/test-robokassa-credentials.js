#!/usr/bin/env node

/**
 * Тест загрузки Robokassa credentials из Infisical
 * Проверяет, что MERCHANT_LOGIN и ROBOKASSA_PASSWORD_* загружены правильно
 */

async function testRobokassaCredentials() {
  console.log('🔍 ТЕСТ: Проверка Robokassa Credentials\n');

  try {
    // Импортируем конфиг
    const {
      MERCHANT_LOGIN,
      ROBOKASSA_PASSWORD_1,
      ROBOKASSA_PASSWORD_2,
      RESULT_URL2,
    } = require('./src/config/index.ts');

    console.log('📋 Результаты проверки:');
    console.log('═'.repeat(50));

    // Проверяем MERCHANT_LOGIN
    if (MERCHANT_LOGIN && MERCHANT_LOGIN !== 'undefined') {
      console.log(`✅ MERCHANT_LOGIN: "${MERCHANT_LOGIN}"`);
    } else {
      console.log(`❌ MERCHANT_LOGIN: undefined или пустой!`);
    }

    // Проверяем ROBOKASSA_PASSWORD_1
    if (ROBOKASSA_PASSWORD_1 && ROBOKASSA_PASSWORD_1 !== 'undefined') {
      console.log(`✅ ROBOKASSA_PASSWORD_1: "${ROBOKASSA_PASSWORD_1.substring(0, 10)}...***"`);
    } else {
      console.log(`❌ ROBOKASSA_PASSWORD_1: undefined или пустой!`);
    }

    // Проверяем ROBOKASSA_PASSWORD_2
    if (ROBOKASSA_PASSWORD_2 && ROBOKASSA_PASSWORD_2 !== 'undefined') {
      console.log(`✅ ROBOKASSA_PASSWORD_2: "${ROBOKASSA_PASSWORD_2.substring(0, 10)}...***"`);
    } else {
      console.log(`❌ ROBOKASSA_PASSWORD_2: undefined или пустой!`);
    }

    // Проверяем RESULT_URL2
    if (RESULT_URL2 && RESULT_URL2 !== 'undefined') {
      console.log(`✅ RESULT_URL2: "${RESULT_URL2}"`);
    } else {
      console.log(`❌ RESULT_URL2: undefined или пустой!`);
    }

    console.log('═'.repeat(50));

    // Подсчет результатов
    const results = [
      MERCHANT_LOGIN && MERCHANT_LOGIN !== 'undefined',
      ROBOKASSA_PASSWORD_1 && ROBOKASSA_PASSWORD_1 !== 'undefined',
      ROBOKASSA_PASSWORD_2 && ROBOKASSA_PASSWORD_2 !== 'undefined',
      RESULT_URL2 && RESULT_URL2 !== 'undefined',
    ];

    const successCount = results.filter(Boolean).length;
    const totalCount = results.length;

    console.log(`\n📊 ИТОГО: ${successCount}/${totalCount} credentials загружены`);

    if (successCount === totalCount) {
      console.log('✅ ВСЕ ROBOKASSA CREDENTIALS ЗАГРУЖЕНЫ ПРАВИЛЬНО!');
      process.exit(0);
    } else {
      console.log(`❌ НЕ ВСЕ credentials загружены! Отсутствует: ${totalCount - successCount}`);
      process.exit(1);
    }
  } catch (error) {
    console.error('❌ ОШИБКА при проверке credentials:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Запускаем тест
testRobokassaCredentials().catch(error => {
  console.error('❌ Критическая ошибка:', error);
  process.exit(1);
});
