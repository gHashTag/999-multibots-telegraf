/**
 * Проверка недавних тренировок пользователя
 */
import { createClient } from '@supabase/supabase-js';
import { initInfisical, getSecret } from '../../src/core/infisical';

async function check() {
  await initInfisical();
  const supabase = createClient(getSecret('SUPABASE_URL')!, getSecret('SUPABASE_SERVICE_KEY')!);

  const telegramId = process.argv[2] || '5439920152';

  console.log(`\n🔍 Проверяю недавние тренировки для ${telegramId}...\n`);

  // Проверяем модели за последние 7 дней
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const { data: recentModels, error } = await supabase
    .from('model_trainings')
    .select('*')
    .eq('telegram_id', telegramId)
    .gte('created_at', weekAgo)
    .order('created_at', { ascending: false });

  console.log('=== МОДЕЛИ ЗА ПОСЛЕДНИЕ 7 ДНЕЙ ===');
  console.log('Найдено:', recentModels?.length || 0);

  if (recentModels && recentModels.length > 0) {
    recentModels.forEach((m, i) => {
      console.log(`\n--- Модель ${i+1} ---`);
      console.log('ID:', m.id);
      console.log('Status:', m.status);
      console.log('Trigger:', m.trigger_word);
      console.log('Model URL:', m.model_url || 'НЕТ');
      console.log('Replicate ID:', m.replicate_training_id || 'НЕТ');
      console.log('Created:', new Date(m.created_at).toLocaleString('ru-RU'));
      console.log('Updated:', new Date(m.updated_at).toLocaleString('ru-RU'));
      if (m.error) console.log('Error:', m.error);
    });
  } else {
    console.log('\n❌ Нет моделей за последние 7 дней');
  }

  // Проверяем model_trainings_v2
  const { data: v2Models, error: v2Error } = await supabase
    .from('model_trainings_v2')
    .select('*')
    .eq('telegram_id', telegramId)
    .order('created_at', { ascending: false })
    .limit(5);

  if (!v2Error && v2Models && v2Models.length > 0) {
    console.log('\n=== МОДЕЛИ V2 (последние 5) ===');
    v2Models.forEach((m, i) => {
      console.log(`\n--- V2 Модель ${i+1} ---`);
      console.log('ID:', m.id);
      console.log('Status:', m.status);
      console.log('Created:', new Date(m.created_at).toLocaleString('ru-RU'));
      console.log('Updated:', new Date(m.updated_at).toLocaleString('ru-RU'));
      console.log('Model URL:', m.model_url || 'НЕТ');
      if (m.error) console.log('Error:', m.error);
    });
  }

  // Последняя модель вообще
  const { data: lastModel } = await supabase
    .from('model_trainings')
    .select('*')
    .eq('telegram_id', telegramId)
    .order('created_at', { ascending: false })
    .limit(1);

  if (lastModel?.[0]) {
    console.log('\n=== ПОСЛЕДНЯЯ МОДЕЛЬ (вообще) ===');
    console.log('Created:', new Date(lastModel[0].created_at).toLocaleString('ru-RU'));
    console.log('Status:', lastModel[0].status);
    console.log('Model URL:', lastModel[0].model_url || 'НЕТ');
  }

  process.exit(0);
}

check().catch(e => {
  console.error('Error:', e);
  process.exit(1);
});
