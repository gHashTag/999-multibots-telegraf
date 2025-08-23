import { InlineKeyboardMarkup } from 'telegraf/typings/core/types/typegram'
import {
  getAvailableLipSyncModels,
  getSortedLipSyncModels,
  calculateLipSyncCost,
} from '@/config/lipsync-models.config'

/**
 * Создает клавиатуру для выбора модели lip-sync
 */
export function createLipSyncModelKeyboard(): InlineKeyboardMarkup {
  const models = getSortedLipSyncModels()

  const buttons = models.map(model => {
    // Рассчитываем стоимость для 10 секунд (примерная длительность)
    const cost10s = calculateLipSyncCost(model.id, 10)
    const costText = `$${cost10s.toFixed(3)}/10с`

    // Иконки для качества
    const qualityIcon = {
      standard: '⚡',
      high: '🚀',
      premium: '⭐',
    }[model.quality]

    return [
      {
        text: `${qualityIcon} ${
          model.name
        }\n💰 ${costText} | 🎯 ${model.quality.toUpperCase()}`,
        callback_data: `lip_sync_model_${model.id}`,
      },
    ]
  })

  // Добавляем кнопку "Назад"
  buttons.push([
    {
      text: '◀️ Назад в меню',
      callback_data: 'back_to_menu',
    },
  ])

  return {
    inline_keyboard: buttons,
  }
}

/**
 * Создает информационное сообщение о моделях
 */
export function createLipSyncModelsInfo(): string {
  const models = getSortedLipSyncModels()

  let message = '🎭 **Выберите модель для Lip-Sync:**\n\n'

  models.forEach((model, index) => {
    const cost10s = calculateLipSyncCost(model.id, 10)
    const qualityIcon = {
      standard: '⚡',
      high: '🚀',
      premium: '⭐',
    }[model.quality]

    message += `${qualityIcon} **${model.name}**\n`
    message += `📝 ${model.description}\n`
    message += `💰 $${cost10s.toFixed(3)} за 10 секунд\n`
    message += `⏱️ Макс. длительность: ${model.maxDuration}с\n`

    if (model.features.length > 0) {
      message += `✨ Особенности:\n`
      model.features.forEach(feature => {
        message += `   • ${feature}\n`
      })
    }

    if (index < models.length - 1) {
      message += '\n' + '─'.repeat(30) + '\n\n'
    }
  })

  message +=
    '\n💡 **Совет:** Kling модель отлично подходит для большинства задач по доступной цене, а Sync LipSync-2 обеспечивает премиум качество для профессиональных проектов.'

  return message
}

/**
 * Создает краткое описание выбранной модели
 */
export function createSelectedModelInfo(modelId: string): string {
  const models = getAvailableLipSyncModels()
  const model = models.find(m => m.id === modelId)

  if (!model) {
    return '❌ Модель не найдена'
  }

  const cost10s = calculateLipSyncCost(model.id, 10)
  const qualityIcon = {
    standard: '⚡',
    high: '🚀',
    premium: '⭐',
  }[model.quality]

  return (
    `${qualityIcon} **Выбрана модель: ${model.name}**\n\n` +
    `📝 ${model.description}\n\n` +
    `💰 Стоимость: $${cost10s.toFixed(3)} за 10 секунд\n` +
    `⏱️ Максимальная длительность: ${model.maxDuration} секунд\n` +
    `🏭 Провайдер: ${model.provider.toUpperCase()}\n\n` +
    `🎬 Теперь загрузите видео с лицом для обработки!`
  )
}
