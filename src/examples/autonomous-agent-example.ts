/**
 * Пример использования автономной системы агентов
 *
 * Запуск: npm run ts-node src/examples/autonomous-agent-example.ts
 */

import { initializeAutonomousSystem } from '../core/mcp/agent/initialization.js'
import { TaskType } from '../core/mcp/agent/state.js'
import dotenv from 'dotenv'

// Загружаем переменные окружения из .env файла
dotenv.config()

// Функция для запуска примера
async function runExample() {
  console.log('🚀 Запуск примера автономной системы агентов')

  try {
    // Инициализируем автономную систему
    const system = await initializeAutonomousSystem({
      systemId: 'example-system',
      mcpConfig: {
        serverUrl: process.env.MCP_SERVER_URL!,
        apiKey: process.env.MCP_API_KEY!,
      },
      enableScheduler: false, // Отключаем планировщик для примера
    })

    console.log('✅ Система инициализирована успешно')

    // Подписываемся на события
    system.on('task_completed', data => {
      console.log(`✅ Задача завершена: ${data.task.id}`)
      console.log('Результат:', JSON.stringify(data.result, null, 2))
    })

    system.on('task_failed', data => {
      console.log(`❌ Ошибка выполнения задачи: ${data.task.id}`)
      console.log('Ошибка:', data.error)
    })

    // Создаем задачу для генерации кода
    const generateTask = await system.createTask(
      TaskType.CODE_GENERATION,
      'Создать простой REST API сервер на Express с TypeScript',
      {
        requirements: [
          'Использовать Express и TypeScript',
          'Добавить маршрут GET /api/health для проверки работоспособности',
          'Добавить маршрут GET /api/users для получения списка пользователей',
          'Добавить маршрут POST /api/users для создания пользователя',
        ],
        language: 'TypeScript',
        outputDir: './generated-code',
        priority: 5,
      }
    )

    console.log(`🚀 Создана задача генерации кода: ${generateTask.id}`)

    // Выполняем задачу
    console.log('⏳ Выполнение задачи генерации кода...')
    await system.processTask(generateTask)

    // Создаем задачу для самосовершенствования
    const improvementTask = await system.createTask(
      TaskType.SELF_IMPROVEMENT,
      'Улучшить архитектуру системы агентов',
      {
        targetComponent: 'agent',
        applyChanges: false, // Не применяем изменения автоматически
        priority: 7,
      }
    )

    console.log(`🚀 Создана задача улучшения: ${improvementTask.id}`)

    // Выполняем задачу
    console.log('⏳ Анализ возможных улучшений...')
    const improvementResult = await system.processTask(improvementTask)

    console.log('✅ Результаты анализа:')
    console.log(JSON.stringify(improvementResult, null, 2))

    // Завершаем работу системы
    await system.shutdown()
    console.log('👋 Работа системы завершена')
  } catch (error) {
    console.error('❌ Ошибка в примере:', error)
  }
}

// Запускаем пример
runExample().catch(console.error)
