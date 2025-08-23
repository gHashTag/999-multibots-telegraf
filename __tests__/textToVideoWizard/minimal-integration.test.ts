import { describe, it, expect } from 'bun:test'
import { Scenes, Context } from 'telegraf'
import { textToVideoWizard } from '../../src/scenes/textToVideoWizard'

// Минимальный интеграционный тест без реального API
describe('TextToVideoWizard - Minimal Integration', () => {
  
  it('should reveal the REAL problem with wizard execution', async () => {
    console.log('🔍 [MINIMAL TEST] Starting wizard problem investigation...')
    
    let replyTexts: string[] = []
    let logMessages: string[] = []
    
    // Перехватываем console.log для анализа
    const originalLog = console.log
    console.log = (...args: any[]) => {
      const message = args.join(' ')
      logMessages.push(message)
      originalLog(...args)
    }
    
    try {
      // Создаем минимальный контекст с wizard поддержкой
      const mockContext = {
        from: { id: 123456789, username: 'testuser' },
        chat: { id: 123456789, type: 'private' },
        message: { message_id: 1, text: '/start', date: 1234567890 },
        session: {},
        reply: async (text: string) => {
          replyTexts.push(text)
          console.log('📤 [REPLY]:', text.substring(0, 50) + '...')
          return { message_id: replyTexts.length }
        },
        wizard: {
          cursor: undefined,
          next: () => {
            console.log('🎯 [WIZARD] next() called')
            if (mockContext.wizard.cursor === undefined) {
              mockContext.wizard.cursor = 0
            } else {
              mockContext.wizard.cursor++
            }
          },
          back: () => {
            console.log('🎯 [WIZARD] back() called')  
            if (mockContext.wizard.cursor && mockContext.wizard.cursor > 0) {
              mockContext.wizard.cursor--
            }
          },
          selectStep: (step: number) => {
            console.log('🎯 [WIZARD] selectStep() called:', step)
            mockContext.wizard.cursor = step
          },
          steps: (textToVideoWizard as any).steps,
          step: undefined, // Будет установлен ниже
        },
        scene: {
          current: { id: 'text_to_video' },
          enter: async (sceneId: string) => {
            console.log('🎯 [SCENE] enter() called:', sceneId)
            mockContext.scene.current = { id: sceneId }
            
            // Симулируем вход в wizard - вызываем enter handler
            const enterHandlers = (textToVideoWizard as any).enterHandlers
            if (enterHandlers && enterHandlers.length > 0) {
              console.log('🎯 [SCENE] Calling enter handler...')
              await enterHandlers[0](mockContext)
            } else {
              console.log('🎯 [SCENE] No enter handlers found')
            }
          },
          leave: async () => {
            console.log('🎯 [SCENE] leave() called')
            mockContext.scene.current = null
          },
          reenter: async () => {
            console.log('🎯 [SCENE] reenter() called')
          }
        }
      } as any
      
      // Устанавливаем текущий шаг wizard'а
      mockContext.wizard.step = mockContext.wizard.steps[0]
      
      console.log('🔍 [MINIMAL TEST] Mock context created with wizard support')
      console.log('🔍 [MINIMAL TEST] Wizard steps available:', mockContext.wizard.steps.length)
      console.log('🔍 [MINIMAL TEST] Current step type:', typeof mockContext.wizard.step)
      
      // Тест 1: Вход в сцену (это должно вызвать enter handler)
      console.log('🔍 [MINIMAL TEST] === TEST 1: Scene Entry ===')
      await mockContext.scene.enter('text_to_video')
      
      console.log('🔍 [MINIMAL TEST] After scene entry:')
      console.log('  - Scene ID:', mockContext.scene.current?.id)
      console.log('  - Wizard cursor:', mockContext.wizard.cursor)
      console.log('  - Replies received:', replyTexts.length)
      
      // Анализируем логи wizard'а
      const wizardLogs = logMessages.filter(log => 
        log.includes('🎬 [WIZARD]') || log.includes('STEP 1')
      )
      
      console.log('🔍 [MINIMAL TEST] Wizard logs captured:', wizardLogs.length)
      wizardLogs.forEach((log, i) => {
        console.log(`  ${i + 1}: ${log}`)
      })
      
      // Проверяем результаты
      const step1Started = wizardLogs.some(log => log.includes('STEP 1 STARTED'))
      const step1Completed = wizardLogs.some(log => log.includes('STEP 1 COMPLETED'))
      
      console.log('🔍 [MINIMAL TEST] Analysis:')
      console.log('  - Step 1 started:', step1Started)  
      console.log('  - Step 1 completed:', step1Completed)
      console.log('  - Replies sent:', replyTexts.length)
      
      if (replyTexts.length > 0) {
        console.log('  - First reply:', replyTexts[0].substring(0, 100))
      }
      
      // Тест 2: Прямой вызов первого шага
      console.log('🔍 [MINIMAL TEST] === TEST 2: Direct Step 1 Call ===')
      replyTexts = []
      logMessages = []
      
      const step1Function = (textToVideoWizard as any).steps[0]
      console.log('🔍 [MINIMAL TEST] Step 1 function type:', typeof step1Function)
      
      if (typeof step1Function === 'function') {
        console.log('🔍 [MINIMAL TEST] Calling step 1 directly...')
        await step1Function(mockContext)
        
        console.log('🔍 [MINIMAL TEST] After direct step 1 call:')
        console.log('  - Wizard cursor:', mockContext.wizard.cursor)  
        console.log('  - Replies received:', replyTexts.length)
        
        if (replyTexts.length > 0) {
          console.log('  - Reply content:', replyTexts[0].substring(0, 100))
        }
      }
      
      // Тест 3: Проверка всех шагов wizard'а
      console.log('🔍 [MINIMAL TEST] === TEST 3: All Steps Analysis ===')
      const allSteps = (textToVideoWizard as any).steps
      console.log('🔍 [MINIMAL TEST] Total steps:', allSteps.length)
      
      allSteps.forEach((step: any, index: number) => {
        console.log(`🔍 [MINIMAL TEST] Step ${index + 1}:`, typeof step)
      })
      
      // Финальные проверки
      expect(allSteps.length).toBe(3)
      allSteps.forEach((step: any, index: number) => {
        expect(typeof step).toBe('function')
      })
      
      console.log('🔍 [MINIMAL TEST] ✅ All basic checks passed')
      
    } catch (error) {
      console.error('🔍 [MINIMAL TEST] ❌ Test failed:', error)
      throw error
    } finally {
      // Восстанавливаем console.log
      console.log = originalLog
    }
  })

  it('should test wizard enter handler execution', async () => {
    console.log('🔍 [ENTER TEST] Testing wizard enter handler...')
    
    let enterCalled = false
    let firstStepCalled = false
    let replies: string[] = []
    
    const mockContext = {
      from: { id: 987654321 },
      session: {},
      reply: async (text: string) => {
        replies.push(text)
        console.log('📤 [ENTER TEST REPLY]:', text.substring(0, 50))
        return { message_id: 1 }
      },
      wizard: {
        cursor: undefined,
        next: () => {
          console.log('🎯 [ENTER TEST] wizard.next() called')
        },
        steps: (textToVideoWizard as any).steps,
      },
      scene: {
        current: { id: 'text_to_video' },
        leave: async () => {
          console.log('🎯 [ENTER TEST] scene.leave() called')
        }
      }
    } as any
    
    // Получаем enter handler из wizard'а
    const enterHandlers = (textToVideoWizard as any).enterHandlers
    console.log('🔍 [ENTER TEST] Enter handlers found:', enterHandlers?.length || 0)
    
    if (enterHandlers && enterHandlers.length > 0) {
      const enterHandler = enterHandlers[0]
      console.log('🔍 [ENTER TEST] Enter handler type:', typeof enterHandler)
      
      if (typeof enterHandler === 'function') {
        console.log('🔍 [ENTER TEST] Calling enter handler...')
        await enterHandler(mockContext)
        enterCalled = true
        
        console.log('🔍 [ENTER TEST] Enter handler completed')
        console.log('  - Replies:', replies.length)
        console.log('  - Wizard cursor:', mockContext.wizard.cursor)
      }
    }
    
    expect(enterCalled).toBe(true)
    console.log('🔍 [ENTER TEST] ✅ Enter handler test completed')
  })
  
  it('should detect the exact failure point', async () => {
    console.log('🔍 [FAILURE TEST] Detecting exact failure point...')
    
    const errorLog: string[] = []
    const successLog: string[] = []
    
    const mockContext = {
      from: { id: 111222333 },
      session: {},
      reply: async (text: string) => {
        successLog.push(`REPLY: ${text.substring(0, 50)}`)
        return { message_id: 1 }
      },
      wizard: {
        cursor: undefined,
        next: () => {
          successLog.push('wizard.next() worked')
          return true
        },
      },
      scene: {
        current: { id: 'text_to_video' },
        leave: async () => {
          successLog.push('scene.leave() worked')
        }
      }
    } as any
    
    try {
      console.log('🔍 [FAILURE TEST] Testing step 1 execution...')
      const step1 = (textToVideoWizard as any).steps[0]
      
      if (typeof step1 === 'function') {
        await step1(mockContext)
        successLog.push('Step 1 executed without error')
      } else {
        errorLog.push('Step 1 is not a function')
      }
    } catch (error) {
      errorLog.push(`Step 1 error: ${error}`)
      console.error('🔍 [FAILURE TEST] Step 1 failed:', error)
    }
    
    console.log('🔍 [FAILURE TEST] Results:')
    console.log('  Success operations:', successLog.length)
    successLog.forEach(msg => console.log(`    ✅ ${msg}`))
    
    console.log('  Failed operations:', errorLog.length) 
    errorLog.forEach(msg => console.log(`    ❌ ${msg}`))
    
    if (errorLog.length > 0) {
      console.log('🔍 [FAILURE TEST] 🚨 FOUND THE PROBLEM! See errors above.')
    } else {
      console.log('🔍 [FAILURE TEST] ✅ No errors detected in isolated test')
    }
  })
})