import { describe, it, expect, beforeAll, afterAll } from 'bun:test'
import { Telegraf, Scenes, session, Context } from 'telegraf'
import { MyContext } from '@/interfaces'
import { textToVideoWizard } from '../../src/scenes/textToVideoWizard'

// РЕАЛЬНЫЙ интеграционный тест с правильным Telegraf контекстом
describe('TextToVideoWizard - REAL Integration Tests', () => {
  let bot: Telegraf<MyContext>
  let stage: Scenes.Stage<MyContext>
  
  // История всех reply вызовов
  const replyHistory: string[] = []
  
  beforeAll(async () => {
    console.log('🧪 [REAL TEST] Setting up REAL Telegraf bot...')
    
    // Создаем реального бота
    bot = new Telegraf<MyContext>('dummy-token-for-testing')
    
    // Создаем Stage с нашим wizard'ом
    stage = new Scenes.Stage<MyContext>([textToVideoWizard])
    
    // Настраиваем middleware в правильном порядке
    bot.use(session())
    bot.use(stage.middleware())
    
    console.log('🧪 [REAL TEST] Bot and Stage configured with proper middleware')
  })

  afterAll(async () => {
    console.log('🧪 [REAL TEST] Cleaning up...')
  })

  describe('🎯 Real Wizard Context Tests', () => {
    it('should properly initialize wizard context', async () => {
      console.log('🧪 [REAL TEST] Testing wizard context initialization...')
      
      let contextReceived: MyContext | null = null
      let enterCalled = false
      
      // Перехватываем входящие сообщения
      bot.use(async (ctx, next) => {
        contextReceived = ctx
        console.log('🧪 [REAL TEST] Context received in middleware:', {
          hasWizard: !!ctx.wizard,
          hasScene: !!ctx.scene,
          sceneId: ctx.scene?.current?.id,
          wizardCursor: ctx.wizard?.cursor,
        })
        
        // Проверяем что wizard доступен в контексте
        expect(ctx.wizard).toBeDefined()
        expect(ctx.scene).toBeDefined()
        
        if (ctx.message && 'text' in ctx.message && ctx.message.text === 'TEST_WIZARD_ENTRY') {
          console.log('🧪 [REAL TEST] Entering wizard scene...')
          try {
            await ctx.scene.enter('text_to_video')
            enterCalled = true
            console.log('🧪 [REAL TEST] ✅ Successfully entered wizard scene')
            
            // Проверяем что сцена установилась
            console.log('🧪 [REAL TEST] Scene after enter:', {
              current: ctx.scene?.current?.id,
              wizardCursor: ctx.wizard?.cursor,
            })
            
          } catch (error) {
            console.error('🧪 [REAL TEST] ❌ Failed to enter wizard scene:', error)
            throw error
          }
        }
        
        return next()
      })
      
      // Симулируем входящее сообщение
      const mockUpdate = {
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
            type: 'private' as const,
          },
          date: Math.floor(Date.now() / 1000),
          text: 'TEST_WIZARD_ENTRY',
        },
      }
      
      // Обрабатываем update через бота
      await bot.handleUpdate(mockUpdate)
      
      // Проверяем результаты
      expect(contextReceived).not.toBeNull()
      expect(enterCalled).toBe(true)
      
      if (contextReceived) {
        expect(contextReceived.wizard).toBeDefined()
        expect(contextReceived.scene).toBeDefined()
        expect(contextReceived.scene.current?.id).toBe('text_to_video')
        
        console.log('🧪 [REAL TEST] ✅ Wizard context properly initialized!')
      }
    })

    it('should execute wizard first step with proper context', async () => {
      console.log('🧪 [REAL TEST] Testing first step execution with real context...')
      
      let step1Executed = false
      let replyText = ''
      
      // Создаем обработчик для входящего сообщения
      bot.use(async (ctx, next) => {
        if (ctx.message && 'text' in ctx.message && ctx.message.text === 'TEST_STEP1_EXECUTION') {
          console.log('🧪 [REAL TEST] Processing step 1 test message...')
          
          // Мокаем reply для перехвата
          const originalReply = ctx.reply
          ctx.reply = async (text: any, options?: any) => {
            replyText = typeof text === 'string' ? text : JSON.stringify(text)
            console.log('🧪 [REAL TEST] 📤 Reply captured:', replyText.substring(0, 100))
            return { message_id: 1 }
          }
          
          try {
            // Входим в wizard
            await ctx.scene.enter('text_to_video')
            step1Executed = true
            
            console.log('🧪 [REAL TEST] Wizard entered, checking state:', {
              sceneId: ctx.scene.current?.id,
              wizardCursor: ctx.wizard?.cursor,
              replyReceived: !!replyText,
            })
            
          } catch (error) {
            console.error('🧪 [REAL TEST] ❌ Step 1 execution failed:', error)
            throw error
          }
        }
        
        return next()
      })
      
      // Симулируем сообщение для тестирования первого шага
      const mockUpdate = {
        update_id: 2,
        message: {
          message_id: 2,
          from: {
            id: 123456789,
            is_bot: false,
            first_name: 'Test',
            username: 'testuser',
          },
          chat: {
            id: 123456789,
            type: 'private' as const,
          },
          date: Math.floor(Date.now() / 1000),
          text: 'TEST_STEP1_EXECUTION',
        },
      }
      
      // Обрабатываем update
      await bot.handleUpdate(mockUpdate)
      
      // Проверяем результаты
      expect(step1Executed).toBe(true)
      expect(replyText).toContain('Choose model')
      
      console.log('🧪 [REAL TEST] ✅ First step executed successfully with real context!')
    })

    it('should handle model selection in step 2 with real wizard context', async () => {
      console.log('🧪 [REAL TEST] Testing step 2 model selection...')
      
      let modelSelectionProcessed = false
      let modelSetInSession = false
      let finalReplyText = ''
      
      bot.use(async (ctx, next) => {
        if (ctx.message && 'text' in ctx.message && ctx.message.text === 'TEST_MODEL_SELECTION') {
          console.log('🧪 [REAL TEST] Testing model selection process...')
          
          // Мокаем reply
          ctx.reply = async (text: any, options?: any) => {
            finalReplyText = typeof text === 'string' ? text : JSON.stringify(text)
            console.log('🧪 [REAL TEST] 📤 Model selection reply:', finalReplyText.substring(0, 100))
            return { message_id: 2 }
          }
          
          try {
            // Входим в wizard и переходим к step 2
            await ctx.scene.enter('text_to_video')
            
            // Симулируем выбор модели (меняем message на выбор модели)
            ctx.message = {
              ...ctx.message,
              text: 'Veo 3 Fast | 8s | 📱 (40⭐)',
            }
            
            // Получаем и вызываем step 2
            const step2 = (textToVideoWizard as any).steps[1]
            if (typeof step2 === 'function') {
              console.log('🧪 [REAL TEST] Calling step 2 with model selection...')
              await step2(ctx)
              modelSelectionProcessed = true
              
              // Проверяем что модель сохранилась в сессии
              if (ctx.session.selectedModel === 'kie-veo-3-fast') {
                modelSetInSession = true
              }
              
              console.log('🧪 [REAL TEST] Step 2 completed, session state:', {
                selectedModel: ctx.session.selectedModel,
                aspectRatio: ctx.session.aspect_ratio,
                cost: ctx.session.selectedVideoCost,
              })
            }
            
          } catch (error) {
            console.error('🧪 [REAL TEST] ❌ Model selection failed:', error)
            throw error
          }
        }
        
        return next()
      })
      
      // Симулируем тестовое сообщение
      const mockUpdate = {
        update_id: 3,
        message: {
          message_id: 3,
          from: {
            id: 123456789,
            is_bot: false,
            first_name: 'Test',
            username: 'testuser',
          },
          chat: {
            id: 123456789,
            type: 'private' as const,
          },
          date: Math.floor(Date.now() / 1000),
          text: 'TEST_MODEL_SELECTION',
        },
      }
      
      await bot.handleUpdate(mockUpdate)
      
      // Проверяем результаты
      expect(modelSelectionProcessed).toBe(true)
      expect(modelSetInSession).toBe(true)
      expect(finalReplyText).toContain('Model selected')
      
      console.log('🧪 [REAL TEST] ✅ Model selection with real wizard context successful!')
    })
  })

  describe('🔍 Real Bot Integration Analysis', () => {
    it('should verify bot middleware chain is correct', async () => {
      console.log('🧪 [REAL TEST] Analyzing bot middleware chain...')
      
      let sessionExists = false
      let stageExists = false
      let wizardAvailable = false
      let sceneAvailable = false
      
      bot.use(async (ctx, next) => {
        if (ctx.message && 'text' in ctx.message && ctx.message.text === 'MIDDLEWARE_ANALYSIS') {
          console.log('🧪 [REAL TEST] Analyzing middleware availability...')
          
          sessionExists = !!ctx.session
          stageExists = !!ctx.scene
          wizardAvailable = !!ctx.wizard
          sceneAvailable = !!ctx.scene && typeof ctx.scene.enter === 'function'
          
          console.log('🧪 [REAL TEST] Middleware analysis:', {
            session: sessionExists,
            stage: stageExists,
            wizard: wizardAvailable,
            sceneEnter: sceneAvailable,
            sceneIds: stage.scenes?.map(s => s.id) || [],
          })
          
          // Проверяем что наш wizard зарегистрирован в stage
          const textToVideoScene = stage.scenes?.find(s => s.id === 'text_to_video')
          expect(textToVideoScene).toBeDefined()
          expect(textToVideoScene?.id).toBe('text_to_video')
          
          console.log('🧪 [REAL TEST] Found textToVideoWizard in stage:', !!textToVideoScene)
        }
        
        return next()
      })
      
      const mockUpdate = {
        update_id: 4,
        message: {
          message_id: 4,
          from: { id: 123456789, is_bot: false, first_name: 'Test', username: 'testuser' },
          chat: { id: 123456789, type: 'private' as const },
          date: Math.floor(Date.now() / 1000),
          text: 'MIDDLEWARE_ANALYSIS',
        },
      }
      
      await bot.handleUpdate(mockUpdate)
      
      // Все middleware должны быть доступны
      expect(sessionExists).toBe(true)
      expect(stageExists).toBe(true)
      expect(wizardAvailable).toBe(true)
      expect(sceneAvailable).toBe(true)
      
      console.log('🧪 [REAL TEST] ✅ All middleware properly configured!')
    })
  })
})