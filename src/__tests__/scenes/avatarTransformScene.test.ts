import { describe, it, expect, jest, beforeEach } from '@jest/globals'
import { WizardContext } from 'telegraf/typings/scenes'
import { MyContext } from '@/interfaces'
import { avatarTransformScene } from '@/scenes/avatarTransformScene'

// Mock dependencies
jest.mock('@/helpers/centralizedLanguage')
jest.mock('@/middlewares/getUserPhotoUrl')
jest.mock('@/utils/logger')
jest.mock('@/core/supabase/checkAvatarTransformUsage')
jest.mock('@/core/supabase/markAvatarTransformUsed')
jest.mock('@/core/bot')
jest.mock('@/services/generateFluxKontext')
jest.mock('@/services/generateSeeDream4')
jest.mock('@/helpers/sendPhotoWithFallback')

describe('AvatarTransformScene', () => {
  let mockCtx: Partial<MyContext & WizardContext>
  
  beforeEach(() => {
    mockCtx = {
      wizard: {
        cursor: 0,
        selectStep: jest.fn(),
        back: jest.fn(),
        next: jest.fn(),
        state: {}
      },
      session: {
        selectedGender: undefined,
        selectedModel: undefined
      },
      reply: jest.fn().mockResolvedValue({}),
      replyWithPhoto: jest.fn().mockResolvedValue({}),
      message: {
        text: ''
      },
      from: {
        id: 123456789,
        username: 'testuser'
      },
      answerCbQuery: jest.fn().mockResolvedValue({}),
      scene: {
        leave: jest.fn().mockResolvedValue({})
      }
    } as any
  })

  describe('Step 0: Explanation and Gender Selection', () => {
    it('should show explanation and gender selection buttons', async () => {
      const explanationStep = avatarTransformScene.steps[0] as Function
      
      await explanationStep(mockCtx)
      
      expect(mockCtx.reply).toHaveBeenCalledWith(
        expect.stringContaining('🎭 ИИ ГЕРОИ - AI HEROES'),
        expect.objectContaining({
          reply_markup: expect.objectContaining({
            keyboard: expect.arrayContaining([
              expect.arrayContaining([
                expect.stringContaining('👨‍💼 Мужской образ'),
                expect.stringContaining('👩‍💼 Женский образ')
              ])
            ])
          })
        })
      )
    })

    it('should handle male gender selection correctly', async () => {
      mockCtx.message!.text = '👨‍💼 Мужской образ'
      const genderProcessStep = avatarTransformScene.steps[1] as Function
      
      await genderProcessStep(mockCtx)
      
      expect(mockCtx.session.selectedGender).toBe('male')
      expect(mockCtx.wizard!.selectStep).toHaveBeenCalledWith(2)
    })

    it('should handle female gender selection correctly', async () => {
      mockCtx.message!.text = '👩‍💼 Женский образ'
      const genderProcessStep = avatarTransformScene.steps[1] as Function
      
      await genderProcessStep(mockCtx)
      
      expect(mockCtx.session.selectedGender).toBe('female')
      expect(mockCtx.wizard!.selectStep).toHaveBeenCalledWith(2)
    })

    it('should handle back to gender selection', async () => {
      mockCtx.message!.text = '⬅️ Назад к выбору пола'
      const genderProcessStep = avatarTransformScene.steps[1] as Function
      
      await genderProcessStep(mockCtx)
      
      expect(mockCtx.wizard!.selectStep).toHaveBeenCalledWith(0)
    })
  })

  describe('Step 2: Model Selection', () => {
    beforeEach(() => {
      mockCtx.session.selectedGender = 'male'
    })

    it('should show model selection after gender is chosen', async () => {
      const modelStep = avatarTransformScene.steps[2] as Function
      
      await modelStep(mockCtx)
      
      expect(mockCtx.reply).toHaveBeenCalledWith(
        expect.stringContaining('🤖 Выберите ИИ модель для генерации:'),
        expect.objectContaining({
          reply_markup: expect.objectContaining({
            keyboard: expect.arrayContaining([
              expect.arrayContaining([
                expect.stringContaining('🤖 FLUX Kontext Max'),
                expect.stringContaining('🎭 SeeDream-4')
              ])
            ])
          })
        })
      )
    })

    it('should handle FLUX Kontext Max selection', async () => {
      mockCtx.message!.text = '🤖 FLUX Kontext Max (Google)'
      const modelProcessStep = avatarTransformScene.steps[2] as Function
      
      await modelProcessStep(mockCtx)
      
      expect(mockCtx.session.selectedModel).toBe('flux-kontext')
    })

    it('should handle SeeDream-4 selection', async () => {
      mockCtx.message!.text = '🎭 SeeDream-4 (ByteDance)'
      const modelProcessStep = avatarTransformScene.steps[2] as Function
      
      await modelProcessStep(mockCtx)
      
      expect(mockCtx.session.selectedModel).toBe('seedream4')
    })

    it('should handle back to gender selection from model step', async () => {
      mockCtx.message!.text = '⬅️ Назад к выбору пола'
      const modelProcessStep = avatarTransformScene.steps[2] as Function
      
      await modelProcessStep(mockCtx)
      
      expect(mockCtx.session.selectedGender).toBeUndefined()
      expect(mockCtx.wizard!.selectStep).toHaveBeenCalledWith(0)
    })
  })

  describe('Step 3: Photo Step', () => {
    beforeEach(() => {
      mockCtx.session.selectedGender = 'male'
      mockCtx.session.selectedModel = 'flux-kontext'
    })

    it('should request user photo', async () => {
      const photoStep = avatarTransformScene.steps[3] as Function
      
      await photoStep(mockCtx)
      
      expect(mockCtx.reply).toHaveBeenCalledWith(
        expect.stringContaining('📸 Отправьте свое фото'),
        expect.objectContaining({
          reply_markup: expect.objectContaining({
            keyboard: expect.arrayContaining([
              expect.arrayContaining([
                expect.stringContaining('⬅️ Назад к выбору модели')
              ])
            ])
          })
        })
      )
    })
  })

  describe('Step 4: Action Selection', () => {
    beforeEach(() => {
      mockCtx.session.selectedGender = 'female'
      mockCtx.session.selectedModel = 'seedream4'
    })

    it('should show action selection with proper options', async () => {
      const actionStep = avatarTransformScene.steps[4] as Function
      
      await actionStep(mockCtx)
      
      expect(mockCtx.reply).toHaveBeenCalledWith(
        expect.stringContaining('🎨 Выберите действие:'),
        expect.objectContaining({
          reply_markup: expect.objectContaining({
            keyboard: expect.arrayContaining([
              expect.arrayContaining([
                expect.stringContaining('🎨 Использовать мой аватар'),
                expect.stringContaining('📸 Загрузить другое фото')
              ])
            ])
          })
        })
      )
    })

    it('should handle "use my avatar" selection', async () => {
      mockCtx.message!.text = '🎨 Использовать мой аватар'
      const actionStep = avatarTransformScene.steps[4] as Function
      
      await actionStep(mockCtx)
      
      expect(mockCtx.wizard!.selectStep).toHaveBeenCalledWith(5)
    })

    it('should handle "upload different photo" selection', async () => {
      mockCtx.message!.text = '📸 Загрузить другое фото'
      const actionStep = avatarTransformScene.steps[4] as Function
      
      await actionStep(mockCtx)
      
      expect(mockCtx.wizard!.selectStep).toHaveBeenCalledWith(6)
    })
  })

  describe('Step 5: Hero Selection and Generation', () => {
    beforeEach(() => {
      mockCtx.session.selectedGender = 'male'
      mockCtx.session.selectedModel = 'flux-kontext'
    })

    it('should show only male heroes for male gender selection', async () => {
      const heroStep = avatarTransformScene.steps[5] as Function
      
      await heroStep(mockCtx)
      
      expect(mockCtx.reply).toHaveBeenCalledWith(
        expect.stringContaining('🦸‍♂️ Выберите героя для мужского образа:'),
        expect.objectContaining({
          reply_markup: expect.objectContaining({
            keyboard: expect.arrayContaining([
              expect.arrayContaining([
                expect.stringContaining('🕷️ Человек-паук'),
                expect.stringContaining('🤖 Железный человек')
              ])
            ])
          })
        })
      )
    })

    it('should show only female heroes for female gender selection', async () => {
      mockCtx.session.selectedGender = 'female'
      const heroStep = avatarTransformScene.steps[5] as Function
      
      await heroStep(mockCtx)
      
      expect(mockCtx.reply).toHaveBeenCalledWith(
        expect.stringContaining('🦸‍♀️ Выберите героиню для женского образа:'),
        expect.objectContaining({
          reply_markup: expect.objectContaining({
            keyboard: expect.arrayContaining([
              expect.arrayContaining([
                expect.stringContaining('🌟 Капитан Марвел'),
                expect.stringContaining('🕷️ Скарлет Витч')
              ])
            ])
          })
        })
      )
    })

    it('should handle random style selection', async () => {
      mockCtx.message!.text = '🎲 Случайный стиль'
      const heroStep = avatarTransformScene.steps[5] as Function
      
      await heroStep(mockCtx)
      
      // Should start generation process
      expect(mockCtx.reply).toHaveBeenCalledWith(
        expect.stringContaining('⌛ Начинаем генерацию')
      )
    })
  })

  describe('Navigation and State Management', () => {
    it('should properly handle back navigation throughout the flow', async () => {
      // Test navigation from different steps
      const steps = [
        { stepIndex: 1, backText: '⬅️ Назад к выбору пола', expectedStep: 0 },
        { stepIndex: 2, backText: '⬅️ Назад к выбору пола', expectedStep: 0 },
        { stepIndex: 3, backText: '⬅️ Назад к выбору модели', expectedStep: 2 },
        { stepIndex: 4, backText: '⬅️ Назад к выбору действия', expectedStep: 3 },
        { stepIndex: 5, backText: '⬅️ Назад к выбору действия', expectedStep: 3 }
      ]

      for (const { stepIndex, backText, expectedStep } of steps) {
        mockCtx.message!.text = backText
        const step = avatarTransformScene.steps[stepIndex] as Function
        
        await step(mockCtx)
        
        expect(mockCtx.wizard!.selectStep).toHaveBeenCalledWith(expectedStep)
      }
    })

    it('should properly clear session data when going back', async () => {
      mockCtx.session.selectedGender = 'male'
      mockCtx.session.selectedModel = 'flux-kontext'
      mockCtx.message!.text = '⬅️ Назад к выбору пола'
      
      const modelStep = avatarTransformScene.steps[2] as Function
      await modelStep(mockCtx)
      
      expect(mockCtx.session.selectedGender).toBeUndefined()
      expect(mockCtx.session.selectedModel).toBeUndefined()
    })
  })

  describe('Error Handling', () => {
    it('should handle unexpected text input gracefully', async () => {
      mockCtx.message!.text = 'invalid input'
      const genderStep = avatarTransformScene.steps[1] as Function
      
      await genderStep(mockCtx)
      
      expect(mockCtx.reply).toHaveBeenCalledWith(
        expect.stringContaining('❌ Неизвестная команда')
      )
    })

    it('should handle missing session data gracefully', async () => {
      mockCtx.session = {} as any
      const heroStep = avatarTransformScene.steps[5] as Function
      
      await heroStep(mockCtx)
      
      expect(mockCtx.reply).toHaveBeenCalledWith(
        expect.stringContaining('❌ Ошибка: необходимо сначала выбрать пол')
      )
    })
  })

  describe('Model Integration', () => {
    it('should use FLUX Kontext Max when selected', async () => {
      const { generateFluxKontext } = require('@/services/generateFluxKontext')
      generateFluxKontext.mockResolvedValue({ success: true })
      
      mockCtx.session.selectedModel = 'flux-kontext'
      mockCtx.session.selectedGender = 'male'
      mockCtx.message!.text = '🕷️ Человек-паук'
      
      const heroStep = avatarTransformScene.steps[5] as Function
      await heroStep(mockCtx)
      
      expect(generateFluxKontext).toHaveBeenCalled()
    })

    it('should use SeeDream-4 when selected', async () => {
      const { generateSeeDream4 } = require('@/services/generateSeeDream4')
      generateSeeDream4.mockResolvedValue({ success: true })
      
      mockCtx.session.selectedModel = 'seedream4'
      mockCtx.session.selectedGender = 'female'
      mockCtx.message!.text = '🌟 Капитан Марвел'
      
      const heroStep = avatarTransformScene.steps[5] as Function
      await heroStep(mockCtx)
      
      expect(generateSeeDream4).toHaveBeenCalled()
    })
  })
})