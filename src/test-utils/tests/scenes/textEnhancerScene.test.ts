import { Scenes } from 'telegraf'
import { MyContext } from '@/interfaces'
import { isRussian } from '@/helpers'
import { enhanceText, validateText } from '@/services/textEnhancer'
import { handleHelpCancel } from '@/handlers'
import { TestResult } from '../../core/types'
import { TestCategory } from '../../core/categories'

// Константы для тестов
const TEST_USER_ID = 123456789
const TEST_CHAT_ID = 987654321
const TEST_BOT_USERNAME = 'test_bot'
const TEST_TEXT = 'Тестовый текст для улучшения'

// Создание мок-функций
function createMockFunction<T extends (...args: any[]) => any>(implementation?: T) {
  const calls: any[][] = []
  const fn = (...args: any[]) => {
    calls.push(args)
    return implementation?.(...args)
  }
  fn.calls = calls
  return fn
}

// Моки
const mockIsRussian = createMockFunction((ctx: MyContext) => true)
const mockEnhanceText = createMockFunction(async (params: any, ctx: any) => ({
  enhancedText: `Улучшенная версия: ${params.text}`,
  originalText: params.text,
  style: params.style || 'default',
  tone: params.tone || 'neutral',
  length: params.length || 'medium'
}))
const mockHandleHelpCancel = createMockFunction(async () => false)

// Создание тестового контекста
function createTestContext() {
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
    message: null as any,
    session: {} as any
  }
}

// Тест: Вход в сцену улучшения текста
async function testTextEnhancerScene_Enter(): Promise<TestResult> {
  console.log('🚀 Запуск теста: Вход в сцену textEnhancerScene (RU)')
  
  try {
    const ctx = createTestContext()
    const scene = new Scenes.WizardScene<MyContext>(
      'textEnhancerScene',
      async (ctx) => {
        await ctx.reply(
          'Отправьте текст, который нужно улучшить:',
          {
            reply_markup: {
              keyboard: [['Отмена']],
              resize_keyboard: true
            }
          }
        )
        return ctx.wizard.next()
      }
    )

    await scene.middleware()(ctx as any, async () => {})

    // Проверяем отправку правильного сообщения
    const replyCall = ctx.reply.calls[0]
    if (!replyCall || !replyCall[0].includes('Отправьте текст')) {
      throw new Error('Неверное сообщение при входе в сцену')
    }

    return {
      name: 'TextEnhancer: Enter Scene',
      category: TestCategory.SCENE,
      success: true,
      message: 'Успешный вход в сцену и отображение приглашения'
    }
  } catch (error: any) {
    return {
      name: 'TextEnhancer: Enter Scene',
      category: TestCategory.SCENE,
      success: false,
      message: `Ошибка при входе в сцену: ${error.message}`
    }
  }
}

// Тест: Отправка текста для улучшения
async function testTextEnhancerScene_SubmitText(): Promise<TestResult> {
  console.log('🚀 Запуск теста: Отправка текста для улучшения')
  
  try {
    const ctx = createTestContext()
    ctx.message = { text: TEST_TEXT } as any
    ctx.wizard.step = 1
    
    const scene = new Scenes.WizardScene<MyContext>(
      'textEnhancerScene',
      async () => 1,
      async (ctx) => {
        const message = ctx.message
        if (!message || !('text' in message)) {
          await ctx.reply('Пожалуйста, отправьте текстовое сообщение.')
          return ctx.scene.reenter()
        }

        if (!validateText(message.text)) {
          await ctx.reply('Текст слишком длинный или пустой. Пожалуйста, отправьте текст от 1 до 2000 символов.')
          return ctx.scene.reenter()
        }

        const result = await enhanceText({ text: message.text }, ctx)
        await ctx.reply(result.enhancedText)
        return ctx.scene.leave()
      }
    )

    await scene.middleware()(ctx as any, async () => {})

    // Проверяем вызов функции улучшения текста
    if (mockEnhanceText.calls.length === 0) {
      throw new Error('Функция улучшения текста не была вызвана')
    }

    return {
      name: 'TextEnhancer: Submit Text',
      category: TestCategory.SCENE,
      success: true,
      message: 'Успешная обработка текста и улучшение'
    }
  } catch (error: any) {
    return {
      name: 'TextEnhancer: Submit Text',
      category: TestCategory.SCENE,
      success: false,
      message: `Ошибка при обработке текста: ${error.message}`
    }
  }
}

// Тест: Отправка некорректного текста
async function testTextEnhancerScene_InvalidText(): Promise<TestResult> {
  console.log('🚀 Запуск теста: Отправка некорректного текста')
  
  try {
    const ctx = createTestContext()
    ctx.message = { text: '' } as any
    ctx.wizard.step = 1
    
    const scene = new Scenes.WizardScene<MyContext>(
      'textEnhancerScene',
      async () => 1,
      async (ctx) => {
        const message = ctx.message
        if (!message || !('text' in message)) {
          await ctx.reply('Пожалуйста, отправьте текстовое сообщение.')
          return ctx.scene.reenter()
        }

        if (!validateText(message.text)) {
          await ctx.reply('Текст слишком длинный или пустой. Пожалуйста, отправьте текст от 1 до 2000 символов.')
          return ctx.scene.reenter()
        }

        return ctx.wizard.next()
      }
    )

    await scene.middleware()(ctx as any, async () => {})

    // Проверяем отправку сообщения об ошибке
    const replyCall = ctx.reply.calls[0]
    if (!replyCall || !replyCall[0].includes('слишком длинный или пустой')) {
      throw new Error('Не отправлено сообщение об ошибке при пустом тексте')
    }

    return {
      name: 'TextEnhancer: Invalid Text',
      category: TestCategory.SCENE,
      success: true,
      message: 'Успешная обработка некорректного текста'
    }
  } catch (error: any) {
    return {
      name: 'TextEnhancer: Invalid Text',
      category: TestCategory.SCENE,
      success: false,
      message: `Ошибка при обработке некорректного текста: ${error.message}`
    }
  }
}

// Функция для запуска всех тестов
export async function runTextEnhancerSceneTests(): Promise<TestResult[]> {
  console.log('🚀 Запуск тестов для textEnhancerScene')
  
  const testResults = [
    await testTextEnhancerScene_Enter(),
    await testTextEnhancerScene_SubmitText(),
    await testTextEnhancerScene_InvalidText()
  ]
  
  let passedTests = 0
  let failedTests = 0
  
  testResults.forEach(result => {
    if (result.success) {
      passedTests++
      console.log(`✅ ${result.name}: ${result.message}`)
    } else {
      failedTests++
      console.log(`❌ ${result.name}: ${result.message}`)
    }
  })
  
  console.log(`\n📊 Результаты тестирования textEnhancerScene:`)
  console.log(`✅ Успешно: ${passedTests}`)
  console.log(`❌ Неудачно: ${failedTests}`)
  console.log(`📝 Всего тестов: ${testResults.length}`)
  
  return testResults
}

// Запуск тестов при прямом вызове файла
if (require.main === module) {
  runTextEnhancerSceneTests().catch(console.error)
} 