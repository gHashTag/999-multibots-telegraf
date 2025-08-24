#!/usr/bin/env node

// Загружаем переменные из .env
require('dotenv').config();

console.log('🔍 Проверка переменных окружения:');
console.log('='.repeat(50));

const requiredVars = [
  'SUPABASE_URL',
  'SUPABASE_SERVICE_KEY', 
  'DART_AI_API_KEY'
];

const optionalVars = [
  'BOT_TOKEN_1',
  'ADMIN_IDS',
  'NODE_ENV'
];

console.log('\n✅ ОБЯЗАТЕЛЬНЫЕ ПЕРЕМЕННЫЕ:');
requiredVars.forEach(varName => {
  const value = process.env[varName];
  if (value) {
    console.log(`✅ ${varName}: ${value.substring(0, 20)}...`);
  } else {
    console.log(`❌ ${varName}: НЕ НАЙДЕНА`);
  }
});

console.log('\n📋 ОПЦИОНАЛЬНЫЕ ПЕРЕМЕННЫЕ:');
optionalVars.forEach(varName => {
  const value = process.env[varName];
  if (value) {
    console.log(`✅ ${varName}: ${value.substring(0, 20)}...`);
  } else {
    console.log(`⚠️ ${varName}: НЕ НАЙДЕНА`);
  }
});

// Проверим, работает ли создание клиента Supabase
console.log('\n🔧 ТЕСТИРОВАНИЕ SUPABASE:');
try {
  const { createClient } = require('@supabase/supabase-js');
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
  console.log('✅ Supabase клиент создан успешно');
} catch (error) {
  console.log(`❌ Ошибка создания Supabase клиента: ${error.message}`);
}

console.log('\n='.repeat(50));