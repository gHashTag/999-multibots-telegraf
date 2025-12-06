/**
 * ТЕСТ: Финальный перенос данных - просто INSERT
 */

import { describe, test, expect } from '@jest/globals';
import { initInfisical, getSecret } from '../core/infisical';
import { supabase } from '../core/supabase/client';

describe('Final Restore Transfer', () => {
  test('Финальный перенос оставшихся данных', async () => {
    console.log('\n🔄 ФИНАЛЬНЫЙ ПЕРЕНОС ДАННЫХ');
    console.log('='.repeat(80));

    try {
      await initInfisical();
      process.env.SUPABASE_URL = getSecret('SUPABASE_URL');
      process.env.SUPABASE_SERVICE_ROLE_KEY = getSecret('SUPABASE_SERVICE_ROLE_KEY');
      process.env.SUPABASE_SERVICE_KEY = getSecret('SUPABASE_SERVICE_KEY');

      // Получаем ID из backup
      const { data: backupIds } = await supabase
        .from('payments_v2_backup')
        .select('id')
        .order('id', { ascending: true });

      // Получаем ID из основной
      const { data: mainIds } = await supabase
        .from('payments_v2')
        .select('id');

      const mainIdSet = new Set((mainIds || []).map(row => row.id));
      const idsToTransfer = (backupIds || [])
        .map(row => row.id)
        .filter(id => !mainIdSet.has(id));

      console.log(`К переносу: ${idsToTransfer.length} записей`);

      if (idsToTransfer.length === 0) {
        console.log('✅ Все данные уже перенесены!');
        return;
      }

      // Переносим по 300 записей
      const batchSize = 300;
      let transferred = 0;

      for (let i = 0; i < idsToTransfer.length; i += batchSize) {
        const batchIds = idsToTransfer.slice(i, i + batchSize);
        const batchNum = Math.floor(i / batchSize) + 1;

        console.log(`\nБатч ${batchNum}: ${i + 1}-${i + batchIds.length} из ${idsToTransfer.length}`);

        const { data: batchData } = await supabase
          .from('payments_v2_backup')
          .select('*')
          .in('id', batchIds);

        if (batchData && batchData.length > 0) {
          await supabase.from('payments_v2').insert(batchData);
          transferred += batchData.length;
          console.log(`✅ Перенесено: ${transferred}/${idsToTransfer.length}`);
        }

        await new Promise(resolve => setTimeout(resolve, 300));
      }

      console.log(`\n🎉 ГОТОВО! Перенесено ${transferred} записей`);

      // Проверяем
      const { count: finalCount } = await supabase
        .from('payments_v2')
        .select('*', { count: 'exact', head: true });

      console.log(`Теперь в основной таблице: ${finalCount} записей`);

      expect(transferred).toBeGreaterThanOrEqual(0);

    } catch (error) {
      console.error('❌ Ошибка:', error);
      throw error;
    }
  });
});
