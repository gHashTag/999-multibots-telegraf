import { inngest } from '@/core/inngest/clients'
import {
  getUserByTelegramIdString,
  updateUserLevelPlusOne,
} from '@/core/supabase'
import { supabase } from '@/core/supabase'
import { createVoiceElevenLabs } from '@/core/elevenlabs/createVoiceElevenLabs'
import { errorMessage, errorMessageAdmin } from '@/helpers'
import { getBotByName } from '@/core/bot'
import { ModeEnum } from '@/price/helpers/modelsCost'
import { v4 as uuidv4 } from 'uuid'

interface CreateVoiceAvatarEvent {
  data: {
    fileUrl: string
    telegram_id: string
    username: string
    is_ru: boolean
    bot_name: string
  }
}

type VoiceResult =
  | { success: true; voiceId: string }
  | { success: false; error: Error }

export const createVoiceAvatarFunction = inngest.createFunction(
  {
    name: 'create-voice-avatar',
    id: 'voice-avatar-creation',
    concurrency: { limit: 2 },
    retries: 2,
  },
  { event: 'voice-avatar.requested' },
  async ({ event, step }: any) => {
    let validatedParams: CreateVoiceAvatarEvent['data'] | null = null
    try {
      validatedParams = (await step.run('validate-input', () => {
        if (
          !event.data ||
          !event.data.fileUrl ||
          !event.data.telegram_id ||
          !event.data.username ||
          event.data.is_ru === undefined ||
          !event.data.bot_name
        ) {
          throw new Error('Missing required fields')
        }

        const validData: CreateVoiceAvatarEvent['data'] = {
          fileUrl: event.data.fileUrl,
          telegram_id: event.data.telegram_id,
          username: event.data.username,
          is_ru: event.data.is_ru,
          bot_name: event.data.bot_name,
        }

        return validData
      })) as CreateVoiceAvatarEvent['data']

      await step.run('get-user-info', async () => {
        const user = await getUserByTelegramIdString(
          validatedParams.telegram_id
        )
        if (!user) throw new Error('User not found')
        // Проверяем уровень пользователя для повышения
        if (user.level === 6) {
          await updateUserLevelPlusOne(user.telegram_id, user.level)
        }
        return user
      })

      // Обработка платежа с помощью PaymentProcessor
      await step.run('process-payment', async () => {
        console.log('💰 Обработка платежа за голосовой аватар:', {
          description: 'Processing payment for voice avatar',
          telegram_id: validatedParams.telegram_id,
          username: validatedParams.username,
        })

        // Отправляем событие payment/process для обработки платежа
        return await inngest.send({
          id: `payment-${validatedParams.telegram_id}-${Date.now()}-${
            ModeEnum.Voice
          }-${uuidv4()}`,
          name: 'payment/process',
          data: {
            telegram_id: validatedParams.telegram_id,
            mode: ModeEnum.Voice,
            is_ru: validatedParams.is_ru,
            bot_name: validatedParams.bot_name,
            description: `Payment for voice avatar creation`,
            type: 'outcome',
            metadata: {
              service_type: ModeEnum.Voice,
              voice_name: validatedParams.username,
            },
          },
        })
      })

      // Отправляем уведомление о начале создания голоса
      await step.run('send-start-notification', async () => {
        const { bot } = getBotByName(validatedParams.bot_name)

        await bot.telegram.sendMessage(
          validatedParams.telegram_id,
          validatedParams.is_ru
            ? '⏳ Создаю голосовой аватар...'
            : '⏳ Creating voice avatar...'
        )

        return { sent: true }
      })

      // Создаем голосовой аватар с использованием ElevenLabs API
      const voiceResult = (await step.run('create-voice', async () => {
        try {
          console.log('📣 Создание голосового аватара:', {
            description: 'Creating voice avatar',
            fileUrl: validatedParams.fileUrl,
            telegram_id: validatedParams.telegram_id,
            username: validatedParams.username,
          })

          const voiceId = await createVoiceElevenLabs({
            fileUrl: validatedParams.fileUrl,
            username: validatedParams.username,
          })

          if (!voiceId) {
            throw new Error('Voice ID not received from ElevenLabs API')
          }

          return {
            success: true as const,
            voiceId,
          }
        } catch (error) {
          console.error('🔥 Ошибка при создании голосового аватара:', {
            description: 'Error creating voice avatar',
            error: JSON.stringify(error, Object.getOwnPropertyNames(error)),
            stack: error instanceof Error ? error.stack : undefined,
          })

          return {
            success: false as const,
            error:
              error instanceof Error ? error : new Error(JSON.stringify(error)),
          }
        }
      })) as VoiceResult

      if (!voiceResult.success) {
        const typedResult = voiceResult as { success: false; error: Error }
        throw typedResult.error
      }

      // Сохраняем ID голоса в базу данных
      await step.run('save-voice-id', async () => {
        const { error } = await supabase
          .from('users')
          .update({ voice_id_elevenlabs: voiceResult.voiceId })
          .eq('telegram_id', validatedParams.telegram_id)

        if (error) {
          throw new Error(`Error saving voice ID to database: ${error.message}`)
        }

        return { success: true }
      })

      // Отправляем уведомление об успешном создании
      await step.run('send-success-notification', async () => {
        const { bot } = getBotByName(validatedParams.bot_name)

        await bot.telegram.sendMessage(
          validatedParams.telegram_id,
          validatedParams.is_ru
            ? '🎤 Голос для аватара успешно создан. \nИспользуйте 🎙️ Текст в голос в меню, чтобы проверить'
            : '🎤 Voice for avatar successfully created! \nUse the 🎙️ Text to speech in the menu to check'
        )

        return { sent: true }
      })

      return { success: true, voiceId: voiceResult.voiceId }
    } catch (error) {
      await step.run('error-handler', async () => {
        console.error('🔥 Глобальная ошибка при создании голоса:', {
          description: 'Global error in voice creation',
          error: JSON.stringify(error, Object.getOwnPropertyNames(error)),
        })

        if (validatedParams) {
          // Отправляем сообщение об ошибке пользователю
          errorMessage(
            error as Error,
            validatedParams.telegram_id,
            validatedParams.is_ru
          )

          // Отправляем сообщение об ошибке администратору
          errorMessageAdmin(error as Error)

          // Отправляем уведомление пользователю об ошибке
          const { bot } = getBotByName(validatedParams.bot_name)
          await bot.telegram.sendMessage(
            validatedParams.telegram_id,
            validatedParams.is_ru
              ? '❌ Произошла ошибка при создании голосового аватара. Пожалуйста, попробуйте еще раз.'
              : '❌ An error occurred while creating your voice avatar. Please try again.'
          )
        }
      })

      throw error
    }
  }
)
