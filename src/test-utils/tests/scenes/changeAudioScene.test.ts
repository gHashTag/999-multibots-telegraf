/**
 * Тесты для сцены Change Audio
 */

import { mockLogger } from '../../core/mock/logger'
import { createTestContext } from '../../core/mockContext'
import { TEXTS as RU_TEXTS } from '../../../locales/ru'
import { TEXTS as EN_TEXTS } from '../../../locales/en'
import { SCENES } from '../../../constants'

// Мокируем логгер
mockLogger()

// Имитация базовых данных для сцены
const mockSceneData = {
  sceneId: 'changeAudioScene',
  commands: {
    cancel: '/cancel',
    help: '/help',
  },
  buttons: {
    american: 'American',
    british: 'British',
    australian: 'Australian',
    indian: 'Indian',
    russian: 'Russian',
    cancel: 'Cancel',
    back: 'Back',
  },
}

/**
 * Основная функция тестирования
 */
const runTests = async () => {
  let total = 0
  let passed = 0
  let failed = 0

  console.log('🔊 Начинаем тестирование сцены Change Audio')
  console.log('==========================================')

  // Тест 1: Проверка входа в сцену и отображения приветственного сообщения
  total++
  console.log(
    '\n🔍 Тест 1: Сцена должна отображать приветственное сообщение при входе'
  )
  try {
    const ctx = createTestContext()

    // Имитируем вход в сцену
    await ctx.scene.enter(mockSceneData.sceneId)

    // Проверяем, что отправлено приветственное сообщение
    if (
      ctx.reply.mock.calls.length > 0 &&
      ctx.reply.mock.calls[0][0].includes('Choose a voice')
    ) {
      console.log(
        '✅ Тест 1 успешно пройден: Сцена отображает приветственное сообщение'
      )
      passed++
    } else {
      throw new Error('Сцена не отображает приветственное сообщение при входе')
    }
  } catch (error) {
    console.error('❌ Тест 1 не пройден:', (error as Error).message)
    failed++
  }

  // Тест 2: Проверка выбора американского акцента
  total++
  console.log(
    '\n🔍 Тест 2: Сцена должна обрабатывать выбор американского акцента'
  )
  try {
    const ctx = createTestContext({
      message: { text: mockSceneData.buttons.american },
    })

    // Имитируем выбор акцента
    await ctx.scene.enter(mockSceneData.sceneId)
    await ctx.callbackQuery?.data(mockSceneData.buttons.american)

    // Проверяем подтверждение выбора
    if (
      ctx.reply.mock.calls.some(
        call => call[0].includes('American') && call[0].includes('selected')
      )
    ) {
      console.log(
        '✅ Тест 2 успешно пройден: Сцена обрабатывает выбор американского акцента'
      )
      passed++
    } else {
      throw new Error('Сцена не обрабатывает выбор американского акцента')
    }
  } catch (error) {
    console.error('❌ Тест 2 не пройден:', (error as Error).message)
    failed++
  }

  // Тест 3: Проверка выбора британского акцента
  total++
  console.log(
    '\n🔍 Тест 3: Сцена должна обрабатывать выбор британского акцента'
  )
  try {
    const ctx = createTestContext({
      message: { text: mockSceneData.buttons.british },
    })

    // Имитируем выбор акцента
    await ctx.scene.enter(mockSceneData.sceneId)
    await ctx.callbackQuery?.data(mockSceneData.buttons.british)

    // Проверяем подтверждение выбора
    if (
      ctx.reply.mock.calls.some(
        call => call[0].includes('British') && call[0].includes('selected')
      )
    ) {
      console.log(
        '✅ Тест 3 успешно пройден: Сцена обрабатывает выбор британского акцента'
      )
      passed++
    } else {
      throw new Error('Сцена не обрабатывает выбор британского акцента')
    }
  } catch (error) {
    console.error('❌ Тест 3 не пройден:', (error as Error).message)
    failed++
  }

  // Тест 4: Проверка команды отмены
  total++
  console.log('\n🔍 Тест 4: Сцена должна обрабатывать команду отмены')
  try {
    const ctx = createTestContext({
      message: { text: mockSceneData.commands.cancel },
    })

    // Имитируем вход в сцену и отмену
    await ctx.scene.enter(mockSceneData.sceneId)
    await ctx.message?.text(mockSceneData.commands.cancel)

    // Проверяем, что сцена завершилась
    if (ctx.scene.leave.mock.calls.length > 0) {
      console.log(
        '✅ Тест 4 успешно пройден: Сцена обрабатывает команду отмены'
      )
      passed++
    } else {
      throw new Error('Сцена не обрабатывает команду отмены')
    }
  } catch (error) {
    console.error('❌ Тест 4 не пройден:', (error as Error).message)
    failed++
  }

  // Тест 5: Проверка команды помощи
  total++
  console.log('\n🔍 Тест 5: Сцена должна обрабатывать команду помощи')
  try {
    const ctx = createTestContext({
      message: { text: mockSceneData.commands.help },
    })

    // Имитируем вход в сцену и запрос помощи
    await ctx.scene.enter(mockSceneData.sceneId)
    await ctx.message?.text(mockSceneData.commands.help)

    // Проверяем отображение справочной информации
    if (ctx.reply.mock.calls.some(call => call[0].includes('help'))) {
      console.log(
        '✅ Тест 5 успешно пройден: Сцена обрабатывает команду помощи'
      )
      passed++
    } else {
      throw new Error('Сцена не обрабатывает команду помощи')
    }
  } catch (error) {
    console.error('❌ Тест 5 не пройден:', (error as Error).message)
    failed++
  }

  // Тест 6: Проверка кнопки назад
  total++
  console.log('\n🔍 Тест 6: Сцена должна обрабатывать кнопку назад')
  try {
    const ctx = createTestContext({
      message: { text: mockSceneData.buttons.back },
    })

    // Имитируем вход в сцену и нажатие кнопки назад
    await ctx.scene.enter(mockSceneData.sceneId)
    await ctx.callbackQuery?.data(mockSceneData.buttons.back)

    // Проверяем возврат в предыдущее меню
    if (
      ctx.scene.leave.mock.calls.length > 0 ||
      ctx.scene.enter.mock.calls.length > 1
    ) {
      console.log('✅ Тест 6 успешно пройден: Сцена обрабатывает кнопку назад')
      passed++
    } else {
      throw new Error('Сцена не обрабатывает кнопку назад')
    }
  } catch (error) {
    console.error('❌ Тест 6 не пройден:', (error as Error).message)
    failed++
  }

  // Тест 7: Проверка обработки неверного ввода
  total++
  console.log('\n🔍 Тест 7: Сцена должна корректно обрабатывать неверный ввод')
  try {
    const ctx = createTestContext({
      message: { text: 'Неверный ввод' },
    })

    // Имитируем вход в сцену и неверный ввод
    await ctx.scene.enter(mockSceneData.sceneId)
    await ctx.message?.text('Неверный ввод')

    // Проверяем отображение сообщения об ошибке
    if (
      ctx.reply.mock.calls.some(
        call =>
          call[0].includes('invalid') || call[0].includes('not recognized')
      )
    ) {
      console.log('✅ Тест 7 успешно пройден: Сцена обрабатывает неверный ввод')
      passed++
    } else {
      throw new Error('Сцена не обрабатывает неверный ввод')
    }
  } catch (error) {
    console.error('❌ Тест 7 не пройден:', (error as Error).message)
    failed++
  }

  // Тест 8: Проверка локализации (русский)
  total++
  console.log('\n🔍 Тест 8: Сцена должна поддерживать русскую локализацию')
  try {
    const ctx = createTestContext({
      session: { language: 'ru' },
    })

    // Имитируем вход в сцену с русской локализацией
    await ctx.scene.enter(mockSceneData.sceneId)

    // Проверяем наличие русских текстов
    if (
      ctx.reply.mock.calls.some(
        call => call[0].includes('Выберите голос') || call[0].includes('акцент')
      )
    ) {
      console.log(
        '✅ Тест 8 успешно пройден: Сцена поддерживает русскую локализацию'
      )
      passed++
    } else {
      throw new Error('Сцена не поддерживает русскую локализацию')
    }
  } catch (error) {
    console.error('❌ Тест 8 не пройден:', (error as Error).message)
    failed++
  }

  // Тест 9: Проверка локализации (английский)
  total++
  console.log('\n🔍 Тест 9: Сцена должна поддерживать английскую локализацию')
  try {
    const ctx = createTestContext({
      session: { language: 'en' },
    })

    // Имитируем вход в сцену с английской локализацией
    await ctx.scene.enter(mockSceneData.sceneId)

    // Проверяем наличие английских текстов
    if (
      ctx.reply.mock.calls.some(
        call => call[0].includes('Choose a voice') || call[0].includes('accent')
      )
    ) {
      console.log(
        '✅ Тест 9 успешно пройден: Сцена поддерживает английскую локализацию'
      )
      passed++
    } else {
      throw new Error('Сцена не поддерживает английскую локализацию')
    }
  } catch (error) {
    console.error('❌ Тест 9 не пройден:', (error as Error).message)
    failed++
  }

  // Итоговая статистика
  console.log('\n==========================================')
  console.log(`📊 Итоги тестирования: ${passed} из ${total} тестов пройдено`)

  if (failed > 0) {
    console.log(`❌ Не пройдено тестов: ${failed}`)
    process.exit(1)
  } else {
    console.log('✅ Все тесты успешно пройдены!')
    process.exit(0)
  }
}

export default runTests
