import { TestResult } from '../../types'
import { sendMediaToPulse, MediaPulseOptions } from '@/helpers/pulse'
import path from 'path'
import { logger } from '@/utils/logger'
import fs from 'fs'
import os from 'os'

/**
 * Тест для отправки фотографии в канал Pulse
 */
export async function testSendPhotoToPulse(): Promise<TestResult> {
  const testName = 'Отправка фотографии в Pulse'

  try {
    logger.info({
      message: '🚀 Запуск теста отправки фото в Pulse',
      description: 'Starting test for sending photo to Pulse',
      testName,
    })

    // Подготовка параметров для отправки фото по URL
    const photoOptions: MediaPulseOptions = {
      mediaType: 'photo',
      mediaSource: 'https://avatars.githubusercontent.com/u/4998556?v=4', // Тестовое фото из GitHub
      telegramId: '12345678',
      username: 'test_user',
      language: 'ru',
      serviceType: 'PhotoTest',
      prompt: 'Тестовый промпт для фотографии',
      botName: 'neuro_blogger_bot',
      additionalInfo: {
        Тест: 'Да',
        Окружение: 'Тестовое',
      },
    }

    // Отправка фото
    await sendMediaToPulse(photoOptions)

    logger.info({
      message: '✅ Тест отправки фото в Pulse успешно завершен',
      description: 'Photo to Pulse test completed successfully',
      testName,
    })

    return {
      success: true,
      message: 'Фото успешно отправлено в Pulse',
      name: testName,
    }
  } catch (error) {
    logger.error({
      message: '❌ Ошибка в тесте отправки фото в Pulse',
      description: 'Error in photo to Pulse test',
      error: (error as Error).message,
      stack: (error as Error).stack,
      testName,
    })

    return {
      success: false,
      message: `Ошибка при отправке фото: ${(error as Error).message}`,
      name: testName,
    }
  }
}

/**
 * Тест для отправки видео в канал Pulse
 */
export async function testSendVideoToPulse(): Promise<TestResult> {
  const testName = 'Отправка видео в Pulse'

  try {
    logger.info({
      message: '🚀 Запуск теста отправки видео в Pulse',
      description: 'Starting test for sending video to Pulse',
      testName,
    })

    // Комментарий о возможности использования локального файла
    // const tmpDir = os.tmpdir()
    // const videoPath = path.join(tmpDir, 'test-video.mp4')
    // В реальном тесте здесь мог бы быть путь к существующему тестовому видеофайлу

    // Подготовка параметров для отправки видео по URL
    // (используется общедоступное тестовое видео)
    const videoOptions: MediaPulseOptions = {
      mediaType: 'video',
      mediaSource:
        'https://sample-videos.com/video123/mp4/240/big_buck_bunny_240p_1mb.mp4',
      telegramId: '12345678',
      username: 'test_user',
      language: 'ru',
      serviceType: 'VideoTest',
      prompt: 'Тестовый промпт для видео',
      botName: 'neuro_blogger_bot',
      additionalInfo: {
        'Тестовое видео': 'Да',
        Разрешение: '240p',
      },
    }

    // Отправка видео
    await sendMediaToPulse(videoOptions)

    logger.info({
      message: '✅ Тест отправки видео в Pulse успешно завершен',
      description: 'Video to Pulse test completed successfully',
      testName,
    })

    return {
      success: true,
      message: 'Видео успешно отправлено в Pulse',
      name: testName,
    }
  } catch (error) {
    logger.error({
      message: '❌ Ошибка в тесте отправки видео в Pulse',
      description: 'Error in video to Pulse test',
      error: (error as Error).message,
      stack: (error as Error).stack,
      testName,
    })

    return {
      success: false,
      message: `Ошибка при отправке видео: ${(error as Error).message}`,
      name: testName,
    }
  }
}

/**
 * Тест для отправки аудио в канал Pulse
 */
export async function testSendAudioToPulse(): Promise<TestResult> {
  const testName = 'Отправка аудио в Pulse'

  try {
    logger.info({
      message: '🚀 Запуск теста отправки аудио в Pulse',
      description: 'Starting test for sending audio to Pulse',
      testName,
    })

    // Подготовка параметров для отправки аудио по URL
    // (используется общедоступное тестовое аудио)
    const audioOptions: MediaPulseOptions = {
      mediaType: 'audio',
      mediaSource:
        'https://file-examples.com/storage/fe352586866388d53d2add0/2017/11/file_example_MP3_1MG.mp3',
      telegramId: '12345678',
      username: 'test_user',
      language: 'ru',
      serviceType: 'AudioTest',
      prompt: 'Тестовый промпт для аудио',
      botName: 'neuro_blogger_bot',
      additionalInfo: {
        'Тестовое аудио': 'Да',
        Продолжительность: '0:30',
      },
    }

    // Отправка аудио
    await sendMediaToPulse(audioOptions)

    logger.info({
      message: '✅ Тест отправки аудио в Pulse успешно завершен',
      description: 'Audio to Pulse test completed successfully',
      testName,
    })

    return {
      success: true,
      message: 'Аудио успешно отправлено в Pulse',
      name: testName,
    }
  } catch (error) {
    logger.error({
      message: '❌ Ошибка в тесте отправки аудио в Pulse',
      description: 'Error in audio to Pulse test',
      error: (error as Error).message,
      stack: (error as Error).stack,
      testName,
    })

    return {
      success: false,
      message: `Ошибка при отправке аудио: ${(error as Error).message}`,
      name: testName,
    }
  }
}

/**
 * Тест для отправки документа в канал Pulse
 */
export async function testSendDocumentToPulse(): Promise<TestResult> {
  const testName = 'Отправка документа в Pulse'

  try {
    logger.info({
      message: '🚀 Запуск теста отправки документа в Pulse',
      description: 'Starting test for sending document to Pulse',
      testName,
    })

    // Создаем временный текстовый файл для теста
    const tmpDir = os.tmpdir()
    const documentPath = path.join(tmpDir, 'test-document.txt')

    // Записываем тестовый текст в файл
    fs.writeFileSync(
      documentPath,
      'Это тестовый документ для отправки в Pulse.'
    )

    // Подготовка параметров для отправки документа из локального файла
    const documentOptions: MediaPulseOptions = {
      mediaType: 'document',
      mediaSource: documentPath,
      telegramId: '12345678',
      username: 'test_user',
      language: 'ru',
      serviceType: 'DocumentTest',
      prompt: 'Тестовый промпт для документа',
      botName: 'neuro_blogger_bot',
      additionalInfo: {
        'Тестовый документ': 'Да',
        'Тип файла': 'TXT',
      },
    }

    // Отправка документа
    await sendMediaToPulse(documentOptions)

    // Удаляем временный файл
    fs.unlinkSync(documentPath)

    logger.info({
      message: '✅ Тест отправки документа в Pulse успешно завершен',
      description: 'Document to Pulse test completed successfully',
      testName,
    })

    return {
      success: true,
      message: 'Документ успешно отправлен в Pulse',
      name: testName,
    }
  } catch (error) {
    logger.error({
      message: '❌ Ошибка в тесте отправки документа в Pulse',
      description: 'Error in document to Pulse test',
      error: (error as Error).message,
      stack: (error as Error).stack,
      testName,
    })

    return {
      success: false,
      message: `Ошибка при отправке документа: ${(error as Error).message}`,
      name: testName,
    }
  }
}

/**
 * Запускает все тесты для отправки медиа в Pulse
 */
export async function runAllPulseMediaTests(): Promise<TestResult> {
  const testName = 'Тесты отправки медиа в Pulse'

  logger.info({
    message: '🚀 Запуск всех тестов для отправки медиа в Pulse',
    description: 'Running all Pulse media tests',
  })

  try {
    const results: TestResult[] = []

    // Запускаем все тесты
    results.push(await testSendPhotoToPulse())
    results.push(await testSendVideoToPulse())
    results.push(await testSendAudioToPulse())
    results.push(await testSendDocumentToPulse())

    // Подсчитываем количество успешных и неуспешных тестов
    const successCount = results.filter(r => r.success).length
    const failCount = results.filter(r => !r.success).length

    logger.info({
      message: `🏁 Завершены все тесты для отправки медиа в Pulse: ✅ ${successCount} успешных, ❌ ${failCount} неуспешных`,
      description: `All Pulse media tests completed: ${successCount} successful, ${failCount} failed`,
    })

    // В нашей тестовой системе нужно возвращать один TestResult, а не массив
    return {
      success: failCount === 0,
      message: `Тесты отправки медиа в Pulse: ${successCount} успешных, ${failCount} неуспешных`,
      name: testName,
    }
  } catch (error) {
    logger.error({
      message: '❌ Ошибка при запуске тестов для отправки медиа в Pulse',
      description: 'Error running Pulse media tests',
      error: (error as Error).message,
      stack: (error as Error).stack,
    })

    return {
      success: false,
      message: `Ошибка при запуске тестов: ${(error as Error).message}`,
      name: testName,
    }
  }
}

// Запускаем тесты, если файл был запущен напрямую
if (require.main === module) {
  ;(async () => {
    await runAllPulseMediaTests()
  })()
}
