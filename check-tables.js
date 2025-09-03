const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkTables() {
  console.log('🔍 ПРОВЕРЯЕМ СТРУКТУРУ ТАБЛИЦ');
  console.log('=================================\n');
  
  // Проверяем instagram_apify_reels
  console.log('📊 Таблица instagram_apify_reels:');
  const { data: apifyData, error: apifyError } = await supabase
    .from('instagram_apify_reels')
    .select('*')
    .limit(1);
  
  if (apifyError) {
    console.log('❌ Ошибка:', apifyError.message);
  } else if (apifyData && apifyData.length > 0) {
    console.log('✅ Поля таблицы:');
    Object.keys(apifyData[0]).forEach(key => {
      console.log(`  - ${key}: ${typeof apifyData[0][key]} = "${apifyData[0][key]}"`);
    });
  } else {
    console.log('⚠️ Таблица пустая, пробуем получить структуру...');
  }
  
  console.log('\n📊 Таблица instagram_scrapings:');
  const { data: scrapingsData, error: scrapingsError } = await supabase
    .from('instagram_scrapings')
    .select('*')
    .limit(1);
  
  if (scrapingsError) {
    console.log('❌ Ошибка:', scrapingsError.message);
  } else if (scrapingsData && scrapingsData.length > 0) {
    console.log('✅ Поля таблицы:');
    Object.keys(scrapingsData[0]).forEach(key => {
      console.log(`  - ${key}: ${typeof scrapingsData[0][key]} = "${scrapingsData[0][key]}"`);
    });
  } else {
    console.log('⚠️ Таблица пустая');
  }
  
  // Пробуем найти записи по user_id
  console.log('\n🔍 Ищем записи по user_id = 144022504:');
  
  const { data: userRecords1, error: error1 } = await supabase
    .from('instagram_apify_reels')
    .select('*')
    .or('user_id.eq.144022504,requester_telegram_id.eq.144022504')
    .limit(5);
    
  console.log('instagram_apify_reels:', userRecords1?.length || 0, 'записей');
  if (userRecords1?.length > 0) {
    console.log('Пример записи:', userRecords1[0]);
  }
  
  const { data: userRecords2, error: error2 } = await supabase
    .from('instagram_scrapings')
    .select('*')
    .or('user_id.eq.144022504,telegram_id.eq.144022504')
    .limit(5);
    
  console.log('instagram_scrapings:', userRecords2?.length || 0, 'записей');
  if (userRecords2?.length > 0) {
    console.log('Пример записи:', userRecords2[0]);
  }
}

checkTables().catch(console.error);