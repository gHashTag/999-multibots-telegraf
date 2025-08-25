#!/usr/bin/env node

// Скрипт для прямой вставки моделей в таблицу model_trainings
// Добавляет модели "Coco Age" и "Vyacheslav Nekludov" для указанных пользователей

import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

// Load environment variables
dotenv.config()

const supabaseUrl = process.env.SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Ошибка: SUPABASE_URL и SUPABASE_SERVICE_KEY должны быть установлены в .env файле')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

// Данные пользователей и моделей
const userIds = [461758294, 289259562, 164609458, 752224685]
const models = [
  {
    model_name: 'Coco Age',
    trigger_word: 'MUSE_NATALY',
    zip_url: 'https://ai-server-u14194.vm.elestio.app/uploads/352374518/model/1753200057463-training_images_1753200054995.zip',
    model_url: 'ghashtag/muse_nataly:d7aa70227518ba5c7e71a6ae7516d6d5d18157d09da8dbbb890af8522f5c0f90',
    replicate_training_id: '9expvj23x9rme0cr6bf8g2f8dg',
    cancel_url: 'https://api.replicate.com/v1/predictions/9expvj23x9rme0cr6bf8g2f8dg/cancel',
    weights: 'https://replicate.delivery/xezq/1WUbkNH3Eb60EFPyfHMAcm4znOKifHHy8FsyQyLlgTuu2WDVA/trained_model.tar',
    gender: 'female'
  },
  {
    model_name: 'Vyacheslav Nekludov',
    trigger_word: 'MUSE_NATALY',
    zip_url: 'https://ai-server-u14194.vm.elestio.app/uploads/352374518/model/1753537610585-training_images_1753537608470.zip',
    model_url: 'ghashtag/muse_nataly:bd4ec60ac9d0265d8bf56957399ce0ae45967bd6d17228a1d9dd31c8a96c9df9',
    replicate_training_id: 'ychtnxxyrhrme0cr8vy91ppvgw',
    cancel_url: 'https://api.replicate.com/v1/predictions/ychtnxxyrhrme0cr8vy91ppvgw/cancel',
    weights: 'https://replicate.delivery/xezq/DYTziGMFIVaEIxi66HfTRCFAu1d9R9Hxt8zwffuGBfbeXKloC/trained_model.tar',
    gender: 'male'
  }
]

async function insertModelsDirectly() {
  try {
    console.log('🚀 Начинаю добавление моделей для пользователей...')
    console.log(`👥 Пользователи: ${userIds.join(', ')}`)
    console.log(`🎨 Модели: ${models.map(m => m.model_name).join(', ')}`)
    
    const recordsToInsert = []
    
    // Создаем записи для каждого пользователя и каждой модели
    for (const userId of userIds) {
      for (const model of models) {
        recordsToInsert.push({
          telegram_id: userId,
          model_name: model.model_name,
          trigger_word: model.trigger_word,
          zip_url: model.zip_url,
          model_url: model.model_url,
          replicate_training_id: model.replicate_training_id,
          status: 'SUCCESS',
          steps: 2000,
          api: 'replicate',
          cancel_url: model.cancel_url,
          weights: model.weights,
          bot_name: 'HaimGroupMedia_bot',
          gender: model.gender,
          error: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
      }
    }
    
    console.log(`📝 Подготовлено ${recordsToInsert.length} записей для вставки`)
    
    // Вставляем все записи одним запросом
    const { data, error } = await supabase
      .from('model_trainings')
      .insert(recordsToInsert)
      .select()
    
    if (error) {
      console.error('❌ Ошибка при вставке записей:', error)
      return
    }
    
    console.log('✅ Записи успешно добавлены!')
    console.log(`📊 Добавлено записей: ${recordsToInsert.length}`)
    
    // Проверим результат
    console.log('🔍 Проверяю добавленные записи...')
    const { data: checkData, error: checkError } = await supabase
      .from('model_trainings')
      .select('telegram_id, model_name, status, created_at')
      .in('telegram_id', userIds)
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
    
    console.log('🎉 Все задачи выполнены успешно!')
    
  } catch (error) {
    console.error('💥 Критическая ошибка:', error)
  }
}

// Запускаем выполнение
insertModelsDirectly()