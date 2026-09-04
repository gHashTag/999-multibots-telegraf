import { inngest } from '@/inngest_app/client'
import { replicate } from '@/core/replicate'
import { getAspectRatio } from '@/core/supabase/ai'
import { savePrompt } from '@/core/supabase/savePrompt'
import { getUserByTelegramId, updateUserLevelPlusOne } from '@/core/supabase'
import { processApiResponse } from '@/helpers/error/processApiResponse'

import { saveFileLocally } from '@/helpers'
import { pulse } from '@/helpers/pulse'
import { processBalanceOperation } from '@/price/helpers'

import { ModeEnum } from '@/interfaces/modes'
import { calculateModeCost } from '@/price/helpers/modelsCost'
import path from 'path'
import { isDev } from '@/config'
import fs from 'fs'

// API_URL for file serving
const API_URL = isDev ? 'http://localhost:2999' : 'https://api.999.md'
import { logger } from '@/utils/logger'
import { getBotByName } from '@/core/bot'
import { slugify } from 'inngest'
import { createInngestFailureHandler } from '@/inngest_app/client'

/**
 * ⚠️ ЭТА ФУНКЦИЯ, ПОХОЖЕ, НЕ ЗАПУСКАЕТСЯ.
 *
 * Она подписана на 'neuro/photo.generate'. Это событие встречается во всём
 * репозитории ровно дважды — в этом объявлении и в таком же в неиспользуемой
 * копии src/inngest_app/functions/neuroImageGeneration.ts. Отправителя нет
 * нигде.
 *
 * Живой путь нейрофото другой: сцена neuroPhotoWizard вызывает
 * generateNeuroPhotoHybrid напрямую (src/scenes/neuroPhotoWizard/index.ts:275),
 * без Inngest. Там своя обработка ошибок, включая ответ про NSFW и запасной
 * План Б.
 *
 * Уведомление пользователя ниже добавлено ДО того, как это выяснилось, —
 * четвёртый случай правки в файле, который никто не выполняет. Оставлено:
 * оно корректно и заработает, если функцию когда-нибудь начнут вызывать. Но
 * считать, что оно что-то чинит сегодня, нельзя.
 *
 * Проверять такие случаи: npm run check:events
 */
export const neuroImageGeneration = inngest.createFunction(
  {
    id: slugify('neuro-image-generation'),
    name: '🎨 Neuro Image Generation',
    retries: 3,
    onFailure: createInngestFailureHandler('neuro-image-generation'),
  },
  { event: 'neuro/photo.generate' },
  async ({ event, step, attempt }) => {
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

      logger.info('🎨 Starting neuro image generation', {
        telegram_id,
        prompt: prompt.substring(0, 50) + '...',
        model_url,
      })

      const botData = (await step.run('get-bot', async () => {
        logger.info('🤖 Getting bot instance', {
          botName: bot_name,
          step: 'get-bot',
        })

        return getBotByName(bot_name)
      })) as { bot: any }
      console.log('botData', botData)
      const bot = botData.bot

      if (!bot) {
        logger.error('❌ Bot instance not found', {
          bot_name,
          telegram_id,
        })
      } else {
        logger.info('✅ Bot instance found', {
          bot_name,
          telegram_id,
        })
      }

      const userExists = await step.run('check-user', async () => {
        logger.info('👤 Validating user existence', {
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

        logger.info('🎭 Gender для генерации (Inngest)', {
          gender: resolvedGender || 'НЕ ОПРЕДЕЛЕН',
          telegram_id,
        })

        return resolvedGender
      })

      // Уровень пользователя
      if (userExists.level === 1) {
        await step.run('update-level', async () => {
          await updateUserLevelPlusOne(telegram_id, userExists.level)
          logger.info('⬆️ User level upgraded', {
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

        logger.info('💸 Calculated image cost', {
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
          logger.error('⚠️ Balance check failed or insufficient funds', {
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
        logger.info('✅ Balance check successful', {
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
        logger.info('📐 Using aspect ratio', {
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
              imageUrl,
              telegram_id,
              'success'
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

      // The user was ALREADY charged once in the 'process-payment' step above:
      // processBalanceOperation performs the MONEY_OUTCOME deduction (the sibling
      // generators morphImages / modelTrainingV2 charge exactly once the same
      // way, with no second deduction). This step used to call updateUserBalance
      // a SECOND time, double-charging every neuro-image generation. Drop the
      // duplicate charge; keep the post-charge balance for the completion message.
      const finalBalance = initialBalance - totalCost

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

      logger.info('✅ Successfully completed neuro generation', {
        telegram_id,
        numImages: generatedImages.length,
      })

      return { success: true, images: generatedImages }
    } catch (error) {
      logger.error('🚨 Neuro image generation failed', {
        error: error.message,
        stack: error.stack,
        telegram_id: event.data.telegram_id,
      })

      // Раньше здесь отправлялось событие 'neuro/photo.failed' — и НИКТО его
      // не слушал. Проверено сверкой отправок с подписками
      // (scripts/orphan-events.cjs): строка встречается только в двух send и
      // ни в одной подписке. То есть генерация падала, человек платил и не
      // получал ни картинки, ни сообщения об ошибке — только тишину.
      //
      // Пишем напрямую. getBotByName в этом файле уже используется выше, так
      // что новой зависимости не появляется.
      //
      // Только на ПОСЛЕДНЕЙ попытке: у функции retries: 3, иначе человек
      // получил бы четыре одинаковых сообщения об одной неудаче.
      const isLastAttempt = attempt >= 3
      if (isLastAttempt) {
        try {
          const { telegram_id, bot_name, is_ru } = event.data
          const { bot } = getBotByName(bot_name)
          if (bot && telegram_id) {
            await bot.telegram.sendMessage(
              telegram_id.toString(),
              // The 'process-payment' step charges via processBalanceOperation
              // BEFORE the generate loop, so on a mid-generation failure the
              // user HAS been charged and onFailure issues no refund. The
              // previous 'you were not charged' text was therefore untrue (and
              // cited a now-removed 'deduct-balance-final' step).
              //
              // Until an automatic refund is enabled -- that is a credit to a
              // user's balance and belongs to the owner, see owner item 21 --
              // the message must at least SAY that the stars were taken.
              // Telling someone only to "try again later" after charging them
              // hides the loss: they retry, get charged again, and never learn
              // that the first attempt cost them anything.
              is_ru
                ? '❌ Не удалось сгенерировать изображение. Звёзды за эту попытку были списаны — напишите в поддержку, чтобы их вернули.'
                : '❌ Image generation failed. The stars for this attempt were charged — contact support to have them returned.'
            )
          }
        } catch (notifyError) {
          // Сообщить не удалось — это не повод потерять исходную ошибку.
          logger.error('Не удалось уведомить пользователя о сбое генерации', {
            error:
              notifyError instanceof Error
                ? notifyError.message
                : String(notifyError),
            telegram_id: event.data.telegram_id,
          })
        }
      }

      throw error
    }
  }
)
