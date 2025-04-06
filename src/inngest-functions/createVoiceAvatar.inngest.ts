import { TelegramId } from '@/interfaces/telegram.interface'
import { inngest } from '@/core/inngest/clients'
import {
  getUserByTelegramIdString,
  updateUserLevelPlusOne,
} from '@/core/supabase'
import { supabase } from '@/core/supabase'
import { createVoiceElevenLabs } from '@/core/elevenlabs/createVoiceElevenLabs'

import { getBotByName } from '@/core/bot'
import { ModeEnum } from '@/interfaces/modes.interface'
import { calculateModeCost } from '@/price/helpers/modelsCost'
import { v4 as uuidv4 } from 'uuid'
import { logger } from '@/utils/logger'

interface CreateVoiceAvatarEvent {
  data: {
    fileUrl: string
    telegram_id: TelegramId
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
      // Валидация входных данных
      const validationResult = await step.run('validate-input', () => {
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
      })

      validatedParams = validationResult as CreateVoiceAvatarEvent['data']

      // Получение информации о пользователе
      await step.run('get-user-info', async () => {
        if (!validatedParams) throw new Error('Missing validated parameters')
        const user = await getUserByTelegramIdString(
          validatedParams.telegram_id
        )
        if (!user) throw new Error('User not found')

        if (user.level === 6) {
          await updateUserLevelPlusOne(user.telegram_id, user.level)
        }
        return user
      })

      // Обработка платежа
      await step.run('process-payment', async () => {
        if (!validatedParams) throw new Error('Missing validated parameters')

        logger.info('💰 Обработка платежа за голосовой аватар:', {
          description: 'Processing payment for voice avatar',
          telegram_id: validatedParams.telegram_id,
          username: validatedParams.username,
        })

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
            description: 'Payment for voice avatar creation',
            type: 'money_expense',
            amount: calculateModeCost({ mode: ModeEnum.Voice }).stars,
            metadata: {
              service_type: ModeEnum.Voice,
              voice_name: validatedParams.username,
            },
          },
        })
      })

      // Отправка уведомления о начале создания
      await step.run('send-start-notification', async () => {
        if (!validatedParams) throw new Error('Missing validated parameters')

        const botResult = getBotByName(validatedParams.bot_name)
        if (!botResult?.bot) {
          throw new Error('Bot instance not found')
        }
        const { bot } = botResult

        await bot.telegram.sendMessage(
          validatedParams.telegram_id,
          validatedParams.is_ru
            ? '⏳ Создаю голосовой аватар...'
            : '⏳ Creating voice avatar...'
        )

        return { sent: true }
      })

      // Создание голосового аватара
      const voiceResult = (await step.run('create-voice', async () => {
        if (!validatedParams) throw new Error('Missing validated parameters')

        try {
          logger.info('📣 Создание голосового аватара:', {
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
          logger.error('🔥 Ошибка при создании голосового аватара:', {
            description: 'Error creating voice avatar',
            error: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined,
          })

          return {
            success: false as const,
            error: error instanceof Error ? error : new Error(String(error)),
          }
        }
      })) as VoiceResult

      if (!voiceResult.success) {
        const typedResult = voiceResult as { success: false; error: Error }
        throw typedResult.error
      }

      // Сохранение ID голоса
      await step.run('save-voice-id', async () => {
        if (!validatedParams) throw new Error('Missing validated parameters')

        const { error } = await supabase
          .from('users')
          .update({ voice_id_elevenlabs: voiceResult.voiceId })
          .eq('telegram_id', validatedParams.telegram_id)

        if (error) {
          throw new Error(`Error saving voice ID to database: ${error.message}`)
        }

        return { success: true }
      })

      // Отправка уведомления об успехе
      await step.run('send-success-notification', async () => {
        if (!validatedParams) throw new Error('Missing validated parameters')

        const botResult = getBotByName(validatedParams.bot_name)
        if (!botResult?.bot) {
          throw new Error('Bot instance not found')
        }
        const { bot } = botResult

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
      logger.error({
        message: '❌ Ошибка при создании голосового аватара',
        description: 'Error during voice avatar creation',
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        params: validatedParams,
      })

      // Обработка возврата средств
      if (validatedParams) {
        try {
          const refundAmount = calculateModeCost({
            mode: ModeEnum.Voice,
          }).stars

          logger.info({
            message: '💸 Начало процесса возврата средств',
            description:
              'Starting refund process due to voice avatar creation error',
            telegram_id: validatedParams.telegram_id,
            refundAmount,
            error: error instanceof Error ? error.message : String(error),
          })

          // Отправка события возврата средств
          await inngest.send({
            id: `refund-${
              validatedParams.telegram_id
            }-${Date.now()}-${uuidv4()}`,
            name: 'payment/process',
            data: {
              telegram_id: validatedParams.telegram_id,
              amount: refundAmount,
              type: 'refund',
              description:
                'Возврат средств за неудачное создание голосового аватара',
              bot_name: validatedParams.bot_name,
              metadata: {
                service_type: ModeEnum.Voice,
                error: error instanceof Error ? error.message : String(error),
                voice_name: validatedParams.username,
              },
            },
          })

          logger.info({
            message: '✅ Возврат средств выполнен',
            description: 'Refund processed successfully',
            telegram_id: validatedParams.telegram_id,
            refundAmount,
          })

          // Отправка уведомления пользователю
          const botResult = getBotByName(validatedParams.bot_name)
          if (botResult?.bot) {
            const { bot } = botResult
            const message = validatedParams.is_ru
              ? `❌ Произошла ошибка при создании голосового аватара. ${refundAmount} ⭐️ возвращены на ваш баланс.`
              : `❌ An error occurred during voice avatar creation. ${refundAmount} ⭐️ have been refunded to your balance.`

            await bot.telegram.sendMessage(validatedParams.telegram_id, message)
          }
        } catch (refundError) {
          logger.error({
            message: '🚨 Ошибка при попытке возврата средств',
            error:
              refundError instanceof Error
                ? refundError.message
                : String(refundError),
            originalError:
              error instanceof Error ? error.message : String(error),
            telegram_id: validatedParams.telegram_id,
          })
        }
      }

      throw error
    }
  }
)
