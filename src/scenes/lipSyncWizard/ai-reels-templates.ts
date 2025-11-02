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
  WAN25 = 'veo31', // Шаблон 1 - Простой Lip-sync
  INNGEST = 'inngest', // Шаблон 2
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
export const AI_REELS_TEMPLATES: Record<
  AIReelsTemplate,
  AIReelsTemplateConfig
> = {
  [AIReelsTemplate.WAN25]: {
    id: AIReelsTemplate.WAN25,
    name: {
      ru: 'Шаблон 1 (Простой Lip-sync)',
      en: 'Template 1 (Simple Lip-sync)',
    },
    description: {
      ru: 'Простое создание lip-sync видео. Быстро и доступно!',
      en: 'Simple lip-sync video creation. Fast and affordable!',
    },
    features: {
      ru: [
        '🎬 Lip-sync поверх вашего видео',
        '⚡ Быстрая генерация (1-2 мин)',
        '💰 Стоимость: 120 ⭐',
        '✨ Простое и понятное',
      ],
      en: [
        '🎬 Lip-sync on your video',
        '⚡ Fast generation (1-2 min)',
        '💰 Cost: 120 ⭐',
        '✨ Simple and clear',
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
        .map(template => {
          const name = isRu ? template.name.ru : template.name.en
          const desc = isRu ? template.description.ru : template.description.en
          const features = (
            isRu ? template.features.ru : template.features.en
          ).join('\n')
          const recommended = template.recommended ? ' ⭐' : ''
          return `${name}${recommended}\n${desc}\n\n${features}`
        })
        .join('\n\n━━━━━━━━━━━━━━━━━━━\n\n')}`
    : `🎬 <b>AI REELS - Template Selection</b>\n\n` +
      `Choose your AI Reels creation approach:\n\n` +
      `${Object.values(AI_REELS_TEMPLATES)
        .map(template => {
          const name = isRu ? template.name.ru : template.name.en
          const desc = isRu ? template.description.ru : template.description.en
          const features = (
            isRu ? template.features.ru : template.features.en
          ).join('\n')
          const recommended = template.recommended ? ' ⭐' : ''
          return `${name}${recommended}\n${desc}\n\n${features}`
        })
        .join('\n\n━━━━━━━━━━━━━━━━━━━\n\n')}`

  const { Markup } = await import('telegraf')

  await ctx.reply(message, {
    parse_mode: 'HTML',
    reply_markup: Markup.keyboard([
      [
        isRu ? '✨ Простой (Lip-sync)' : '✨ Simple (Lip-sync)',
        isRu ? '⚡ Полный (Veo 3.1)' : '⚡ Full (Veo 3.1)',
      ],
      [
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

  // Шаблон 1 (Simple Lip-sync)
  if (
    lowerText.includes('шаблон 1') ||
    lowerText.includes('template 1') ||
    lowerText.includes('простой') ||
    lowerText.includes('simple') ||
    lowerText.includes('полный') ||
    lowerText.includes('full') ||
    lowerText.includes('wan') ||
    lowerText.includes('veo') ||
    lowerText.includes('1️⃣')
  ) {
    return AIReelsTemplate.WAN25
  }

  // Шаблон 2 (Inngest)
  if (
    lowerText.includes('шаблон 2') ||
    lowerText.includes('template 2') ||
    lowerText.includes('надежный') ||
    lowerText.includes('reliable') ||
    lowerText.includes('inngest') ||
    lowerText.includes('2️⃣')
  ) {
    return AIReelsTemplate.INNGEST
  }

  return null
}

/**
 * Получает конфигурацию шаблона
 */
export function getTemplateConfig(
  template: AIReelsTemplate
): AIReelsTemplateConfig {
  return AI_REELS_TEMPLATES[template]
}

/**
 * Проверяет, доступен ли Inngest шаблон
 */
export function isInngestTemplateAvailable(): boolean {
  return (
    !!process.env.BOT_INNGEST_EVENT_KEY && process.env.NODE_ENV === 'production'
  )
}
