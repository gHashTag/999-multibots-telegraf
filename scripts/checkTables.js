#!/usr/bin/env node

/**
 * Скрипт для проверки таблиц в базе данных
 */

const { createClient } = require('@supabase/supabase-js')
require('dotenv').config({ path: '.env' })

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('❌ Отсутствуют SUPABASE_URL или SUPABASE_SERVICE_KEY в .env')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

async function checkTables() {
  console.log('🔍 Проверяем таблицы в базе данных...\n')

  // Получаем список таблиц
  const { data: tables, error } = await supabase.rpc('list_tables')

  if (error) {
    console.log('❌ Ошибка при получении списка таблиц:', error)
    console.log('\nПопробуем получить через информационную схему...')

    const { data: schemaData, error: schemaError } = await supabase
      .from('information_schema.tables')
      .select('table_name')
      .eq('table_schema', 'public')
      .order('table_name')

    if (schemaError) {
      console.error('❌ Ошибка:', schemaError)
      return
    }

    console.log('📋 Список таблиц в схеме public:')
    schemaData.forEach(table => {
      console.log(`  - ${table.table_name}`)
    })
  } else {
    console.log('📋 Таблицы в базе данных:')
    tables.forEach(table => {
      console.log(`  - ${table}`)
    })
  }
}

checkTables()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('❌ Критическая ошибка:', error)
    process.exit(1)
  })
