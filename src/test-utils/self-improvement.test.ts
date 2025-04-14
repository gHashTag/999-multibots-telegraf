import { TestResult } from './core/types'
import { TaskType } from '../core/mcp/agent/state'
import { createAutonomousSystem } from '../core/mcp/agent/autonomous-system'
import { Service } from '../core/mcp/types'

export async function testSelfImprovement(): Promise<TestResult> {
  try {
    console.log('🧪 Запуск теста самосовершенствования...')

    // Создаем мок MCP сервиса
    const mockService: Service = {
      name: 'test-service',
      async initialize() {
        console.log('🔧 Инициализация тестового сервиса')
      },
      async close() {
        console.log('👋 Закрытие тестового сервиса')
      },
      async call(prompt: string) {
        return {
          content: 'Test response',
          role: 'assistant'
        }
      }
    }

    // Создаем автономную систему
    const system = createAutonomousSystem({
      mcpService: mockService,
      enableScheduler: false
    })

    // Инициализируем систему
    await system.initialize()

    // Создаем тестовую задачу
    const task = await system.createTask(
      TaskType.SELF_IMPROVEMENT,
      'Выполнить базовый анализ системы',
      {
        priority: 1
      }
    )

    // Обрабатываем задачу
    const result = await system.processTask(task)

    // Проверяем результат
    if (!result || !result.success) {
      throw new Error('Тест не пройден: результат отсутствует или неуспешен')
    }

    // Закрываем систему
    await system.shutdown()

    console.log('✅ Тест самосовершенствования успешно пройден')
    return {
      success: true,
      message: 'Тест самосовершенствования пройден успешно',
      name: 'Self Improvement Test'
    }

  } catch (error) {
    console.error('❌ Ошибка в тесте самосовершенствования:', error)
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Неизвестная ошибка',
      name: 'Self Improvement Test'
    }
  }
} 