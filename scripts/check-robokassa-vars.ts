#!/usr/bin/env ts-node

/**
 * Скрипт проверки Robokassa переменных в Infisical
 * Показывает какие переменные существуют и какие нет
 */

async function checkRobokassaVars() {
  console.log('🔍 ПРОВЕРКА ROBOKASSA ПЕРЕМЕННЫХ В INFISICAL\n');
  console.log('='.repeat(60));

  try {
    // Импортируем Infisical
    const { initInfisical, getSecretsStats } = await import('../src/core/infisical');

    // Инициализируем Infisical
    console.log('🔐 Инициализация Infisical...');
    await initInfisical();

    const stats = getSecretsStats();
    console.log(`✅ Загружено ${stats.totalSecrets} секретов\n`);

    // Проверяемые переменные
    const checkVars = [
      'ROBOKASSA_MERCHANT_LOGIN',
      'ROBOKASSA_PASSWORD_1',
      'ROBOKASSA_PASSWORD_2',
      'ROBOKASSA_RESULT_URL2',
      // Также проверим старые имена (на всякий случай)
      'MERCHANT_LOGIN',
      'ROBOKASSA_PASSWORD',
      'RESULT_URL2'
    ];

    console.log('🔍 ПРОВЕРКА ПЕРЕМЕННЫХ:');
    console.log('─'.repeat(60));

    for (const varName of checkVars) {
      try {
        const value = require('../src/core/infisical').getSecret(varName);
        console.log(`✅ ${varName}: "${value.substring(0, 15)}...***"`);
      } catch (e) {
        console.log(`❌ ${varName}: НЕ НАЙДЕНО`);
      }
    }

    console.log('\n' + '='.repeat(60));
    console.log('📋 СПИСОК ВСЕХ ПЕРЕМЕННЫХ С "ROBOKASSA":');
    console.log('─'.repeat(60));

    const robokassaVars = stats.secretKeys.filter(key =>
      key.toLowerCase().includes('robokassa') || key.toLowerCase().includes('merchant')
    );

    if (robokassaVars.length === 0) {
      console.log('❌ НИ ОДНОЙ переменной с "robokassa" или "merchant" НЕ НАЙДЕНО!');
      console.log('\n🚨 ПРОБЛЕМА: Переменные НЕ СУЩЕСТВУЮТ в Infisical!');
      console.log('\n📋 РЕШЕНИЕ:');
      console.log('1. Откройте https://app.infisical.com/');
      console.log('2. Перейдите в проект fd763fa3-35d5-4045-93bd-1795c5f00fc3');
      console.log('3. Выберите environment "prod"');
      console.log('4. Добавьте переменные:');
      console.log('   - ROBOKASSA_MERCHANT_LOGIN=neuroblogger');
      console.log('   - ROBOKASSA_PASSWORD_1=GhfqLJR79Do9Zvans16G');
      console.log('   - ROBOKASSA_PASSWORD_2=w31s8DPWPITH5dh6eTTL');
      console.log('   - ROBOKASSA_RESULT_URL2=https://three-head-dragon.shop/payment-success');
    } else {
      robokassaVars.forEach(key => {
        console.log(`  - ${key}`);
      });
    }

    console.log('\n' + '='.repeat(60));
    console.log('✅ ПРОВЕРКА ЗАВЕРШЕНА');

  } catch (error) {
    console.error('❌ ОШИБКА:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Запускаем проверку
checkRobokassaVars();
