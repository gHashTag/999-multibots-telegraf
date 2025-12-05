// ПРОВЕРКА ВСЕХ БОТОВ В БАЗЕ ДАННЫХ
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://fbgmxbvzwgxfkagxkmqc.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFiZ214Ynp2d2d4ZmdhZ3hzbXFjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzUwNzcyNzYsImV4cCI6MjA1MDY1MzI3Nn0.CqYl7p2vJ6f6dJ0dU2xC8bKqj_1eJ0dD4L5z6N3c2A';

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false },
  global: { headers: { 'apikey': supabaseKey } }
});

async function checkAllBotsInDB() {
  console.log('🔍 ПРОВЕРКА ВСЕХ БОТОВ В БАЗЕ ДАННЫХ\n');

  try {
    // Получаем ВСЕХ ботов из базы
    const { data: allPayments, error } = await supabase
      .from('payments')
      .select('bot_name, COUNT(*) as count')
      .order('count', { ascending: false });

    if (error) {
      console.error('❌ Ошибка:', error.message);
      return;
    }

    console.log('📊 ВСЕ БОТЫ В БАЗЕ (по количеству транзакций):\n');

    allPayments.forEach((bot, i) => {
      console.log(`${i+1}. ${bot.bot_name}: ${bot.count} транзакций`);
    });

    // Проверяем наших 10 ботов
    console.log('\n\n✅ НАШИ 10 БОТОВ:');
    const ourBots = [
      'neuro_blogger_bot',
      'MetaMuse_Manifest_bot',
      'Gaia_Kamskaia_bot',
      'AI_STARS_bot',
      'Kaya_easy_art_bot',
      'NeuroLenaAssistant_bot',
      'HaimGroupMedia_bot',
      'LeeSolarbot',
      'NeurostylistShtogrina_bot',
      'ZavaraBot'
    ];

    allPayments.forEach(payment => {
      if (ourBots.includes(payment.bot_name)) {
        console.log(`✅ ${payment.bot_name}: ${payment.count} транзакций`);
      }
    });

    // Ищем других ботов
    console.log('\n❓ ДРУГИЕ БОТЫ (которых нет в нашем списке):');
    let foundOtherBots = false;
    allPayments.forEach(payment => {
      if (!ourBots.includes(payment.bot_name)) {
        console.log(`⚠️  ${payment.bot_name}: ${payment.count} транзакций`);
        foundOtherBots = true;
      }
    });

    if (!foundOtherBots) {
      console.log('✅ Других ботов не найдено - анализируем всех правильно!');
    }

  } catch (error) {
    console.error('❌ Критическая ошибка:', error.message);
  }
}

checkAllBotsInDB();
