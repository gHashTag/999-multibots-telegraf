/**
 * Проверка всех таблиц для пользователя
 */
import { createClient } from '@supabase/supabase-js';
import { initInfisical, getSecret } from '../../src/core/infisical';

async function check() {
  await initInfisical();
  const supabase = createClient(getSecret('SUPABASE_URL')!, getSecret('SUPABASE_SERVICE_KEY')!);

  const telegramId = process.argv[2] || '5439920152';
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  console.log(`\n🔍 Проверяю ВСЕ таблицы для ${telegramId} за сегодня (${today.toLocaleDateString('ru-RU')})...\n`);

  // 1. model_trainings
  const { data: mt } = await supabase
    .from('model_trainings')
    .select('*')
    .eq('telegram_id', telegramId)
    .gte('created_at', today.toISOString());
  console.log(`📋 model_trainings (сегодня): ${mt?.length || 0}`);
  if (mt?.length) mt.forEach(m => console.log(`   - ${m.status} | ${m.trigger_word}`));

  // 2. model_trainings_v2
  const { data: mt2, error: mt2Err } = await supabase
    .from('model_trainings_v2')
    .select('*')
    .eq('telegram_id', telegramId)
    .gte('created_at', today.toISOString());
  if (!mt2Err) {
    console.log(`📋 model_trainings_v2 (сегодня): ${mt2?.length || 0}`);
    if (mt2?.length) mt2.forEach(m => console.log(`   - ${m.status} | created: ${new Date(m.created_at).toLocaleString('ru-RU')}`));
  }

  // 3. ai_jobs
  const { data: jobs, error: jobsErr } = await supabase
    .from('ai_jobs')
    .select('*')
    .eq('telegram_id', telegramId)
    .gte('created_at', today.toISOString());
  if (!jobsErr) {
    console.log(`📋 ai_jobs (сегодня): ${jobs?.length || 0}`);
    if (jobs?.length) jobs.forEach(j => console.log(`   - ${j.status} | ${j.job_type}`));
  }

  // 4. prompts_history (за сегодня)
  const { data: history } = await supabase
    .from('prompts_history')
    .select('*')
    .eq('telegram_id', telegramId)
    .gte('created_at', today.toISOString())
    .order('created_at', { ascending: false });
  console.log(`📋 prompts_history (сегодня): ${history?.length || 0}`);
  if (history?.length) {
    history.slice(0, 5).forEach(h =>
      console.log(`   - ${h.mode} | ${h.status} | ${new Date(h.created_at).toLocaleString('ru-RU')}`)
    );
  }

  // 5. payments (за сегодня)
  const { data: payments } = await supabase
    .from('payments')
    .select('*')
    .eq('telegram_id', telegramId)
    .gte('created_at', today.toISOString());
  console.log(`📋 payments (сегодня): ${payments?.length || 0}`);
  if (payments?.length) payments.forEach(p => console.log(`   - ${p.amount} | ${p.status}`));

  // 6. Проверяем баланс
  const { data: user } = await supabase
    .from('users')
    .select('balance, username')
    .eq('telegram_id', telegramId)
    .single();
  console.log(`\n💰 Баланс: ${user?.balance || 0} ⭐`);

  // 7. Все модели (независимо от даты)
  const { data: allModels } = await supabase
    .from('model_trainings')
    .select('id, status, trigger_word, created_at, model_url')
    .eq('telegram_id', telegramId)
    .order('created_at', { ascending: false })
    .limit(5);

  console.log(`\n📋 Последние 5 моделей (все время):`);
  allModels?.forEach((m, i) => {
    console.log(`   ${i+1}. ${m.status} | ${m.trigger_word} | ${new Date(m.created_at).toLocaleDateString('ru-RU')} | URL: ${m.model_url ? '✅' : '❌'}`);
  });

  process.exit(0);
}

check().catch(e => {
  console.error('Error:', e);
  process.exit(1);
});
