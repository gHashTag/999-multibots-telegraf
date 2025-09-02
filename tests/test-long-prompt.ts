#!/usr/bin/env ts-node
import axios from 'axios'
import dotenv from 'dotenv'
import path from 'path'

// Загружаем переменные окружения
dotenv.config({ path: path.join(__dirname, '..', '.env') })

const API_KEY = process.env.KIE_AI_API_KEY || 'f52f224a92970aa6b7c7780104a00f71'

// Длинный промпт для тестирования
const LONG_PROMPT = `Fixed wide shot on a sleek matte-black desk surface. A subtle pulsing glow in neon blue begins to form at the center of the frame, gradually intensifying. Suddenly, holographic fragments burst upward, assembling into a floating 3D logo. The logo rotates slowly, revealing intricate details and depth. As it completes a full rotation, the entire structure shatters into thousands of luminous particles that drift upward and fade, leaving only a soft afterglow that dims to black. The camera remains perfectly still throughout, emphasizing the logo's dramatic emergence and dissolution. Professional studio lighting, ultra-sharp focus, 8K quality, cinematic atmosphere with subtle lens flares and depth of field effects.`

async function testLongPrompt() {
  console.log('🎬 Тестирование с длинным промптом')
  console.log('📏 Длина промпта:', LONG_PROMPT.length, 'символов')
  console.log('📝 Промпт:', LONG_PROMPT)
  console.log('---')

  try {
    // Тест через Kie.ai API напрямую
    console.log('🔄 Отправляем запрос в Kie.ai API...')
    
    const response = await axios.post(
      'https://api.kie.ai/api/v1/veo/generate',
      {
        model: 'veo3_fast',
        prompt: LONG_PROMPT,
        aspectRatio: '9:16',
        enableFallback: false,
        enableTranslation: true,
      },
      {
        headers: {
          Authorization: `Bearer ${API_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    )

    console.log('✅ Ответ от Kie.ai:')
    console.log('   Code:', response.data.code)
    console.log('   Message:', response.data.msg)
    
    if (response.data.data) {
      console.log('   TaskId:', response.data.data.taskId || response.data.data)
      console.log('   Full data:', JSON.stringify(response.data.data, null, 2))
    }

    if (response.data.code === 200) {
      console.log('✅ Промпт успешно принят Kie.ai!')
      console.log('📋 Видео генерируется, taskId:', response.data.data?.taskId || response.data.data)
    } else {
      console.log('❌ Ошибка от Kie.ai:', response.data.msg)
    }

  } catch (error: any) {
    if (error.response) {
      console.error('❌ API Error:', error.response.status, error.response.statusText)
      console.error('   Response:', error.response.data)
    } else {
      console.error('❌ Error:', error.message)
    }
  }
}

// Запускаем тест
testLongPrompt()