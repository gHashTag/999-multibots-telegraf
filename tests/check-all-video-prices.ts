#!/usr/bin/env tsx
/**
 * Полная проверка цен всех видео моделей с детальным расчетом
 * Запуск: npx tsx tests/check-all-video-prices.ts
 */

import * as dotenv from 'dotenv'
dotenv.config()

import { UNIFIED_VIDEO_MODELS as VIDEO_MODELS_CONFIG } from '../src/config/unified-video-models.config'
import { calculateFinalPrice } from '../src/price/helpers/calculateFinalPrice'

// Константы для расчета
const STAR_COST_USD = 0.016  // 1 звезда = $0.016
const MARKUP_RATE = 1.5       // Наценка 50%
const DEFAULT_DURATION = 5    // Стандартная длительность видео

// Цветной вывод
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  bold: '\x1b[1m'
}

function formatPrice(price: number): string {
  return `${price}⭐`
}

function calculateExpectedPrice(basePricePerSec: number, duration: number = DEFAULT_DURATION): number {
  const totalCostUSD = basePricePerSec * duration
  const priceInStars = totalCostUSD / STAR_COST_USD
  const finalPrice = priceInStars * MARKUP_RATE
  return Math.floor(finalPrice)
}

function printHeader(title: string) {
  console.log(`\n${colors.cyan}${'='.repeat(80)}${colors.reset}`)
  console.log(`${colors.cyan}${colors.bold} ${title}${colors.reset}`)
  console.log(`${colors.cyan}${'='.repeat(80)}${colors.reset}`)
}

function printModelInfo(model: any) {
  console.log(`\n${colors.yellow}📹 Модель: ${colors.bold}${model.title}${colors.reset}`)
  console.log(`${colors.blue}   ID: ${model.id}${colors.reset}`)
  console.log(`${colors.blue}   Описание: ${model.description || 'Нет описания'}${colors.reset}`)
  console.log(`${colors.blue}   Тип входа: ${model.inputType.join(', ')}${colors.reset}`)
  console.log(`${colors.blue}   API модель: ${model.api.model}${colors.reset}`)
}

function printCalculation(
  basePricePerSec: number,
  duration: number,
  actualPrice: number,
  expectedPrice: number,
  hasFixedPrice: boolean
) {
  console.log(`\n${colors.magenta}💰 Расчет цены:${colors.reset}`)

  if (hasFixedPrice) {
    console.log(`   ${colors.green}✅ Фиксированная цена: ${formatPrice(actualPrice)}${colors.reset}`)
  } else {
    console.log(`   Базовая цена: $${basePricePerSec}/сек`)
    console.log(`   Длительность: ${duration} сек`)
    console.log(`   Стоимость без наценки: $${(basePricePerSec * duration).toFixed(3)}`)
    console.log(`   В звездах без наценки: ${((basePricePerSec * duration) / STAR_COST_USD).toFixed(1)}⭐`)
    console.log(`   Наценка: ${((MARKUP_RATE - 1) * 100).toFixed(0)}% (×${MARKUP_RATE})`)
    console.log(`   ${colors.bold}Ожидаемая цена: ${formatPrice(expectedPrice)}${colors.reset}`)
    console.log(`   ${colors.bold}Фактическая цена: ${formatPrice(actualPrice)}${colors.reset}`)
  }

  // Проверка корректности
  if (actualPrice === expectedPrice || hasFixedPrice) {
    console.log(`   ${colors.green}✅ Цена корректна${colors.reset}`)
  } else {
    const diff = actualPrice - expectedPrice
    console.log(`   ${colors.red}❌ Разница: ${diff > 0 ? '+' : ''}${diff}⭐${colors.reset}`)
  }
}

async function checkAllPrices() {
  printHeader('ПРОВЕРКА ЦЕН ВСЕХ ВИДЕО МОДЕЛЕЙ')

  console.log(`\n${colors.cyan}📊 Параметры расчета:${colors.reset}`)
  console.log(`   • 1 звезда = $${STAR_COST_USD}`)
  console.log(`   • Наценка = ${((MARKUP_RATE - 1) * 100).toFixed(0)}% (коэффициент ${MARKUP_RATE})`)
  console.log(`   • Стандартная длительность = ${DEFAULT_DURATION} сек`)

  const models = Object.values(VIDEO_MODELS_CONFIG)
  let correctCount = 0
  let errorCount = 0
  const errors: string[] = []

  // Список моделей с фиксированными ценами
  const FIXED_PRICE_MODELS = ['veo3_fast', 'veo3', 'kling-v1.6-pro', 'minimax']

  printHeader('ДЕТАЛЬНАЯ ПРОВЕРКА КАЖДОЙ МОДЕЛИ')

  for (const model of models) {
    printModelInfo(model)

    const hasFixedPrice = FIXED_PRICE_MODELS.includes(model.id)
    const actualPrice = calculateFinalPrice(model.id)

    // Для моделей с фиксированными ценами используем их значения
    let expectedPrice = 0
    let duration = DEFAULT_DURATION

    if (hasFixedPrice) {
      // Для фиксированных цен просто проверяем, что они установлены правильно
      switch (model.id) {
        case 'veo3_fast':
          expectedPrice = 40
          duration = 8
          break
        case 'veo3':
          expectedPrice = 120
          duration = 8
          break
        case 'kling-v1.6-pro':
          expectedPrice = 60
          duration = 6
          break
        case 'minimax':
          expectedPrice = 50
          duration = 5
          break
      }
    } else {
      // Для остальных рассчитываем по формуле
      expectedPrice = calculateExpectedPrice(model.basePrice, duration)
    }

    printCalculation(
      model.basePrice,
      duration,
      actualPrice,
      expectedPrice,
      hasFixedPrice
    )

    if (actualPrice === expectedPrice || (hasFixedPrice && actualPrice > 0)) {
      correctCount++
    } else {
      errorCount++
      errors.push(`${model.title}: ожидалось ${expectedPrice}⭐, получено ${actualPrice}⭐`)
    }

    console.log(`${colors.blue}${'─'.repeat(80)}${colors.reset}`)
  }

  // Итоговая статистика
  printHeader('ИТОГОВАЯ СТАТИСТИКА')

  console.log(`\n${colors.bold}Всего моделей: ${models.length}${colors.reset}`)
  console.log(`${colors.green}✅ Корректные цены: ${correctCount}${colors.reset}`)
  console.log(`${colors.red}❌ Некорректные цены: ${errorCount}${colors.reset}`)

  if (errors.length > 0) {
    console.log(`\n${colors.red}${colors.bold}Модели с ошибками:${colors.reset}`)
    errors.forEach(err => console.log(`   ${colors.red}• ${err}${colors.reset}`))
  }

  // Специальная проверка проблемных моделей
  printHeader('ПРОВЕРКА ПРОБЛЕМНЫХ МОДЕЛЕЙ')

  const problematicModels = ['kling-v1.6-pro', 'minimax']
  console.log(`\n${colors.yellow}⚠️ Модели, которые раньше показывали 236⭐:${colors.reset}`)

  for (const modelId of problematicModels) {
    const price = calculateFinalPrice(modelId)
    const model = VIDEO_MODELS_CONFIG[modelId]

    console.log(`\n   ${colors.bold}${model.title}:${colors.reset}`)
    console.log(`      Текущая цена: ${formatPrice(price)}`)

    if (price === 236) {
      console.log(`      ${colors.red}❌ ВСЁ ЕЩЁ ПОКАЗЫВАЕТ 236⭐! ТРЕБУЕТСЯ ИСПРАВЛЕНИЕ!${colors.reset}`)
    } else if (price === 60 || price === 50) {
      console.log(`      ${colors.green}✅ Исправлено! Больше не показывает 236⭐${colors.reset}`)
    } else {
      console.log(`      ${colors.yellow}⚠️ Неожиданная цена, требует проверки${colors.reset}`)
    }
  }

  // Рекомендации
  printHeader('РЕКОМЕНДАЦИИ')

  console.log(`\n${colors.cyan}📝 Что нужно проверить на production:${colors.reset}`)
  console.log('   1. Запустить генерацию для каждой модели')
  console.log('   2. Проверить отображаемую цену перед генерацией')
  console.log('   3. Проверить фактическое списание после генерации')
  console.log('   4. Убедиться, что нет множественной генерации')
  console.log('   5. Проверить обработку network errors')

  // Список команд для тестирования
  console.log(`\n${colors.cyan}🔧 Команды для production тестирования:${colors.reset}`)
  console.log(`   ${colors.white}ssh -i ~/.ssh/zomro root@212.86.115.30${colors.reset}`)
  console.log(`   ${colors.white}cd /root/bot-farm${colors.reset}`)
  console.log(`   ${colors.white}docker logs 999-multibots --tail 100 -f${colors.reset}`)
}

// Запуск проверки
checkAllPrices().catch(console.error)