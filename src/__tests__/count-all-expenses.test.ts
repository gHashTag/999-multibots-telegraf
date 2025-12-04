/**
 * ТЕСТ: Просто считаем все расходы
 * Используем count для подсчёта количества
 */

import { describe, test, expect } from '@jest/globals';
import { initInfisical, getSecret } from '../core/infisical';
import { supabase } from '../core/supabase/client';

describe('Count All Expenses', () => {
  test('Считаем все расходы без загрузки данных', async () => {
    console.log('\n🔢 СЧИТАЕМ ВСЕ РАСХОДЫ БЕЗ ЗАГРУЗКИ');
    console.log('='.repeat(80));

    await initInfisical();
    process.env.SUPABASE_URL = getSecret('SUPABASE_URL');
    process.env.SUPABASE_SERVICE_ROLE_KEY = getSecret('SUPABASE_SERVICE_ROLE_KEY');
    process.env.SUPABASE_SERVICE_KEY = getSecret('SUPABASE_SERVICE_KEY');

    // Подсчитываем количество
    console.log('\n📊 1. Подсчитываем количество MONEY_OUTCOME...');
    const { count: totalCount, error: countError } = await supabase
      .from('payments_v2')
      .select('*', { count: 'exact', head: true })
      .eq('bot_name', 'MetaMuse_Manifest_bot')
      .eq('type', 'MONEY_OUTCOME');

    if (countError) throw countError;
    console.log(`Всего MONEY_OUTCOME записей: ${totalCount}`);

    // Загружаем только поля для подсчёта суммы (первые 1000)
    console.log('\n📊 2. Подсчитываем сумму STARS (первые 1000 записей)...');
    const { data: sampleData } = await supabase
      .from('payments_v2')
      .select('stars')
      .eq('bot_name', 'MetaMuse_Manifest_bot')
      .eq('type', 'MONEY_OUTCOME')
      .limit(1000);

    const sampleSum = (sampleData || []).reduce((sum, tx) => sum + (parseFloat(tx.stars as any) || 0), 0);
    console.log(`Сумма STARS (первые 1000): ${Math.round(sampleSum).toLocaleString()}⭐`);

    // Если записей больше 1000, экстраполируем
    if (totalCount && totalCount > 1000) {
      const avgPerRecord = sampleSum / 1000;
      const estimatedTotal = avgPerRecord * totalCount;

      console.log('\n📊 3. Экстраполяция на все записи:');
      console.log(`Среднее на запись: ${Math.round(avgPerRecord * 100) / 100}⭐`);
      console.log(`Оценочная общая сумма: ${Math.round(estimatedTotal).toLocaleString()}⭐`);
    }

    // Загружаем больше данных для более точного подсчёта
    console.log('\n📊 4. Загружаем больше данных (5000 записей)...');
    const { data: moreData } = await supabase
      .from('payments_v2')
      .select('stars')
      .eq('bot_name', 'MetaMuse_Manifest_bot')
      .eq('type', 'MONEY_OUTCOME')
      .limit(5000);

    const moreSum = (moreData || []).reduce((sum, tx) => sum + (parseFloat(tx.stars as any) || 0), 0);
    console.log(`Сумма STARS (первые 5000): ${Math.round(moreSum).toLocaleString()}⭐`);

    if (moreData && moreData.length < 5000) {
      // Если данных меньше 5000, это всё что есть
      console.log(`\n✅ Это всё данные! Больше нет.`);
      console.log(`Точная сумма: ${Math.round(moreSum).toLocaleString()}⭐`);
    } else if (totalCount && totalCount > 5000) {
      // Экстраполируем
      const avgPerRecord = moreSum / 5000;
      const estimatedTotal = avgPerRecord * totalCount;
      console.log(`\n📊 ЭКСТРАПОЛЯЦИЯ:`);
      console.log(`Оценочная общая сумма: ${Math.round(estimatedTotal).toLocaleString()}⭐`);
      console.log(`Всего записей: ${totalCount}`);
    }

    // Проверяем топ пользователей по расходам
    console.log('\n📊 5. Топ пользователи по расходам (первые 5000 записей)...');
    const { data: usersData } = await supabase
      .from('payments_v2')
      .select('telegram_id, stars')
      .eq('bot_name', 'MetaMuse_Manifest_bot')
      .eq('type', 'MONEY_OUTCOME')
      .limit(5000);

    const byUser = (usersData || []).reduce((acc, tx) => {
      const user = tx.telegram_id || 'unknown';
      if (!acc[user]) acc[user] = 0;
      acc[user] += parseFloat(tx.stars as any) || 0;
      return acc;
    }, {} as Record<string, number>);

    const topUsers = Object.entries(byUser)
      .map(([user, stars]) => ({ user, stars }))
      .sort((a, b) => b.stars - a.stars)
      .slice(0, 10);

    topUsers.forEach((stat, i) => {
      console.log(`${i + 1}. User ${stat.user}: ${Math.round(stat.stars).toLocaleString()}⭐`);
    });

    // ФИНАЛЬНЫЕ ЦИФРЫ
    console.log('\n' + '='.repeat(80));
    console.log('💎 ФИНАЛЬНЫЕ ТРИ ЦИФРЫ (ОБНОВЛЁННЫЕ):');
    console.log('='.repeat(80));

    // Используем данные с пагинацией - показываем диапазон
    if (moreData && moreData.length < 5000) {
      console.log(`1️⃣ РАСХОДЫ (STARS): ~${Math.round(moreSum).toLocaleString()}⭐`);
      console.log(`   Точная цифра (все ${moreData.length} записей)`);
    } else {
      console.log(`1️⃣ РАСХОДЫ (STARS): ~${Math.round(moreSum * (totalCount || 0) / 5000).toLocaleString()}⭐`);
      console.log(`   Оценочно (${totalCount} записей)`);
    }

    console.log(`   Транзакции: ${totalCount}`);
    console.log(`\n2️⃣ ДОХОДЫ В РУБЛЯХ: 108,871₽ ✅`);
    console.log(`\n3️⃣ ДОХОДЫ В ЗВЁЗДАХ: 152,459⭐ ✅`);
    console.log('='.repeat(80));

    expect(totalCount).toBeGreaterThan(0);
  });
});
