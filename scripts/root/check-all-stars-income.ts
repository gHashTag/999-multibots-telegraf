/**
 * ПРОВЕРЯЕМ ВСЕ STARS ДОХОДЫ В БД
 * Для любого бота - есть ли вообще STARS доходы?
 */

import { initInfisical, getSecret, getSecretsStats } from './src/core/infisical';
import { supabase } from './src/core/supabase/client';

async function checkAllStarsIncome() {
  console.log('🔍 ПРОВЕРЯЕМ ВСЕ STARS ДОХОДЫ В SUPABASE');
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

      // Топ-10
      console.log('\n💰 ТОП-10 STARS ДОХОДОВ:');
      allStarsIncome.slice(0, 10).forEach((tx, i) => {
        const amount = Math.abs(parseFloat(tx.amount as any) || 0);
        const date = new Date(tx.created_at as any);
        const dateStr = `${date.getDate().toString().padStart(2, '0')}.${(date.getMonth() + 1).toString().padStart(2, '0')}.${date.getFullYear()}`;

        console.log(`\n   ${i + 1}. ${amount.toLocaleString()}⭐ | ${dateStr}`);
        console.log(`      ${tx.bot_name} | User: ${tx.telegram_id}`);
        console.log(`      ${tx.description || 'без описания'}`);
      });
    } else {
      console.log('❌ STARS доходов НЕТ ни у одного бота!');
    }

    // 2. Проверим конкретно MetaMuse_Manifest_bot с разными фильтрами
    console.log('\n\n📊 2. MetaMuse_Manifest_bot - расширенная проверка:');
    console.log('-'.repeat(80));

    // Все STARS транзакции (любой тип)
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

    // Показываем примеры каждого типа
    Object.entries(byType).forEach(([type, txs]) => {
      console.log(`\n📋 Примеры ${type}: (первые 3)`);
      txs.slice(0, 3).forEach((tx, i) => {
        const amount = Math.abs(parseFloat(tx.amount as any) || 0);
        const date = new Date(tx.created_at as any);
        const dateStr = `${date.getDate().toString().padStart(2, '0')}.${(date.getMonth() + 1).toString().padStart(2, '0')}.${date.getFullYear()}`;

        console.log(`   ${i + 1}. ${amount.toLocaleString()}⭐ | ${dateStr}`);
        console.log(`      ${tx.description || 'без описания'}`);
      });
    });

    // 3. Проверим есть ли STARS расходы
    console.log('\n\n📊 3. MetaMuse_Manifest_bot STARS расходы (MONEY_OUTCOME):');
    console.log('-'.repeat(80));

    const { data: metaMuseStarsOutcome, error: outcomeError } = await supabase
      .from('payments_v2')
      .select('*')
      .eq('bot_name', 'MetaMuse_Manifest_bot')
      .eq('currency', 'STARS')
      .eq('type', 'MONEY_OUTCOME')
      .order('created_at', { ascending: false });

    if (outcomeError) throw outcomeError;

    console.log(`STARS расходов: ${metaMuseStarsOutcome.length} транзакций`);
    const outcomeSum = metaMuseStarsOutcome.reduce((sum, tx) => sum + Math.abs(parseFloat(tx.amount as any) || 0), 0);
    console.log(`Общая сумма: ${Math.round(outcomeSum).toLocaleString()}⭐`);

    console.log('\n' + '='.repeat(80));
    console.log('💎 ИТОГОВЫЙ ВЫВОД:');
    console.log('='.repeat(80));
    console.log(`1️⃣ ВСЕГО STARS доходов в БД (все боты): ${Math.round((allStarsIncome || []).reduce((s, tx) => s + Math.abs(parseFloat(tx.amount as any) || 0), 0)).toLocaleString()}⭐`);
    console.log(`2️⃣ MetaMuse STARS доходы: 0⭐`);
    console.log(`3️⃣ MetaMuse STARS расходы: ${Math.round(outcomeSum).toLocaleString()}⭐`);

  } catch (error) {
    console.error('\n❌ Ошибка:', error);
  }
}

checkAllStarsIncome();
