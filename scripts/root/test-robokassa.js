#!/usr/bin/env node

/**
 * Простой тест для проверки загрузки Robokassa переменных
 * Запускается с настройками production
 */

const fs = require('fs');
const path = require('path');

// Устанавливаем NODE_ENV в production для имитации продакшена
process.env.NODE_ENV = 'production';
process.env.INFISICAL_ENVIRONMENT = 'prod';

// Загружаем конфигурацию
require('./dist/config/index.js');

console.log('\n' + '='.repeat(70));
console.log('🔍 ПРОВЕРКА ЗАГРУЗКИ ROBOKASSA ПЕРЕМЕННЫХ');
console.log('='.repeat(70) + '\n');

console.log('📋 Проверяемые переменные:');
console.log('─'.repeat(70));

// Проверяем основные переменные
const variables = [
  { name: 'MERCHANT_LOGIN (с fallback)', value: process.env.ROBOKASSA_MERCHANT_LOGIN || process.env.MERCHANT_LOGIN },
  { name: 'ROBOKASSA_PASSWORD_1', value: process.env.ROBOKASSA_PASSWORD_1 },
  { name: 'ROBOKASSA_PASSWORD_2', value: process.env.ROBOKASSA_PASSWORD_2 },
  { name: 'ROBOKASSA_RESULT_URL2 (с fallback)', value: process.env.ROBOKASSA_RESULT_URL2 || process.env.RESULT_URL2 }
];

let allLoaded = true;

variables.forEach(({ name, value }) => {
  if (value) {
    const displayValue = value.substring(0, 15) + '***';
    console.log(`✅ ${name}: "${displayValue}"`);
  } else {
    console.log(`❌ ${name}: НЕ ЗАГРУЖЕН`);
    allLoaded = false;
  }
});

console.log('\n' + '='.repeat(70));
if (allLoaded) {
  console.log('✅ ВСЕ ПЕРЕМЕННЫЕ ЗАГРУЖЕНЫ УСПЕШНО!');
} else {
  console.log('❌ НЕКОТОРЫЕ ПЕРЕМЕННЫЕ НЕ ЗАГРУЖЕНЫ!');
}
console.log('='.repeat(70) + '\n');

// Показываем экспортированные значения из config
try {
  const config = require('./dist/config/index.js');
  console.log('📤 Экспортированные значения из config:');
  console.log('─'.repeat(70));
  console.log('MERCHANT_LOGIN:', config.MERCHANT_LOGIN ? config.MERCHANT_LOGIN.substring(0, 15) + '***' : 'undefined');
  console.log('ROBOKASSA_PASSWORD_1:', config.ROBOKASSA_PASSWORD_1 ? config.ROBOKASSA_PASSWORD_1.substring(0, 15) + '***' : 'undefined');
  console.log('ROBOKASSA_PASSWORD_2:', config.ROBOKASSA_PASSWORD_2 ? config.ROBOKASSA_PASSWORD_2.substring(0, 15) + '***' : 'undefined');
  console.log('RESULT_URL2:', config.RESULT_URL2 || 'undefined');
  console.log('='.repeat(70) + '\n');
} catch (error) {
  console.error('❌ Ошибка загрузки config:', error.message);
}
