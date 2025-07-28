import { supabase } from '@/core/supabase'

async function checkTables() {
  console.log('🔍 Проверяем доступные таблицы в базе данных...')

  // Получаем список всех таблиц
  const { data: tables, error } = await supabase
    .from('information_schema.tables')
    .select('table_name')
    .eq('table_schema', 'public')
    .order('table_name')

  if (error) {
    console.error('❌ Ошибка получения таблиц:', error)
    return
  }

  console.log('\n📋 Доступные таблицы:')
  tables?.forEach((table, index) => {
    console.log(`${index + 1}. ${table.table_name}`)
  })

  // Проверяем таблицы связанные с моделями
  const modelTables = tables?.filter(
    t =>
      t.table_name.toLowerCase().includes('model') ||
      t.table_name.toLowerCase().includes('training') ||
      t.table_name.toLowerCase().includes('flux')
  )

  console.log('\n🤖 Таблицы связанные с моделями:')
  if (modelTables && modelTables.length > 0) {
    modelTables.forEach((table, index) => {
      console.log(`${index + 1}. ${table.table_name}`)
    })
  } else {
    console.log('❌ Таблицы с моделями не найдены')
  }

  // Проверим таблицу users подробнее - возможно там есть колонки связанные с моделями
  console.log('\n👤 Структура таблицы users:')
  const { data: userColumns, error: userError } = await supabase
    .from('information_schema.columns')
    .select('column_name, data_type, is_nullable')
    .eq('table_name', 'users')
    .eq('table_schema', 'public')
    .order('ordinal_position')

  if (userError) {
    console.error('❌ Ошибка получения структуры users:', userError)
  } else {
    userColumns?.forEach(col => {
      console.log(
        `  ${col.column_name}: ${col.data_type} ${col.is_nullable === 'YES' ? '(nullable)' : '(not null)'}`
      )
    })
  }
}

async function main() {
  try {
    await checkTables()
  } catch (error) {
    console.error('💥 Ошибка:', error)
  }
}

main()
