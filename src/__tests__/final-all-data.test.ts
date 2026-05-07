/**
 * ТЕСТ: Финальные данные по всем ботам
 * Проверяем всё со всеми корректировками
 */

import { describe, test, expect } from '@jest/globals';
import { initInfisical, getSecret } from '../core/infisical';
import { supabase } from '../core/supabase/client';

describe('Final All Data', () => {
  test('Финальные данные по всем ботам', async () => {
    console.log('\n🔍 ФИНАЛЬНЫЕ ДАННЫЕ ПО ВСЕМ БОТАМ');
    console.log('='.repeat(80));

    await initInfisical();
    process.env.SUPABASE_URL = getSecret('SUPABASE_URL');
    process.env.SUPABASE_SERVICE_ROLE_KEY = getSecret('SUPABASE_SERVICE_ROLE_KEY');
    process.env.SUPABASE_SERVICE_KEY = getSecret('SUPABASE_SERVICE_KEY');

    // Получаем список всех ботов
    const { data: bots, error: botsError } = await supabase
      .from('payments_v2')
      .select('bot_name')
      .not('bot_name', 'is', null);

    if (botsError) throw botsError;

    const uniqueBots = [...new Set((bots || []).map(b => b.bot_name))];
    console.log(`Всего ботов: ${uniqueBots.length}`);
    console.log(`Список: ${uniqueBots.join(', ')}`);

    // Статистика по каждому боту
    console.log('\n📊 Статистика по каждому боту:');
    console.log('-'.repeat(80));

    for (const botName of uniqueBots) {
      console.log(`\n🤖 ${botName}:`);

      // Всего записей
      const { count: totalCount } = await supabase
        .from('payments_v2')
        .select('*', { count: 'exact', head: true })
        .eq('bot_name', botName);

      // MONEY_INCOME (все валюты) - считаем через поле stars
      const { data: incomeData } = await supabase
        .from('payments_v2')
        .select('*')
        .eq('bot_name', botName)
        .eq('type', 'MONEY_INCOME');

      const starsIncomeSum = (incomeData || []).reduce((sum, tx) => sum + (parseFloat(tx.stars as any) || 0), 0);

      // MONEY_OUTCOME - считаем через поле stars
      const { data: outcomeData } = await supabase
        .from('payments_v2')
        .select('stars')
        .eq('bot_name', botName)
        .eq('type', 'MONEY_OUTCOME');

      const starsOutcomeSum = (outcomeData || []).reduce((sum, tx) => sum + (parseFloat(tx.stars as any) || 0), 0);

      // RUB доходы
      const { data: rubIncome } = await supabase
        .from('payments_v2')
        .select('amount')
        .eq('bot_name', botName)
        .eq('currency', 'RUB')
        .eq('type', 'MONEY_INCOME')
        .gt('amount', 0);

      const rubIncomeSum = (rubIncome || []).reduce((sum, tx) => sum + Math.abs(parseFloat(tx.amount as any) || 0), 0);

      console.log(`   Всего записей: ${totalCount}`);
      console.log(`   Расходы: ${Math.round(starsOutcomeSum).toLocaleString()}⭐`);
      console.log(`   Доходы в рублях: ${Math.round(rubIncomeSum).toLocaleString()}₽`);
      console.log(`   Доходы в звёздах: ${Math.round(starsIncomeSum).toLocaleString()}⭐`);
    }

    // ИТОГО по всем ботам
    console.log('\n\n📊 ИТОГО ПО ВСЕМ БОТАМ:');
    console.log('='.repeat(80));

    const { data: allIncome } = await supabase
      .from('payments_v2')
      .select('*')
      .eq('type', 'MONEY_INCOME');

    const { data: allOutcome } = await supabase
      .from('payments_v2')
      .select('stars')
      .eq('type', 'MONEY_OUTCOME');

    const totalStarsIncome = (allIncome || []).reduce((sum, tx) => sum + (parseFloat(tx.stars as any) || 0), 0);
    const totalStarsOutcome = (allOutcome || []).reduce((sum, tx) => sum + (parseFloat(tx.stars as any) || 0), 0);

    const { data: allRubIncome } = await supabase
      .from('payments_v2')
      .select('amount')
      .eq('currency', 'RUB')
      .eq('type', 'MONEY_INCOME')
      .gt('amount', 0);

    const totalRubIncome = (allRubIncome || []).reduce((sum, tx) => sum + Math.abs(parseFloat(tx.amount as any) || 0), 0);

    const { count: totalRecords } = await supabase
      .from('payments_v2')
      .select('*', { count: 'exact', head: true });

    console.log(`Всего записей: ${totalRecords}`);
    console.log(`Общие расходы: ${Math.round(totalStarsOutcome).toLocaleString()}⭐`);
    console.log(`Общие доходы в рублях: ${Math.round(totalRubIncome).toLocaleString()}₽`);
    console.log(`Общие доходы в звёздах: ${Math.round(totalStarsIncome).toLocaleString()}⭐`);

    expect(uniqueBots.length).toBeGreaterThan(0);

  });
});
