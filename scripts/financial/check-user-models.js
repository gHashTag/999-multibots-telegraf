// Проверяем модели пользователя через Supabase (JavaScript version)
const { createClient } = require('@supabase/supabase-js');

async function checkUserModels() {
  const telegramId = '144022504';
  console.log(`🔍 Проверяем модели пользователя ${telegramId}...`);

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Missing Supabase credentials');
    console.log('SUPABASE_URL:', !!supabaseUrl);
    console.log('SUPABASE_SERVICE_KEY:', !!supabaseKey);
    return;
  }

  console.log('✅ Supabase credentials found');
  const supabase = createClient(supabaseUrl, supabaseKey);

  // 1. Все модели
  console.log('\n📋 ВСЕ МОДЕЛИ:');
  const { data: allModels, error: allError } = await supabase
    .from('model_trainings')
    .select('*')
    .eq('telegram_id', telegramId)
    .eq('status', 'SUCCESS')
    .order('created_at', { ascending: false });

  if (allError) {
    console.error('❌ Ошибка получения всех моделей:', allError);
  } else {
    console.log(`✅ Найдено ${allModels?.length || 0} моделей`);
    allModels?.forEach((model, i) => {
      console.log(`  ${i + 1}. ${model.model_name} (API: ${model.api}, ID: ${model.id})`);
    });
  }

  // 2. Replicate модели
  console.log('\n🔄 ТОЛЬКО REPLICATE:');
  const { data: repModels, error: repError } = await supabase
    .from('model_trainings')
    .select('*')
    .eq('telegram_id', telegramId)
    .eq('status', 'SUCCESS')
    .eq('api', 'replicate')
    .order('created_at', { ascending: false });

  if (repError) {
    console.error('❌ Ошибка:', repError);
  } else {
    console.log(`✅ Найдено ${repModels?.length || 0} replicate моделей`);
    repModels?.forEach((model, i) => {
      console.log(`  ${i + 1}. ${model.model_name}`);
    });
  }

  // 3. Другие модели
  console.log('\n🎭 НЕ-REPLICATE:');
  const { data: otherModels, error: otherError } = await supabase
    .from('model_trainings')
    .select('*')
    .eq('telegram_id', telegramId)
    .eq('status', 'SUCCESS')
    .neq('api', 'replicate')
    .order('created_at', { ascending: false });

  if (otherError) {
    console.error('❌ Ошибка:', otherError);
  } else {
    console.log(`✅ Найдено ${otherModels?.length || 0} других моделей`);
    otherModels?.forEach((model, i) => {
      console.log(`  ${i + 1}. ${model.model_name} (API: ${model.api})`);
    });
  }

  console.log('\n✅ Проверка завершена!');
}

checkUserModels().catch(console.error);
