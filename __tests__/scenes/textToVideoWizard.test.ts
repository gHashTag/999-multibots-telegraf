import { textToVideoWizard } from '../../src/scenes/textToVideoWizard'
import { makeMockContext } from '../utils/mockTelegrafContext'

// Простые моки без jest
const mockHandleTextToVideoDirect = {
  fn: async () => Promise.resolve(),
  called: false,
  lastArgs: [] as any[]
}

// Подменяем модуль
const originalModule = require('../../src/handlers/handleTextToVideoDirect')
originalModule.handleTextToVideoDirect = async (...args: any[]) => {
  mockHandleTextToVideoDirect.called = true
  mockHandleTextToVideoDirect.lastArgs = args
  return mockHandleTextToVideoDirect.fn(...args)
}

describe('textToVideoWizard', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    console.log = jest.fn()
    console.error = jest.fn()
    console.warn = jest.fn()
  })

  describe('🎬 Wizard Structure', () => {
    it('should have correct wizard ID', () => {
      expect(textToVideoWizard.id).toBe('text_to_video')
    })

    it('should have 2 steps', () => {
      expect(textToVideoWizard.steps).toHaveLength(2)
    })
  })

  describe('🚪 Wizard Enter Handler', () => {
    it('should enter wizard and force first step execution', async () => {
      const ctx = makeMockContext()
      
      // Мокаем wizard steps
      const mockFirstStep = jest.fn()
      ctx.wizard.steps = [mockFirstStep, jest.fn()]
      
      await textToVideoWizard.enterHandler(ctx as any)

      expect(console.log).toHaveBeenCalledWith('🎬 [WIZARD] ✅ WIZARD ENTERED! User:', ctx.from.id)
      expect(console.log).toHaveBeenCalledWith('🎬 [WIZARD] Forcing Step 1 execution...')
      expect(ctx.wizard.cursor).toBe(0)
      expect(mockFirstStep).toHaveBeenCalledWith(ctx)
    })

    it('should handle errors in forced step execution', async () => {
      const ctx = makeMockContext()
      
      // Мокаем ошибочный первый шаг
      const mockFirstStep = jest.fn().mockRejectedValue(new Error('Test error'))
      ctx.wizard.steps = [mockFirstStep]
      
      await textToVideoWizard.enterHandler(ctx as any)

      expect(console.error).toHaveBeenCalledWith('🎬 [WIZARD] Error in forced step execution:', expect.any(Error))
    })
  })

  describe('🎯 Step 1: Model Selection', () => {
    it('should show keyboard with 4 models', async () => {
      const ctx = makeMockContext()
      
      await textToVideoWizard.steps[0](ctx as any)

      expect(console.log).toHaveBeenCalledWith('🎬 [WIZARD] Step 1: Creating simplified keyboard...')
      expect(ctx.reply).toHaveBeenCalledWith(
        expect.stringContaining('🎥 Выберите модель и формат видео'),
        expect.objectContaining({
          reply_markup: expect.objectContaining({
            keyboard: expect.arrayContaining([
              ['Veo 3 Fast | 8s | 📱 (40⭐)', 'Veo 3 Fast | 8s | 🖥️ (40⭐)'],
              ['Veo 3 | 8s | 📱 (202⭐)', 'Veo 3 | 8s | 🖥️ (202⭐)'],
              ['Kling v1.6 Pro | ~10s | 📱 (60⭐)', 'Kling v1.6 Pro | ~10s | 🖥️ (60⭐)'],
              ['Minimax | 6s | 📱 (50⭐)', 'Minimax | 6s | 🖥️ (50⭐)']
            ])
          })
        })
      )
      expect(ctx.wizard.next).toHaveBeenCalled()
    })

    it('should handle errors gracefully', async () => {
      const ctx = makeMockContext()
      // Ломаем isRussianFromState
      const { isRussianFromState } = require('../../src/helpers/centralizedLanguage')
      isRussianFromState.mockImplementation(() => {
        throw new Error('Language detection error')
      })
      
      await textToVideoWizard.steps[0](ctx as any)

      expect(console.error).toHaveBeenCalledWith('🎬 [WIZARD] Step 1 ERROR:', expect.any(Error))
      expect(ctx.reply).toHaveBeenCalledWith('❌ Ошибка в мастере генерации видео')
      expect(ctx.scene.leave).toHaveBeenCalled()
    })
  })

  describe('🎯 Step 2: Model Parsing & Prompt', () => {
    describe('Back button handling', () => {
      it('should handle "Назад" button', async () => {
        const ctx = makeMockContext()
        ctx.message.text = '⬅️ Назад в меню'
        
        await textToVideoWizard.steps[1](ctx as any)

        expect(ctx.reply).toHaveBeenCalledWith('Возвращаемся в меню...')
        expect(ctx.scene.leave).toHaveBeenCalled()
      })
    })

    describe('Model selection parsing', () => {
      const testCases = [
        {
          buttonText: 'Veo 3 Fast | 8s | 📱 (40⭐)',
          expected: { modelId: 'kie-veo-3-fast', aspectRatio: '9:16', duration: 8, cost: 40 }
        },
        {
          buttonText: 'Veo 3 | 8s | 🖥️ (202⭐)',
          expected: { modelId: 'kie-veo-3', aspectRatio: '16:9', duration: 8, cost: 202 }
        },
        {
          buttonText: 'Kling v1.6 Pro | ~10s | 📱 (60⭐)',
          expected: { modelId: 'kling-v1.6-pro', aspectRatio: '9:16', duration: 10, cost: 60 }
        },
        {
          buttonText: 'Minimax | 6s | 🖥️ (50⭐)',
          expected: { modelId: 'minimax', aspectRatio: '16:9', duration: 6, cost: 50 }
        }
      ]

      testCases.forEach(({ buttonText, expected }) => {
        it(`should parse "${buttonText}" correctly`, async () => {
          const ctx = makeMockContext()
          ctx.message.text = buttonText
          
          await textToVideoWizard.steps[1](ctx as any)

          expect(ctx.session.selectedVideoModel).toBe(expected.modelId)
          expect(ctx.session.selectedAspectRatio).toBe(expected.aspectRatio)
          expect(ctx.session.selectedDuration).toBe(expected.duration)
          expect(ctx.session.selectedVideoCost).toBe(expected.cost)
          expect(ctx.reply).toHaveBeenCalledWith(
            expect.stringContaining('✅ Выбрано:'),
            expect.objectContaining({ reply_markup: { remove_keyboard: true } })
          )
        })
      })
    })

    describe('Prompt handling', () => {
      beforeEach(() => {
        // Устанавливаем сохраненные параметры модели в сессии
        const setupSession = (ctx: any) => {
          ctx.session.selectedVideoModel = 'kie-veo-3-fast'
          ctx.session.selectedAspectRatio = '9:16'
          ctx.session.selectedVideoCost = 40
          ctx.session.selectedDuration = 8
        }
      })

      it('should accept valid prompt and start generation', async () => {
        const ctx = makeMockContext()
        ctx.message.text = 'танцующий шаман у костра'
        ctx.session.selectedVideoModel = 'kie-veo-3-fast'
        ctx.session.selectedAspectRatio = '9:16'
        ctx.session.selectedVideoCost = 40
        ctx.session.selectedDuration = 8
        
        mockHandleTextToVideoDirect.mockResolvedValue(undefined)
        
        await textToVideoWizard.steps[1](ctx as any)

        expect(ctx.reply).toHaveBeenCalledWith(
          expect.stringContaining('🎬 Генерируем видео...')
        )
        expect(mockHandleTextToVideoDirect).toHaveBeenCalledWith(
          ctx,
          'танцующий шаман у костра',
          'kie-veo-3-fast',
          8,
          '9:16'
        )
        expect(ctx.scene.leave).toHaveBeenCalled()
      })

      it('should reject short prompts', async () => {
        const ctx = makeMockContext()
        ctx.message.text = 'hi'
        ctx.session.selectedVideoModel = 'kie-veo-3-fast'
        
        await textToVideoWizard.steps[1](ctx as any)

        expect(ctx.reply).toHaveBeenCalledWith('Описание слишком короткое.')
        expect(mockHandleTextToVideoDirect).not.toHaveBeenCalled()
        expect(ctx.scene.leave).not.toHaveBeenCalled()
      })

      it('should handle generation errors', async () => {
        const ctx = makeMockContext()
        ctx.message.text = 'танцующий шаман у костра'
        ctx.session.selectedVideoModel = 'kie-veo-3-fast'
        ctx.session.selectedAspectRatio = '9:16'
        ctx.session.selectedVideoCost = 40
        ctx.session.selectedDuration = 8
        
        mockHandleTextToVideoDirect.mockRejectedValue(new Error('Generation failed'))
        
        await textToVideoWizard.steps[1](ctx as any)

        expect(ctx.reply).toHaveBeenCalledWith('❌ Ошибка в мастере генерации видео')
        expect(ctx.scene.leave).toHaveBeenCalled()
      })
    })

    describe('Error handling', () => {
      it('should handle no message', async () => {
        const ctx = makeMockContext()
        ctx.message = undefined
        
        await textToVideoWizard.steps[1](ctx as any)

        expect(ctx.reply).toHaveBeenCalledWith('Выберите модель из кнопок выше.')
      })

      it('should handle message without text', async () => {
        const ctx = makeMockContext()
        delete (ctx.message as any).text
        
        await textToVideoWizard.steps[1](ctx as any)

        expect(ctx.reply).toHaveBeenCalledWith('Выберите модель из кнопок выше.')
      })

      it('should handle unknown model selection', async () => {
        const ctx = makeMockContext()
        ctx.message.text = 'Unknown Model | 📱 (100⭐)'
        
        await textToVideoWizard.steps[1](ctx as any)

        // Should fallback to default model
        expect(ctx.session.selectedVideoModel).toBe('kie-veo-3-fast')
        expect(ctx.session.selectedAspectRatio).toBe('9:16')
        expect(ctx.session.selectedDuration).toBe(8)
        expect(ctx.session.selectedVideoCost).toBe(40)
      })
    })
  })

  describe('🚪 Wizard Leave Handler', () => {
    it('should clear session data on leave', async () => {
      const ctx = makeMockContext()
      ctx.session.selectedVideoModel = 'kie-veo-3-fast'
      ctx.session.selectedVideoCost = 40
      ctx.session.selectedAspectRatio = '9:16'
      ctx.session.selectedDuration = 8
      
      await textToVideoWizard.leaveHandler(ctx as any)

      expect(ctx.session.selectedVideoModel).toBeUndefined()
      expect(ctx.session.selectedVideoCost).toBeUndefined()
      expect(ctx.session.selectedAspectRatio).toBeUndefined()
      expect(ctx.session.selectedDuration).toBeUndefined()
      expect(console.log).toHaveBeenCalledWith('🎬 [WIZARD] 👋 WIZARD LEFT! User:', ctx.from.id)
    })
  })
})