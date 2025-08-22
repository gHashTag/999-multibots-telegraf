#!/usr/bin/env node

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

async function analyzeClient() {
  const clientTelegramId = '6807620304';
  
  console.log('\n===========================================');
  console.log(`АНАЛИЗ КЛИЕНТА: ${clientTelegramId}`);
  console.log('===========================================\n');

  try {
    // 1. Получаем информацию о пользователе
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('*')
      .eq('telegram_id', clientTelegramId);

    if (userError) throw userError;

    if (userData && userData.length > 0) {
      console.log('📱 ИНФОРМАЦИЯ О ПОЛЬЗОВАТЕЛЕ:');
      userData.forEach(user => {
        console.log(`   Имя: ${user.first_name || ''} ${user.last_name || ''}`);
        console.log(`   Username: @${user.username || 'не указан'}`);
        console.log(`   Бот: ${user.bot_name}`);
        console.log(`   Дата регистрации: ${new Date(user.created_at).toLocaleString('ru-RU')}`);
        console.log('---');
      });
    }

    // 2. Получаем все транзакции
    const { data: payments, error: paymentsError } = await supabase
      .from('payments_v2')
      .select('*')
      .eq('telegram_id', clientTelegramId)
      .order('created_at', { ascending: false });

    if (paymentsError) throw paymentsError;

    console.log(`\n📊 ВСЕГО ТРАНЗАКЦИЙ: ${payments.length}`);

    // 3. Анализ по типам транзакций
    const incomes = payments.filter(p => p.type === 'MONEY_INCOME' && p.status === 'COMPLETED');
    const outcomes = payments.filter(p => p.type === 'MONEY_OUTCOME' && p.status === 'COMPLETED');
    const pending = payments.filter(p => p.status === 'PENDING');
    const failed = payments.filter(p => p.status === 'FAILED');

    // Разделяем доходы на реальные и бонусные
    const realIncomes = incomes.filter(p => p.category === 'REAL' || !p.category);
    const bonusIncomes = incomes.filter(p => p.category === 'BONUS');

    // 4. Подсчет сумм
    const totalRealStars = realIncomes.reduce((sum, p) => sum + (p.stars || 0), 0);
    const totalBonusStars = bonusIncomes.reduce((sum, p) => sum + (p.stars || 0), 0);
    const totalSpentStars = outcomes.reduce((sum, p) => sum + (p.stars || 0), 0);
    const currentBalance = totalRealStars + totalBonusStars - totalSpentStars;

    console.log('\n💰 ФИНАНСОВАЯ СТАТИСТИКА:');
    console.log(`   Пополнено звезд (реальные): ${totalRealStars} ⭐`);
    console.log(`   Бонусные звезды: ${totalBonusStars} ⭐`);
    console.log(`   Потрачено звезд: ${totalSpentStars} ⭐`);
    console.log(`   ТЕКУЩИЙ БАЛАНС: ${currentBalance} ⭐`);

    // 5. Анализ пополнений по способам оплаты
    const rubPayments = realIncomes.filter(p => p.currency === 'RUB');
    const starPayments = realIncomes.filter(p => p.currency === 'XTR' || p.currency === 'STARS');

    console.log('\n💳 АНАЛИЗ ПОПОЛНЕНИЙ:');
    console.log(`   Через рубли (Robokassa): ${rubPayments.length} платежей на ${rubPayments.reduce((s, p) => s + (p.stars || 0), 0)} ⭐`);
    console.log(`   Через Telegram Stars: ${starPayments.length} платежей на ${starPayments.reduce((s, p) => s + (p.stars || 0), 0)} ⭐`);
    
    if (bonusIncomes.length > 0) {
      console.log(`   Бонусные начисления: ${bonusIncomes.length} на ${totalBonusStars} ⭐`);
    }

    // 6. Анализ трат по сервисам
    const serviceStats = {};
    outcomes.forEach(p => {
      const service = p.service_type || p.description || 'Неизвестный сервис';
      if (!serviceStats[service]) {
        serviceStats[service] = { count: 0, stars: 0 };
      }
      serviceStats[service].count++;
      serviceStats[service].stars += p.stars || 0;
    });

    console.log('\n🔧 АНАЛИЗ ТРАТ ПО СЕРВИСАМ:');
    Object.entries(serviceStats)
      .sort(([, a], [, b]) => b.stars - a.stars)
      .forEach(([service, stats]) => {
        console.log(`   ${service}: ${stats.count} раз на ${stats.stars} ⭐`);
      });

    // 7. Последние операции
    console.log('\n📅 ПОСЛЕДНИЕ 10 ОПЕРАЦИЙ:');
    payments.slice(0, 10).forEach(p => {
      const date = new Date(p.created_at).toLocaleString('ru-RU');
      const type = p.type === 'MONEY_INCOME' ? '➕' : '➖';
      const status = p.status === 'COMPLETED' ? '✅' : p.status === 'PENDING' ? '⏳' : '❌';
      console.log(`   ${date} ${type} ${p.stars} ⭐ ${status} - ${p.description || 'Без описания'}`);
    });

    // 8. Проблемные транзакции
    if (pending.length > 0) {
      console.log('\n⚠️ НЕЗАВЕРШЕННЫЕ ТРАНЗАКЦИИ (PENDING):');
      pending.forEach(p => {
        const date = new Date(p.created_at).toLocaleString('ru-RU');
        console.log(`   ${date} - ${p.stars} ⭐ - ${p.description || 'Без описания'}`);
      });
    }

    if (failed.length > 0) {
      console.log('\n❌ НЕУДАЧНЫЕ ТРАНЗАКЦИИ (FAILED):');
      failed.forEach(p => {
        const date = new Date(p.created_at).toLocaleString('ru-RU');
        console.log(`   ${date} - ${p.stars} ⭐ - ${p.description || 'Без описания'}`);
      });
    }

    // 9. Проверка баланса через SQL функцию
    const { data: balanceFromFunc, error: balanceError } = await supabase
      .rpc('get_user_balance', { user_telegram_id: clientTelegramId });

    if (!balanceError && balanceFromFunc !== null) {
      console.log('\n🔍 ПРОВЕРКА БАЛАНСА:');
      console.log(`   Баланс по SQL функции: ${balanceFromFunc} ⭐`);
      console.log(`   Баланс по расчетам: ${currentBalance} ⭐`);
      
      if (Math.abs(balanceFromFunc - currentBalance) > 0.01) {
        console.log(`   ⚠️ ВНИМАНИЕ: Расхождение в балансе на ${Math.abs(balanceFromFunc - currentBalance)} ⭐`);
      } else {
        console.log(`   ✅ Баланс совпадает`);
      }
    }

    // 10. Анализ активности
    if (payments.length > 0) {
      const firstPayment = new Date(payments[payments.length - 1].created_at);
      const lastPayment = new Date(payments[0].created_at);
      const daysSinceFirst = Math.floor((Date.now() - firstPayment) / (1000 * 60 * 60 * 24));
      const daysSinceLast = Math.floor((Date.now() - lastPayment) / (1000 * 60 * 60 * 24));

      console.log('\n📈 АКТИВНОСТЬ:');
      console.log(`   Первая транзакция: ${firstPayment.toLocaleString('ru-RU')} (${daysSinceFirst} дней назад)`);
      console.log(`   Последняя транзакция: ${lastPayment.toLocaleString('ru-RU')} (${daysSinceLast} дней назад)`);
      console.log(`   Средняя частота: ${(payments.length / daysSinceFirst).toFixed(2)} транзакций в день`);
    }

    console.log('\n===========================================\n');

  } catch (error) {
    console.error('Ошибка при анализе:', error);
  }
}

analyzeClient();
