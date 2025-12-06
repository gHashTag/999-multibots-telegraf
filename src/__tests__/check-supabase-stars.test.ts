/**
 * ТЕСТ: Проверяем STARS доходы в Supabase
 * Запускаем через npm test
 */

import { describe, test, expect } from '@jest/globals';
import { initInfisical, getSecret, getSecretsStats } from '../core/infisical';
import { supabase } from '../core/supabase/client';

describe('MetaMuse_Manifest_bot STARS Analysis', () => {
  test('Проверяем STARS доходы в БД', async () => {
    console.log('\n🔍 ПРОВЕРЯЕМ SUPABASE payments_v2');
    console.log('='.repeat(80));

    try {
      // Инициализируем Infisical для загрузки секретов
      console.log('\n🔐 Инициализируем Infisical...');
      await initInfisical();

      // Синхронизируем секреты с process.env (как в index.ts)
      console.log('🔄 Синхронизируем секреты с process.env...');
      process.env.SUPABASE_URL = getSecret('SUPABASE_URL');
      process.env.SUPABASE_SERVICE_ROLE_KEY = getSecret('SUPABASE_SERVICE_ROLE_KEY');
      process.env.SUPABASE_SERVICE_KEY = getSecret('SUPABASE_SERVICE_KEY');

      const stats = getSecretsStats();
      console.log(`✅ Загружено ${stats.totalSecrets} секретов из ${stats.environment}`);
      console.log('✅ Supabase credentials синхронизированы');
      // 1. STARS доходы
      const { data: starsIncome, error: starsError } = await supabase
        .from('payments_v2')
        .select('*')
        .eq('bot_name', 'MetaMuse_Manifest_bot')
        .eq('currency', 'STARS')
        .eq('type', 'MONEY_INCOME')
        .gt('amount', 0)
        .order('created_at', { ascending: false });

      if (starsError) throw starsError;

      console.log(`\n📊 STARS доходы: ${starsIncome.length} транзакций`);

      if (starsIncome.length > 0) {
        starsIncome.forEach((tx, i) => {
          const amount = Math.abs(parseFloat(tx.amount as any) || 0);
          const date = new Date(tx.created_at as any);
          const dateStr = `${date.getDate().toString().padStart(2, '0')}.${(date.getMonth() + 1).toString().padStart(2, '0')}.${date.getFullYear()}`;

          console.log(`   ${i + 1}. ${amount.toLocaleString()}⭐ | ${dateStr}`);
          console.log(`      User: ${tx.telegram_id} | ${tx.payment_method || 'unknown'}`);
          console.log(`      ${tx.description || 'без описания'}`);
        });
      }

      // 2. RUB доходы
      const { data: rubIncome, error: rubError } = await supabase
        .from('payments_v2')
        .select('*')
        .eq('bot_name', 'MetaMuse_Manifest_bot')
        .eq('currency', 'RUB')
        .eq('type', 'MONEY_INCOME')
        .gt('amount', 0)
        .order('created_at', { ascending: false });

      if (rubError) throw rubError;

      console.log(`\n📊 RUB доходы: ${rubIncome.length} транзакций`);

      if (rubIncome.length > 0) {
        const totalSum = rubIncome.reduce((sum, tx) => sum + Math.abs(parseFloat(tx.amount as any) || 0), 0);
        console.log(`   Общая сумма: ${Math.round(totalSum).toLocaleString()}₽`);
      }

      // 3. STARS расходы
      const { data: starsExpense, error: expenseError } = await supabase
        .from('payments_v2')
        .select('*')
        .eq('bot_name', 'MetaMuse_Manifest_bot')
        .eq('currency', 'STARS')
        .eq('type', 'MONEY_OUTCOME')
        .order('created_at', { ascending: false });

      if (expenseError) throw expenseError;

      console.log(`\n📊 STARS расходы: ${starsExpense.length} транзакций`);

      if (starsExpense.length > 0) {
        const totalExpense = starsExpense.reduce((sum, tx) => sum + Math.abs(parseFloat(tx.amount as any) || 0), 0);
        console.log(`   Общая сумма: ${Math.round(totalExpense).toLocaleString()}⭐`);
      }

      // Проверки
      expect(starsIncome).toBeDefined();
      expect(Array.isArray(starsIncome)).toBe(true);
      expect(starsIncome.length).toBeGreaterThanOrEqual(0);

      expect(rubIncome).toBeDefined();
      expect(Array.isArray(rubIncome)).toBe(true);
      expect(rubIncome.length).toBeGreaterThanOrEqual(0);

      expect(starsExpense).toBeDefined();
      expect(Array.isArray(starsExpense)).toBe(true);
      expect(starsExpense.length).toBeGreaterThanOrEqual(0);

      // Выводим итоговые цифры
      const rubSum = rubIncome.reduce((sum, tx) => sum + Math.abs(parseFloat(tx.amount as any) || 0), 0);
      const starsIncomeSum = starsIncome.reduce((sum, tx) => sum + Math.abs(parseFloat(tx.amount as any) || 0), 0);
      const starsExpenseSum = starsExpense.reduce((sum, tx) => sum + Math.abs(parseFloat(tx.amount as any) || 0), 0);

      console.log('\n' + '='.repeat(80));
      console.log('💎 ТРИ ЦИФРЫ (из БД):');
      console.log('='.repeat(80));
      console.log(`1️⃣ РАСХОДЫ (STARS): ${Math.round(starsExpenseSum).toLocaleString()}⭐`);
      console.log(`2️⃣ ДОХОДЫ В РУБЛЯХ: ${Math.round(rubSum).toLocaleString()}₽`);
      console.log(`3️⃣ ДОХОДЫ В ЗВЕЗДАХ: ${Math.round(starsIncomeSum).toLocaleString()}⭐`);

    } catch (error) {
      console.error('❌ Ошибка:', error);
      throw error;
    }
  });
});
