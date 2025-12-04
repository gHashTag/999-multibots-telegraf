// Завершаем перенос данных
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY
);

async function finalizeRestore() {
  console.log('Завершаем перенос данных...');
  
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
    console.log('Все данные перенесены!');
    return;
  }

  // Переносим по 200 записей
  const batchSize = 200;
  let transferred = 0;

  for (let i = 0; i < idsToTransfer.length; i += batchSize) {
    const batchIds = idsToTransfer.slice(i, i + batchSize);
    
    const { data: batchData } = await supabase
      .from('payments_v2_backup')
      .select('*')
      .in('id', batchIds);

    if (batchData && batchData.length > 0) {
      await supabase.from('payments_v2').insert(batchData);
      transferred += batchData.length;
      console.log(`Перенесено: ${transferred}/${idsToTransfer.length}`);
    }
    
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  console.log(`Готово! Перенесено ${transferred} записей`);
}

finalizeRestore().catch(console.error);
