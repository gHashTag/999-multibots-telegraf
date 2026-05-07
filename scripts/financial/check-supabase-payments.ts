/**
 * ПРОВЕРЯЕМ SUPABASE ЧЕРЕЗ СУЩЕСТВУЮЩИЙ КЛИЕНТ
 * Используем импорты из проекта
 */

import { supabase } from '../src/core/supabase/client.ts';

async function checkSupabasePayments() {
  console.log('🔍 ПРОВЕРЯЕМ SUPABASE payments_v2');
  console.log('='.repeat(80));

  try {
    // 1. Проверяем STARS доходы для MetaMuse_Manifest_bot
    console.log('\n📊 1. STARS доходы (MONEY_INCOME) для MetaMuse_Manifest_bot:');
    console.log('-'.repeat(80));

    const { data: starsIncome, error: starsError } = await supabase
      .from('payments_v2')
      .select('*')
      .eq('bot_name', 'MetaMuse_Manifest_bot')
      .eq('currency', 'STARS')
      .eq('type', 'MONEY_INCOME')
      .gt('amount', 0)
      .order('created_at', { ascending: false });

    if (starsError) {
      console.error('❌ Ошибка:', starsError);
      return;
    }

    console.log(`Найдено: ${starsIncome.length} транзакций`);

    if (starsIncome.length > 0) {
      starsIncome.forEach((tx, i) => {
        const amount = Math.abs(parseFloat(tx.amount as any) || 0);
        const date = new Date(tx.created_at as any);
        const dateStr = `${date.getDate().toString().padStart(2, '0')}.${(date.getMonth() + 1).toString().padStart(2, '0')}.${date.getFullYear()}`;

        console.log(`\n${i + 1}. ${amount.toLocaleString()}⭐ | ${dateStr}`);
        console.log(`   User: ${tx.telegram_id} | ${tx.payment_method || 'unknown'}`);
        console.log(`   ${tx.description || 'без описания'}`);
      });
    }

    // 2. Проверяем RUB доходы
    console.log('\n\n📊 2. RUB доходы (MONEY_INCOME) для MetaMuse_Manifest_bot:');
    console.log('-'.repeat(80));

    const { data: rubIncome, error: rubError } = await supabase
      .from('payments_v2')
      .select('*')
      .eq('bot_name', 'MetaMuse_Manifest_bot')
      .eq('currency', 'RUB')
      .eq('type', 'MONEY_INCOME')
      .gt('amount', 0)
      .order('created_at', { ascending: false });

    if (rubError) {
      console.error('❌ Ошибка:', rubError);
      return;
    }

    console.log(`Найдено: ${rubIncome.length} транзакций`);

    if (rubIncome.length > 0) {
      const totalSum = rubIncome.reduce((sum, tx) => sum + Math.abs(parseFloat(tx.amount as any) || 0), 0);
      console.log(`Общая сумма: ${Math.round(totalSum).toLocaleString()}₽`);

      rubIncome.slice(0, 5).forEach((tx, i) => {
        const amount = Math.abs(parseFloat(tx.amount as any) || 0);
        const date = new Date(tx.created_at as any);
        const dateStr = `${date.getDate().toString().padStart(2, '0')}.${(date.getMonth() + 1).toString().padStart(2, '0')}.${date.getFullYear()}`;

        console.log(`\n${i + 1}. ${amount.toLocaleString()}₽ | ${dateStr}`);
        console.log(`   User: ${tx.telegram_id} | ${tx.payment_method || 'unknown'}`);
        console.log(`   ${tx.description || 'без описания'}`);
      });
    }

    // 3. Проверяем STARS расходы
    console.log('\n\n📊 3. STARS расходы (MONEY_OUTCOME) для MetaMuse_Manifest_bot:');
    console.log('-'.repeat(80));

    const { data: starsExpense, error: expenseError } = await supabase
      .from('payments_v2')
      .select('*')
      .eq('bot_name', 'MetaMuse_Manifest_bot')
      .eq('currency', 'STARS')
      .eq('type', 'MONEY_OUTCOME')
      .order('created_at', { ascending: false });

    if (expenseError) {
      console.error('❌ Ошибка:', expenseError);
      return;
    }

    console.log(`Найдено: ${starsExpense.length} транзакций`);

    if (starsExpense.length > 0) {
      const totalExpense = starsExpense.reduce((sum, tx) => sum + Math.abs(parseFloat(tx.amount as any) || 0), 0);
      console.log(`Общая сумма: ${Math.round(totalExpense).toLocaleString()}⭐`);

      starsExpense.slice(0, 3).forEach((tx, i) => {
        const amount = Math.abs(parseFloat(tx.amount as any) || 0);
        const date = new Date(tx.created_at as any);
        const dateStr = `${date.getDate().toString().padStart(2, '0')}.${(date.getMonth() + 1).toString().padStart(2, '0')}.${date.getFullYear()}`;

        console.log(`\n${i + 1}. ${amount.toLocaleString()}⭐ | ${dateStr}`);
        console.log(`   ${tx.payment_method || 'unknown'}`);
        console.log(`   ${tx.description || 'без описания'}`);
      });
    }

    // 4. Сводка
    const rubSum = rubIncome?.reduce((sum, tx) => sum + Math.abs(parseFloat(tx.amount as any) || 0), 0) || 0;
    const starsIncomeSum = starsIncome?.reduce((sum, tx) => sum + Math.abs(parseFloat(tx.amount as any) || 0), 0) || 0;
    const starsExpenseSum = starsExpense?.reduce((sum, tx) => sum + Math.abs(parseFloat(tx.amount as any) || 0), 0) || 0;

    console.log('\n\n' + '='.repeat(80));
    console.log('💎 СВОДКА ПО METAMUSE_MANIFEST_BOT:');
    console.log('='.repeat(80));
    console.log(`1️⃣ РАСХОДЫ (STARS): ${Math.round(starsExpenseSum).toLocaleString()}⭐ (${starsExpense.length} транз.)`);
    console.log(`2️⃣ ДОХОДЫ В РУБЛЯХ: ${Math.round(rubSum).toLocaleString()}₽ (${rubIncome.length} транз.)`);
    console.log(`3️⃣ ДОХОДЫ В ЗВЕЗДАХ: ${Math.round(starsIncomeSum).toLocaleString()}⭐ (${starsIncome.length} транз.)`);

  } catch (error) {
    console.error('❌ Критическая ошибка:', error);
  }
}

checkSupabasePayments();
