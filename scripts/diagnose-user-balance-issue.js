#!/usr/bin/env node

/**
 * Скрипт диагностики проблемы пользователя с кнопками баланса
 * Помогает понять, почему "Пополнить баланс" и "Баланс" могут путаться
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

async function diagnoseUserIssue(telegramId) {
  console.log('\n=== ДИАГНОСТИКА ПРОБЛЕМЫ С КНОПКАМИ БАЛАНСА ===\n');
  console.log(`👤 Пользователь: ${telegramId}\n`);

  try {
    // 1. Проверяем последние транзакции пользователя
    const { data: recentPayments, error: paymentsError } = await supabase
      .from('payments_v2')
      .select('*')
      .eq('telegram_id', telegramId)
      .order('created_at', { ascending: false })
      .limit(10);

    if (paymentsError) throw paymentsError;

    console.log('📊 Последние 10 транзакций:');
    if (recentPayments && recentPayments.length > 0) {
      recentPayments.forEach((payment, index) => {
        const date = new Date(payment.created_at).toLocaleString('ru-RU');
        const type = payment.type === 'MONEY_INCOME' ? '➕' : '➖';
        console.log(`  ${index + 1}. ${date} ${type} ${payment.stars} ⭐ - ${payment.description || 'Без описания'}`);
      });
    } else {
      console.log('  Транзакций не найдено');
    }

    // 2. Проверяем данные пользователя
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('*')
      .eq('telegram_id', telegramId);

    if (userError) throw userError;

    console.log('\n📱 Информация о пользователе:');
    if (userData && userData.length > 0) {
      userData.forEach(user => {
        console.log(`  Бот: ${user.bot_name}`);
        console.log(`  Username: @${user.username || 'не указан'}`);
        console.log(`  Язык: ${user.language_code || 'не определен'}`);
        console.log(`  Дата регистрации: ${new Date(user.created_at).toLocaleString('ru-RU')}`);
      });
    }

    // 3. Проверяем текущий баланс
    const { data: balance, error: balanceError } = await supabase
      .rpc('get_user_balance', { user_telegram_id: telegramId });

    if (!balanceError && balance !== null) {
      console.log(`\n💰 Текущий баланс: ${balance} ⭐`);
    }

    // 4. Рекомендации для пользователя
    console.log('\n🔧 РЕКОМЕНДАЦИИ ДЛЯ РЕШЕНИЯ ПРОБЛЕМЫ:\n');
    
    console.log('1️⃣ ОБНОВИТЕ КЛАВИАТУРУ:');
    console.log('   Отправьте команду /menu боту для обновления клавиатуры');
    console.log('   Это сбросит все активные сцены и покажет актуальные кнопки\n');
    
    console.log('2️⃣ ИСПОЛЬЗУЙТЕ ИМЕННО КНОПКИ:');
    console.log('   ✅ Нажимайте на кнопку "💰 Баланс" для просмотра баланса');
    console.log('   ✅ Нажимайте на кнопку "💎 Пополнить баланс" для пополнения');
    console.log('   ❌ НЕ вводите текст вручную - используйте готовые кнопки!\n');
    
    console.log('3️⃣ ЕСЛИ КНОПКИ НЕ ВИДНЫ:');
    console.log('   - Нажмите на иконку клавиатуры рядом с полем ввода');
    console.log('   - Если клавиатура не появляется, отправьте /menu\n');
    
    console.log('4️⃣ ПРОВЕРКА ПОДПИСКИ:');
    console.log('   Функции баланса доступны только с активной подпиской');
    console.log('   Если у вас нет подписки, сначала оформите её через главное меню\n');

    console.log('5️⃣ ТЕХНИЧЕСКИЕ ДЕТАЛИ:');
    console.log('   Кнопка "💰 Баланс" → Показывает текущий баланс и историю');
    console.log('   Кнопка "💎 Пополнить баланс" → Открывает выбор способа оплаты');
    console.log('   Эти кнопки НЕ должны путаться, если использовать их правильно\n');

    console.log('⚠️  ВАЖНО:');
    console.log('   Если проблема сохраняется после выполнения рекомендаций,');
    console.log('   обратитесь в техподдержку с описанием проблемы и скриншотами.\n');

  } catch (error) {
    console.error('Ошибка при диагностике:', error);
  }
}

// Получаем ID пользователя из аргументов командной строки
const userId = process.argv[2];

if (!userId) {
  console.log('Использование: node diagnose-user-balance-issue.js <telegram_id>');
  console.log('Пример: node diagnose-user-balance-issue.js 6807620304');
  process.exit(1);
}

diagnoseUserIssue(userId);
