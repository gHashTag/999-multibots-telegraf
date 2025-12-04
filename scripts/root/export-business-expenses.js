// Экспорт business_expenses из базы данных в JSON файл
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

async function exportBusinessExpenses() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.log('❌ Нет доступа к базе данных');
    console.log('Нужны переменные: SUPABASE_URL и SUPABASE_SERVICE_KEY');
    return;
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    console.log('📥 Загрузка business_expenses из базы...');
    const { data, error } = await supabase
      .from('business_expenses')
      .select('*');

    if (error) {
      throw new Error(error.message);
    }

    console.log(`   ✅ Найдено: ${data.length} записей`);

    const fs = require('fs');
    const path = require('path');
    const outputPath = path.join(process.cwd(), 'business_expenses_data.json');
    
    fs.writeFileSync(outputPath, JSON.stringify(data, null, 2));
    
    console.log(`   ✅ Экспортировано в: ${outputPath}`);
    console.log('\nТеперь можно запустить тест с полными данными!\n');
    
  } catch (error) {
    console.log(`❌ Ошибка: ${error.message}`);
  }
}

exportBusinessExpenses();
