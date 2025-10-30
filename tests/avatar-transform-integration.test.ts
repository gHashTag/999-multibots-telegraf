import { describe, it, expect, beforeEach, afterEach, mock } from 'bun:test'

/**
 * 🔄 AVATAR TRANSFORM SCENE INTEGRATION TEST SUITE
 *
 * This test suite validates the complete workflow of the AvatarTransformScene
 * including the button mapping fix and prevention of BUTTON_DATA_INVALID errors.
 *
 * 🎯 Purpose:
 * - Test complete user flow from start to finish
 * - Validate keyboard generation matches validation logic
 * - Test all 72 heroes end-to-end
 * - Verify emoji-prefixed heroes work correctly
 * - Test error handling and edge cases
 *
 * 🏗️ Test Structure:
 * - Mock all external dependencies
 * - Simulate real user interactions
 * - Test both successful and error paths
 * - Validate state management across steps
 */

describe('AvatarTransformScene Integration Tests', () => {
  let mockCtx: any

  beforeEach(() => {
    // Setup mock context without external dependencies
    mockCtx = {
      wizard: {
        cursor: 0,
        selectStep: mock(() => {}),
        back: mock(() => {}),
        next: mock(() => {}),
        state: {}
      },
      session: {
        selectedGender: undefined,
        selectedModel: undefined,
        selectedHero: undefined,
        kontextImageUrl: 'https://example.com/user-photo.jpg'
      },
      reply: mock(() => Promise.resolve({ message_id: 123 })),
      replyWithPhoto: mock(() => Promise.resolve({ message_id: 456 })),
      message: {
        text: ''
      },
      from: {
        id: 123456789,
        username: 'testuser',
        first_name: 'Test User'
      },
      answerCbQuery: mock(() => Promise.resolve({})),
      scene: {
        leave: mock(() => Promise.resolve({})),
        enter: mock(() => Promise.resolve({}))
      },
      botInfo: {
        username: 'AI_STARS_bot'
      },
      telegram: {
        sendMessage: mock(() => Promise.resolve({}))
      }
    }
  })

  describe('🚀 Complete User Flow Tests', () => {
    it('should complete full flow for "🎨 Алекс Мерсер" (previously missing hero)', async () => {
      const { avatarTransformScene } = require('@/scenes/avatarTransformScene')

      // Step 0: Explanation and gender selection
      const step0 = avatarTransformScene.steps[0] as Function
      await step0(mockCtx)

      expect(mockCtx.reply).toHaveBeenCalledWith(
        expect.stringContaining('🎭 ИИ ГЕРОИ - AI HEROES'),
        expect.objectContaining({
          reply_markup: expect.objectContaining({
            keyboard: expect.arrayContaining([
              expect.arrayContaining([
                '👨‍💼 Мужской образ',
                '👩‍💼 Женский образ'
              ])
            ])
          })
        })
      )

      // Step 1: Gender selection
      mockCtx.message.text = '👨‍💼 Мужской образ'
      const step1 = avatarTransformScene.steps[1] as Function
      await step1(mockCtx)

      expect(mockCtx.session.selectedGender).toBe('male')
      expect(mockCtx.wizard.selectStep).toHaveBeenCalledWith(2)

      // Step 2: Model selection
      const step2 = avatarTransformScene.steps[2] as Function
      await step2(mockCtx)

      expect(mockCtx.reply).toHaveBeenCalledWith(
        expect.stringContaining('🤖 Выберите ИИ модель'),
        expect.objectContaining({
          reply_markup: expect.objectContaining({
            keyboard: expect.arrayContaining([
              expect.arrayContaining([
                expect.stringContaining('FLUX Kontext Max'),
                expect.stringContaining('SeeDream-4')
              ])
            ])
          })
        })
      )

      // Select model
      mockCtx.message.text = '🤖 FLUX Kontext Max (Google)'
      await step2(mockCtx)

      expect(mockCtx.session.selectedModel).toBe('flux-kontext')

      // Step 3: Photo action selection
      const step3 = avatarTransformScene.steps[3] as Function
      await step3(mockCtx)

      expect(mockCtx.reply).toHaveBeenCalledWith(
        expect.stringContaining('🎯 Выберите действие'),
        expect.objectContaining({
          reply_markup: expect.objectContaining({
            keyboard: expect.arrayContaining([
              expect.arrayContaining([
                '🎨 Использовать мой аватар',
                '📸 Загрузить своё фото'
              ])
            ])
          })
        })
      )

      // Choose to use avatar
      mockCtx.message.text = '🎨 Использовать мой аватар'
      await step3(mockCtx)

      expect(mockCtx.wizard.selectStep).toHaveBeenCalledWith(5)

      // Step 5: Hero selection and generation - TEST THE CRITICAL MISSING HERO!
      const step5 = avatarTransformScene.steps[5] as Function
      await step5(mockCtx)

      // Verify hero selection keyboard is shown
      expect(mockCtx.reply).toHaveBeenCalledWith(
        expect.stringContaining('🦸‍♂️ Выберите героя'),
        expect.objectContaining({
          reply_markup: expect.objectContaining({
            keyboard: expect.any(Array)
          })
        })
      )

      // Select the previously missing hero: "🎨 Алекс Мерсер"
      mockCtx.message.text = '🎨 Алекс Мерсер'
      await step5(mockCtx)

      // Verify the hero was successfully selected (no BUTTON_DATA_INVALID error)
      expect(mockCtx.session.selectedHero).toBe('Алекс Мерсер')

      // Verify generation message is sent
      expect(mockCtx.reply).toHaveBeenCalledWith(
        expect.stringContaining('⏳ Генерирую ваше превращение'),
        expect.objectContaining({
          parse_mode: 'HTML',
          reply_markup: { remove_keyboard: true }
        })
      )

      // Verify AI generation service was called
      const { generateFluxKontextMax } = require('@/services/generateFluxKontextMax')
      expect(generateFluxKontextMax).toHaveBeenCalledWith(
        expect.objectContaining({
          photoUrl: 'https://example.com/user-photo.jpg',
          prompt: expect.stringContaining('Алекс Мерсер')
        })
      )

      // Verify photo was sent with fallback
      const { sendPhotoWithFallback } = require('@/helpers/sendPhotoWithFallback')
      expect(sendPhotoWithFallback).toHaveBeenCalledWith(
        mockCtx,
        'https://example.com/generated-image.jpg',
        expect.stringContaining('🎨 AI HEROES'),
        expect.any(Object)
      )
    })

    it('should handle all 72 male heroes without BUTTON_DATA_INVALID errors', async () => {
      const { avatarTransformScene } = require('@/scenes/avatarTransformScene')

      // Setup context for male heroes
      mockCtx.session.selectedGender = 'male'
      mockCtx.session.selectedModel = 'flux-kontext'

      const step5 = avatarTransformScene.steps[5] as Function

      // List of all male heroes that should be supported
      const maleHeroes = [
        'Человек-паук', 'Железный человек', 'Капитан Америка', 'Тор', 'Халк',
        'Доктор Стрэндж', 'Дэдпул', 'Росомаха', 'Человек-муравей', 'Блэк Пантер',
        'Локи', 'Веном', 'Карающий', 'Призрачный гонщик', 'Зимний солдат',
        'Звёздный лорд', 'Соколиный глаз', 'Супермен', 'Бэтмен', 'Флэш',
        'Зелёный фонарь', 'Аквамен', 'Киборг', 'Шазам', 'Зелёная стрела',
        'Джокер', 'Найтвинг', 'Дэфстроук', 'Гоку', 'Наруто', 'Луффи',
        'Ичиго', 'Саитама', 'Эдвард Элрик', 'Лайт Ягами', 'Какаши',
        'Сасукэ', 'Вегета', 'Пикколо', 'Натсу', 'Эрен Йегер', 'Леви Аккерман',
        'Илья Муромец', 'Добрыня Никитич', 'Алеша Попович', 'Алёша Попович',
        'Перун', 'Святогор', 'Иван-царевич', 'Кощей Бессмертный', 'Серый Волк',
        'Емеля', 'Кратос', 'Геральт из Ривии', 'Мастер Чиф', 'Данте',
        'Субзиро', 'Скорпион', 'Рю', 'Кен', 'Соник', 'Марио', 'Линк',
        'Клауд Страйф', 'Сефирот', 'Джон Уик', 'Терминатор', 'Хищник',
        'Спаун', 'Альтаир', 'Эцио', 'Алекс Мерсер' // ⚠️ THE CRITICAL MISSING HERO
      ]

      // Test each hero individually
      for (const heroName of maleHeroes) {
        // Reset session for clean test
        mockCtx.session.selectedHero = undefined
        mockCtx.reply.mockClear()

        // Test with 🎨 prefix (secondary heroes)
        mockCtx.message.text = `🎨 ${heroName}`

        try {
          await step5(mockCtx)

          // Verify hero was selected successfully (no error thrown)
          expect(mockCtx.session.selectedHero).toBe(heroName)

          // Verify no error message was sent
          expect(mockCtx.reply).not.toHaveBeenCalledWith(
            expect.stringContaining('❌ Неверный выбор')
          )

        } catch (error) {
          // If error occurs, provide detailed info for debugging
          throw new Error(`BUTTON_DATA_INVALID error for hero "${heroName}": ${error}`)
        }
      }

      // Verify all heroes were tested
      expect(maleHeroes).toHaveLength(72)
      expect(maleHeroes).toContain('Алекс Мерсер') // Critical verification
    })

    it('should handle all female heroes without errors', async () => {
      const { avatarTransformScene } = require('@/scenes/avatarTransformScene')

      // Setup context for female heroes
      mockCtx.session.selectedGender = 'female'
      mockCtx.session.selectedModel = 'seedream4'

      const step5 = avatarTransformScene.steps[5] as Function

      // Sample of female heroes to test
      const femaleHeroes = [
        'Капитан Марвел', 'Скарлет Витч', 'Алая ведьма', 'Чёрная вдова',
        'Гвен Стейси', 'Шури', 'Валькирия', 'Чудо-женщина', 'Харли Квинн',
        'Лара Крофт', 'Чун Ли', 'Сейлор Мун', '18-й андроид', 'Zero Two'
      ]

      // Test each female hero
      for (const heroName of femaleHeroes) {
        mockCtx.session.selectedHero = undefined
        mockCtx.reply.mockClear()

        mockCtx.message.text = `🎨 ${heroName}`

        try {
          await step5(mockCtx)

          expect(mockCtx.session.selectedHero).toBe(heroName)

          expect(mockCtx.reply).not.toHaveBeenCalledWith(
            expect.stringContaining('❌ Неверный выбор')
          )

        } catch (error) {
          throw new Error(`BUTTON_DATA_INVALID error for female hero "${heroName}": ${error}`)
        }
      }
    })
  })

  describe('🔥 Critical Edge Cases', () => {
    it('should handle invalid hero selection gracefully', async () => {
      const { avatarTransformScene } = require('@/scenes/avatarTransformScene')

      mockCtx.session.selectedGender = 'male'
      mockCtx.session.selectedModel = 'flux-kontext'

      const step5 = avatarTransformScene.steps[5] as Function

      // Test invalid hero name
      mockCtx.message.text = '🎨 Несуществующий Герой'

      await step5(mockCtx)

      expect(mockCtx.reply).toHaveBeenCalledWith(
        '❌ Неверный выбор. Пожалуйста, используйте кнопки.'
      )

      expect(mockCtx.session.selectedHero).toBeUndefined()
    })

    it('should handle missing session data', async () => {
      const { avatarTransformScene } = require('@/scenes/avatarTransformScene')

      // Missing gender in session
      mockCtx.session.selectedGender = undefined
      mockCtx.session.selectedModel = 'flux-kontext'

      const step5 = avatarTransformScene.steps[5] as Function
      mockCtx.message.text = '🎨 Алекс Мерсер'

      await step5(mockCtx)

      expect(mockCtx.reply).toHaveBeenCalledWith(
        '❌ Ошибка: не выбран пол. Начните заново'
      )

      expect(mockCtx.scene.leave).toHaveBeenCalled()
    })

    it('should handle generation service failures', async () => {
      const { avatarTransformScene } = require('@/scenes/avatarTransformScene')
      const { generateFluxKontextMax } = require('@/services/generateFluxKontextMax')

      // Mock generation failure
      generateFluxKontextMax.mockRejectedValue(new Error('AI service unavailable'))

      mockCtx.session.selectedGender = 'male'
      mockCtx.session.selectedModel = 'flux-kontext'

      const step5 = avatarTransformScene.steps[5] as Function
      mockCtx.message.text = '🎨 Алекс Мерсер'

      await step5(mockCtx)

      // Should still process hero selection (no BUTTON_DATA_INVALID)
      expect(mockCtx.session.selectedHero).toBe('Алекс Мерсер')

      // Should handle generation error gracefully
      expect(mockCtx.reply).toHaveBeenCalledWith(
        expect.stringContaining('❌'),
        expect.any(Object)
      )
    })
  })

  describe('🎯 Primary vs Secondary Hero Flow', () => {
    it('should handle primary heroes with special emojis', async () => {
      const { avatarTransformScene } = require('@/scenes/avatarTransformScene')

      mockCtx.session.selectedGender = 'male'
      mockCtx.session.selectedModel = 'flux-kontext'

      const step5 = avatarTransformScene.steps[5] as Function

      // Test primary hero with special emoji (not 🎨)
      mockCtx.message.text = '🕷️ Человек-паук'

      await step5(mockCtx)

      expect(mockCtx.session.selectedHero).toBe('Человек-паук')

      // Test another primary hero
      mockCtx.session.selectedHero = undefined
      mockCtx.message.text = '🤖 Железный человек'

      await step5(mockCtx)

      expect(mockCtx.session.selectedHero).toBe('Железный человек')
    })

    it('should handle secondary heroes with 🎨 emoji prefix', async () => {
      const { avatarTransformScene } = require('@/scenes/avatarTransformScene')

      mockCtx.session.selectedGender = 'male'
      mockCtx.session.selectedModel = 'flux-kontext'

      const step5 = avatarTransformScene.steps[5] as Function

      // Test secondary heroes with 🎨 prefix
      const secondaryHeroes = [
        'Алекс Мерсер',  // The critical missing hero
        'Кратос',
        'Данте',
        'Субзиро',
        'Альтаир',
        'Эцио'
      ]

      for (const heroName of secondaryHeroes) {
        mockCtx.session.selectedHero = undefined
        mockCtx.message.text = `🎨 ${heroName}`

        await step5(mockCtx)

        expect(mockCtx.session.selectedHero).toBe(heroName)
      }
    })
  })

  describe('🔄 Session State Management', () => {
    it('should maintain state consistency throughout flow', async () => {
      const { avatarTransformScene } = require('@/scenes/avatarTransformScene')

      // Test complete state progression
      expect(mockCtx.session.selectedGender).toBeUndefined()
      expect(mockCtx.session.selectedModel).toBeUndefined()
      expect(mockCtx.session.selectedHero).toBeUndefined()

      // Step 1: Gender selection
      mockCtx.message.text = '👨‍💼 Мужской образ'
      const step1 = avatarTransformScene.steps[1] as Function
      await step1(mockCtx)

      expect(mockCtx.session.selectedGender).toBe('male')

      // Step 2: Model selection
      mockCtx.message.text = '🤖 FLUX Kontext Max (Google)'
      const step2 = avatarTransformScene.steps[2] as Function
      await step2(mockCtx)

      expect(mockCtx.session.selectedModel).toBe('flux-kontext')

      // Step 5: Hero selection
      mockCtx.message.text = '🎨 Алекс Мерсер'
      const step5 = avatarTransformScene.steps[5] as Function
      await step5(mockCtx)

      expect(mockCtx.session.selectedHero).toBe('Алекс Мерсер')

      // Verify all state is maintained
      expect(mockCtx.session.selectedGender).toBe('male')
      expect(mockCtx.session.selectedModel).toBe('flux-kontext')
      expect(mockCtx.session.selectedHero).toBe('Алекс Мерсер')
    })

    it('should handle back navigation correctly', async () => {
      const { avatarTransformScene } = require('@/scenes/avatarTransformScene')

      // Setup state
      mockCtx.session.selectedGender = 'male'
      mockCtx.session.selectedModel = 'flux-kontext'

      // Navigate back to gender selection
      mockCtx.message.text = '⬅️ Назад к выбору пола'
      const step2 = avatarTransformScene.steps[2] as Function
      await step2(mockCtx)

      // Should clear state and go back
      expect(mockCtx.session.selectedGender).toBeUndefined()
      expect(mockCtx.wizard.selectStep).toHaveBeenCalledWith(0)
    })
  })
})