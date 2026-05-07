/**
 * Проверка активности пользователя за сегодня
 */
import { createClient } from '@supabase/supabase-js';
import { initInfisical, getSecret } from '../../src/core/infisical';

async function check() {
  await initInfisical();
  const supabase = createClient(getSecret('SUPABASE_URL')!, getSecret('SUPABASE_SERVICE_KEY')!);

  const telegramId = process.argv[2] || '5439920152';
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  console.log(`\n🔍 Активность пользователя ${telegramId} за сегодня...\n`);

  // 1. Проверяем prompts_history за сегодня
  const { data: history } = await supabase
    .from('prompts_history')
    .select('*')
    .eq('telegram_id', telegramId)
    .gte('created_at', today.toISOString())
    .order('created_at', { ascending: false });

  console.log(`📋 prompts_history сегодня: ${history?.length || 0}`);
  history?.forEach((h, i) => {
    console.log(`   ${i+1}. ${h.mode} | ${h.status} | ${new Date(h.created_at).toLocaleString('ru-RU')}`);
    if (h.error_message) console.log(`      ⚠️ Error: ${h.error_message}`);
  });

  // 2. Проверяем payments_v2 за сегодня
  const { data: payments } = await supabase
    .from('payments_v2')
    .select('*')
    .eq('telegram_id', Number(telegramId))
    .gte('created_at', today.toISOString())
    .order('created_at', { ascending: false });

  console.log(`\n💰 payments_v2 сегодня: ${payments?.length || 0}`);
  payments?.forEach((p, i) => {
    console.log(`   ${i+1}. ${p.type} | ${p.stars}⭐ | ${p.service_type || p.description} | ${new Date(p.created_at).toLocaleString('ru-RU')}`);
  });

  // 3. Проверяем model_trainings за последний месяц
  const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const { data: trainings } = await supabase
    .from('model_trainings')
    .select('*')
    .eq('telegram_id', telegramId)
    .gte('created_at', monthAgo.toISOString())
    .order('created_at', { ascending: false });

  console.log(`\n🎭 model_trainings за месяц: ${trainings?.length || 0}`);
  trainings?.forEach((t, i) => {
    console.log(`   ${i+1}. ${t.status} | ${t.trigger_word} | ${new Date(t.created_at).toLocaleString('ru-RU')}`);
  });

  // 4. Проверяем ai_jobs если есть
  const { data: jobs, error: jobsErr } = await supabase
    .from('ai_jobs')
    .select('*')
    .eq('telegram_id', telegramId)
    .gte('created_at', today.toISOString())
    .order('created_at', { ascending: false });

  if (!jobsErr) {
    console.log(`\n🤖 ai_jobs сегодня: ${jobs?.length || 0}`);
    jobs?.forEach((j, i) => {
      console.log(`   ${i+1}. ${j.status} | ${j.job_type} | ${new Date(j.created_at).toLocaleString('ru-RU')}`);
    });
  }

  // 5. Проверяем user_sessions если есть
  const { data: sessions, error: sessErr } = await supabase
    .from('user_sessions')
    .select('*')
    .eq('telegram_id', telegramId)
    .order('updated_at', { ascending: false })
    .limit(5);

  if (!sessErr && sessions?.length) {
    console.log(`\n📱 user_sessions (последние 5):`);
    sessions.forEach((s, i) => {
      console.log(`   ${i+1}. scene: ${s.current_scene || 'нет'} | ${new Date(s.updated_at).toLocaleString('ru-RU')}`);
    });
  }

  // 6. Текущий баланс
  const { data: balance } = await supabase.rpc('get_user_balance', { user_telegram_id: telegramId });
  console.log(`\n💰 Текущий баланс: ${balance || 0} ⭐`);

  console.log('\n✅ Проверка завершена');
  process.exit(0);
}

check().catch(e => {
  console.error('Error:', e);
  process.exit(1);
});
