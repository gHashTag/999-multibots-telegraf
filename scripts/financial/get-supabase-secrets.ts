/**
 * ИНИЦИАЛИЗИРУЕМ INFISICAL И ПОЛУЧАЕМ SUPABASE СЕКРЕТЫ
 */

import { initInfisical, getSecrets } from './src/core/infisical/index';
import { createClient } from '@supabase/supabase-js';

async function main() {
  console.log('🔐 ИНИЦИАЛИЗАЦИЯ INFISICAL...');
  console.log('='.repeat(80));

  try {
    // 1. Загружаем все секреты из Infisical
    await initInfisical();

    console.log('✅ Секреты загружены из Infisical');

    // 2. Получаем SUPABASE секреты
    const supabaseSecrets = getSecrets([
      'SUPABASE_URL',
      'SUPABASE_SERVICE_KEY',
      'SUPABASE_SERVICE_ROLE_KEY'
    ]);

    console.log('\n🔑 ПОЛУЧЕННЫЕ SUPABASE СЕКРЕТЫ:');
    console.log('SUPABASE_URL:', supabaseSecrets.SUPABASE_URL ? '✅ УСТАНОВЛЕНА' : '❌ НЕТ');
    console.log('SUPABASE_SERVICE_KEY:', supabaseSecrets.SUPABASE_SERVICE_KEY ? '✅ УСТАНОВЛЕНА' : '❌ НЕТ');
    console.log('SUPABASE_SERVICE_ROLE_KEY:', supabaseSecrets.SUPABASE_SERVICE_ROLE_KEY ? '✅ УСТАНОВЛЕНА' : '❌ НЕТ');

    if (!supabaseSecrets.SUPABASE_URL) {
      console.log('\n❌ SUPABASE_URL не найден в Infisical!');
      return;
    }

    // 3. Создаем Supabase клиент
    const supabaseKey = supabaseSecrets.SUPABASE_SERVICE_ROLE_KEY || supabaseSecrets.SUPABASE_SERVICE_KEY;
    const supabase = createClient(supabaseSecrets.SUPABASE_URL, supabaseKey);

    // 4. Проверяем данные
    console.log('\n🔍 ПРОВЕРЯЕМ ДАННЫЕ В SUPABASE...');
    console.log('='.repeat(80));

    // STARS доходы для MetaMuse
    const { data: starsIncome, error: starsError } = await supabase
      .from('payments_v2')
      .select('*')
      .eq('bot_name', 'MetaMuse_Manifest_bot')
      .eq('currency', 'STARS')
      .eq('type', 'MONEY_INCOME')
      .gt('amount', 0)
      .order('created_at', { ascending: false });

    if (starsError) throw starsError;

    console.log(`\n📊 STARS доходы (MONEY_INCOME) для MetaMuse_Manifest_bot:`);
    console.log(`   Найдено: ${starsIncome.length} транзакций`);

    if (starsIncome.length > 0) {
      console.log('\n💰 ТОП-10 STARS ДОХОДОВ:');
      starsIncome.slice(0, 10).forEach((tx, i) => {
        const amount = Math.abs(parseFloat(tx.amount as any) || 0);
        const date = new Date(tx.created_at as any);
        const dateStr = `${date.getDate().toString().padStart(2, '0')}.${(date.getMonth() + 1).toString().padStart(2, '0')}.${date.getFullYear()}`;

        console.log(`\n   ${i + 1}. ${amount.toLocaleString()}⭐ | ${dateStr}`);
        console.log(`      User: ${tx.telegram_id} | ${tx.payment_method || 'unknown'}`);
        console.log(`      ${tx.description || 'без описания'}`);
      });

      const totalSum = starsIncome.reduce((sum, tx) => sum + Math.abs(parseFloat(tx.amount as any) || 0), 0);
      console.log(`\n💎 ОБЩАЯ СУММА: ${Math.round(totalSum).toLocaleString()}⭐`);
    } else {
      console.log('   ❌ STARS доходов НЕТ!');
    }

    // RUB доходы
    const { data: rubIncome, error: rubError } = await supabase
      .from('payments_v2')
      .select('*')
      .eq('bot_name', 'MetaMuse_Manifest_bot')
      .eq('currency', 'RUB')
      .eq('type', 'MONEY_INCOME')
      .gt('amount', 0)
      .order('created_at', { ascending: false });

    if (rubError) throw rubError;

    const rubSum = rubIncome.reduce((sum, tx) => sum + Math.abs(parseFloat(tx.amount as any) || 0), 0);

    console.log(`\n\n📊 RUB доходы (MONEY_INCOME):`);
    console.log(`   ${rubIncome.length} транз., ${Math.round(rubSum).toLocaleString()}₽`);

    // STARS расходы
    const { data: starsExpense, error: expenseError } = await supabase
      .from('payments_v2')
      .select('*')
      .eq('bot_name', 'MetaMuse_Manifest_bot')
      .eq('currency', 'STARS')
      .eq('type', 'MONEY_OUTCOME')
      .order('created_at', { ascending: false });

    if (expenseError) throw expenseError;

    const starsExpenseSum = starsExpense.reduce((sum, tx) => sum + Math.abs(parseFloat(tx.amount as any) || 0), 0);

    console.log(`\n\n📊 STARS расходы (MONEY_OUTCOME):`);
    console.log(`   ${starsExpense.length} транз., ${Math.round(starsExpenseSum).toLocaleString()}⭐`);

    // ИТОГОВЫЕ ЦИФРЫ
    console.log('\n' + '='.repeat(80));
    console.log('💎 ТРИ ЦИФРЫ ПО METAMUSE_MANIFEST_BOT:');
    console.log('='.repeat(80));
    console.log(`1️⃣ РАСХОДЫ (STARS): ${Math.round(starsExpenseSum).toLocaleString()}⭐`);
    console.log(`2️⃣ ДОХОДЫ В РУБЛЯХ: ${Math.round(rubSum).toLocaleString()}₽`);
    console.log(`3️⃣ ДОХОДЫ В ЗВЕЗДАХ: ${Math.round(starsIncome.reduce((sum, tx) => sum + Math.abs(parseFloat(tx.amount as any) || 0), 0)).toLocaleString()}⭐`);

  } catch (error) {
    console.error('\n❌ ОШИБКА:', error);
    process.exit(1);
  }
}

main();
