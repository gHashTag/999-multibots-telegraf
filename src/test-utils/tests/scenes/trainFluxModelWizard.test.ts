import { MyContext } from '@/interfaces'
import {
  createMockContext,
  createMockWizardContext,
} from '../../core/mockContext'
import { TestResult } from '../../core/types'
import {
  assertContains,
  assertReplyContains,
  assertReplyMarkupContains,
  assertScene,
} from '../../core/assertions'
import { TEXTS as RU } from '@/locales/ru'
import { TEXTS as EN } from '@/locales/en'
import { SCENES } from '@/constants'
import { trainFluxModelWizard } from '@/scenes/trainFluxModelWizard'

/**
 * Тестирует вход в сцену загрузки фотографий для тренировки модели
 */
export async function testTrainFluxModelWizard_EnterScene(): Promise<TestResult> {
  try {
    // Создаем мок контекста
    const ctx = createMockWizardContext()
    ctx.from = {
      id: 123456789,
      is_bot: false,
      first_name: 'Test',
      username: 'test_user',
      language_code: 'ru',
    }
    ctx.message = { text: '/train', message_id: 1 } as any

    // Запускаем первый шаг сцены
    await trainFluxModelWizard.steps[0](ctx as unknown as MyContext)

    // Проверяем, что бот отправил правильное сообщение с инструкциями
    assertReplyContains(ctx, 'Пожалуйста, отправьте изображения')
    assertReplyContains(ctx, 'минимум 10')

    // Проверяем, что клавиатура содержит кнопку отмены
    assertReplyMarkupContains(ctx, 'Отмена')

    // Проверяем, что сцена перешла на следующий шаг
    assertScene(ctx, 'trainFluxModelWizard', 1)

    return {
      name: 'trainFluxModelWizard: Enter Scene',
      success: true,
      message: 'Успешно отображены инструкции по загрузке фотографий',
    }
  } catch (error) {
    return {
      name: 'trainFluxModelWizard: Enter Scene',
      success: false,
      message: String(error),
    }
  }
}

/**
 * Тестирует загрузку изображения
 */
export async function testTrainFluxModelWizard_UploadImage(): Promise<TestResult> {
  try {
    // Создаем мок контекста
    const ctx = createMockWizardContext(1)
    ctx.from = {
      id: 123456789,
      is_bot: false,
      first_name: 'Test',
      username: 'test_user',
      language_code: 'ru',
    }

    // Имитируем сессию с массивом изображений
    ctx.session = {
      ...ctx.session,
      images: [],
    }

    // Имитируем сообщение с фотографией
    ctx.message = {
      message_id: 1,
      photo: [
        {
          file_id: 'test_file_id',
          file_unique_id: 'test_unique_id',
          width: 100,
          height: 100,
          file_size: 1024,
        },
      ],
    } as any

    // Мокируем функции Telegram API
    ctx.telegram = {
      ...ctx.telegram,
      getFile: async () => ({ file_path: 'photos/test.jpg' }),
      sendMessage: async () => ({ message_id: 2 }),
    } as any

    // Мокируем fetch для имитации получения изображения
    global.fetch = jest.fn().mockResolvedValue({
      arrayBuffer: jest.fn().mockResolvedValue(new ArrayBuffer(10240)),
    })

    // Запускаем второй шаг сцены для обработки фото
    await trainFluxModelWizard.steps[1](ctx as unknown as MyContext)

    // Проверяем, что изображение было добавлено в сессию
    assertContains(ctx.session.images.length, 1)

    return {
      name: 'trainFluxModelWizard: Upload Image',
      success: true,
      message: 'Успешно загружено и обработано изображение',
    }
  } catch (error) {
    return {
      name: 'trainFluxModelWizard: Upload Image',
      success: false,
      message: String(error),
    }
  }
}

/**
 * Тестирует отправку команды завершения при недостаточном количестве изображений
 */
export async function testTrainFluxModelWizard_NotEnoughImages(): Promise<TestResult> {
  try {
    // Создаем мок контекста
    const ctx = createMockWizardContext(1)
    ctx.from = {
      id: 123456789,
      is_bot: false,
      first_name: 'Test',
      username: 'test_user',
      language_code: 'ru',
    }

    // Имитируем сессию с недостаточным количеством изображений
    ctx.session = {
      ...ctx.session,
      images: [{ buffer: Buffer.from('test'), filename: 'test.jpg' }],
    }

    // Имитируем команду завершения
    ctx.message = {
      message_id: 1,
      text: '/done',
    } as any

    // Запускаем второй шаг сцены для обработки команды
    await trainFluxModelWizard.steps[1](ctx as unknown as MyContext)

    // Проверяем, что бот отправил сообщение о недостаточном количестве изображений
    assertReplyContains(ctx, 'минимум 10 изображений')

    return {
      name: 'trainFluxModelWizard: Not Enough Images',
      success: true,
      message:
        'Корректно обработана ситуация с недостаточным количеством изображений',
    }
  } catch (error) {
    return {
      name: 'trainFluxModelWizard: Not Enough Images',
      success: false,
      message: String(error),
    }
  }
}

/**
 * Тестирует успешное завершение загрузки с достаточным количеством изображений
 */
export async function testTrainFluxModelWizard_CompleteUpload(): Promise<TestResult> {
  try {
    // Создаем мок контекста
    const ctx = createMockWizardContext(1)
    ctx.from = {
      id: 123456789,
      is_bot: false,
      first_name: 'Test',
      username: 'test_user',
      language_code: 'ru',
    }

    // Имитируем сессию с достаточным количеством изображений
    ctx.session = {
      ...ctx.session,
      images: Array(10).fill({
        buffer: Buffer.from('test'),
        filename: 'test.jpg',
      }),
    }

    // Имитируем команду завершения
    ctx.message = {
      message_id: 1,
      text: '/done',
    } as any

    // Мокируем функцию перехода на другую сцену
    ;(ctx as any).scene.enter = (sceneName: string) => {
      ctx.wizard.scene.current = sceneName
      return Promise.resolve()
    }

    // Запускаем второй шаг сцены для обработки команды
    await trainFluxModelWizard.steps[1](ctx as unknown as MyContext)

    // Проверяем, что произошел переход на сцену загрузки ZIP
    assertContains(ctx.wizard.scene.current, 'uploadTrainFluxModelScene')

    return {
      name: 'trainFluxModelWizard: Complete Upload',
      success: true,
      message:
        'Успешно завершена загрузка фотографий и выполнен переход на следующую сцену',
    }
  } catch (error) {
    return {
      name: 'trainFluxModelWizard: Complete Upload',
      success: false,
      message: String(error),
    }
  }
}

/**
 * Тестирует загрузку невалидного изображения
 */
export async function testTrainFluxModelWizard_InvalidImage(): Promise<TestResult> {
  try {
    // Создаем мок контекста
    const ctx = createMockWizardContext(1)
    ctx.from = {
      id: 123456789,
      is_bot: false,
      first_name: 'Test',
      username: 'test_user',
      language_code: 'ru',
    }

    // Имитируем сессию с массивом изображений
    ctx.session = {
      ...ctx.session,
      images: [],
    }

    // Имитируем сообщение с фотографией
    ctx.message = {
      message_id: 1,
      photo: [
        {
          file_id: 'invalid_file_id',
          file_unique_id: 'invalid_unique_id',
          width: 100,
          height: 100,
          file_size: 1024,
        },
      ],
    } as any

    // Мокируем функции Telegram API для возврата ошибки
    ctx.telegram = {
      ...ctx.telegram,
      getFile: async () => ({ file_path: 'photos/invalid.jpg' }),
      sendMessage: async () => ({ message_id: 2 }),
    } as any

    // Мокируем fetch для имитации получения невалидного изображения
    global.fetch = jest.fn().mockResolvedValue({
      arrayBuffer: jest.fn().mockResolvedValue(new ArrayBuffer(10)),
    })

    // Мокируем функцию проверки изображения для возврата false
    jest.mock('@/helpers/images', () => ({
      isValidImage: () => Promise.resolve(false),
    }))

    // Запускаем второй шаг сцены для обработки фото
    await trainFluxModelWizard.steps[1](ctx as unknown as MyContext)

    return {
      name: 'trainFluxModelWizard: Invalid Image',
      success: true,
      message: 'Корректно обработана загрузка невалидного изображения',
    }
  } catch (error) {
    return {
      name: 'trainFluxModelWizard: Invalid Image',
      success: false,
      message: String(error),
    }
  }
}

/**
 * Тестирует отмену загрузки
 */
export async function testTrainFluxModelWizard_Cancel(): Promise<TestResult> {
  try {
    // Создаем мок контекста
    const ctx = createMockWizardContext(1)
    ctx.from = {
      id: 123456789,
      is_bot: false,
      first_name: 'Test',
      username: 'test_user',
      language_code: 'ru',
    }

    // Имитируем сообщение с командой отмены
    ctx.message = {
      message_id: 1,
      text: 'Отмена',
    } as any

    // Мокируем функцию выхода из сцены
    ;(ctx as any).scene.leave = () => {
      ctx.wizard.scene.current = null
      return Promise.resolve()
    }

    // Запускаем второй шаг сцены
    await trainFluxModelWizard.steps[1](ctx as unknown as MyContext)

    // Проверяем, что произошел выход из сцены
    assertContains(ctx.wizard.scene.current, null)

    return {
      name: 'trainFluxModelWizard: Cancel',
      success: true,
      message: 'Успешно обработана команда отмены',
    }
  } catch (error) {
    return {
      name: 'trainFluxModelWizard: Cancel',
      success: false,
      message: String(error),
    }
  }
}

/**
 * Тестирует загрузку слишком большого изображения
 */
export async function testTrainFluxModelWizard_TooLargeImage(): Promise<TestResult> {
  try {
    // Создаем мок контекста
    const ctx = createMockWizardContext(1)
    ctx.from = {
      id: 123456789,
      is_bot: false,
      first_name: 'Test',
      username: 'test_user',
      language_code: 'ru',
    }

    // Имитируем сессию с массивом изображений
    ctx.session = {
      ...ctx.session,
      images: [],
    }

    // Имитируем сообщение с фотографией
    ctx.message = {
      message_id: 1,
      photo: [
        {
          file_id: 'large_file_id',
          file_unique_id: 'large_unique_id',
          width: 5000,
          height: 5000,
          file_size: 15 * 1024 * 1024, // 15 MB
        },
      ],
    } as any

    // Мокируем функции Telegram API
    ctx.telegram = {
      ...ctx.telegram,
      getFile: async () => ({ file_path: 'photos/large.jpg' }),
      sendMessage: async () => ({ message_id: 2 }),
    } as any

    // Мокируем fetch для имитации получения слишком большого изображения
    global.fetch = jest.fn().mockResolvedValue({
      arrayBuffer: jest
        .fn()
        .mockResolvedValue(new ArrayBuffer(15 * 1024 * 1024)),
    })

    // Запускаем второй шаг сцены для обработки фото
    await trainFluxModelWizard.steps[1](ctx as unknown as MyContext)

    // Проверяем, что бот отправил сообщение о слишком большом размере
    assertReplyContains(ctx, 'слишком большое')

    return {
      name: 'trainFluxModelWizard: Too Large Image',
      success: true,
      message: 'Корректно обработана загрузка слишком большого изображения',
    }
  } catch (error) {
    return {
      name: 'trainFluxModelWizard: Too Large Image',
      success: false,
      message: String(error),
    }
  }
}

/**
 * Запускает все тесты для сцены trainFluxModelWizard
 */
export async function runTrainFluxModelWizardTests(): Promise<TestResult[]> {
  console.log(
    '🧪 Запуск тестов сцены trainFluxModelWizard (Загрузка фотографий)...'
  )

  const results: TestResult[] = []

  try {
    results.push(await testTrainFluxModelWizard_EnterScene())
    results.push(await testTrainFluxModelWizard_UploadImage())
    results.push(await testTrainFluxModelWizard_NotEnoughImages())
    results.push(await testTrainFluxModelWizard_CompleteUpload())
    results.push(await testTrainFluxModelWizard_InvalidImage())
    results.push(await testTrainFluxModelWizard_Cancel())
    results.push(await testTrainFluxModelWizard_TooLargeImage())
  } catch (error) {
    console.error('❌ Ошибка при запуске тестов trainFluxModelWizard:', error)
  }

  // Выводим сводку результатов
  const totalTests = results.length
  const passedTests = results.filter(r => r.success).length
  const failedTests = totalTests - passedTests

  console.log(
    `\n📊 Результаты тестов trainFluxModelWizard (${passedTests}/${totalTests}):`
  )
  results.forEach(result => {
    console.log(
      `${result.success ? '✅' : '❌'} ${result.name}: ${result.success ? 'УСПЕХ' : 'ОШИБКА'}`
    )
    if (!result.success) {
      console.log(`   Сообщение: ${result.message}`)
    }
  })

  return results
}

export default runTrainFluxModelWizardTests
