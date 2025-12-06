/**
 * ПОДКЛЮЧАЕМСЯ К SUPABASE НАПРЯМУЮ
 * Проверяем актуальные данные в payments_v2
 */

const { createClient } = require('@supabase/supabase-js');

console.log('🔍 ПОДКЛЮЧЕНИЕ К SUPABASE');
console.log('='.repeat(80));

// Читаем конфигурацию из .env или создаем клиент
const supabaseUrl = process.env.SUPABASE_URL || 'https://your-project.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || 'your-service-key';

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
  console.log('⚠️ Нет переменных окружения для Supabase');
  console.log('   SUPABASE_URL:', process.env.SUPABASE_URL || 'НЕ УСТАНОВЛЕНА');
  console.log('   SUPABASE_SERVICE_KEY:', process.env.SUPABASE_SERVICE_KEY ? 'УСТАНОВЛЕНА' : 'НЕ УСТАНОВЛЕНА');

  console.log('\n💡 Попробуем загрузить из Infisical...');
}

const supabase = createClient(
  process.env.SUPABASE_URL || 'https://placeholder.supabase.co',
  process.env.SUPABASE_SERVICE_KEY || 'placeholder-key'
);

// Функция выполнения запроса
async function checkSupabase() {
  try {
    console.log('\n📊 Выполняем SQL запрос к payments_v2...');

    // Запрашиваем данные по MetaMuse_Manifest_bot
    const { data, error } = await supabase
      .from('payments_v2')
      .select('*')
      .eq('bot_name', 'MetaMuse_Manifest_bot')
      .eq('currency', 'STARS')
      .eq('type', 'MONEY_INCOME')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('❌ Ошибка запроса:', error);
      return;
    }

    console.log(`\n✅ Найдено STARS доходов для MetaMuse_Manifest_bot: ${data.length}\n`);

    if (data.length > 0) {
      console.log('📋 ТОП-10 STARS ДОХОДОВ:');
      console.log('-'.repeat(80));

      data
        .slice(0, 10)
        .forEach((tx, i) => {
          const amount = Math.abs(parseFloat(tx.amount) || 0);
          const date = new Date(tx.created_at);
          const dateStr = `${date.getDate().toString().padStart(2, '0')}.${(date.getMonth() + 1).toString().padStart(2, '0')}.${date.getFullYear()}`;

          console.log(`   ${i + 1}. ${amount.toLocaleString()}⭐ | ${dateStr}`);
          console.log(`      User: ${tx.telegram_id} | ${tx.payment_method}`);
          console.log(`      ${tx.description.substring(0, 80)}...`);
        });

      // Общая статистика
      const totalSum = data.reduce((sum, tx) => sum + Math.abs(parseFloat(tx.amount) || 0), 0);
      const uniqueUsers = new Set(data.map(tx => tx.telegram_id));

      console.log('\n💎 ИТОГО:');
      console.log(`   Транзакций: ${data.length}`);
      console.log(`   Сумма: ${Math.round(totalSum).toLocaleString()}⭐`);
      console.log(`   Пользователей: ${uniqueUsers.size}`);
    } else {
      console.log('❌ STARS доходов НЕТ в БД!');
    }

    // Проверим все валюты для MetaMuse
    console.log('\n📊 ПРОВЕРЯЕМ ВСЕ ВАЛЮТЫ ДЛЯ MetaMuse_Manifest_bot:');
    const { data: allData, error: allError } = await supabase
      .from('payments_v2')
      .select('currency, type, amount, payment_method')
      .eq('bot_name', 'MetaMuse_Manifest_bot')
      .order('currency', { ascending: true });

    if (allError) {
      console.error('❌ Ошибка запроса:', allError);
      return;
    }

    const currencyStats = {};
    allData.forEach(row => {
      const key = `${row.currency}-${row.type}`;
      if (!currencyStats[key]) {
        currencyStats[key] = { count: 0, total: 0 };
      }
      currencyStats[key].count++;
      currencyStats[key].total += Math.abs(parseFloat(row.amount) || 0);
    });

    console.log('\n📈 СТАТИСТИКА ПО ВАЛЮТАМ И ТИПАМ:');
    Object.entries(currencyStats).forEach(([key, stats]) => {
      const [currency, type] = key.split('-');
      const currencySymbol = currency === 'RUB' ? '₽' : currency === 'STARS' ? '⭐' : '';
      console.log(`   ${currency} (${type}): ${stats.count} транз., ${Math.round(stats.total).toLocaleString()}${currencySymbol}`);
    });

  } catch (error) {
    console.error('❌ Ошибка:', error.message);
  }
}

// Выполняем проверку
checkSupabase();
