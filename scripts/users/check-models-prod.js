/**
 * 🔍 NODE.JS СКРИПТ ДЛЯ ПРОВЕРКИ МОДЕЛЕЙ ПОЛЬЗОВАТЕЛЯ НА PRODUCTION
 *
 * Использование на production сервере:
 * ssh root@188.137.250.69
 * docker exec 999-multibots node /root/999-agents-telegraf/scripts/users/check-models-prod.js 5439920152
 *
 * Или локально через SSH:
 * ssh root@188.137.250.69 "docker exec 999-multibots node /root/999-agents-telegraf/scripts/users/check-models-prod.js 5439920152"
 */

const { createClient } = require('@supabase/supabase-js');

const telegramId = process.argv[2] || '5439920152';

async function checkUserModels() {
  console.log('🔐 Инициализация Supabase...');

  // Получаем секреты из environment (они уже загружены в Docker контейнере)
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error('❌ SUPABASE_URL или SUPABASE_SERVICE_KEY не найдены в environment');
    console.error('Доступные ключи:', Object.keys(process.env).filter(k => k.includes('SUPABASE')));
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  console.log(`\n🔍 Проверяю модели пользователя ${telegramId}...\n`);

  // 1. Получаем информацию о пользователе
  const { data: user, error: userError } = await supabase
    .from('users')
    .select('*')
    .eq('telegram_id', telegramId)
    .single();

  if (userError) {
    console.log('⚠️ Пользователь не найден в таблице users');
  } else {
    console.log('👤 Пользователь найден:');
    console.log(`   Username: @${user.username || 'не указан'}`);
    console.log(`   Bot: ${user.bot_name || 'не указан'}`);
    console.log(`   Created: ${new Date(user.created_at).toLocaleString('ru-RU')}\n`);
  }

  // 2. ВСЕ МОДЕЛИ
  const { data: allModels, error: allError } = await supabase
    .from('model_trainings')
    .select('*')
    .or(`user_id.eq.${telegramId},telegram_id.eq.${telegramId}`)
    .order('created_at', { ascending: false });

  if (allError) {
    console.error('❌ Ошибка получения моделей:', allError.message);
    process.exit(1);
  }

  if (!allModels || allModels.length === 0) {
    console.log('📭 У пользователя нет моделей в базе данных\n');
    process.exit(0);
  }

  console.log(`📋 Найдено ${allModels.length} моделей\n`);
  console.log('━'.repeat(100));

  // 3. Детальная информация о каждой модели
  allModels.forEach((model, i) => {
    const statusEmoji = getStatusEmoji(model.status);
    console.log(`\n🎭 Модель #${i + 1}:`);
    console.log(`   ID: ${model.id}`);
    console.log(`   Название: ${model.model_name || 'не указано'}`);
    console.log(`   Trigger Word: ${model.trigger_word || 'не указано'}`);
    console.log(`   Статус: ${statusEmoji} ${model.status}`);
    console.log(`   API: ${model.api || 'не указано'}`);
    console.log(`   Gender: ${model.gender || 'не указано'}`);
    console.log(`   Steps: ${model.steps || 'не указано'}`);
    console.log(`   Bot: ${model.bot_name || 'не указано'}`);
    console.log(`   Replicate ID: ${model.replicate_training_id || 'не указано'}`);
    console.log(`   ZIP URL: ${model.zip_url ? '✅ Есть' : '❌ Нет'}`);
    console.log(`   Model URL: ${model.model_url ? '✅ ' + model.model_url : '❌ Нет'}`);
    console.log(`   Создано: ${new Date(model.created_at).toLocaleString('ru-RU')}`);
    console.log(`   Обновлено: ${new Date(model.updated_at).toLocaleString('ru-RU')}`);

    if (model.error) {
      console.log(`   ⚠️ Ошибка: ${model.error}`);
    }
  });

  console.log('\n' + '━'.repeat(100));

  // 4. Статистика по статусам
  const statusStats = {};
  allModels.forEach(m => {
    statusStats[m.status] = (statusStats[m.status] || 0) + 1;
  });

  console.log('\n📈 Статистика по статусам:');
  Object.entries(statusStats).forEach(([status, count]) => {
    console.log(`   ${getStatusEmoji(status)} ${status}: ${count}`);
  });

  // 5. Статистика по API
  const apiStats = {};
  allModels.forEach(m => {
    const api = m.api || 'не указано';
    apiStats[api] = (apiStats[api] || 0) + 1;
  });

  console.log('\n🔌 Статистика по API:');
  Object.entries(apiStats).forEach(([api, count]) => {
    console.log(`   ${api}: ${count}`);
  });

  // 6. Успешные модели
  const successModels = allModels.filter(m =>
    (m.status === 'succeeded' || m.status === 'SUCCESS' || m.status === 'completed') && m.model_url
  );

  console.log(`\n✅ Успешных моделей с URL: ${successModels.length}`);
  if (successModels.length > 0) {
    successModels.forEach((m, i) => {
      console.log(`   ${i + 1}. ${m.model_name} (${m.api}) - ${m.model_url}`);
    });
  }

  // 7. Модели с ошибками
  const errorModels = allModels.filter(m =>
    m.error || m.status === 'failed' || m.status === 'FAILED'
  );

  if (errorModels.length > 0) {
    console.log(`\n⚠️ Модели с ошибками: ${errorModels.length}`);
    errorModels.forEach((m, i) => {
      console.log(`   ${i + 1}. ${m.model_name}: ${m.error || 'Статус failed'}`);
    });
  }

  // 8. История генераций
  const { data: history, error: histError } = await supabase
    .from('prompts_history')
    .select('*')
    .eq('telegram_id', telegramId)
    .eq('mode', 'neuro_photo')
    .order('created_at', { ascending: false })
    .limit(10);

  if (!histError && history) {
    console.log(`\n📜 История генераций (последние ${history.length}):`);\
    history.forEach((h, i) => {
      console.log(`   ${i + 1}. ${h.model_type || 'не указано'} - ${h.status} - ${new Date(h.created_at).toLocaleString('ru-RU')}`);
    });
  }

  console.log('\n✅ Проверка завершена!\n');
}

function getStatusEmoji(status) {
  const emojiMap = {
    'pending': '⏳',
    'processing': '🔄',
    'succeeded': '✅',
    'SUCCESS': '✅',
    'failed': '❌',
    'FAILED': '❌',
    'canceled': '🚫',
    'starting': '🚀',
    'completed': '✅'
  };
  return emojiMap[status] || '❓';
}

checkUserModels()
  .then(() => {
    console.log('🎉 Готово!');
    process.exit(0);
  })
  .catch(error => {
    console.error('❌ Критическая ошибка:', error);
    process.exit(1);
  });
