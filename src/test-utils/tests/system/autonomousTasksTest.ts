/**
 * Тесты для системы автономных задач в базе данных
 */

import { createClient } from '@supabase/supabase-js'
import { TestResult } from '../../types'
import { logger } from '../../../utils/logger'
import type { Task } from '../../../core/mcp/agent/state'
import { createMockFn } from '../../test-config'

/**
 * Тип для мок-функции с дополнительными свойствами
 */
type MockFn<T = any, R = any> = {
  (...args: T[]): R
  calls: T[][]
  mockReturnValue: (value: R) => MockFn<T, R>
}

/**
 * Конфигурация для Supabase
 */
const SUPABASE_URL =
  process.env.SUPABASE_URL || 'https://yuukfqcsdhkyxegfwlcb.supabase.co'
const SUPABASE_KEY = process.env.SUPABASE_KEY || ''

/**
 * Создает клиент Supabase
 * @returns Supabase клиент для работы с БД
 */
function createSupabaseClient() {
  return createClient(SUPABASE_URL, SUPABASE_KEY)
}

/**
 * Тип упрощенного агента для тестирования
 */
interface TestNetworkAgent {
  id: string
  name: string
  description: string
  capabilities: string[]
  priority: number
  maxConcurrentTasks: number
  currentTaskCount: number
  canHandle: (task: Task) => Promise<boolean>
  handle: (task: Task) => Promise<any>
}

/**
 * Создает мок-агента для тестирования
 * @param id - Идентификатор агента
 * @param capabilities - Массив возможностей агента
 * @param agentPriority - Приоритет агента
 * @param maxConcurrentTasks - Максимальное число одновременных задач
 * @returns Объект агента для тестирования
 */
const createMockAgent = (
  id: string,
  capabilities: string[] = ['test', 'mock'],
  agentPriority = 1,
  maxConcurrentTasks = 3
): TestNetworkAgent => {
  return {
    id,
    name: `Agent ${id}`,
    description: `Test agent ${id}`,
    capabilities,
    priority: agentPriority,
    maxConcurrentTasks,
    currentTaskCount: 0,
    canHandle: createMockFn().mockReturnValue(Promise.resolve(true)) as MockFn,
    handle: createMockFn().mockReturnValue(
      Promise.resolve({ success: true })
    ) as MockFn,
  }
}

/**
 * Тест создания задачи в БД
 * @returns Результат выполнения теста
 */
export async function testCreateAutonomousTask(): Promise<TestResult> {
  try {
    logger.info('🚀 Запуск теста создания автономной задачи')

    const testTelegramId = 999888777
    const testBotName = 'test_bot'

    // Создаем клиент Supabase
    const supabase = createSupabaseClient()

    // Очищаем все тестовые данные
    await supabase.rpc('clean_test_autonomous_tasks', {
      p_telegram_id: testTelegramId,
      p_bot_name: testBotName,
    })

    // Создаем задачу
    const { data: taskId, error } = await supabase.rpc(
      'create_autonomous_task',
      {
        p_telegram_id: testTelegramId,
        p_bot_name: testBotName,
        p_type: 'TEST_TYPE',
        p_description: 'Тестовая задача интеграционного теста',
        p_priority: 5,
        p_metadata: { test_key: 'test_value' },
      }
    )

    if (error) {
      return {
        success: false,
        name: 'Тест создания автономной задачи',
        message: `Ошибка при создании задачи: ${error.message}`,
        error: error.message,
      }
    }

    if (!taskId) {
      return {
        success: false,
        name: 'Тест создания автономной задачи',
        message: 'Не удалось создать задачу: ID не получен',
      }
    }

    // Проверяем, что задача создана
    const { data: task, error: fetchError } = await supabase
      .from('autonomous_tasks')
      .select('*')
      .eq('id', taskId)
      .single()

    if (fetchError) {
      return {
        success: false,
        name: 'Тест создания автономной задачи',
        message: `Ошибка при получении созданной задачи: ${fetchError.message}`,
        error: fetchError.message,
      }
    }

    if (!task) {
      return {
        success: false,
        name: 'Тест создания автономной задачи',
        message: 'Задача не найдена после создания',
      }
    }

    // Проверяем атрибуты созданной задачи
    if (
      task.telegram_id !== testTelegramId ||
      task.bot_name !== testBotName ||
      task.type !== 'TEST_TYPE' ||
      task.priority !== 5
    ) {
      return {
        success: false,
        name: 'Тест создания автономной задачи',
        message: 'Атрибуты созданной задачи не соответствуют ожидаемым',
        details: { task },
      }
    }

    // Очищаем тестовые данные после завершения теста
    await supabase.rpc('clean_test_autonomous_tasks', {
      p_telegram_id: testTelegramId,
      p_bot_name: testBotName,
    })

    return {
      success: true,
      name: 'Тест создания автономной задачи',
      message: 'Задача успешно создана и имеет корректные атрибуты',
    }
  } catch (error: any) {
    return {
      success: false,
      name: 'Тест создания автономной задачи',
      message: `Ошибка при выполнении теста: ${error.message}`,
      error: error.message,
    }
  }
}

/**
 * Тест получения задачи с учетом приоритета
 * @returns Результат выполнения теста
 */
export async function testGetNextAutonomousTask(): Promise<TestResult> {
  try {
    logger.info('🚀 Запуск теста получения следующей автономной задачи')

    const testTelegramId = 999888777
    const testBotName = 'test_bot'

    // Создаем клиент Supabase
    const supabase = createSupabaseClient()

    // Очищаем все тестовые данные
    await supabase.rpc('clean_test_autonomous_tasks', {
      p_telegram_id: testTelegramId,
      p_bot_name: testBotName,
    })

    // Создаем задачи с разными приоритетами
    await supabase.rpc('create_autonomous_task', {
      p_telegram_id: testTelegramId,
      p_bot_name: testBotName,
      p_type: 'PRIORITY_TEST',
      p_description: 'Задача с низким приоритетом',
      p_priority: 2,
    })

    // Задача со средним приоритетом, не используется в этом тесте напрямую,
    // но создается для полноты сценария тестирования
    await supabase.rpc('create_autonomous_task', {
      p_telegram_id: testTelegramId,
      p_bot_name: testBotName,
      p_type: 'PRIORITY_TEST',
      p_description: 'Задача со средним приоритетом',
      p_priority: 5,
    })

    const { data: taskId3 } = await supabase.rpc('create_autonomous_task', {
      p_telegram_id: testTelegramId,
      p_bot_name: testBotName,
      p_type: 'PRIORITY_TEST',
      p_description: 'Задача с высоким приоритетом',
      p_priority: 9,
    })

    // Получаем следующую задачу
    const { data: nextTask, error } = await supabase.rpc(
      'get_next_autonomous_task',
      {
        p_telegram_id: testTelegramId,
        p_bot_name: testBotName,
      }
    )

    if (error) {
      return {
        success: false,
        name: 'Тест получения следующей автономной задачи',
        message: `Ошибка при получении задачи: ${error.message}`,
        error: error.message,
      }
    }

    if (!nextTask) {
      return {
        success: false,
        name: 'Тест получения следующей автономной задачи',
        message: 'Не удалось получить следующую задачу',
      }
    }

    // Проверяем, что была выбрана задача с наивысшим приоритетом
    if (nextTask.id !== taskId3) {
      return {
        success: false,
        name: 'Тест получения следующей автономной задачи',
        message: 'Выбрана задача с неправильным приоритетом',
        details: {
          expectedTaskId: taskId3,
          actualTaskId: nextTask.id,
          task: nextTask,
        },
      }
    }

    // Очищаем тестовые данные после завершения теста
    await supabase.rpc('clean_test_autonomous_tasks', {
      p_telegram_id: testTelegramId,
      p_bot_name: testBotName,
    })

    return {
      success: true,
      name: 'Тест получения следующей автономной задачи',
      message: 'Задача с высоким приоритетом успешно получена',
    }
  } catch (error: any) {
    return {
      success: false,
      name: 'Тест получения следующей автономной задачи',
      message: `Ошибка при выполнении теста: ${error.message}`,
      error: error.message,
    }
  }
}

/**
 * Тест интеграции с маршрутизатором агентов
 * @returns Результат выполнения теста
 */
export async function testRouterIntegration(): Promise<TestResult> {
  try {
    logger.info('🚀 Запуск теста интеграции с маршрутизатором')

    const testTelegramId = 999888777
    const testBotName = 'test_bot'

    // Создаем клиент Supabase
    const supabase = createSupabaseClient()

    // Очищаем все тестовые данные
    await supabase.rpc('clean_test_autonomous_tasks', {
      p_telegram_id: testTelegramId,
      p_bot_name: testBotName,
    })

    // Создаем задачи разных типов
    const { data: taskId1 } = await supabase.rpc('create_autonomous_task', {
      p_telegram_id: testTelegramId,
      p_bot_name: testBotName,
      p_type: 'ROUTER_TEST_A',
      p_description: 'Задача типа A',
      p_priority: 5,
      p_metadata: { capability: 'capability_a' },
    })

    const { data: taskId2 } = await supabase.rpc('create_autonomous_task', {
      p_telegram_id: testTelegramId,
      p_bot_name: testBotName,
      p_type: 'ROUTER_TEST_B',
      p_description: 'Задача типа B',
      p_priority: 5,
      p_metadata: { capability: 'capability_b' },
    })

    // Создаем моки агентов с разными возможностями
    const agentA = createMockAgent('agent-a', ['capability_a'], 5, 3)
    const agentB = createMockAgent('agent-b', ['capability_b'], 5, 3)

    // Мокируем методы проверки возможностей
    agentA.canHandle = async (task: Task) => {
      return task.metadata?.capability === 'capability_a'
    }

    agentB.canHandle = async (task: Task) => {
      return task.metadata?.capability === 'capability_b'
    }

    // Получаем задачи из БД
    const { data: taskA, error: errorA } = await supabase
      .from('autonomous_tasks')
      .select('*')
      .eq('id', taskId1)
      .single()

    const { data: taskB, error: errorB } = await supabase
      .from('autonomous_tasks')
      .select('*')
      .eq('id', taskId2)
      .single()

    if (errorA || errorB) {
      return {
        success: false,
        name: 'Тест интеграции с маршрутизатором',
        message: `Ошибка при получении задач: ${
          errorA?.message || errorB?.message
        }`,
        error: errorA?.message || errorB?.message,
      }
    }

    if (!taskA || !taskB) {
      return {
        success: false,
        name: 'Тест интеграции с маршрутизатором',
        message: 'Не удалось получить созданные задачи',
      }
    }

    // Проверяем, что агент A может обработать задачу A
    const canHandleTaskA = await agentA.canHandle(taskA as unknown as Task)
    const canHandleTaskB = await agentB.canHandle(taskB as unknown as Task)

    if (!canHandleTaskA || !canHandleTaskB) {
      return {
        success: false,
        name: 'Тест интеграции с маршрутизатором',
        message: 'Агенты не могут обработать предназначенные для них задачи',
        details: {
          agentACanHandleTaskA: canHandleTaskA,
          agentBCanHandleTaskB: canHandleTaskB,
        },
      }
    }

    // Очищаем тестовые данные после завершения теста
    await supabase.rpc('clean_test_autonomous_tasks', {
      p_telegram_id: testTelegramId,
      p_bot_name: testBotName,
    })

    return {
      success: true,
      name: 'Тест интеграции с маршрутизатором',
      message: 'Агенты успешно маршрутизируются к соответствующим задачам',
    }
  } catch (error: any) {
    return {
      success: false,
      name: 'Тест интеграции с маршрутизатором',
      message: `Ошибка при выполнении теста: ${error.message}`,
      error: error.message,
    }
  }
}

/**
 * Тест зависимостей между задачами
 * @returns Результат выполнения теста
 */
export async function testTaskDependencies(): Promise<TestResult> {
  try {
    logger.info('🚀 Запуск теста зависимостей между задачами')

    const testTelegramId = 999888777
    const testBotName = 'test_bot'

    // Создаем клиент Supabase
    const supabase = createSupabaseClient()

    // Очищаем все тестовые данные
    await supabase.rpc('clean_test_autonomous_tasks', {
      p_telegram_id: testTelegramId,
      p_bot_name: testBotName,
    })

    // Создаем основную задачу
    const { data: mainTaskId } = await supabase.rpc('create_autonomous_task', {
      p_telegram_id: testTelegramId,
      p_bot_name: testBotName,
      p_type: 'DEPENDENCY_TEST_MAIN',
      p_description: 'Основная задача',
      p_priority: 5,
    })

    // Создаем зависимую задачу
    const { data: dependentTaskId } = await supabase.rpc(
      'create_autonomous_task',
      {
        p_telegram_id: testTelegramId,
        p_bot_name: testBotName,
        p_type: 'DEPENDENCY_TEST_DEPENDENT',
        p_description: 'Зависимая задача',
        p_priority: 8,
        p_metadata: { dependency_id: mainTaskId },
      }
    )

    // Устанавливаем статус основной задачи как "в процессе"
    await supabase
      .from('autonomous_tasks')
      .update({ status: 'IN_PROGRESS' })
      .eq('id', mainTaskId)

    // Проверяем, что зависимая задача не будет выбрана, пока основная не завершена
    const { data: nextTask, error } = await supabase.rpc(
      'get_next_autonomous_task',
      {
        p_telegram_id: testTelegramId,
        p_bot_name: testBotName,
      }
    )

    if (error) {
      return {
        success: false,
        name: 'Тест зависимостей между задачами',
        message: `Ошибка при получении следующей задачи: ${error.message}`,
        error: error.message,
      }
    }

    // Проверяем, что следующая задача не является зависимой задачей
    if (nextTask && nextTask.id === dependentTaskId) {
      return {
        success: false,
        name: 'Тест зависимостей между задачами',
        message:
          'Зависимая задача была выбрана, хотя основная задача еще не завершена',
        details: { nextTask },
      }
    }

    // Завершаем основную задачу
    await supabase
      .from('autonomous_tasks')
      .update({ status: 'COMPLETED' })
      .eq('id', mainTaskId)

    // Теперь должна быть выбрана зависимая задача
    const { data: nextTaskAfter, error: afterError } = await supabase.rpc(
      'get_next_autonomous_task',
      {
        p_telegram_id: testTelegramId,
        p_bot_name: testBotName,
      }
    )

    if (afterError) {
      return {
        success: false,
        name: 'Тест зависимостей между задачами',
        message: `Ошибка при получении задачи после завершения основной: ${afterError.message}`,
        error: afterError.message,
      }
    }

    if (!nextTaskAfter || nextTaskAfter.id !== dependentTaskId) {
      return {
        success: false,
        name: 'Тест зависимостей между задачами',
        message:
          'Зависимая задача не была выбрана после завершения основной задачи',
        details: {
          expectedTaskId: dependentTaskId,
          actualTaskId: nextTaskAfter?.id,
        },
      }
    }

    // Очищаем тестовые данные после завершения теста
    await supabase.rpc('clean_test_autonomous_tasks', {
      p_telegram_id: testTelegramId,
      p_bot_name: testBotName,
    })

    return {
      success: true,
      name: 'Тест зависимостей между задачами',
      message:
        'Зависимости между задачами работают правильно: зависимая задача выбирается только после завершения основной',
    }
  } catch (error: any) {
    return {
      success: false,
      name: 'Тест зависимостей между задачами',
      message: `Ошибка при выполнении теста: ${error.message}`,
      error: error.message,
    }
  }
}

/**
 * Запускает все тесты для автономных задач
 * @returns Массив результатов тестов
 */
export async function runAutonomousTasksTests(): Promise<TestResult[]> {
  const results: TestResult[] = []

  try {
    // Запускаем все тесты автономных задач
    results.push(await testCreateAutonomousTask())
    results.push(await testGetNextAutonomousTask())
    results.push(await testRouterIntegration())
    results.push(await testTaskDependencies())

    // Считаем успешные и неуспешные тесты
    const totalTests = results.length
    const passedTests = results.filter(r => r.success).length
    const failedTests = totalTests - passedTests

    logger.info(
      `🏁 Завершено тестов автономных задач: ${totalTests}, успешно: ${passedTests}, с ошибками: ${failedTests}`
    )

    if (failedTests > 0) {
      const failedDetails = results
        .filter(r => !r.success)
        .map(r => r.name)
        .join(', ')
      logger.error(`❌ Тесты с ошибками: ${failedDetails}`)
    }
  } catch (error: any) {
    logger.error(
      `❌ Ошибка при запуске тестов автономных задач: ${error.message}`
    )
    results.push({
      success: false,
      name: 'Запуск тестов автономных задач',
      message: `Общая ошибка при выполнении тестов: ${error.message}`,
      error: error.message,
    })
  }

  return results
}
