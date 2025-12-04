/**
 * ТЕСТ: Точные цифры из основной таблицы после восстановления
 */

import { describe, test, expect } from '@jest/globals';
import { initInfisical, getSecret } from '../core/infisical';
import { supabase } from '../core/supabase/client';

describe('Exact Numbers Main After Restore', () => {
  test('Точные цифры из основной таблицы после восстановления', async () => {
    console.log('\n🎯 ТОЧНЫЕ ЦИФРЫ ИЗ ОСНОВНОЙ ТАБЛИЦЫ ПОСЛЕ ВОССТАНОВЛЕНИЯ');
    console.log('='.repeat(80));

    await initInfisical();
    process.env.SUPABASE_URL = getSecret('SUPABASE_URL');
    process.env.SUPABASE_SERVICE_ROLE_KEY = getSecret('SUPABASE_SERVICE_ROLE_KEY');
    process.env.SUPABASE_SERVICE_KEY = getSecret('SUPABASE_SERVICE_KEY');

    // RUB доходы БЕЗ ФИЛЬТРОВ
    console.log('📊 RUB доходы (все, без фильтров):');
    console.log('-'.repeat(80));

    const { data: rubIncomeAll } = await supabase
      .from('payments_v2')
      .select('*')
      .eq('bot_name', 'MetaMuse_Manifest_bot')
      .eq('currency', 'RUB')
      .eq('type', 'MONEY_INCOME');

    console.log(`Всего RUB MONEY_INCOME: ${rubIncomeAll.length} транзакций`);

    const rubIncomeWithAmount = rubIncomeAll.filter(tx => parseFloat(tx.amount as any) > 0);
    const rubIncomeSum = rubIncomeWithAmount.reduce((sum, tx) => sum + Math.abs(parseFloat(tx.amount as any) || 0), 0);

    console.log(`С положительной суммой: ${rubIncomeWithAmount.length} транзакций`);
    console.log(`Сумма: ${Math.round(rubIncomeSum).toLocaleString()}₽`);

    // STARS доходы БЕЗ ФИЛЬТРОВ
    console.log('\n\n📊 STARS доходы (все, без фильтров):');
    console.log('-'.repeat(80));

    const { data: starsIncomeAll } = await supabase
      .from('payments_v2')
      .select('*')
      .eq('bot_name', 'MetaMuse_Manifest_bot')
      .eq('currency', 'STARS')
      .eq('type', 'MONEY_INCOME');

    console.log(`Всего STARS MONEY_INCOME: ${starsIncomeAll.length} транзакций`);

    const starsIncomeWithAmount = starsIncomeAll.filter(tx => parseFloat(tx.amount as any) > 0);
    const starsIncomeSum = starsIncomeWithAmount.reduce((sum, tx) => sum + Math.abs(parseFloat(tx.amount as any) || 0), 0);

    console.log(`С положительной суммой: ${starsIncomeWithAmount.length} транзакций`);
    console.log(`Сумма: ${Math.round(starsIncomeSum).toLocaleString()}⭐`);

    // STARS расходы БЕЗ ФИЛЬТРОВ
    console.log('\n\n📊 STARS расходы (все, без фильтров):');
    console.log('-'.repeat(80));

    const { data: starsOutcomeAll } = await supabase
      .from('payments_v2')
      .select('*')
      .eq('bot_name', 'MetaMuse_Manifest_bot')
      .eq('currency', 'STARS')
      .eq('type', 'MONEY_OUTCOME');

    console.log(`Всего STARS MONEY_OUTCOME: ${starsOutcomeAll.length} транзакций`);

    const starsOutcomeSum = starsOutcomeAll.reduce((sum, tx) => sum + Math.abs(parseFloat(tx.amount as any) || 0), 0);
    console.log(`Сумма: ${Math.round(starsOutcomeSum).toLocaleString()}⭐`);

    // ИТОГОВЫЕ ЦИФРЫ
    console.log('\n' + '='.repeat(80));
    console.log('💎 ТОЧНЫЕ ИТОГОВЫЕ ЦИФРЫ (ИЗ ОСНОВНОЙ ТАБЛИЦЫ):');
    console.log('='.repeat(80));
    console.log(`\n1️⃣ РАСХОДЫ (STARS): ${Math.round(starsOutcomeSum).toLocaleString()}⭐`);
    console.log(`   Транзакции: ${starsOutcomeAll.length}`);
    console.log(`\n2️⃣ ДОХОДЫ В РУБЛЯХ: ${Math.round(rubIncomeSum).toLocaleString()}₽`);
    console.log(`   Транзакции: ${rubIncomeWithAmount.length} (из ${rubIncomeAll.length})`);
    console.log(`\n3️⃣ ДОХОДЫ В ЗВЕЗДАХ: ${Math.round(starsIncomeSum).toLocaleString()}⭐`);
    console.log(`   Транзакции: ${starsIncomeWithAmount.length} (из ${starsIncomeAll.length})`);
    console.log('='.repeat(80));

    expect(rubIncomeAll).toBeDefined();
    expect(starsIncomeAll).toBeDefined();
    expect(starsOutcomeAll).toBeDefined();
  });
});
