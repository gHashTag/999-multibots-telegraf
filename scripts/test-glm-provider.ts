/**
 * 🧪 Тестирование GLM-4.7 провайдера
 */

import { config } from 'dotenv'
import path from 'path'

// Load .env
config({ path: path.join(process.cwd(), '.env') })

async function testGLMProvider() {
  console.log('🧪 [TEST] Тестирование GLM-4.7 провайдера...\n')

  const { initInfisical } = await import('../src/core/infisical')
  const { GLMProvider } = await import('../src/core/openai/glm-provider')

  try {
    // Инициализация Infisical
    await initInfisical()

    const glmApiKey = process.env.GLM_API_KEY

    if (!glmApiKey) {
      console.log('❌ GLM_API_KEY не найден в process.env')
      console.log('💡 Добавьте ключ в Infisical: https://app.infisical.com/')
      process.exit(1)
    }

    console.log(`✅ GLM_API_KEY загружен: ${glmApiKey.substring(0, 10)}...\n`)

    // Создаем провайдер
    const glmProvider = new GLMProvider(glmApiKey)

    console.log('📤 Отправка тестового запроса...')

    const response = await glmProvider.chatCompletion([
      {
        role: 'system',
        content: 'You are a helpful assistant.',
      },
      {
        role: 'user',
        content: 'Say "GLM-4.7 is working!" in one sentence.',
      },
    ])

    console.log('✅ Ответ получен:')
    console.log(`   ${response}\n`)
    console.log('✅ GLM-4.7 интеграция работает корректно!')

  } catch (error) {
    console.error('❌ Ошибка тестирования:', error instanceof Error ? error.message : String(error))
    process.exit(1)
  }
}

testGLMProvider()
