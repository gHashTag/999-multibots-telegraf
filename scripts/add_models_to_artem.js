#!/usr/bin/env node

// Скрипт для добавления моделей пользователю 7669741878 (Артем Всемогущий)
// Добавляет модели "Coco Age" и "Vyacheslav Nekludov"

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

// Данные пользователя и моделей
const userId = 7669741878
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

async function addModelsToArtem() {
  try {
    console.log(`🚀 Добавляю модели пользователю ${userId} (Артем Всемогущий)...`)
    
    // Сначала проверим, какие модели уже есть у пользователя
    console.log('🔍 Проверяю существующие модели...')
    const { data: existingModels, error: checkError } = await supabase
      .from('model_trainings')
      .select('model_name, status, created_at')
      .eq('telegram_id', userId)
    
    if (checkError) {
      console.error('❌ Ошибка при проверке существующих моделей:', checkError)
      return
    }
    
    console.log(`📋 У пользователя уже есть ${existingModels?.length || 0} моделей:`)
    existingModels?.forEach((model, index) => {
      console.log(`${index + 1}. ${model.model_name} (${model.status}) - ${model.created_at}`)
    })
    
    const recordsToInsert = []
    
    // Создаем записи для каждой модели
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
    
    console.log(`📝 Подготовлено ${recordsToInsert.length} записей для добавления:`)
    recordsToInsert.forEach((record, index) => {
      console.log(`${index + 1}. ${record.model_name} (${record.gender})`)
    })
    
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
    
    // Проверяем итоговый результат
    console.log('🔍 Проверяю финальный список моделей пользователя...')
    const { data: finalModels, error: finalError } = await supabase
      .from('model_trainings')
      .select('model_name, status, created_at, gender')
      .eq('telegram_id', userId)
      .order('created_at', { ascending: false })
    
    if (finalError) {
      console.error('❌ Ошибка при финальной проверке:', finalError)
      return
    }
    
    console.log(`📋 Итого у пользователя ${userId} теперь ${finalModels?.length || 0} моделей:`)
    finalModels?.forEach((model, index) => {
      console.log(`${index + 1}. ${model.model_name} (${model.gender || 'не указан'}) - ${model.status} - ${new Date(model.created_at).toLocaleDateString('ru-RU')}`)
    })
    
    console.log('🎉 Задача выполнена успешно!')
    console.log('🎯 Теперь пользователь сможет выбирать между несколькими моделями в нейрофото!')
    
  } catch (error) {
    console.error('💥 Критическая ошибка:', error)
  }
}

// Запускаем выполнение
addModelsToArtem()