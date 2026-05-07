/**
 * ТЕСТ: Проверяем ВСЕ STARS доходы в БД
 */

import { describe, test, expect } from '@jest/globals';
import { initInfisical, getSecret, getSecretsStats } from '../core/infisical';
import { supabase } from '../core/supabase/client';

describe('All STARS Income Analysis', () => {
  test('Проверяем все STARS доходы в БД', async () => {
    console.log('\n🔍 ПРОВЕРЯЕМ ВСЕ STARS ДОХОДЫ В SUPABASE');
    console.log('='.repeat(80));

    try {
      // Инициализируем Infisical
      console.log('\n🔐 Инициализируем Infisical...');
      await initInfisical();

      // Синхронизируем секреты
      process.env.SUPABASE_URL = getSecret('SUPABASE_URL');
      process.env.SUPABASE_SERVICE_ROLE_KEY = getSecret('SUPABASE_SERVICE_ROLE_KEY');
      process.env.SUPABASE_SERVICE_KEY = getSecret('SUPABASE_SERVICE_KEY');

      const stats = getSecretsStats();
      console.log(`✅ Загружено ${stats.totalSecrets} секретов\n`);

      // 1. STARS доходы для ВСЕХ ботов
      console.log('📊 1. STARS доходы (MONEY_INCOME) для ВСЕХ ботов:');
      console.log('-'.repeat(80));

      const { data: allStarsIncome, error: allStarsError } = await supabase
        .from('payments_v2')
        .select('*')
        .eq('currency', 'STARS')
        .eq('type', 'MONEY_INCOME')
        .gt('amount', 0)
        .order('created_at', { ascending: false });

      if (allStarsError) throw allStarsError;

      console.log(`Найдено: ${allStarsIncome.length} транзакций`);

      if (allStarsIncome.length > 0) {
        const totalSum = allStarsIncome.reduce((sum, tx) => sum + Math.abs(parseFloat(tx.amount as any) || 0), 0);
        console.log(`Общая сумма: ${Math.round(totalSum).toLocaleString()}⭐`);

        // Группируем по ботам
        const byBot = allStarsIncome.reduce((acc, tx) => {
          const bot = tx.bot_name || 'unknown';
          if (!acc[bot]) acc[bot] = [];
          acc[bot].push(tx);
          return acc;
        }, {} as Record<string, any[]>);

        console.log('\n📋 По ботам:');
        Object.entries(byBot).forEach(([bot, txs]) => {
          const sum = txs.reduce((s, tx) => s + Math.abs(parseFloat(tx.amount as any) || 0), 0);
          console.log(`   ${bot}: ${txs.length} транз., ${Math.round(sum).toLocaleString()}⭐`);
        });
      } else {
        console.log('❌ STARS доходов НЕТ ни у одного бота!');
      }

      // 2. MetaMuse_Manifest_bot - все STARS транзакции
      console.log('\n\n📊 2. MetaMuse_Manifest_bot - все STARS транзакции:');
      console.log('-'.repeat(80));

      const { data: allMetaMuseStars, error: metaMuseError } = await supabase
        .from('payments_v2')
        .select('*')
        .eq('bot_name', 'MetaMuse_Manifest_bot')
        .eq('currency', 'STARS')
        .order('created_at', { ascending: false });

      if (metaMuseError) throw metaMuseError;

      console.log(`ВСЕХ STARS транзакций MetaMuse: ${allMetaMuseStars.length}`);

      // Группируем по типам
      const byType = allMetaMuseStars.reduce((acc, tx) => {
        const type = tx.type || 'unknown';
        if (!acc[type]) acc[type] = [];
        acc[type].push(tx);
        return acc;
      }, {} as Record<string, any[]>);

      console.log('\nПо типам:');
      Object.entries(byType).forEach(([type, txs]) => {
        const sum = txs.reduce((s, tx) => s + Math.abs(parseFloat(tx.amount as any) || 0), 0);
        console.log(`   ${type}: ${txs.length} транз., ${Math.round(sum).toLocaleString()}⭐`);
      });

      // ИТОГОВЫЙ ВЫВОД
      const metaMuseStarsIncome = allStarsIncome.filter(tx => tx.bot_name === 'MetaMuse_Manifest_bot');
      const metaMuseStarsIncomeSum = metaMuseStarsIncome.reduce((sum, tx) => sum + Math.abs(parseFloat(tx.amount as any) || 0), 0);

      const metaMuseStarsOutcome = allMetaMuseStars.filter(tx => tx.type === 'MONEY_OUTCOME');
      const metaMuseStarsOutcomeSum = metaMuseStarsOutcome.reduce((sum, tx) => sum + Math.abs(parseFloat(tx.amount as any) || 0), 0);

      console.log('\n' + '='.repeat(80));
      console.log('💎 ФИНАЛЬНЫЕ ЦИФРЫ ПО METAMUSE_MANIFEST_BOT:');
      console.log('='.repeat(80));
      console.log(`1️⃣ РАСХОДЫ (STARS): ${Math.round(metaMuseStarsOutcomeSum).toLocaleString()}⭐`);
      console.log(`2️⃣ ДОХОДЫ В РУБЛЯХ: нужно проверить отдельно`);
      console.log(`3️⃣ ДОХОДЫ В ЗВЁЗДАХ: ${Math.round(metaMuseStarsIncomeSum).toLocaleString()}⭐`);

      expect(allStarsIncome).toBeDefined();
      expect(Array.isArray(allStarsIncome)).toBe(true);

    } catch (error) {
      console.error('\n❌ Ошибка:', error);
      throw error;
    }
  });
});
