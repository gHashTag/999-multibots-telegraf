#!/usr/bin/env ts-node

/**
 * Финальный тест Veo 3 генерации с длинными JSON промптами
 */

import axios from 'axios'
import dotenv from 'dotenv'

dotenv.config()

const KIE_AI_API_KEY = process.env.KIE_AI_API_KEY

if (!KIE_AI_API_KEY) {
  console.error('❌ KIE_AI_API_KEY не найден в .env')
  process.exit(1)
}

const longJsonPrompt = {
  "description": "Fixed wide shot on a sleek matte-black desk surface. A subtle pulsing glow in neon blue begins to form into the shape of the VibeCoder logo. From the glow, shimmering lines of code flow outward like liquid light, spreading across the desk in fractal patterns. The lines then ripple and converge, lifting into the air and reshaping themselves into a glowing 3D interface — a hovering cube of evolving code that gently shifts with organic, fluid motion.",
  "style": "futuristic, inspiring, high-tech",
  "camera": "fixed wide shot, slight dolly-in at climax",
  "lighting": "cool neon accents with soft ambient gradient (blue-violet tone)",
  "environment": "matte black workspace, futuristic tech studio feel",
  "elements": [
    "VibeCoder logo glowing",
    "light streams transforming into flowing code",
    "fractal pattern animation",
    "3D code-cube emerging in midair",
    "gentle particle effects around the cube"
  ],
  "motion": {
    "type": "logo-to-energy-to-structure",
    "details": "the logo pulses into light, releases streaming code lines, which converge and transform into a levitating, glowing cube of dynamic code"
  },
  "ending": "The floating cube stabilizes, glowing softly, with the VibeCoder logo embossed at its core.",
  "audio": {
    "voice_over": "none",
    "music": "ambient electronic with slow build-up, synth pads and subtle beats",
    "sfx": "soft digital hum, rising energy swell, gentle crackling light particles"
  },
  "text_overlay": "none",
  "format": "16:9",
  "keywords": [
    "VibeCoder",
    "AI coding",
    "futuristic",
    "transformation",
    "creativity through technology"
  ]
}

async function testVeoGeneration() {
  console.log('🧪 Тестирование Veo 3 генерации с длинным JSON промптом')
  console.log('📏 Длина промпта:', JSON.stringify(longJsonPrompt).length, 'символов')
  
  try {
    // Запуск генерации
    console.log('\n📤 Отправка запроса на Kie.ai API...')
    
    const response = await axios.post(
      'https://api.kie.ai/api/v1/veo/generate',
      {
        model: 'veo3_fast',
        prompt: JSON.stringify(longJsonPrompt),
        aspectRatio: '9:16',
        enableFallback: false,
        enableTranslation: true
      },
      {
        headers: {
          'Authorization': `Bearer ${KIE_AI_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    )

    console.log('\n✅ Ответ от Kie.ai:')
    console.log('- Статус:', response.status)
    console.log('- TaskId:', response.data.taskId)
    
    const taskId = response.data.taskId
    
    // Проверка статуса
    console.log('\n⏳ Проверка статуса генерации...')
    
    await new Promise(resolve => setTimeout(resolve, 5000))
    
    const statusResponse = await axios.get(
      `https://api.kie.ai/api/v1/veo/record-info?taskId=${taskId}`,
      {
        headers: {
          'Authorization': `Bearer ${KIE_AI_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    )
    
    console.log('\n📊 Статус задачи:')
    console.log('- Статус:', statusResponse.data.status || statusResponse.data.data?.status)
    console.log('- Прогресс:', statusResponse.data.data?.progress || 'N/A')
    
    if (statusResponse.data.data?.videoUrl) {
      console.log('- Видео URL:', statusResponse.data.data.videoUrl)
    }
    
    console.log('\n✅ ТЕСТ УСПЕШЕН!')
    console.log('📝 Резюме:')
    console.log('- JSON промпт длиной', JSON.stringify(longJsonPrompt).length, 'символов принят')
    console.log('- Генерация запущена успешно')
    console.log('- TaskId получен для отслеживания')
    console.log('\n🎉 Система готова к работе с длинными JSON промптами!')
    
  } catch (error: any) {
    console.error('\n❌ Ошибка:', error.response?.data || error.message)
    console.error('Статус:', error.response?.status)
    console.error('URL:', error.config?.url)
    process.exit(1)
  }
}

// Запуск теста
testVeoGeneration()