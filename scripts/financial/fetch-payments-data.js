#!/usr/bin/env node

/**
 * 🔌 ПОЛУЧЕНИЕ ДАННЫХ ИЗ SUPABASE
 * Использует существующий Infisical SDK для получения ключей
 */

const fs = require('fs');
const path = require('path');

// Настройки Infisical
const INFISICAL_CLIENT_ID = '88fcf0cd-cce9-4844-bad2-8e19b4bad3ed';
const INFISICAL_CLIENT_SECRET = 'b377e7a60b669ea2317f339dc6cb79ce49d588a7bbed92433bb2a73dedff3314';
const PROJECT_ID = 'fd763fa3-35d5-4045-93bd-1795c5f00fc3';
const ENVIRONMENT = 'dev';

async function initInfisical() {
  const { InfisicalSDK } = await import('@infisical/sdk');

  const client = new InfisicalSDK({
    siteUrl: 'https://app.infisical.com'
  });

  await client.auth().universalAuth.login({
    clientId: INFISICAL_CLIENT_ID,
    clientSecret: INFISICAL_CLIENT_SECRET
  });

  return client;
}

async function getSecrets(client) {
  const result = await client.secrets().listSecrets({
    projectId: PROJECT_ID,
    environment: ENVIRONMENT,
    secretPath: '/'
  });

  const secrets = {};
  for (const secret of result.secrets) {
    secrets[secret.secretKey] = secret.secretValue;
  }

  return secrets;
}

async function fetchAllPages(url, headers) {
  const allData = [];
  let offset = 0;
  const limit = 1000;

  while (true) {
    const paginatedUrl = `${url}&offset=${offset}&limit=${limit}`;
    console.log(`📥 Загрузка страницы (offset: ${offset})...`);

    const response = await fetch(paginatedUrl, {
      headers: headers
    });

    if (!response.ok) {
      throw new Error(`Ошибка загрузки: ${response.status} ${response.statusText}`);
    }

    const pageData = await response.json();

    if (pageData.length === 0) {
      console.log('✅ Все страницы загружены');
      break;
    }

    allData.push(...pageData);
    console.log(`   Загружено записей: ${pageData.length} (всего: ${allData.length})`);

    // Если меньше лимита - это последняя страница
    if (pageData.length < limit) {
      console.log('✅ Все страницы загружены (последняя страница)');
      break;
    }

    offset += limit;
  }

  return allData;
}

async function fetchPaymentsData(secrets) {
  const SUPABASE_URL = secrets.SUPABASE_URL;
  const SUPABASE_SERVICE_KEY = secrets.SUPABASE_SERVICE_KEY;

  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    throw new Error('SUPABASE_URL или SUPABASE_SERVICE_KEY не найдены в секретах');
  }

  console.log(`✅ Подключение к: ${SUPABASE_URL}`);

  const headers = {
    'apikey': SUPABASE_SERVICE_KEY,
    'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
    'Content-Type': 'application/json'
  };

  const url = `${SUPABASE_URL}/rest/v1/payments_v2?select=*`;

  console.log('\n📥 Загрузка ВСЕХ данных из payments_v2 (с пагинацией)...');

  // Получаем ВСЕ данные с пагинацией
  const rawData = await fetchAllPages(url, headers);

  console.log(`\n✅ Загружено ВСЕГО: ${rawData.length} записей`);

  // Форматируем данные
  const formattedData = rawData.map(row => ({
    telegram_id: row.telegram_id || '',
    bot_name: row.bot_name || '',
    payment_method: row.payment_method || '',
    description: row.description || '',
    amount: parseFloat(row.amount || 0),
    currency: row.currency || 'RUB',
    type: row.type || '',
    created_at: row.created_at || ''
  }));

  // Создаем резервную копию
  const backupPath = `payments_data_backup_${new Date().toISOString().slice(0, 10)}.json`;
  fs.writeFileSync(backupPath, JSON.stringify(formattedData, null, 2));
  console.log(`💾 Резервная копия создана: ${backupPath}`);

  // Сохраняем основной файл
  fs.writeFileSync('payments_data.json', JSON.stringify(formattedData, null, 2));
  console.log('💾 Данные сохранены в payments_data.json');

  // Статистика по ботам
  const botStats = {};
  for (const row of formattedData) {
    const bot = row.bot_name;
    if (!botStats[bot]) {
      botStats[bot] = 0;
    }
    botStats[bot]++;
  }

  console.log('\n📊 СТАТИСТИКА ПО БОТАМ:');
  const sortedBots = Object.entries(botStats).sort((a, b) => b[1] - a[1]);
  sortedBots.forEach(([bot, count]) => {
    console.log(`   ${bot}: ${count} транзакций`);
  });

  // Статистика по пользователям
  const userStats = {};
  for (const row of formattedData) {
    const userId = row.telegram_id;
    if (!userStats[userId]) {
      userStats[userId] = 0;
    }
    userStats[userId]++;
  }

  console.log('\n👤 СТАТИСТИКА ПО ПОЛЬЗОВАТЕЛЯМ:');
  console.log(`   Всего пользователей: ${Object.keys(userStats).length}`);
  console.log(`   Всего транзакций: ${formattedData.length}`);

  return formattedData;
}

async function main() {
  console.log('\n' + '='.repeat(70));
  console.log('🔌 ПОЛУЧЕНИЕ ДАННЫХ ИЗ SUPABASE');
  console.log('='.repeat(70) + '\n');

  try {
    // Инициализируем Infisical
    console.log('🔐 Инициализация Infisical...');
    const client = await initInfisical();
    console.log('✅ Успешная авторизация в Infisical\n');

    // Получаем секреты
    console.log('📥 Получение секретов...');
    const secrets = await getSecrets(client);
    console.log(`✅ Загружено ${Object.keys(secrets).length} секретов\n`);

    // Получаем данные
    const data = await fetchPaymentsData(secrets);

    console.log(`\n✅ Успешно загружено ${data.length} записей\n`);
    console.log('='.repeat(70));

  } catch (error) {
    console.error('\n❌ Ошибка:', error.message);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

main();
