/**
 * Скрипт получения ВСЕХ пользователей из Supabase
 * С пагинацией для обхода ограничения API (1000 записей за раз)
 * БЕЗ создания промежуточных файлов
 */

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import path from 'path';
import fs from 'fs';

// Load .env
config({ path: path.join(process.cwd(), '.env') });

// Валютные курсы
const RATES = { XTR: 1.8, STARS: 1.8, RUB: 1.0 };

function convertToRub(amount: number, currency: string): number {
  return (parseFloat(amount.toString()) || 0) * (RATES[currency as keyof typeof RATES] || 1.0);
}

// Типы данных
interface UserStats {
  telegram_id: number;
  total_income_rub: number;
  total_spent_rub: number;
  income_operations: number;
  spending_operations: number;
  income_bots: Set<string>;
  spending_bots: Set<string>;
  income_currency: { RUB: number; XTR: number; STARS: number };
  spending_currency: { RUB: number; XTR: number; STARS: number };
}

interface PaymentRecord {
  telegram_id: number;
  amount: number;
  currency: string;
  type: string;
  bot_name: string;
  created_at: string;
  payment_method?: string;
}

/**
 * Получение ВСЕХ записей из payments_v2 с пагинацией
 */
async function fetchAllPayments(): Promise<PaymentRecord[]> {
  console.log('🔐 Loading secrets from Infisical...\n');

  const { initInfisical, getSecret } = await import('../src/core/infisical');
  await initInfisical();

  const supabaseUrl = getSecret('SUPABASE_URL');
  const supabaseKey = getSecret('SUPABASE_SERVICE_KEY');

  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Missing Supabase credentials in Infisical');
  }

  const supabase = createClient(supabaseUrl, supabaseKey);
  console.log('✅ Connected to Supabase\n');

  // Получаем общее количество записей
  const { count } = await supabase
    .from('payments_v2')
    .select('*', { count: 'exact', head: true });

  console.log(`📊 Total records in database: ${count}\n`);

  // Пагинация по 1000 записей
  const pageSize = 1000;
  const totalPages = Math.ceil((count || 0) / pageSize);

  console.log(`📥 Fetching all data with pagination (${totalPages} pages)...\n`);

  const allRecords: PaymentRecord[] = [];

  for (let page = 0; page < totalPages; page++) {
    const offset = page * pageSize;
    console.log(`📥 Loading page ${page + 1}/${totalPages} (offset: ${offset})...`);

    const { data, error } = await supabase
      .from('payments_v2')
      .select('telegram_id, amount, currency, type, bot_name, created_at, payment_method')
      .range(offset, offset + pageSize - 1);

    if (error) {
      throw new Error(`Error fetching page ${page + 1}: ${error.message}`);
    }

    allRecords.push(...(data || []));
    console.log(`   Loaded records: ${data?.length || 0} (total: ${allRecords.length})`);
  }

  console.log(`\n✅ All pages loaded successfully!`);
  console.log(`✅ Total records: ${allRecords.length}\n`);

  return allRecords;
}

/**
 * Обработка данных пользователей
 * БЕЗ создания промежуточных файлов!
 */
function processUsersData(records: PaymentRecord[]): Record<string, UserStats> {
  console.log('🔄 Processing user data...\n');

  const userStats: Record<string, UserStats> = {};

  records.forEach(record => {
    const userId = record.telegram_id;

    if (!userId) return; // Skip records without user ID

    if (!userStats[userId]) {
      userStats[userId] = {
        telegram_id: userId,
        total_income_rub: 0,
        total_spent_rub: 0,
        income_operations: 0,
        spending_operations: 0,
        income_bots: new Set(),
        spending_bots: new Set(),
        income_currency: { RUB: 0, XTR: 0, STARS: 0 },
        spending_currency: { RUB: 0, XTR: 0, STARS: 0 }
      };
    }

    const amount = parseFloat(record.amount.toString()) || 0;
    let amountInRub = amount;

    // Конвертация в рубли
    if (record.currency === 'XTR') amountInRub = amount * 1.8;
    if (record.currency === 'STARS') amountInRub = amount * 1.8;

    // Обработка ДОХОДОВ (MONEY_INCOME)
    if (record.type === 'MONEY_INCOME') {
      userStats[userId].total_income_rub += amountInRub;
      userStats[userId].income_operations += 1;
      userStats[userId].income_bots.add(record.bot_name);
      (userStats[userId].income_currency as any)[record.currency] += amount;
    }

    // Обработка РАСХОДОВ (MONEY_OUTCOME)
    if (record.type === 'MONEY_OUTCOME') {
      userStats[userId].total_spent_rub += amountInRub;
      userStats[userId].spending_operations += 1;
      userStats[userId].spending_bots.add(record.bot_name);
      (userStats[userId].spending_currency as any)[record.currency] += amount;
    }
  });

  console.log(`✅ Processed ${Object.keys(userStats).length} users\n`);

  return userStats;
}

/**
 * Главная функция - получение ВСЕХ пользователей
 * НЕ создает промежуточные файлы!
 */
export async function getAllUsersData(): Promise<Record<string, UserStats>> {
  console.log('\n' + '='.repeat(80));
  console.log('🎯 ПОЛУЧЕНИЕ ВСЕХ ПОЛЬЗОВАТЕЛЕЙ ИЗ SUPABASE');
  console.log('   С пагинацией, БЕЗ промежуточных файлов');
  console.log('='.repeat(80) + '\n');

  try {
    // 1. Получить ВСЕ записи из Supabase
    const allRecords = await fetchAllPayments();

    // 2. Обработать данные пользователей
    const usersData = processUsersData(allRecords);

    // 3. Показать статистику
    console.log('📊 ФИНАЛЬНАЯ СТАТИСТИКА:');
    console.log(`   👤 Всего пользователей: ${Object.keys(usersData).length}`);
    console.log(`   💰 Пользователей с доходами: ${Object.values(usersData).filter(u => u.total_income_rub > 0).length}`);
    console.log(`   💸 Пользователей с расходами: ${Object.values(usersData).filter(u => u.total_spent_rub > 0).length}`);
    console.log(`   💎 Всего доходов: ${Math.round(Object.values(usersData).reduce((s, u) => s + u.total_income_rub, 0)).toLocaleString()}₽`);
    console.log(`   📉 Всего расходов: ${Math.round(Object.values(usersData).reduce((s, u) => s + u.total_spent_rub, 0)).toLocaleString()}₽`);

    // 4. Показать ТОП-10 пользователей
    console.log('\n🏆 ТОП-10 ПОЛЬЗОВАТЕЛЕЙ ПО ДОХОДАМ:');
    const topIncomeUsers = Object.values(usersData)
      .sort((a, b) => b.total_income_rub - a.total_income_rub)
      .slice(0, 10);

    topIncomeUsers.forEach((user, index) => {
      console.log(`   ${index + 1}. ID: ${user.telegram_id} | Доходы: ${Math.round(user.total_income_rub).toLocaleString()}₽ | Расходы: ${Math.round(user.total_spent_rub).toLocaleString()}₽`);
    });

    console.log('\n🏆 ТОП-10 ПОЛЬЗОВАТЕЛЕЙ ПО РАСХОДАМ:');
    const topSpendingUsers = Object.values(usersData)
      .sort((a, b) => b.total_spent_rub - a.total_spent_rub)
      .slice(0, 10);

    topSpendingUsers.forEach((user, index) => {
      console.log(`   ${index + 1}. ID: ${user.telegram_id} | Расходы: ${Math.round(user.total_spent_rub).toLocaleString()}₽ | Доходы: ${Math.round(user.total_income_rub).toLocaleString()}₽`);
    });

    console.log('\n' + '='.repeat(80));
    console.log('✅ ДАННЫЕ ПОЛЬЗОВАТЕЛЕЙ ГОТОВЫ!');
    console.log('   Возвращается объект со ВСЕМИ пользователями');
    console.log('   БЕЗ создания промежуточных файлов!');
    console.log('='.repeat(80) + '\n');

    return usersData;

  } catch (error) {
    console.error('❌ Error:', error instanceof Error ? error.message : String(error));
    throw error;
  }
}

// Запуск скрипта
getAllUsersData()
  .then((usersData) => {
    // Выводим JSON для парсинга parent процессом
    process.stdout.write('\n---JSON_START---\n');
    process.stdout.write(JSON.stringify(usersData));
    process.stdout.write('\n---JSON_END---\n');

    // Завершаем процесс
    process.exit(0);
  })
  .catch(error => {
    console.error('❌ Script failed:', error);
    process.exit(1);
  });
