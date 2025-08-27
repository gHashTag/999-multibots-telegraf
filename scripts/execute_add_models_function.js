#!/usr/bin/env node

// Скрипт для выполнения SQL-функции add_models_to_users()
// Этот скрипт сначала создает функцию, а затем выполняет её

import { createClient } from '@supabase/supabase-js'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

// Get current directory for ES modules
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Load environment variables
import dotenv from 'dotenv'
dotenv.config()

const supabaseUrl = process.env.SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Ошибка: SUPABASE_URL и SUPABASE_SERVICE_KEY должны быть установлены в .env файле')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function executeAddModelsFunction() {
  try {
    console.log('🚀 Начинаю выполнение функции add_models_to_users()...')
    
    // Сначала читаем и создаем функцию из SQL файла
    const sqlFilePath = path.join(__dirname, 'add_models_to_users.sql')
    const sqlContent = fs.readFileSync(sqlFilePath, 'utf8')
    
    console.log('📁 Создаю функцию в базе данных...')
    const createResult = await supabase.rpc('exec', { sql: sqlContent })
    
    if (createResult.error) {
      console.error('❌ Ошибка при создании функции:', createResult.error)
      // Попробуем выполнить SQL напрямую через raw query
      console.log('🔄 Попытка создания функции через прямое выполнение SQL...')
    }
    
    // Выполняем функцию
    console.log('⚡ Выполняю функцию add_models_to_users()...')
    const { data, error } = await supabase.rpc('add_models_to_users')
    
    if (error) {
      console.error('❌ Ошибка при выполнении функции:', error)
      return
    }
    
    console.log('✅ Функция выполнена успешно!')
    console.log('📊 Результат:', data)
    
    // Проверим, что записи действительно добавились
    console.log('🔍 Проверяю добавленные записи...')
    const { data: checkData, error: checkError } = await supabase
      .from('model_trainings')
      .select('telegram_id, model_name, status')
      .in('telegram_id', [461758294, 289259562, 164609458, 752224685])
      .order('created_at', { ascending: false })
      .limit(8)
    
    if (checkError) {
      console.error('❌ Ошибка при проверке:', checkError)
      return
    }
    
    console.log('📋 Последние добавленные записи:')
    checkData?.forEach((record, index) => {
      console.log(`${index + 1}. Telegram ID: ${record.telegram_id}, Модель: ${record.model_name}, Статус: ${record.status}`)
    })
    
  } catch (error) {
    console.error('💥 Критическая ошибка:', error)
  }
}

// Запускаем выполнение
executeAddModelsFunction()