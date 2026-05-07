/**
 * ТЕСТ: Проверяем STARS Money Income в backup
 */

import { describe, test, expect } from '@jest/globals';
import { initInfisical, getSecret } from '../core/infisical';
import { supabase } from '../core/supabase/client';

describe('Check Backup STARS Income', () => {
  test('Проверяем STARS Money Income в backup таблице', async () => {
    console.log('\n🔍 ПРОВЕРЯЕМ STARS MONEY INCOME В BACKUP');
    console.log('='.repeat(80));

    await initInfisical();
    process.env.SUPABASE_URL = getSecret('SUPABASE_URL');
    process.env.SUPABASE_SERVICE_ROLE_KEY = getSecret('SUPABASE_SERVICE_ROLE_KEY');
    process.env.SUPABASE_SERVICE_KEY = getSecret('SUPABASE_SERVICE_KEY');

    // STARS Money Income в backup
    const { data: backupStarsIncome, error } = await supabase
      .from('payments_v2_backup')
      .select('*')
      .eq('bot_name', 'MetaMuse_Manifest_bot')
      .eq('currency', 'STARS')
      .eq('type', 'MONEY_INCOME')
      .order('created_at', { ascending: false });

    if (error) throw error;

    console.log(`STARS Money Income в backup: ${backupStarsIncome.length} записей`);

    if (backupStarsIncome.length > 0) {
      console.log('\n📊 Подробно:');
      backupStarsIncome.forEach((tx, i) => {
        const amount = Math.abs(parseFloat(tx.amount as any) || 0);
        const date = new Date(tx.created_at as any);
        const dateStr = `${date.getDate().toString().padStart(2, '0')}.${(date.getMonth() + 1).toString().padStart(2, '0')}.${date.getFullYear()}`;

        console.log(`\n${i + 1}. ${amount.toLocaleString()}⭐ | ${dateStr}`);
        console.log(`   Status: ${tx.status}`);
        console.log(`   User: ${tx.telegram_id}`);
        console.log(`   Description: ${tx.description || 'без описания'}`);
      });
    } else {
      console.log('\n❌ STARS Money Income в backup НЕТ!');
    }

    // Проверим XTR в backup
    console.log('\n\n📊 XTR Money Income в backup:');
    const { data: backupXtrIncome } = await supabase
      .from('payments_v2_backup')
      .select('*')
      .eq('bot_name', 'MetaMuse_Manifest_bot')
      .eq('currency', 'XTR')
      .eq('type', 'MONEY_INCOME');

    console.log(`XTR Money Income в backup: ${backupXtrIncome.length} записей`);
    if (backupXtrIncome.length > 0) {
      const sum = backupXtrIncome.reduce((s, tx) => s + Math.abs(parseFloat(tx.amount as any) || 0), 0);
      console.log(`Сумма: ${Math.round(sum).toLocaleString()} XTR`);
    }

    // Сравнение main vs backup
    console.log('\n\n📊 Сравнение main vs backup Money Income:');
    const { data: mainStarsIncome } = await supabase
      .from('payments_v2')
      .select('*')
      .eq('bot_name', 'MetaMuse_Manifest_bot')
      .eq('currency', 'STARS')
      .eq('type', 'MONEY_INCOME');

    const { data: mainXtrIncome } = await supabase
      .from('payments_v2')
      .select('*')
      .eq('bot_name', 'MetaMuse_Manifest_bot')
      .eq('currency', 'XTR')
      .eq('type', 'MONEY_INCOME');

    console.log(`\nMain:`);
    console.log(`   STARS Money Income: ${mainStarsIncome.length}`);
    console.log(`   XTR Money Income: ${mainXtrIncome.length}`);

    console.log(`\nBackup:`);
    console.log(`   STARS Money Income: ${backupStarsIncome.length}`);
    console.log(`   XTR Money Income: ${backupXtrIncome.length}`);

    expect(backupStarsIncome).toBeDefined();

  });
});
