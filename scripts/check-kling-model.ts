#!/usr/bin/env bun

import Replicate from 'replicate'

const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN!,
})

async function checkModel() {
  try {
    console.log('🔍 Получаем информацию о модели kwaivgi/kling-lip-sync...\n')
    
    // Получаем информацию о модели
    const model = await replicate.models.get('kwaivgi', 'kling-lip-sync')
    
    console.log('📋 Информация о модели:')
    console.log('Name:', model.name)
    console.log('Description:', model.description)
    console.log('Latest version:', model.latest_version?.id)
    
    // Получаем схему входных параметров
    if (model.latest_version?.openapi_schema) {
      const inputSchema = model.latest_version.openapi_schema.components?.schemas?.Input
      
      console.log('\n📥 Входные параметры:')
      if (inputSchema?.properties) {
        Object.entries(inputSchema.properties).forEach(([key, value]: [string, any]) => {
          console.log(`\n  ${key}:`)
          console.log(`    type: ${value.type}`)
          console.log(`    description: ${value.description || 'N/A'}`)
          if (value.default !== undefined) {
            console.log(`    default: ${value.default}`)
          }
          if (inputSchema.required?.includes(key)) {
            console.log(`    required: true`)
          }
        })
      }
      
      console.log('\n🔴 Обязательные параметры:', inputSchema?.required || [])
    }
    
    // Пробуем простой вызов с минимальными параметрами
    console.log('\n\n🧪 Тестовый вызов с реальными URL...')
    
    const testInput = {
      video_url: 'https://replicate.delivery/pbxt/JrNdC0hHA1LQg4PvQKQ1bEaBqG2HcdQOS3qxIFS9g1YNFQRTA/output.mp4',
      audio_url: 'https://replicate.delivery/pbxt/JrNdC0hHA1LQg4PvQKQ1bEaBqG2HcdQOS3qxIFS9g1YNFQRTA/audio.mp3',
    }
    
    console.log('Input:', testInput)
    
    const prediction = await replicate.predictions.create({
      version: model.latest_version?.id || 'latest',
      input: testInput,
    })
    
    console.log('\n✅ Prediction создан:')
    console.log('ID:', prediction.id)
    console.log('Status:', prediction.status)
    console.log('URLs:', prediction.urls)
    
  } catch (error) {
    console.error('\n❌ Ошибка:')
    console.error(error)
    
    if (error instanceof Error && 'response' in error) {
      const response = (error as any).response
      console.error('\nResponse status:', response?.status)
      console.error('Response data:', await response?.text())
    }
  }
}

checkModel()
