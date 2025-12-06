/**
 * ТЕСТ: ПРАВИЛЬНЫЕ финальные цифры с учётом поля stars
 */

import { describe, test, expect } from '@jest/globals';
import { initInfisical, getSecret } from '../core/infisical';
import { supabase } from '../core/supabase/client';

describe('Final Correct Numbers', () => {
  test('Считаем правильные три цифры с учётом поля stars', async () => {
    console.log('\n🎯 ПРАВИЛЬНЫЕ ТРИ ЦИФРЫ С УЧЁТОМ ПОЛЯ STARS');
    console.log('='.repeat(80));

    await initInfisical();
    process.env.SUPABASE_URL = getSecret('SUPABASE_URL');
    process.env.SUPABASE_SERVICE_ROLE_KEY = getSecret('SUPABASE_SERVICE_ROLE_KEY');
    process.env.SUPABASE_SERVICE_KEY = getSecret('SUPABASE_SERVICE_KEY');

    // 1. STARS доходы = сумма поля stars во всех MONEY_INCOME
    console.log('📊 1. STARS доходы (поле stars в MONEY_INCOME):');
    console.log('-'.repeat(80));

    const { data: allMoneyIncome } = await supabase
      .from('payments_v2')
      .select('*')
      .eq('bot_name', 'MetaMuse_Manifest_bot')
      .eq('type', 'MONEY_INCOME');

    const starsIncomeSum = (allMoneyIncome || []).reduce(
      (sum, tx) => sum + (parseFloat(tx.stars as any) || 0), 0
    );

    console.log(`Всего MONEY_INCOME записей: ${allMoneyIncome?.length || 0}`);
    console.log(`Общая сумма STARS: ${Math.round(starsIncomeSum).toLocaleString()}⭐`);

    // Группируем по валютам
    const byCurrency = (allMoneyIncome || []).reduce((acc, tx) => {
      const currency = tx.currency || 'unknown';
      if (!acc[currency]) acc[currency] = { count: 0, stars: 0, amount: 0 };
      acc[currency].count++;
      acc[currency].stars += parseFloat(tx.stars as any) || 0;
      acc[currency].amount += parseFloat(tx.amount as any) || 0;
      return acc;
    }, {} as Record<string, { count: number; stars: number; amount: number }>);

    console.log('\nПо валютам:');
    Object.entries(byCurrency).forEach(([currency, stats]) => {
      console.log(`   ${currency}: ${stats.count} транз., ${Math.round(stats.stars).toLocaleString()}⭐, ${Math.round(stats.amount).toLocaleString()} (сумма amount)`);
    });

    // 2. STARS расходы
    console.log('\n\n📊 2. STARS расходы:');
    console.log('-'.repeat(80));

    const { data: allMoneyOutcome } = await supabase
      .from('payments_v2')
      .select('*')
      .eq('bot_name', 'MetaMuse_Manifest_bot')
      .eq('type', 'MONEY_OUTCOME');

    const starsOutcomeSum = (allMoneyOutcome || []).reduce(
      (sum, tx) => sum + (parseFloat(tx.stars as any) || 0), 0
    );

    console.log(`Всего MONEY_OUTCOME записей: ${allMoneyOutcome?.length || 0}`);
    console.log(`Общая сумма STARS: ${Math.round(starsOutcomeSum).toLocaleString()}⭐`);

    // 3. RUB доходы
    console.log('\n\n📊 3. RUB доходы (MONEY_INCOME с currency = RUB):');
    console.log('-'.repeat(80));

    const { data: rubIncome } = await supabase
      .from('payments_v2')
      .select('*')
      .eq('bot_name', 'MetaMuse_Manifest_bot')
      .eq('currency', 'RUB')
      .eq('type', 'MONEY_INCOME')
      .gt('amount', 0);

    const rubIncomeSum = (rubIncome || []).reduce(
      (sum, tx) => sum + Math.abs(parseFloat(tx.amount as any) || 0), 0
    );

    console.log(`RUB MONEY_INCOME: ${rubIncome?.length || 0} транз.`);
    console.log(`Сумма: ${Math.round(rubIncomeSum).toLocaleString()}₽`);

    // ИТОГ
    console.log('\n' + '='.repeat(80));
    console.log('💎 ПРАВИЛЬНЫЕ ТРИ ЦИФРЫ:');
    console.log('='.repeat(80));
    console.log(`\n1️⃣ РАСХОДЫ (STARS): ${Math.round(starsOutcomeSum).toLocaleString()}⭐`);
    console.log(`   Источник: сумма поля stars в MONEY_OUTCOME`);
    console.log(`\n2️⃣ ДОХОДЫ В РУБЛЯХ: ${Math.round(rubIncomeSum).toLocaleString()}₽`);
    console.log(`   Источник: сумма поля amount в MONEY_INCOME с currency = RUB`);
    console.log(`\n3️⃣ ДОХОДЫ В ЗВЕЗДАХ: ${Math.round(starsIncomeSum).toLocaleString()}⭐`);
    console.log(`   Источник: сумма поля stars в MONEY_INCOME`);
    console.log(`   (RUB + STARS, XTR + STARS, Telegram Stars)`);
    console.log('='.repeat(80));

    // Показываем примеры STARS доходов
    console.log('\n📋 Примеры STARS доходов (топ-10):');
    console.log('-'.repeat(80));
    (allMoneyIncome || [])
      .filter(tx => (parseFloat(tx.stars as any) || 0) > 0)
      .sort((a, b) => (parseFloat(b.stars as any) || 0) - (parseFloat(a.stars as any) || 0))
      .slice(0, 10)
      .forEach((tx, i) => {
        const stars = parseFloat(tx.stars as any) || 0;
        const amount = parseFloat(tx.amount as any) || 0;
        const currency = tx.currency || 'unknown';
        const date = new Date(tx.created_at as any);
        const dateStr = `${date.getDate().toString().padStart(2, '0')}.${(date.getMonth() + 1).toString().padStart(2, '0')}.${date.getFullYear()}`;

        console.log(`${i + 1}. ${stars.toLocaleString()}⭐ | ${dateStr}`);
        console.log(`   ${currency}: ${amount} + ${stars}⭐`);
        console.log(`   ${tx.description || 'без описания'}`);
      });

    expect(allMoneyIncome).toBeDefined();

  });
});
