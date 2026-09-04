import { inngest } from '@/inngest_app/client'
import { assertSafePathSegment } from '@/utils/pathSegment'
import { logger } from '@/utils/logger'
import { getUserBalance } from '@/core/supabase/getUserBalance'
import { getUserByTelegramId } from '@/core/supabase'
import { getBotByName } from '@/core/bot'
import { createKlingMorphingVideo } from '@/core/kling'
// MorphingType is 'seamless' | 'loop' string literal
import fs from 'fs'
import path from 'path'

// 🔧 НОВЫЙ ИНТЕРФЕЙС: Получаем готовые пути к файлам, не ZIP
interface MorphingJobData {
  telegram_id: string
  image_count: number
  morphing_type: 'seamless' | 'loop'
  model: string
  is_ru: boolean
  bot_name: string
  job_id: string
  // 🎯 КЛЮЧЕВОЕ ИЗМЕНЕНИЕ: Массив путей к файлам вместо zip_file_path
  image_files: Array<{
    filename: string
    path: string
    order: number
  }>
  extraction_path: string // Путь для очистки после обработки
}

export const morphImages = inngest.createFunction(
  {
    id: 'morph-images',
    name: '🧬 Morph Images', // Добавляем emoji и название как у других функций
    retries: 3,
  },
  { event: 'morph/images.requested' },
  async ({ event, step }) => {
    const {
      telegram_id,
      morphing_type,
      model,
      is_ru,
      bot_name,
      job_id,
      image_files,
      extraction_path,
    } = event.data as MorphingJobData

    logger.info('🧬 Morphing job started:', {
      telegram_id,
      job_id,
      image_files_count: image_files.length,
      morphing_type,
      model,
    })

    // ШАГ 1: Проверка существования пользователя
    await step.run('check-user-exists', async () => {
      const user = await getUserByTelegramId(telegram_id)

      if (!user) {
        throw new Error(`User ${telegram_id} does not exist`)
      }

      logger.info('✅ User exists:', { telegram_id })
      return { exists: true, user }
    })

    // ШАГ 2: Проверка баланса пользователя
    await step.run('check-balance', async () => {
      const balance = await getUserBalance(telegram_id, bot_name)
      const requiredStars = 50 // Базовая стоимость морфинга

      if (balance < requiredStars) {
        throw new Error(`Insufficient balance: ${balance} < ${requiredStars}`)
      }

      logger.info('✅ Balance sufficient:', {
        telegram_id,
        balance,
        required: requiredStars,
      })
      return { balance, required: requiredStars }
    })

    // ШАГ 3: Уведомление о начале обработки (НЕ отправляем большие данные!)
    await step.run('notify-start', async () => {
      const { bot, error } = getBotByName(bot_name)
      if (error || !bot) {
        throw new Error(`Bot ${bot_name} not found: ${error}`)
      }

      const startMessage = is_ru
        ? `🧬 Начинаю морфинг ${image_files.length} изображений...\nJob ID: ${job_id}`
        : `🧬 Starting morphing of ${image_files.length} images...\nJob ID: ${job_id}`

      await bot.telegram.sendMessage(telegram_id, startMessage)

      logger.info('✅ Start notification sent:', { telegram_id, job_id })
      return { notified: true }
    })

    // ШАГ 4: 🚀 ПОШАГОВАЯ ОБРАБОТКА МОРФИНГ ПАР
    // Преобразуем пути файлов в формат ExtractedImage для существующей логики
    const extractedImages = image_files.map(file => ({
      filename: file.filename,
      originalName: file.filename,
      path: file.path,
      order: file.order,
    }))

    // 🔍 ДИАГНОСТИКА: Проверяем extraction_path и все пути к файлам
    logger.info('🧬 🔍 Диагностика путей к файлам:', {
      telegram_id,
      extraction_path,
      extraction_path_exists: fs.existsSync(extraction_path),
      cwd: process.cwd(),
      image_files_received: image_files.length,
      extracted_images_paths: extractedImages.map(img => ({
        filename: img.filename,
        path: img.path,
        exists: fs.existsSync(img.path),
        absolute_path: path.resolve(img.path),
      })),
    })

    // Проверяем что extraction_path существует
    if (!fs.existsSync(extraction_path)) {
      const error = `Extraction path does not exist: ${extraction_path}`
      logger.error('🧬 ❌ Директория извлечения не найдена:', {
        telegram_id,
        extraction_path,
        cwd: process.cwd(),
        absolute_extraction_path: path.resolve(extraction_path),
      })
      throw new Error(error)
    }

    // Приводим тип morphing_type к правильному enum
    const morphingTypeEnum = morphing_type === 'seamless' ? 'seamless' : 'loop'

    // Определяем сколько пар нужно обработать
    const totalPairs =
      extractedImages.length -
      1 +
      (morphingTypeEnum === 'loop' && extractedImages.length > 2 ? 1 : 0)
    logger.info('🧬 🎯 Начинаем пошаговую обработку морфинг пар:', {
      telegram_id,
      total_images: extractedImages.length,
      total_pairs: totalPairs,
      morphing_type: morphingTypeEnum,
      includes_loop: morphingTypeEnum === 'loop' && extractedImages.length > 2,
    })

    // ШАГ 4.1: 🚀 УНИВЕРСАЛЬНАЯ ОБРАБОТКА ВСЕХ ПАР (любое количество!)
    const allPairVideoUrls = await step.run('process-all-pairs', async () => {
      const pairVideoUrls: string[] = []

      logger.info('🧬 🎯 Начинаем batch обработку всех пар:', {
        telegram_id,
        total_pairs: extractedImages.length - 1,
        morphing_type: morphingTypeEnum,
      })

      // Обрабатываем все основные пары (изображение i с изображением i+1)
      for (let i = 0; i < extractedImages.length - 1; i++) {
        const pairIndex = i + 1
        const image1 = extractedImages[i]
        const image2 = extractedImages[i + 1]

        logger.info(
          `🧬 ⏳ Обрабатываем пару ${pairIndex}/${extractedImages.length - 1}:`,
          {
            telegram_id,
            pair_index: pairIndex,
            total_pairs: extractedImages.length - 1,
            from: image1.filename,
            to: image2.filename,
            image1_path: image1.path,
            image2_path: image2.path,
          }
        )

        // 🔍 ПРОВЕРКА СУЩЕСТВОВАНИЯ ФАЙЛОВ ПЕРЕД ОБРАБОТКОЙ
        if (!fs.existsSync(image1.path)) {
          const error = `Image 1 file does not exist: ${image1.path}`
          logger.error('🧬 ❌ Файл изображения 1 не найден:', {
            telegram_id,
            pair_index: pairIndex,
            expected_path: image1.path,
            cwd: process.cwd(),
            absolute_path: path.resolve(image1.path),
          })
          throw new Error(error)
        }

        if (!fs.existsSync(image2.path)) {
          const error = `Image 2 file does not exist: ${image2.path}`
          logger.error('🧬 ❌ Файл изображения 2 не найден:', {
            telegram_id,
            pair_index: pairIndex,
            expected_path: image2.path,
            cwd: process.cwd(),
            absolute_path: path.resolve(image2.path),
          })
          throw new Error(error)
        }

        logger.info(`🧬 ✅ Файлы изображений найдены для пары ${pairIndex}:`, {
          telegram_id,
          image1_size: fs.statSync(image1.path).size,
          image2_size: fs.statSync(image2.path).size,
        })

        // 🎬 Создаем морфинг видео для пары
        const result = await createKlingMorphingVideo(
          [image1, image2],
          morphingTypeEnum,
          telegram_id
        )

        if (!result.success || !result.video_url) {
          throw new Error(`Pair ${pairIndex} morphing failed: ${result.error}`)
        }

        logger.info(
          `✅ Пара ${pairIndex}/${extractedImages.length - 1} завершена:`,
          {
            telegram_id,
            pair_index: pairIndex,
            video_url: result.video_url,
            total_processed: pairIndex,
            remaining_pairs: extractedImages.length - 1 - pairIndex,
          }
        )

        pairVideoUrls.push(result.video_url)
      }

      logger.info('🎉 Все основные пары обработаны успешно:', {
        telegram_id,
        total_pairs_processed: pairVideoUrls.length,
        video_urls: pairVideoUrls,
      })

      return pairVideoUrls
    })

    // ШАГ 4.2: Если LOOP - обрабатываем замыкающую пару (последнее с первым)
    let loopVideoUrl: string | null = null
    if (morphingTypeEnum === 'loop' && extractedImages.length > 2) {
      loopVideoUrl = await step.run('process-loop-pair', async () => {
        const lastImage = extractedImages[extractedImages.length - 1]
        const firstImage = extractedImages[0]

        logger.info(
          `🔄 Обрабатываем LOOP пару (${extractedImages.length} → 1):`,
          {
            telegram_id,
            from: lastImage.filename,
            to: firstImage.filename,
            lastImage_path: lastImage.path,
            firstImage_path: firstImage.path,
          }
        )

        // 🔍 ПРОВЕРКА СУЩЕСТВОВАНИЯ ФАЙЛОВ ДЛЯ LOOP ПАРЫ
        if (!fs.existsSync(lastImage.path)) {
          const error = `Last image file does not exist: ${lastImage.path}`
          logger.error('🧬 ❌ Файл последнего изображения не найден:', {
            telegram_id,
            expected_path: lastImage.path,
            cwd: process.cwd(),
            absolute_path: path.resolve(lastImage.path),
          })
          throw new Error(error)
        }

        if (!fs.existsSync(firstImage.path)) {
          const error = `First image file does not exist: ${firstImage.path}`
          logger.error('🧬 ❌ Файл первого изображения не найден:', {
            telegram_id,
            expected_path: firstImage.path,
            cwd: process.cwd(),
            absolute_path: path.resolve(firstImage.path),
          })
          throw new Error(error)
        }

        logger.info(`🔄 ✅ Файлы для LOOP пары найдены:`, {
          telegram_id,
          lastImage_size: fs.statSync(lastImage.path).size,
          firstImage_size: fs.statSync(firstImage.path).size,
        })

        const result = await createKlingMorphingVideo(
          [lastImage, firstImage],
          morphingTypeEnum,
          telegram_id
        )

        if (!result.success || !result.video_url) {
          throw new Error(`Loop pair morphing failed: ${result.error}`)
        }

        logger.info(`✅ LOOP пара завершена:`, {
          telegram_id,
          video_url: result.video_url,
        })

        return result.video_url
      })
    }

    // Собираем все видео URL в один массив
    const finalPairVideoUrls = [...allPairVideoUrls]
    if (loopVideoUrl) {
      finalPairVideoUrls.push(loopVideoUrl)
    }

    logger.info('🎬 Все пары обработаны, готовим к склейке:', {
      telegram_id,
      total_videos: finalPairVideoUrls.length,
      has_loop: loopVideoUrl !== null,
      morphing_type: morphingTypeEnum,
    })

    // ШАГ 5: 🎬 СКЛЕЙКА ВСЕХ ВИДЕО
    const finalVideoResult = await step.run(
      'concatenate-all-videos',
      async () => {
        logger.info('🎬 Начинаем склейку всех видео:', {
          telegram_id,
          videos_to_concatenate: finalPairVideoUrls.length,
          video_urls: finalPairVideoUrls,
        })

        // Создаем временную директорию для склейки
        assertSafePathSegment(telegram_id, 'telegram_id')
        const tempDir = path.join(
          __dirname,
          '../../../tmp/morphing',
          telegram_id,
          `final_concatenation_${Date.now()}`
        )

        await fs.promises.mkdir(tempDir, { recursive: true })

        try {
          // Загружаем все видео локально
          const localVideoPaths: string[] = []
          for (let i = 0; i < finalPairVideoUrls.length; i++) {
            const videoUrl = finalPairVideoUrls[i]
            const localPath = path.join(tempDir, `video_${i + 1}.mp4`)

            // Загружаем видео
            const axios = require('axios')
            const response = await axios.get(videoUrl, {
              responseType: 'stream',
              timeout: 5 * 60 * 1000, // 5 минут
            })

            const writer = fs.createWriteStream(localPath)
            response.data.pipe(writer)

            await new Promise<void>((resolve, reject) => {
              // Guard the SOURCE stream: axios responseType:'stream' does not attach an
              // 'error' listener to response.data, so a mid-stream ECONNRESET/timeout emits
              // an unhandled 'error' -> uncaughtException -> the global handler process.exit(1)
              // kills the whole multi-bot process. Reject (and destroy the writer) instead.
              response.data.on('error', (streamErr: Error) => {
                writer.destroy()
                reject(streamErr)
              })
              writer.on('finish', () => resolve())
              writer.on('error', reject)
            })

            localVideoPaths.push(localPath)
          }

          // Склеиваем видео с помощью FFmpeg
          const outputPath = path.join(
            tempDir,
            `final_morphing_${Date.now()}.mp4`
          )
          const listFilePath = outputPath.replace('.mp4', '_list.txt')
          const listContent = localVideoPaths
            .map(videoPath => `file '${videoPath}'`)
            .join('\n')

          await fs.promises.writeFile(listFilePath, listContent)

          const { exec } = require('child_process')
          const { promisify } = require('util')
          const execAsync = promisify(exec)

          const ffmpegCommand = `ffmpeg -f concat -safe 0 -i "${listFilePath}" -c copy "${outputPath}"`
          await execAsync(ffmpegCommand)

          // Проверяем результат
          if (!fs.existsSync(outputPath)) {
            throw new Error('Final video was not created')
          }

          // Очищаем временные файлы
          await fs.promises.unlink(listFilePath)
          for (const videoPath of localVideoPaths) {
            if (fs.existsSync(videoPath)) {
              await fs.promises.unlink(videoPath)
            }
          }

          logger.info('✅ Склейка завершена успешно:', {
            telegram_id,
            final_video_path: outputPath,
          })

          return {
            success: true,
            video_url: outputPath,
            processing_pairs: finalPairVideoUrls.length,
            job_id: `morphing_${telegram_id}_${Date.now()}`,
            processing_time: 0, // Будет вычислено позже в финальном результате
          }
        } catch (error) {
          // Очистка при ошибке
          if (fs.existsSync(tempDir)) {
            await fs.promises.rm(tempDir, { recursive: true, force: true })
          }
          throw error
        }
      }
    )

    // ШАГ 6: Очистка временных файлов
    await step.run('cleanup-temp-files', async () => {
      try {
        // Очищаем директорию с извлеченными изображениями
        if (fs.existsSync(extraction_path)) {
          await fs.promises.rm(extraction_path, {
            recursive: true,
            force: true,
          })
          logger.info('✅ Temporary extraction path cleaned:', {
            extraction_path,
          })
        }

        return { cleaned: true, path: extraction_path }
      } catch (error) {
        logger.error('⚠️ Failed to clean temporary files:', {
          extraction_path,
          error: error instanceof Error ? error.message : String(error),
        })
        // Не прерываем выполнение из-за ошибки очистки
        return { cleaned: false, error: String(error) }
      }
    })

    // Отправляем результат пользователю
    const deliverResult = await step.run('deliver-result', async () => {
      logger.info('📤 Отправляем морфинг видео пользователю:', {
        description: 'Delivering morphing video to user',
        telegram_id,
        video_url: finalVideoResult.video_url,
        bot_name,
      })

      const { bot, error } = getBotByName(bot_name)
      if (error || !bot) {
        throw new Error(`Bot ${bot_name} not found: ${error}`)
      }

      // 🎬 Рекламный текст с упоминанием бота
      const botMention =
        bot_name === 'clip_maker_neuro_bot'
          ? '@clip_maker_neuro_bot'
          : '@ai_koshey_bot'
      const advertisementText = `🧬 **Морфинг завершен!**\n\n✨ Создано с помощью ${botMention}\n🎯 Время обработки: ~5 минут\n💫 Качество: Full HD 1080p\n\n📥 **Скачать:** Отправлен как документ\n👀 **Просмотр:** Видео выше\n\n🚀 Создавай больше контента с нашими ботами!`

      try {
        // 📱 Отправляем как видео для просмотра (с превью)
        await bot.telegram.sendVideo(telegram_id, finalVideoResult.video_url, {
          caption: advertisementText,
          parse_mode: 'Markdown',
          width: 1920, // Full HD ширина
          height: 1080, // Full HD высота
          duration: 5, // 5 секунд
          supports_streaming: true, // Поддержка стриминга
        })

        // 📎 Отправляем как документ для скачивания
        const fileDownloadText = `📁 **Файл для скачивания**\n\n🎬 Морфинг видео в высоком качестве\n💾 Можно сохранить на устройство\n\n${botMention} - создаем будущее вместе!`
        await bot.telegram.sendDocument(
          telegram_id,
          finalVideoResult.video_url,
          {
            caption: fileDownloadText,
            parse_mode: 'Markdown',
          }
        )

        logger.info('✅ Видео успешно доставлено пользователю:', {
          telegram_id,
          delivered_as: 'video_and_document',
          bot_name,
        })

        return { delivered: true, method: 'video_and_document' }
      } catch (deliveryError) {
        logger.error('❌ Ошибка доставки видео:', {
          telegram_id,
          error:
            deliveryError instanceof Error
              ? deliveryError.message
              : String(deliveryError),
        })

        // Фоллбэк: отправляем хотя бы ссылку
        await bot.telegram.sendMessage(
          telegram_id,
          `🎬 **Морфинг готов!**\n\n📎 **Скачать видео:** ${finalVideoResult.video_url}\n\n✨ Создано с помощью ${botMention}`,
          { parse_mode: 'Markdown' }
        )

        return { delivered: true, method: 'link_fallback' }
      }
    })

    // 🔧 ФИНАЛЬНЫЙ РЕЗУЛЬТАТ: Возвращаем только необходимые данные (БЕЗ больших объектов)
    const processingEndTime = Date.now()
    const eventTime = new Date(event.ts).getTime()
    const totalProcessingTime = processingEndTime - eventTime

    const finalResult = {
      job_id,
      telegram_id,
      status: 'completed',
      morphing_result: {
        success: finalVideoResult.success,
        job_id: finalVideoResult.job_id,
        video_url: finalVideoResult.video_url,
        processing_time: totalProcessingTime,
        processing_pairs: finalVideoResult.processing_pairs,
      },
      delivery: deliverResult,
      processing_time: totalProcessingTime,
      total_pairs_processed: finalVideoResult.processing_pairs,
    }

    logger.info('🎉 Morphing job completed successfully:', finalResult)
    return finalResult
  }
)
