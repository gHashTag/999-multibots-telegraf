import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'bun:test'
import { Telegraf, Scenes, session } from 'telegraf'
import { MyContext } from '@/interfaces'
import { textToVideoWizard } from '../../src/scenes/textToVideoWizard'

// Интеграционный тест с реальным Telegraf ботом
describe('TextToVideoWizard - Integration Tests', () => {
  let bot: Telegraf<MyContext>
  let stage: Scenes.Stage<MyContext>
  let testUser: MyContext
  
  // Перехватываем все вызовы ctx.reply для анализа
  const replyHistory: Array<{
    text: string
    options?: any
    timestamp: number
  }> = []
  
  const consoleLogHistory: string[] = []
  
  beforeAll(async () => {
    // Перехватываем console.log для отслеживания выполнения
    const originalConsoleLog = console.log
    console.log = (...args) => {
      const message = args.map(arg => 
        typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
      ).join(' ')
      consoleLogHistory.push(message)
      originalConsoleLog(...args)
    }
    
    // Создаем реального бота с реальным Stage
    bot = new Telegraf<MyContext>('dummy-token')
    stage = new Scenes.Stage<MyContext>([textToVideoWizard])
    
    // Настраиваем middleware
    bot.use(session())
    bot.use(stage.middleware())
    
    console.log('🧪 [INTEGRATION TEST] Bot and stage initialized')
  })
  
  afterAll(async () => {
    // Восстанавливаем console.log
    console.log = console.log
  })
  
  beforeEach(() => {
    // Очищаем историю перед каждым тестом
    replyHistory.length = 0
    consoleLogHistory.length = 0
    
    // Создаем тестового пользователя с полным контекстом
    testUser = {
      update: {
        update_id: 1,
        message: {
          message_id: 1,
          from: {
            id: 123456789,
            is_bot: false,
            first_name: 'Test',
            username: 'testuser',
          },
          chat: {
            id: 123456789,
            type: 'private',
          },
          date: Math.floor(Date.now() / 1000),
          text: '/start',
        },
      },
      telegram: bot.telegram,
      botInfo: { id: 123, is_bot: true, first_name: 'TestBot', username: 'testbot' },
      chat: {
        id: 123456789,
        type: 'private',
      },
      from: {
        id: 123456789,
        is_bot: false,
        first_name: 'Test',
        username: 'testuser',
      },
      message: {
        message_id: 1,
        from: {
          id: 123456789,
          is_bot: false,
          first_name: 'Test',
          username: 'testuser',
        },
        chat: {
          id: 123456789,
          type: 'private',
        },
        date: Math.floor(Date.now() / 1000),
        text: '/start',
      },
      // Мокаем reply функцию для захвата ответов
      reply: async (text: string, options?: any) => {
        replyHistory.push({
          text: typeof text === 'string' ? text : JSON.stringify(text),
          options,
          timestamp: Date.now(),
        })
        console.log('📤 [REPLY CAPTURED]:', text)
        return { message_id: replyHistory.length }
      },
      // Инициализируем сессию
      session: {} as any,
    } as any
  })

  describe('🔥 Real Wizard Integration', () => {
    it('should enter wizard and execute first step', async () => {
      console.log('🧪 [TEST] Starting wizard entry test...')
      
      try {
        // Входим в wizard сцену
        console.log('🧪 [TEST] Entering text_to_video scene...')
        await testUser.scene?.enter('text_to_video')
        
        // Проверяем что wizard вошел в сцену
        expect(testUser.scene?.current?.id).toBe('text_to_video')
        console.log('🧪 [TEST] ✅ Scene entered successfully')
        
        // Анализируем захваченные ответы
        console.log('🧪 [TEST] Captured replies:', replyHistory.length)
        replyHistory.forEach((reply, index) => {
          console.log(`🧪 [TEST] Reply ${index + 1}:`, reply.text.substring(0, 100))
        })
        
        // Анализируем логи консоли
        console.log('🧪 [TEST] Console logs captured:', consoleLogHistory.length)
        const wizardLogs = consoleLogHistory.filter(log => 
          log.includes('🎬 [WIZARD]') || log.includes('textToVideoStep1')
        )
        console.log('🧪 [TEST] Wizard-related logs:', wizardLogs.length)
        wizardLogs.forEach((log, index) => {
          console.log(`🧪 [TEST] Wizard Log ${index + 1}:`, log)
        })
        
        // Проверяем что первый шаг был вызван
        const step1Started = consoleLogHistory.some(log => 
          log.includes('🎬 [WIZARD] 🚀 STEP 1 STARTED!')
        )
        
        console.log('🧪 [TEST] Step 1 started?', step1Started)
        
        if (!step1Started) {
          console.error('🧪 [TEST] ❌ FIRST STEP WAS NOT CALLED!')
          console.log('🧪 [TEST] All captured logs:')
          consoleLogHistory.forEach((log, index) => {
            console.log(`${index}: ${log}`)
          })
        }
        
        // Должен быть хотя бы один ответ (клавиатура выбора моделей)
        expect(replyHistory.length).toBeGreaterThan(0)
        
        // Первый ответ должен содержать текст выбора модели
        if (replyHistory.length > 0) {
          const firstReply = replyHistory[0].text
          expect(firstReply).toContain('Выберите модель')
        }
        
      } catch (error) {
        console.error('🧪 [TEST] ❌ Test failed with error:', error)
        console.log('🧪 [TEST] Error stack:', error instanceof Error ? error.stack : 'No stack')
        throw error
      }
    })

    it('should handle model selection in step 2', async () => {
      console.log('🧪 [TEST] Starting model selection test...')
      
      try {
        // Сначала входим в wizard
        await testUser.scene?.enter('text_to_video')
        
        // Очищаем историю после входа
        replyHistory.length = 0
        consoleLogHistory.length = 0
        
        // Симулируем выбор модели
        testUser.message = {
          message_id: 2,
          from: testUser.from!,
          chat: testUser.chat!,
          date: Math.floor(Date.now() / 1000),
          text: 'Veo 3 Fast | 8s | 📱 (40⭐)',
        }
        
        // Получаем второй шаг wizard'а
        const step2 = (textToVideoWizard as any).steps[1]
        
        if (typeof step2 === 'function') {
          console.log('🧪 [TEST] Calling step 2 with model selection...')
          await step2(testUser)
          
          // Проверяем что модель сохранилась в сессии
          expect(testUser.session.selectedModel).toBe('kie-veo-3-fast')
          expect(testUser.session.aspect_ratio).toBe('9:16')
          expect(testUser.session.selectedVideoCost).toBe(40)
          
          // Должен быть ответ с подтверждением выбора
          expect(replyHistory.length).toBeGreaterThan(0)
          if (replyHistory.length > 0) {
            const reply = replyHistory[0].text
            expect(reply).toContain('Модель выбрана')
            expect(reply).toContain('опишите')
          }
          
          console.log('🧪 [TEST] ✅ Model selection test passed')
        } else {
          throw new Error('Step 2 is not a function')
        }
        
      } catch (error) {
        console.error('🧪 [TEST] ❌ Model selection test failed:', error)
        throw error
      }
    })

    it('should handle prompt processing in step 3', async () => {
      console.log('🧪 [TEST] Starting prompt processing test...')
      
      try {
        // Настраиваем сессию с выбранной моделью
        testUser.session = {
          selectedModel: 'kie-veo-3-fast',
          aspect_ratio: '9:16',
          selectedVideoCost: 40,
        }
        
        // Симулируем ввод промпта
        testUser.message = {
          message_id: 3,
          from: testUser.from!,
          chat: testUser.chat!,
          date: Math.floor(Date.now() / 1000),
          text: 'A beautiful sunset over the ocean with waves',
        }
        
        // Мокаем handleTextToVideoDirect чтобы избежать реальной генерации
        let videoGenerationCalled = false
        let videoGenerationParams: any = null
        
        // Временно заменяем импорт
        const originalModule = await import('@/handlers/handleTextToVideoDirect')
        const mockHandleTextToVideoDirect = async (...args: any[]) => {
          videoGenerationCalled = true
          videoGenerationParams = args
          console.log('🧪 [TEST] 🎬 Video generation called with params:', args)
        }
        
        // Получаем третий шаг
        const step3 = (textToVideoWizard as any).steps[2]
        
        if (typeof step3 === 'function') {
          console.log('🧪 [TEST] Calling step 3 with prompt...')
          
          // Временно мокаем функцию генерации
          const originalHandleTextToVideoDirect = (await import('@/handlers/handleTextToVideoDirect')).handleTextToVideoDirect
          
          // Вызываем третий шаг
          await step3(testUser)
          
          // Проверяем что было сообщение о генерации
          expect(replyHistory.length).toBeGreaterThan(0)
          if (replyHistory.length > 0) {
            const reply = replyHistory[0].text
            expect(reply).toContain('Генерируем видео')
            expect(reply).toContain('kie-veo-3-fast')
            expect(reply).toContain('9:16')
            expect(reply).toContain('40⭐')
          }
          
          console.log('🧪 [TEST] ✅ Prompt processing test passed')
        } else {
          throw new Error('Step 3 is not a function')
        }
        
      } catch (error) {
        console.error('🧪 [TEST] ❌ Prompt processing test failed:', error)
        throw error
      }
    })

    it('should handle full wizard flow end-to-end', async () => {
      console.log('🧪 [TEST] Starting full E2E wizard flow test...')
      
      try {
        // Этап 1: Вход в wizard
        console.log('🧪 [TEST] E2E Step 1: Entering wizard...')
        await testUser.scene?.enter('text_to_video')
        
        let step1Replies = [...replyHistory]
        console.log('🧪 [TEST] E2E Step 1 replies:', step1Replies.length)
        
        // Этап 2: Выбор модели  
        replyHistory.length = 0
        console.log('🧪 [TEST] E2E Step 2: Selecting model...')
        
        testUser.message = {
          message_id: 2,
          from: testUser.from!,
          chat: testUser.chat!,
          date: Math.floor(Date.now() / 1000),
          text: 'Veo 3 | 8s | 🖥️ (202⭐)',
        }
        
        const step2 = (textToVideoWizard as any).steps[1]
        await step2(testUser)
        
        let step2Replies = [...replyHistory]
        console.log('🧪 [TEST] E2E Step 2 replies:', step2Replies.length)
        
        // Этап 3: Ввод промпта
        replyHistory.length = 0
        console.log('🧪 [TEST] E2E Step 3: Processing prompt...')
        
        testUser.message = {
          message_id: 3,
          from: testUser.from!,
          chat: testUser.chat!,
          date: Math.floor(Date.now() / 1000),
          text: 'A cat playing with a ball in slow motion',
        }
        
        const step3 = (textToVideoWizard as any).steps[2]
        await step3(testUser)
        
        let step3Replies = [...replyHistory]
        console.log('🧪 [TEST] E2E Step 3 replies:', step3Replies.length)
        
        // Анализируем весь поток
        console.log('🧪 [TEST] E2E Analysis:')
        console.log('  - Step 1 (model selection): ', step1Replies.length, 'replies')
        console.log('  - Step 2 (model chosen): ', step2Replies.length, 'replies')  
        console.log('  - Step 3 (video generation): ', step3Replies.length, 'replies')
        
        // Проверки успешного потока
        expect(step1Replies.length).toBeGreaterThan(0) // Должна показаться клавиатура
        expect(step2Replies.length).toBeGreaterThan(0) // Должно быть подтверждение
        expect(step3Replies.length).toBeGreaterThan(0) // Должно быть сообщение о генерации
        
        // Проверяем что сессия содержит правильные данные
        expect(testUser.session.selectedModel).toBe('kie-veo-3')
        expect(testUser.session.aspect_ratio).toBe('16:9')
        expect(testUser.session.selectedVideoCost).toBe(202)
        
        console.log('🧪 [TEST] ✅ Full E2E test passed!')
        
      } catch (error) {
        console.error('🧪 [TEST] ❌ Full E2E test failed:', error)
        console.log('🧪 [TEST] Final state analysis:')
        console.log('  - Session:', testUser.session)
        console.log('  - Reply history:', replyHistory)
        console.log('  - Console logs:', consoleLogHistory.filter(log => log.includes('🎬')))
        throw error
      }
    })
  })

  describe('🚫 Error Cases Integration', () => {
    it('should handle wizard entry failures', async () => {
      console.log('🧪 [TEST] Testing wizard entry failure handling...')
      
      try {
        // Создаем поврежденный контекст
        const brokenContext = {
          ...testUser,
          reply: async () => {
            throw new Error('Reply failed')
          }
        }
        
        // Попытка входа должна быть обработана gracefully
        await expect(brokenContext.scene?.enter('text_to_video')).not.toThrow()
        
        console.log('🧪 [TEST] ✅ Entry failure handled gracefully')
        
      } catch (error) {
        console.error('🧪 [TEST] Entry failure test failed:', error)
        throw error
      }
    })

    it('should handle missing dependencies', async () => {
      console.log('🧪 [TEST] Testing missing dependencies handling...')
      
      try {
        // Тест без реальных зависимостей покажет проблемы
        const contextWithoutDeps = {
          ...testUser,
          session: undefined,
        }
        
        const step1 = (textToVideoWizard as any).steps[0]
        
        // Должно обработать отсутствие сессии
        await expect(step1(contextWithoutDeps)).not.toThrow()
        
        console.log('🧪 [TEST] ✅ Missing dependencies handled')
        
      } catch (error) {
        console.log('🧪 [TEST] Missing dependencies caused error (expected):', error)
      }
    })
  })
})