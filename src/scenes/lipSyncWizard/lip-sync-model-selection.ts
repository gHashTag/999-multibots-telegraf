import { Scenes, Markup } from 'telegraf'
import { MyContext } from '../../interfaces'
import { isRussianFromState } from '@/helpers/centralizedLanguage'
import {
  getAvailableLipSyncModels,
  LipSyncModelConfig,
} from '@/config/lipsync-models.config'
import { logger } from '@/utils/logger'
import { showMainMenu } from '@/navigation'

/**
 * 🎤 LIP SYNC MODEL SELECTION SCENE
 *
 * Показывает доступные модели для lip sync:
 * - Veed Fabric (kie.ai) - image + text
 * - Fal.ai Veed Fabric - image + audio/text
 * - LatentSync (ByteDance) - video + audio
 * - Hummingbird-0 (Tavus) - video + audio (premium)
 */
export const lipSyncModelSelectionScene = new Scenes.BaseScene<MyContext>(
  'lip_sync_model_selection'
)

/**
 * Формирует текст описания модели для пользователя
 */
function formatModelDescription(
  model: LipSyncModelConfig,
  isRu: boolean
): string {
  const qualityMap = {
    standard: isRu ? 'Стандартное' : 'Standard',
    high: isRu ? 'Высокое' : 'High',
    premium: isRu ? 'Премиум' : 'Premium',
  }

  const quality = qualityMap[model.quality] || model.quality
  const duration =
    model.maxDuration >= 60
      ? `${Math.floor(model.maxDuration / 60)} ${isRu ? 'мин' : 'min'}`
      : `${model.maxDuration} ${isRu ? 'сек' : 'sec'}`

  return isRu
    ? `${model.description}\n\n` +
        `⭐ Качество: ${quality}\n` +
        `⏱️ Макс. длительность: ${duration}\n` +
        `💰 ~${getStarsPerSecond(model)}⭐/сек`
    : `${model.description}\n\n` +
        `⭐ Quality: ${quality}\n` +
        `⏱️ Max duration: ${duration}\n` +
        `💰 ~${getStarsPerSecond(model)}⭐/sec`
}

/**
 * Возвращает примерную стоимость в звездах за секунду
 */
function getStarsPerSecond(model: LipSyncModelConfig): number {
  // Специфичные модели с известными ценами
  switch (model.id) {
    case 'veed_fabric':
      return 14 // 720p качество
    case 'fal_veed_fabric':
      return 10 // 480p (базовое), 19 для 720p
    case 'latentsync':
      return 3 // экономичная
    case 'hummingbird':
      return 22 // премиум
  }

  // Используем данные из конфига или рассчитываем
  if (model.costPerSecondStars480p) {
    return Math.round(model.costPerSecondStars480p)
  }
  // Приблизительный расчёт: costPerSecond USD → stars
  // 1 star ≈ $0.016, наценка 1.5x
  const starsPerSecond = (model.costPerSecond * 1.5) / 0.016
  return Math.round(starsPerSecond)
}

/**
 * Возвращает тип входных данных для модели
 */
function getInputType(model: LipSyncModelConfig, isRu: boolean): string {
  // LatentSync и Hummingbird требуют VIDEO + AUDIO
  if (model.id === 'latentsync' || model.id === 'hummingbird') {
    return isRu ? '🎬 видео + 🎤 аудио' : '🎬 video + 🎤 audio'
  }
  // Veed модели работают с изображением
  return isRu ? '🖼 фото + 🎤 аудио' : '🖼 image + 🎤 audio'
}

/**
 * Создаёт клавиатуру с моделями (с ценами!)
 */
function createModelKeyboard(models: LipSyncModelConfig[], isRu: boolean) {
  const buttons = models.map(model => {
    const starsPerSec = getStarsPerSecond(model)
    const priceLabel = `${starsPerSec}⭐/сек`

    return [
      Markup.button.callback(
        `${model.name} — ${priceLabel}`,
        `lip_sync_model_${model.id}`
      ),
    ]
  })

  // Добавляем кнопку "Назад"
  buttons.push([
    Markup.button.callback(isRu ? '◀️ Назад' : '◀️ Back', 'go_back_to_menu'),
  ])

  return Markup.inlineKeyboard(buttons)
}

/**
 * При входе в сцену - показываем выбор моделей
 */
lipSyncModelSelectionScene.enter(async ctx => {
  const isRu = isRussianFromState(ctx)
  const telegramId = ctx.from?.id

  logger.info('🎤 [LIP SYNC SELECTION] Scene entered', {
    telegramId,
  })

  const availableModels = getAvailableLipSyncModels()

  if (availableModels.length === 0) {
    await ctx.reply(
      isRu
        ? '❌ Нет доступных моделей для lip sync'
        : '❌ No available lip sync models'
    )
    return ctx.scene.leave()
  }

  const headerText = isRu
    ? '🎤 *Синхронизация губ*\n\n' +
      'Выберите модель для генерации:\n\n' +
      availableModels
        .map((m, i) => {
          const starsPerSec = getStarsPerSecond(m)
          const inputType = getInputType(m, true)
          return (
            `*${i + 1}. ${m.name}*\n` +
            `💰 ${starsPerSec}⭐/сек • ${inputType}\n` +
            `${m.description}\n`
          )
        })
        .join('\n')
    : '🎤 *Lip Sync*\n\n' +
      'Select a model for generation:\n\n' +
      availableModels
        .map((m, i) => {
          const starsPerSec = getStarsPerSecond(m)
          const inputType = getInputType(m, false)
          return (
            `*${i + 1}. ${m.name}*\n` +
            `💰 ${starsPerSec}⭐/sec • ${inputType}\n` +
            `${m.description}\n`
          )
        })
        .join('\n')

  await ctx.reply(headerText, {
    parse_mode: 'Markdown',
    ...createModelKeyboard(availableModels, isRu),
  })
})

/**
 * Обработчик выбора модели - делегирует в registerCommands.ts
 * через callback lip_sync_model_{modelId}
 */
// Модели обрабатываются глобальным обработчиком lip_sync_model_* в registerCommands.ts

/**
 * Кнопка "Назад"
 */
lipSyncModelSelectionScene.action('go_back_to_menu', async ctx => {
  await ctx.answerCbQuery()
  const isRu = isRussianFromState(ctx)

  logger.info('🎤 [LIP SYNC SELECTION] Back to menu', {
    telegramId: ctx.from?.id,
  })

  await ctx.scene.leave()
  await showMainMenu(ctx)
})

/**
 * Текстовые команды
 */
lipSyncModelSelectionScene.hears(
  ['🏠 Главное меню', '🏠 Main menu', '/menu'],
  async ctx => {
    await ctx.scene.leave()
    await showMainMenu(ctx)
  }
)

export default lipSyncModelSelectionScene
