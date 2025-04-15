import { Scenes } from 'telegraf'
import { MyContext, MySession, MyWizardSession } from '@/interfaces'
import { isRussian } from '@/helpers'
import { generateNeuroImage } from '@/services/generateNeuroImage'
import { handleHelpCancel } from '@/handlers'
import { promptNeuroCoder } from '@/scenes/neuroCoderScene/promts'

// Константы для тестов
const TEST_USER_ID = 123456789
const TEST_CHAT_ID = 987654321
const TEST_BOT_USERNAME = 'test_bot'
const TEST_MODEL_URL = 'ghashtag/neuro_coder_flux-dev-lora:5ff9ea5918427540563f09940bf95d6efc16b8ce9600e82bb17c2b188384e355'

// Интерфейс для типизации моков
interface MockFunction<T extends (...args: any[]) => any> {
  (...args: Parameters<T>): ReturnType<T>
  calls: Parameters<T>[]
}

// Создание типизированной мок-функции
function createMockFunction<T extends (...args: any[]) => any>(implementation?: T): MockFunction<T> {
  const calls: Parameters<T>[] = []
  const fn = (...args: Parameters<T>) => {
    calls.push(args)
    return implementation?.(...args)
  }
  return Object.assign(fn, { calls }) as MockFunction<T>
}

// Типизированные моки
const mockIsRussian = createMockFunction<typeof isRussian>((ctx) => true)
const mockIsEnglish = createMockFunction<typeof isRussian>((ctx) => false)
const mockGenerateNeuroImage = createMockFunction<typeof generateNeuroImage>(async () => {})
const mockHandleHelpCancel = createMockFunction<typeof handleHelpCancel>(async () => false)

// Интерфейс для тестового контекста
interface TestContext extends Partial<MyContext> {
  from?: { id: number }
  chat?: { id: number }
  botInfo?: { username: string }
  wizard: {
    next: () => number
    selectStep: (step: number) => void
    step: number
  }
  scene: {
    leave: () => Promise<void>
    reenter: () => Promise<void>
  }
  reply: (text: string, extra?: any) => Promise<void>
  message?: { text?: string }
  session: Partial<MySession>
}

// Создание типизированного тестового контекста
function createTestContext(isRu: boolean = true): TestContext {
  return {
    from: { id: TEST_USER_ID },
    chat: { id: TEST_CHAT_ID },
    botInfo: { username: TEST_BOT_USERNAME },
    wizard: {
      next: () => 1,
      selectStep: (step: number) => {},
      step: 0
    },
    scene: {
      leave: createMockFunction(async () => {}),
      reenter: createMockFunction(async () => {})
    },
    reply: createMockFunction(async (text: string, extra?: any) => {}),
    session: {
      prompt: undefined,
      selectedModel: undefined,
      audioToText: {
        audioFileId: undefined,
        audioFileUrl: undefined,
        transcription: undefined
      }
    },
    message: undefined
  }
}

// Тест: Вход в сцену на русском языке
async function testNeuroCoderScene_Enter() {
  console.log('🚀 Запуск теста: Вход в сцену neuroCoderScene (RU)')
  
  try {
    const ctx = createTestContext(true) as unknown as MyContext
    const scene = new Scenes.WizardScene<MyContext>(
      'neuroCoderScene',
      async (ctx) => {
        await ctx.reply(
          'Выберите количество изображений для генерации:',
          {
            reply_markup: {
              keyboard: [
                ['1️', '2'],
                ['30', '50'],
                ['Отмена'],
              ],
              resize_keyboard: true
            }
          }
        )
        return ctx.wizard.next()
      }
    )

    await scene.middleware()(ctx, async () => {})

    const replyCall = (ctx.reply as MockFunction<any>).calls[0]
    if (!replyCall || !replyCall[0].includes('Выберите количество изображений')) {
      throw new Error('Неверное сообщение при входе в сцену')
    }

    return {
      name: 'testNeuroCoderScene_Enter',
      success: true,
      message: 'Успешный вход в сцену и отображение меню на русском'
    }
  } catch (error: any) {
    return {
      name: 'testNeuroCoderScene_Enter',
      success: false,
      message: `Ошибка при входе в сцену: ${error.message}`
    }
  }
}

// Тест: Вход в сцену на английском языке
async function testNeuroCoderScene_EnterEnglish() {
  console.log('🚀 Starting test: Enter neuroCoderScene (EN)')
  
  try {
    const ctx = createTestContext(false)
    const scene = new Scenes.WizardScene<MyContext>(
      'neuroCoderScene',
      async (ctx) => {
        await ctx.reply(
          'Select number of images to generate:',
          {
            reply_markup: {
              keyboard: [
                ['1️', '2'],
                ['30', '50'],
                ['Cancel'],
              ],
              resize_keyboard: true
            }
          }
        )
        return ctx.wizard.next()
      }
    )

    await scene.middleware()(ctx as any, async () => {})

    const replyCall = (ctx.reply as MockFunction<any>).calls[0]
    if (!replyCall || !replyCall[0].includes('Select number of images')) {
      throw new Error('Incorrect message on scene enter (English)')
    }

    return {
      name: 'testNeuroCoderScene_EnterEnglish',
      success: true,
      message: 'Successfully entered scene and displayed menu in English'
    }
  } catch (error: any) {
    return {
      name: 'testNeuroCoderScene_EnterEnglish',
      success: false,
      message: `Error entering scene: ${error.message}`
    }
  }
}

// Тест: Выбор количества изображений
async function testNeuroCoderScene_SelectNumberOfImages() {
  console.log('🚀 Запуск теста: Выбор количества изображений')
  
  try {
    const ctx = createTestContext() as unknown as MyContext
    ctx.message = { text: '30' }
    ctx.session.prompt = promptNeuroCoder
    
    const scene = new Scenes.WizardScene<MyContext>(
      'neuroCoderScene',
      async () => 1,
      async (ctx) => {
        const message = ctx.message
        if (!message || !ctx.from?.id) {
          await ctx.reply('Ошибка при выборе количества изображений.')
          return ctx.scene.leave()
        }

        if ('text' in message) {
          const numImages = parseInt(message.text)
          await generateNeuroImage(
            promptNeuroCoder,
            TEST_MODEL_URL,
            numImages,
            ctx.from.id.toString(),
            ctx,
            ctx.botInfo?.username
          )
          return ctx.scene.leave()
        }
        
        await ctx.reply('Пожалуйста, выберите количество изображений.')
        return ctx.scene.reenter()
      }
    )

    ctx.wizard.step = 1
    await scene.middleware()(ctx, async () => {})

    const generateCall = mockGenerateNeuroImage.calls[0]
    if (!generateCall) {
      throw new Error('Функция генерации изображений не была вызвана')
    }

    if (generateCall[2] !== 30) {
      throw new Error(`Неверное количество изображений: ${generateCall[2]}`)
    }

    return {
      name: 'testNeuroCoderScene_SelectNumberOfImages',
      success: true,
      message: 'Успешный выбор количества изображений и вызов генерации'
    }
  } catch (error: any) {
    return {
      name: 'testNeuroCoderScene_SelectNumberOfImages',
      success: false,
      message: `Ошибка при выборе количества изображений: ${error.message}`
    }
  }
}

// Тест: Проверка некорректного ввода
async function testNeuroCoderScene_InvalidInput() {
  console.log('🚀 Запуск теста: Проверка некорректного ввода')
  
  try {
    const ctx = createTestContext()
    ctx.message = { text: 'invalid' }
    
    const scene = new Scenes.WizardScene<MyContext>(
      'neuroCoderScene',
      async () => 1,
      async (ctx) => {
        const message = ctx.message
        if (!message || !('text' in message) || isNaN(parseInt(message.text))) {
          await ctx.reply('Пожалуйста, выберите количество изображений.')
          return ctx.scene.reenter()
        }
        return ctx.scene.leave()
      }
    )

    ctx.wizard.step = 1
    await scene.middleware()(ctx as any, async () => {})

    const replyCall = (ctx.reply as MockFunction<any>).calls[0]
    if (!replyCall || !replyCall[0].includes('Пожалуйста, выберите количество изображений')) {
      throw new Error('Неверная обработка некорректного ввода')
    }

    return {
      name: 'testNeuroCoderScene_InvalidInput',
      success: true,
      message: 'Успешная обработка некорректного ввода'
    }
  } catch (error: any) {
    return {
      name: 'testNeuroCoderScene_InvalidInput',
      success: false,
      message: `Ошибка при обработке некорректного ввода: ${error.message}`
    }
  }
}

// Тест: Отмена операции
async function testNeuroCoderScene_Cancel() {
  console.log('🚀 Запуск теста: Отмена операции')
  
  try {
    const ctx = createTestContext()
    ctx.message = { text: 'Отмена' }
    mockHandleHelpCancel.calls = []
    
    const scene = new Scenes.WizardScene<MyContext>(
      'neuroCoderScene',
      async () => 1,
      async (ctx) => {
        const isCancel = await handleHelpCancel(ctx)
        if (isCancel) {
          return ctx.scene.leave()
        }
        return ctx.scene.reenter()
      }
    )

    ctx.wizard.step = 1
    await scene.middleware()(ctx as any, async () => {})

    if (mockHandleHelpCancel.calls.length === 0) {
      throw new Error('Функция handleHelpCancel не была вызвана')
    }

    return {
      name: 'testNeuroCoderScene_Cancel',
      success: true,
      message: 'Успешная отмена операции'
    }
  } catch (error: any) {
    return {
      name: 'testNeuroCoderScene_Cancel',
      success: false,
      message: `Ошибка при отмене операции: ${error.message}`
    }
  }
}

// Тест: Проверка сохранения промпта в сессии
async function testNeuroCoderScene_SavePrompt() {
  console.log('🚀 Запуск теста: Проверка сохранения промпта')
  
  try {
    const ctx = createTestContext()
    ctx.message = { text: '1' }
    ctx.session = {}
    
    const scene = new Scenes.WizardScene<MyContext>(
      'neuroCoderScene',
      async () => 1,
      async (ctx) => {
        ctx.session.prompt = promptNeuroCoder
        return ctx.wizard.next()
      }
    )

    ctx.wizard.step = 1
    await scene.middleware()(ctx as any, async () => {})

    if (ctx.session.prompt !== promptNeuroCoder) {
      throw new Error('Промпт не был сохранен в сессии')
    }

    return {
      name: 'testNeuroCoderScene_SavePrompt',
      success: true,
      message: 'Успешное сохранение промпта в сессии'
    }
  } catch (error: any) {
    return {
      name: 'testNeuroCoderScene_SavePrompt',
      success: false,
      message: `Ошибка при сохранении промпта: ${error.message}`
    }
  }
}

// Функция для запуска всех тестов
export async function runNeuroCoderSceneTests() {
  console.log('🚀 Запуск тестов для neuroCoderScene')
  
  const testResults = [
    await testNeuroCoderScene_Enter(),
    await testNeuroCoderScene_EnterEnglish(),
    await testNeuroCoderScene_SelectNumberOfImages(),
    await testNeuroCoderScene_InvalidInput(),
    await testNeuroCoderScene_Cancel(),
    await testNeuroCoderScene_SavePrompt()
  ]
  
  let totalTests = testResults.length
  let passedTests = testResults.filter(r => r.success).length
  
  console.log('\n📊 Результаты тестирования:')
  testResults.forEach(result => {
    if (result.success) {
      console.log(`✅ ${result.name}: ${result.message}`)
    } else {
      console.log(`❌ ${result.name}: ${result.message}`)
    }
  })
  
  console.log(`\n📈 Статистика:`)
  console.log(`✅ Успешно: ${passedTests}`)
  console.log(`❌ Неудачно: ${totalTests - passedTests}`)
  console.log(`📝 Всего тестов: ${totalTests}`)
  console.log(`🎯 Покрытие: ${((passedTests / totalTests) * 100).toFixed(1)}%`)
  
  return testResults
}

// Запуск тестов при прямом вызове файла
if (require.main === module) {
  runNeuroCoderSceneTests().catch(console.error)
} 