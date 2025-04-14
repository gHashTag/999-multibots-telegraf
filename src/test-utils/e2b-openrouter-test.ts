import { TestResult } from '../types/test'
import { logger } from '../logger'
import { SandboxManager } from '../core/mcp/agent/specialized/e2b-coding-agent'

// Список бесплатных моделей OpenRouter
const FREE_MODELS = [
  'agentica-org/deepcoder-14b-preview:free',
  'moonshotai/kimi-vl-a3b-thinking:free',
  'google/gemini-2.0-flash-thinking-exp:free',
  'google/gemini-2.0-flash-thinking-exp-1219:free'
]

export async function runE2BOpenRouterTest(): Promise<TestResult> {
  try {
    logger.info('🚀 Starting E2B OpenRouter test')
    
    // Получаем инстанс песочницы через менеджер
    const sandboxManager = SandboxManager.getInstance()
    await sandboxManager.initialize()
    
    logger.info('✅ Sandbox initialized successfully')

    // Тестируем каждую модель
    for (const model of FREE_MODELS) {
      try {
        logger.info(`📝 Testing model: ${model}`)
        
        // Создаем Python скрипт для теста
        const pythonScript = `
import openrouter
openrouter.api_key = "${process.env.OPENROUTER_API_KEY || ''}"

response = openrouter.chat.completions.create(
    model="${model}",
    messages=[
        {"role": "user", "content": "Print 'Hello World' and explain how you work"}
    ]
)

print(f"Response from {model}:")
print(response.choices[0].message.content)
`

        // Записываем скрипт в файл
        await sandboxManager.writeFile('/test.py', pythonScript)
        
        // Устанавливаем OpenRouter SDK
        const install = await sandboxManager.runCommand('pip install openrouter')
        logger.info('OpenRouter SDK installed')

        // Запускаем тест
        const result = await sandboxManager.runCommand('python /test.py')
        logger.info(`Model ${model} test result: ${result.stdout}`)

      } catch (err) {
        const error = err as Error
        logger.error(`Error testing model ${model}: ${error.message}`)
      }
    }

    // Очищаем ресурсы
    await sandboxManager.cleanup()
    logger.info('Resources cleaned up successfully')

    return {
      success: true,
      message: 'E2B OpenRouter test completed successfully',
      name: 'E2B OpenRouter Test'
    }

  } catch (err) {
    const error = err as Error
    logger.error(`E2B OpenRouter test failed: ${error.message}`)
    return {
      success: false,
      message: `Test failed: ${error.message}`,
      name: 'E2B OpenRouter Test'
    }
  }
} 