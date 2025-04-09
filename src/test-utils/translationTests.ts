import { TestResult } from '@/types/test.interface'
import { supabase } from '@/core/supabase'
import { ModeEnum } from '@/types/modes'
import { logger } from '@/utils/logger'

const REQUIRED_LANGUAGES = ['ru', 'en']
const REQUIRED_BOTS = [
  'neuro_blogger_bot',
  'clip_maker_neuro_bot',
  'ai_koshey_bot',
  'Gaia_Kamskaia_bot',
  'LeeSolarbot',
  'MetaMuse_Manifest_bot',
  'NeuroLenaAssistant_bot',
  'NeurostylistShtogrina_bot',
  'ZavaraBot',
]

// Все ключи, которые используются в приложении
const REQUIRED_TRANSLATION_KEYS = [
  // Общие ключи
  'help',
  'start',
  'cancel',
  'error',
  'success',

  // Системные ключи
  'maintenance',
  'rate_limit',
  'subscription_required',

  // Ключи для сцен и режимов
  'subscriptionScene',
  'digitalAvatar',
  'chat_with_avatar_start',
  'avatar_brain_description',
  'avatar_voice_description',
  'avatar_model_description',
  'avatar_greeting',
  'avatar_help',

  // Ключи из ModeEnum
  ModeEnum.Subscribe,
  ModeEnum.DigitalAvatarBody,
  ModeEnum.NeuroPhoto,
  ModeEnum.ImageToPrompt,
  ModeEnum.Avatar,
  ModeEnum.ChatWithAvatar,
  ModeEnum.SelectModel,
  ModeEnum.Voice,
  ModeEnum.TextToSpeech,
  ModeEnum.ImageToVideo,
  ModeEnum.TextToVideo,
  ModeEnum.TextToImage,
]

interface MissingTranslation {
  bot: string
  key: string
  language: string
}

export async function checkTranslations(): Promise<TestResult> {
  const missingTranslations: MissingTranslation[] = []
  let totalChecked = 0

  try {
    logger.info('🔍 Starting translation check', {
      requiredKeys: REQUIRED_TRANSLATION_KEYS.length,
      requiredLanguages: REQUIRED_LANGUAGES.length,
      requiredBots: REQUIRED_BOTS.length,
    })

    // Получаем все существующие переводы
    const { data: existingTranslations, error } = await supabase
      .from('translations')
      .select('*')

    if (error) {
      throw new Error(`Failed to fetch translations: ${error.message}`)
    }

    // Получаем информацию об аватарах
    const { data: avatars, error: avatarsError } = await supabase
      .from('avatars')
      .select('bot_name, name, description, personality')

    if (avatarsError) {
      throw new Error(`Failed to fetch avatars: ${avatarsError.message}`)
    }

    // Проверяем наличие всех необходимых переводов
    for (const bot of REQUIRED_BOTS) {
      // Проверяем базовые переводы
      for (const key of REQUIRED_TRANSLATION_KEYS) {
        for (const lang of REQUIRED_LANGUAGES) {
          totalChecked++

          // Проверяем наличие перевода
          const hasTranslation = existingTranslations?.some(
            t => t.bot_name === bot && t.key === key && t.language_code === lang
          )

          if (!hasTranslation) {
            // Если перевод отсутствует в текущем боте, проверяем наличие в neuro_blogger_bot
            const hasDefaultTranslation =
              bot !== 'neuro_blogger_bot' &&
              existingTranslations?.some(
                t =>
                  t.bot_name === 'neuro_blogger_bot' &&
                  t.key === key &&
                  t.language_code === lang
              )

            if (!hasDefaultTranslation) {
              missingTranslations.push({
                bot,
                key,
                language: lang,
              })
            }
          }
        }
      }

      // Проверяем специфичные для аватара переводы
      const avatar = avatars?.find(a => a.bot_name === bot)
      if (avatar) {
        // Проверяем наличие основной информации об аватаре
        const avatarKeys = [
          'name',
          'description',
          'personality',
          'greeting',
          'help_message',
        ]

        for (const key of avatarKeys) {
          for (const lang of REQUIRED_LANGUAGES) {
            totalChecked++

            const hasTranslation = existingTranslations?.some(
              t =>
                t.bot_name === bot &&
                t.key === `avatar_${key}` &&
                t.language_code === lang
            )

            if (!hasTranslation) {
              missingTranslations.push({
                bot,
                key: `avatar_${key}`,
                language: lang,
              })
            }
          }
        }
      }
    }

    // Логируем результаты
    logger.info('✅ Translation check completed', {
      totalChecked,
      missingCount: missingTranslations.length,
    })

    if (missingTranslations.length > 0) {
      logger.warn('❌ Missing translations detected', {
        count: missingTranslations.length,
        missing: missingTranslations,
      })

      // Группируем отсутствующие переводы по ботам для лучшей читаемости
      const groupedMissing = missingTranslations.reduce(
        (acc, curr) => {
          const key = curr.bot
          if (!acc[key]) {
            acc[key] = []
          }
          acc[key].push(`${curr.key} (${curr.language})`)
          return acc
        },
        {} as Record<string, string[]>
      )

      let detailedMessage = 'Missing translations:\n\n'
      for (const [bot, missing] of Object.entries(groupedMissing)) {
        detailedMessage += `🤖 ${bot}:\n${missing.map(m => `  - ${m}`).join('\n')}\n\n`
      }

      return {
        success: false,
        message: detailedMessage,
        name: 'Translation Check',
      }
    }

    return {
      success: true,
      message: `Successfully checked ${totalChecked} translations. All required translations are present.`,
      name: 'Translation Check',
    }
  } catch (error) {
    logger.error('❌ Translation check failed', {
      error: error instanceof Error ? error.message : String(error),
    })

    return {
      success: false,
      message: `Test failed: ${error instanceof Error ? error.message : String(error)}`,
      name: 'Translation Check',
    }
  }
}
