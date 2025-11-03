import { inngest } from '@/core/inngest/clients'
import { replicate } from '@/core/replicate'
import { getAspectRatio } from '@/core/supabase/ai'
import { savePrompt } from '@/core/supabase/savePrompt'
import {
  getUserByTelegramId,
  updateUserLevelPlusOne,
  updateUserBalance,
} from '@/core/supabase'
import { processApiResponse } from '@/helpers/processApiResponse'

import { saveFileLocally } from '@/helpers'
import { pulse } from '@/helpers/pulse'
import { processBalanceOperation } from '@/price/helpers'

import { ModeEnum } from '@/interfaces/modes'
import { calculateModeCost } from '@/price/helpers/modelsCost'
import path from 'path'
import { API_URL } from '@/config'
import fs from 'fs'
import { logger } from '@/utils/logger'
import { getBotByName } from '@/core/bot'
import { PaymentType } from '@/interfaces/payments.interface'
import { slugify } from 'inngest'

export const neuroImageGeneration = inngest.createFunction(
  {
    id: slugify('neuro-image-generation'),
    name: '🎨 Neuro Image Generation',
    retries: 3,
  },
  { event: 'neuro/photo.generate' },
  async ({ event, step }) => {
    try {
      const {
        prompt,
        model_url,
        num_images,
        telegram_id,
        username,
        is_ru,
        bot_name,
        gender, // ← ДОБАВЛЕНО: извлекаем gender из event.data
      } = event.data

      logger.info({
        message: '🎨 Starting neuro image generation',
        telegram_id,
        prompt: prompt.substring(0, 50) + '...',
        model_url,
      })

      const botData = (await step.run('get-bot', async () => {
        logger.info({
          message: '🤖 Getting bot instance',
          botName: bot_name,
          step: 'get-bot',
        })

        return getBotByName(bot_name)
      })) as { bot: any }
      console.log('botData', botData)
      const bot = botData.bot

      if (!bot) {
        logger.error({
          message: '❌ Bot instance not found',
          bot_name,
          telegram_id,
        })
      } else {
        logger.info({
          message: '✅ Bot instance found',
          bot_name,
          telegram_id,
        })
      }

      const userExists = await step.run('check-user', async () => {
        logger.info({
          message: '👤 Validating user existence',
          telegram_id,
        })
        const user = await getUserByTelegramId(telegram_id)
        if (!user) throw new Error(`User ${telegram_id} not found`)
        return user
      })

      // ← ДОБАВЛЕНО: Получаем gender из параметра или из базы данных
      const userGender = await step.run('get-user-gender', async () => {
        let resolvedGender = gender
        if (!resolvedGender) {
          // Если gender не передан, пытаемся получить из пользователя
          resolvedGender = userExists.gender

          // Если и в пользователе нет, пытаемся получить из последней тренировки
          if (!resolvedGender) {
            const { supabase } = await import('@/core/supabase')
            const { data: lastTraining } = await supabase
              .from('model_trainings')
              .select('gender')
              .eq('telegram_id', telegram_id)
              .order('created_at', { ascending: false })
              .limit(1)
              .single()

            resolvedGender = lastTraining?.gender
          }
        }

        logger.info({
          message: '🎭 Gender для генерации (Inngest)',
          gender: resolvedGender || 'НЕ ОПРЕДЕЛЕН',
          telegram_id,
        })

        return resolvedGender
      })

      // Уровень пользователя
      if (userExists.level === 1) {
        await step.run('update-level', async () => {
          await updateUserLevelPlusOne(telegram_id, userExists.level)
          logger.info({
            message: '⬆️ User level upgraded',
            telegram_id,
            newLevel: userExists.level + 1,
          })
        })
      }

      const totalCost = await step.run('calculate-total-cost', async () => {
        const costResult = calculateModeCost({
          mode: ModeEnum.NeuroPhoto,
          numImages: num_images,
        })

        logger.info({
          message: '💸 Calculated image cost',
          num_images,
          totalCost: costResult.stars,
        })
        return costResult.stars
      })

      const balanceCheck = await step.run('process-payment', async () => {
        const result = await processBalanceOperation({
          telegram_id,
          paymentAmount: totalCost,
          is_ru,
          bot_name,
        })

        if (!result.success) {
          logger.error({
            message: '⚠️ Balance check failed or insufficient funds',
            telegramId: telegram_id,
            requiredAmount: totalCost,
            currentBalance: result.currentBalance,
            error: result.error,
            step: 'process-payment',
          })

          if (result.error) {
            try {
              const { bot } = getBotByName(bot_name)
              if (bot) {
                await bot.telegram.sendMessage(
                  telegram_id.toString(),
                  result.error
                )
              } else {
                logger.error(
                  'Failed to get bot instance for error notification',
                  { bot_name }
                )
              }
            } catch (notifyError) {
              logger.error(
                'Failed to send balance error notification to user',
                { telegramId: telegram_id, error: notifyError }
              )
            }
          }
          throw new Error(result.error || 'Balance check failed')
        }
        logger.info({
          message: '✅ Balance check successful',
          telegramId: telegram_id,
          currentBalance: result.currentBalance,
          requiredAmount: totalCost,
          step: 'process-payment',
        })
        return {
          currentBalance: result.currentBalance,
          paymentAmount: totalCost,
        }
      })

      const initialBalance = balanceCheck.currentBalance

      const aspect_ratio = await step.run('get-aspect-ratio', async () => {
        const ratio = await getAspectRatio(telegram_id)
        logger.info({
          message: '📐 Using aspect ratio',
          ratio,
        })
        return ratio
      })

      const generatedImages = []

      for (let i = 0; i < num_images; i++) {
        const generationResult = await step.run(
          `generate-image-${i}`,
          async () => {
            const { bot, error } = getBotByName(bot_name)
            if (error || !bot) {
              throw new Error(`Bot instance not found or invalid: ${error}`)
            }
            await bot.telegram.sendMessage(
              telegram_id,
              is_ru
                ? `⏳ Генерация изображения ${i + 1} из ${num_images}`
                : `⏳ Generating image ${i + 1} of ${num_images}`
            )

            // ← ИСПРАВЛЕНО: Формируем промпт с учетом gender
            const genderPrompt =
              userGender === 'male'
                ? 'handsome man, masculine features'
                : userGender === 'female'
                ? 'beautiful woman, feminine features'
                : 'person' // fallback если gender не определен

            const input = {
              prompt: `Fashionable ${genderPrompt}: ${prompt}. Cinematic Lighting, realistic, intricate details, extremely detailed, incredible details, full colored, complex details, insanely detailed and intricate, hypermaximalist, extremely detailed with rich colors. Masterpiece, best quality, aerial view, HDR, UHD, unreal engine, Representative, fair skin, beautiful face, Rich in details, high quality, gorgeous, glamorous, 8K, super detail, gorgeous light and shadow, detailed decoration, detailed lines.`,
              negative_prompt: 'nsfw, erotic, violence, bad anatomy...',
              num_inference_steps: 40,
              guidance_scale: 3,
              lora_scale: 1,
              megapixels: '1',
              output_quality: 80,
              prompt_strength: 0.8,
              extra_lora_scale: 1,
              go_fast: false,
              ...(aspect_ratio === '1:1'
                ? { width: 1024, height: 1024 }
                : aspect_ratio === '16:9'
                ? { width: 1368, height: 768 }
                : aspect_ratio === '9:16'
                ? { width: 768, height: 1368 }
                : { width: 1024, height: 1024 }),
              sampler: 'flowmatch',
              num_outputs: 1,
              aspect_ratio,
            }

            const output = await replicate.run(model_url, { input })
            const imageUrl = await processApiResponse(output)

            if (!imageUrl) throw new Error('Image generation failed')

            const localPath = await saveFileLocally(
              telegram_id,
              imageUrl,
              'neuro-photo',
              '.jpeg'
            )

            const prompt_id = await savePrompt(
              prompt,
              model_url,
              ModeEnum.NeuroPhoto,
              imageUrl,
              telegram_id,
              'SUCCESS'
            )

            if (!prompt_id) {
              logger.error('Failed to save prompt')
              throw new Error('Prompt save failed')
            }

            await pulse(
              localPath,
              prompt,
              `/${model_url}`,
              telegram_id,
              username,
              is_ru,
              bot_name
            )

            return {
              url: `${API_URL}/uploads/${telegram_id}/neuro-photo/${path.basename(
                localPath
              )}`,
              path: localPath,
              prompt_id,
            }
          }
        )

        await step.run(`notify-image-${i}`, async () => {
          const { bot, error } = getBotByName(bot_name)
          if (error || !bot) {
            throw new Error(`Bot instance not found or invalid: ${error}`)
          }
          await bot.telegram.sendPhoto(telegram_id, {
            source: fs.createReadStream(generationResult.path),
          })
        })

        generatedImages.push(generationResult.url)
      }

      const finalBalance = await step.run('deduct-balance-final', async () => {
        logger.info({
          message: '💸 Deducting balance after successful image generation',
          telegramId: telegram_id,
          paymentAmount: totalCost,
          currentBalance: initialBalance,
          step: 'deduct-balance-final',
        })

        const newBalance = initialBalance - totalCost

        await updateUserBalance(
          telegram_id,
          totalCost, // ← ИСПРАВЛЕНО: передаем сумму операции, а не новый баланс
          PaymentType.MONEY_OUTCOME,
          `NeuroPhoto generation (${num_images} images)`,
          {
            stars: totalCost,
            payment_method: 'Internal',
            bot_name: bot_name,
            language: is_ru ? 'ru' : 'en',
            service_type: ModeEnum.NeuroPhoto, // ← ДОБАВЛЕНО: указываем тип сервиса
            category: 'REAL',
            cost: totalCost / 1.5, // ← ДОБАВЛЕНО: себестоимость (цена ÷ наценка 50%)
          }
        )

        logger.info({
          message: '✅ Balance updated successfully',
          telegramId: telegram_id,
          newBalance: newBalance,
          step: 'deduct-balance-final',
        })
        return newBalance
      })

      await step.run('final-notification', async () => {
        const { bot, error } = getBotByName(bot_name)
        if (error || !bot) {
          throw new Error(`Bot instance not found or invalid: ${error}`)
        }
        await bot.telegram.sendMessage(
          telegram_id,
          is_ru
            ? `Ваши изображения сгенерированы! Стоимость: ${totalCost.toFixed(
                2
              )} ⭐️\nНовый баланс: ${finalBalance.toFixed(2)} ⭐️`
            : `Your images generated! Cost: ${totalCost.toFixed(
                2
              )} ⭐️\nNew balance: ${finalBalance.toFixed(2)} ⭐️`,
          {
            reply_markup: {
              keyboard: [
                [
                  { text: '1️⃣' },
                  { text: '2️⃣' },
                  { text: '3️⃣' },
                  { text: '4️⃣' },
                ],
                [
                  { text: is_ru ? '🆕 Новый промпт' : '🆕 New prompt' },
                  { text: is_ru ? '⬆️ Улучшить промпт' : '⬆️ Improve prompt' },
                ],
                [
                  { text: is_ru ? '📐 Изменить размер' : '📐 Change size' },
                  {
                    text: is_ru
                      ? '⬆️ Увеличить качество'
                      : '⬆️ Upscale Quality',
                  },
                ],
                [{ text: is_ru ? '🏠 Главное меню' : '🏠 Main menu' }],
              ],
              resize_keyboard: true,
              one_time_keyboard: false,
            },
          }
        )
      })

      logger.info({
        message: '✅ Successfully completed neuro generation',
        telegram_id,
        numImages: generatedImages.length,
      })

      return { success: true, images: generatedImages }
    } catch (error) {
      logger.error({
        message: '🚨 Neuro image generation failed',
        error: error.message,
        stack: error.stack,
        telegram_id: event.data.telegram_id,
      })

      await inngest.send({
        name: 'neuro/photo.failed',
        data: {
          ...event.data,
          error: error.message,
        },
      })

      throw error
    }
  }
)
