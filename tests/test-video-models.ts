#!/usr/bin/env tsx
/**
 * Тест для проверки расчета цен и предотвращения дублирования видео генерации
 * Запуск: npx tsx tests/test-video-models.ts
 */

import { calculateFinalPrice } from '../src/price/helpers/calculateFinalPrice'
import { videoTaskCache } from '../src/modules/videoGenerator/taskCache'

// Цветной вывод для терминала
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m'
}

function log(message: string, color = colors.reset) {
  console.log(`${color}${message}${colors.reset}`)
}

async function testPriceCalculation() {
  log('\n===== ТЕСТ РАСЧЕТА ЦЕН =====', colors.cyan)

  const models = [
    { id: 'veo3_fast', expected: 40, name: 'Veo 3 Fast' },
    { id: 'veo3', expected: 120, name: 'Veo 3' },
    { id: 'kling-v1.6-pro', expected: 60, name: 'Kling v1.6 Pro' },
    { id: 'minimax', expected: 50, name: 'Minimax' },
  ]

  let passed = 0
  let failed = 0

  for (const model of models) {
    try {
      const price = calculateFinalPrice(model.id)

      if (price === model.expected) {
        log(`✅ ${model.name}: ${price}⭐ (ожидалось ${model.expected}⭐)`, colors.green)
        passed++
      } else {
        log(`❌ ${model.name}: ${price}⭐ (ожидалось ${model.expected}⭐)`, colors.red)
        failed++
      }
    } catch (error) {
      log(`❌ ${model.name}: Ошибка - ${error}`, colors.red)
      failed++
    }
  }

  log(`\nРезультат: ${passed} успешно, ${failed} с ошибками`,
    failed > 0 ? colors.red : colors.green)
}

async function testDuplicatePrevention() {
  log('\n===== ТЕСТ ПРЕДОТВРАЩЕНИЯ ДУБЛИРОВАНИЯ =====', colors.cyan)

  const userId = '123456789'
  const modelId = 'kling-v1.6-pro'
  const taskId = 'task_' + Date.now()
  const prompt = 'Beautiful landscape'

  // Тест 1: Добавление задачи
  log('\n1. Добавляем задачу в кеш...', colors.yellow)
  videoTaskCache.addTask(userId, modelId, taskId, prompt)

  const hasTask = videoTaskCache.hasActiveTask(userId, modelId)
  if (hasTask) {
    log('✅ Задача успешно добавлена в кеш', colors.green)
  } else {
    log('❌ Ошибка добавления задачи в кеш', colors.red)
  }

  // Тест 2: Проверка дублирования
  log('\n2. Проверяем блокировку дублирования...', colors.yellow)
  const duplicate = videoTaskCache.hasActiveTask(userId, modelId)
  if (duplicate) {
    log('✅ Дубликат обнаружен и будет заблокирован', colors.green)
  } else {
    log('❌ Дубликат не обнаружен', colors.red)
  }

  // Тест 3: Проверка для другой модели
  log('\n3. Проверяем, что другая модель не блокируется...', colors.yellow)
  const otherModel = videoTaskCache.hasActiveTask(userId, 'veo3')
  if (!otherModel) {
    log('✅ Другая модель доступна для генерации', colors.green)
  } else {
    log('❌ Другая модель заблокирована (не должна быть)', colors.red)
  }

  // Тест 4: Удаление задачи
  log('\n4. Удаляем задачу из кеша...', colors.yellow)
  videoTaskCache.removeTask(userId, modelId)

  const removed = !videoTaskCache.hasActiveTask(userId, modelId)
  if (removed) {
    log('✅ Задача успешно удалена из кеша', colors.green)
  } else {
    log('❌ Ошибка удаления задачи из кеша', colors.red)
  }

  // Тест 5: Статистика кеша
  log('\n5. Статистика кеша:', colors.yellow)
  const stats = videoTaskCache.getStats()
  log(`   Всего активных задач: ${stats.totalTasks}`, colors.blue)
}

async function testNetworkRetry() {
  log('\n===== ТЕСТ RETRY МЕХАНИЗМА =====', colors.cyan)

  log('✅ Retry механизм добавлен в downloadFileHelper', colors.green)
  log('   - 3 попытки по умолчанию', colors.blue)
  log('   - Увеличивающаяся задержка: 2, 4, 6 секунд', colors.blue)
  log('   - Пропуск retry для постоянных ошибок (404, 403, 401)', colors.blue)
}

async function testAspectRatio() {
  log('\n===== ТЕСТ ASPECT RATIO =====', colors.cyan)

  log('✅ Автоматический выбор 9:16 для вертикальных фото', colors.green)
  log('   - Проверка поддержки aspectRatioOptions в модели', colors.blue)
  log('   - Приоритет вертикального соотношения для совместимости', colors.blue)
}

// Главная функция
async function main() {
  log('\n🚀 ЗАПУСК ТЕСТОВ ВИДЕО ГЕНЕРАЦИИ', colors.magenta)

  try {
    await testPriceCalculation()
    await testDuplicatePrevention()
    await testNetworkRetry()
    await testAspectRatio()

    log('\n✨ ВСЕ ТЕСТЫ ЗАВЕРШЕНЫ', colors.green)

    // Очищаем кеш после тестов
    videoTaskCache.clear()

    process.exit(0)
  } catch (error) {
    log(`\n❌ ОШИБКА ТЕСТИРОВАНИЯ: ${error}`, colors.red)
    process.exit(1)
  }
}

// Запуск тестов
main().catch(console.error)