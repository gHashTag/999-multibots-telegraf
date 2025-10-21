/**
 * 🎬 AI REELS TEMPLATES
 *
 * Шаблоны для создания AI Reels с разными подходами:
 * 1. Template WAN25: Прямая синхронная генерация (быстро)
 * 2. Template Inngest: Асинхронная генерация через Inngest (надежно, с retry)
 */

import { MyContext } from '@/interfaces'
import { isRussianFromState } from '@/helpers/centralizedLanguage'
import { logger } from '@/utils/logger'

export enum AIReelsTemplate {
  WAN25 = 'wan25',
  INNGEST = 'inngest',
}

export interface AIReelsTemplateConfig {
  id: AIReelsTemplate
  name: {
    ru: string
    en: string
  }
  description: {
    ru: string
    en: string
  }
  features: {
    ru: string[]
    en: string[]
  }
  icon: string
  recommended?: boolean
}

/**
 * Конфигурация шаблонов AI Reels
 */
export const AI_REELS_TEMPLATES: Record<AIReelsTemplate, AIReelsTemplateConfig> = {
  [AIReelsTemplate.WAN25]: {
    id: AIReelsTemplate.WAN25,
    name: {
      ru: 'Шаблон 1',
      en: 'Template 1',
    },
    description: {
      ru: 'Создание AI Reels видео. Результат за 2-3 минуты.',
      en: 'AI Reels video creation. Result in 2-3 minutes.',
    },
    features: {
      ru: [
        '🎬 Lip-sync видео',
        '🎥 4 видео сцены',
        '🔗 Склеивание в единый ролик',
        '💰 Стоимость: 240 ⭐',
      ],
      en: [
        '🎬 Lip-sync video',
        '🎥 4 video scenes',
        '🔗 Merge into single reel',
        '💰 Cost: 240 ⭐',
      ],
    },
    icon: '1️⃣',
    recommended: true,
  },
  [AIReelsTemplate.INNGEST]: {
    id: AIReelsTemplate.INNGEST,
    name: {
      ru: 'Шаблон 2',
      en: 'Template 2',
    },
    description: {
      ru: 'Профессиональная обработка через Render Server.',
      en: 'Professional processing via Render Server.',
    },
    features: {
      ru: [
        '🎭 Hedra - качественная генерация',
        '🎬 HeyGen - премиум качество',
        '🎥 4 видео сцены VEO3 Fast',
        '💰 От 310 ⭐ (зависит от длины)',
        '⏱️ Цена: 240⭐ + 7⭐/сек lip-sync',
      ],
      en: [
        '🎭 Hedra - quality generation',
        '🎬 HeyGen - premium quality',
        '🎥 4 video scenes VEO3 Fast',
        '💰 From 310 ⭐ (depends on length)',
        '⏱️ Price: 240⭐ + 7⭐/sec lip-sync',
      ],
    },
    icon: '2️⃣',
  },
}

/**
 * Показывает выбор шаблона AI Reels
 */
export async function showTemplateSelection(ctx: MyContext): Promise<void> {
  const isRu = isRussianFromState(ctx)

  const message = isRu
    ? `🎬 <b>AI REELS - Выбор шаблона</b>\n\n` +
      `Выберите подход для создания вашего AI Reels:\n\n` +
      `${Object.values(AI_REELS_TEMPLATES)
        .map((template) => {
          const name = isRu ? template.name.ru : template.name.en
          const desc = isRu ? template.description.ru : template.description.en
          const features = (isRu ? template.features.ru : template.features.en).join('\n')
          const recommended = template.recommended ? ' ⭐' : ''
          return `${name}${recommended}\n${desc}\n\n${features}`
        })
        .join('\n\n━━━━━━━━━━━━━━━━━━━\n\n')}`
    : `🎬 <b>AI REELS - Template Selection</b>\n\n` +
      `Choose your AI Reels creation approach:\n\n` +
      `${Object.values(AI_REELS_TEMPLATES)
        .map((template) => {
          const name = isRu ? template.name.ru : template.name.en
          const desc = isRu ? template.description.ru : template.description.en
          const features = (isRu ? template.features.ru : template.features.en).join('\n')
          const recommended = template.recommended ? ' ⭐' : ''
          return `${name}${recommended}\n${desc}\n\n${features}`
        })
        .join('\n\n━━━━━━━━━━━━━━━━━━━\n\n')}`

  const { Markup } = await import('telegraf')

  await ctx.reply(message, {
    parse_mode: 'HTML',
    reply_markup: Markup.keyboard([
      [
        isRu ? '⚡ Быстрый (WAN 2.5)' : '⚡ Fast (WAN 2.5)',
        isRu ? '🔄 Надежный (Inngest)' : '🔄 Reliable (Inngest)',
      ],
      [isRu ? '🏠 Главное меню' : '🏠 Main menu'],
    ]).resize().reply_markup,
  })

  logger.info('🎬 [AI REELS TEMPLATES] Template selection shown', {
    telegramId: ctx.from?.id?.toString(),
  })
}

/**
 * Парсит выбор шаблона из текста сообщения
 */
export function parseTemplateSelection(text: string): AIReelsTemplate | null {
  const lowerText = text.toLowerCase()

  if (
    lowerText.includes('быстрый') ||
    lowerText.includes('fast') ||
    lowerText.includes('wan')
  ) {
    return AIReelsTemplate.WAN25
  }

  if (
    lowerText.includes('надежный') ||
    lowerText.includes('reliable') ||
    lowerText.includes('inngest')
  ) {
    return AIReelsTemplate.INNGEST
  }

  return null
}

/**
 * Получает конфигурацию шаблона
 */
export function getTemplateConfig(template: AIReelsTemplate): AIReelsTemplateConfig {
  return AI_REELS_TEMPLATES[template]
}

/**
 * Проверяет, доступен ли Inngest шаблон
 */
export function isInngestTemplateAvailable(): boolean {
  return !!process.env.BOT_INNGEST_EVENT_KEY && process.env.NODE_ENV === 'production'
}
