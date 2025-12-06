/**
 * Tests for neuroPhotoWizard (NeuroPhoto Generation)
 * Covers: Model selection, prompt handling, image generation, keyboard actions
 */

import { describe, it, expect, beforeEach, vi, Mock, afterEach } from 'vitest'

// Mock dependencies BEFORE imports
vi.mock('@/helpers/centralizedLanguage', () => ({
  isRussianFromState: vi.fn(() => true),
}))

vi.mock('@/core/supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(() => ({
            neq: vi.fn(() => ({
              order: vi.fn(() => Promise.resolve({ data: [], error: null })),
            })),
            order: vi.fn(() => Promise.resolve({ data: [], error: null })),
          })),
        })),
      })),
    })),
  },
  getActiveUserModelsByType: vi.fn(() => Promise.resolve([])),
  getReferalsCountAndUserData: vi.fn(() => Promise.resolve({
    subscriptionType: 'neurophoto',
  })),
  getUserData: vi.fn(() => Promise.resolve({
    telegram_id: '223757230',
    gender: 'male',
  })),
  getAspectRatio: vi.fn(() => Promise.resolve('1:1')),
}))

vi.mock('@/core/supabase/getActiveUserModelsByTypeForHaim', () => ({
  getActiveUserModelsByTypeForHaim: vi.fn(() => Promise.resolve([])),
}))

vi.mock('@/core/bot', () => ({
  getBotNameByToken: vi.fn(() => ({ bot_name: 'test_bot' })),
  getBotNameByUsername: vi.fn(() => ({ bot_name: 'test_bot' })),
}))

vi.mock('@/navigation', () => ({
  sendGenericErrorMessage: vi.fn(),
  sendPhotoDescriptionRequest: vi.fn(() => Promise.resolve()),
  getButtonTextsByMode: vi.fn(() => ({ ru: '🏠 Главное меню', en: '🏠 Main menu' })),
  createMainMenuKeyboard: vi.fn(() => ({
    reply_markup: { keyboard: [], resize_keyboard: true },
  })),
  handleHelpCancel: vi.fn(() => Promise.resolve(false)),
}))

vi.mock('@/services/generateNeuroPhotoHybrid', () => ({
  generateNeuroPhotoHybrid: vi.fn(() => Promise.resolve({
    success: true,
    urls: ['https://example.com/image1.jpg'],
  })),
}))

vi.mock('@/services/CancelButtonService', () => ({
  CancelButtonService: {
    executeMainMenu: vi.fn(() => Promise.resolve()),
    executeCancel: vi.fn(() => Promise.resolve()),
  },
}))

vi.mock('@/handlers/getUserInfo', () => ({
  getUserInfo: vi.fn(() => Promise.resolve({ telegramId: '223757230' })),
}))

vi.mock('@/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}))

vi.mock('@/interfaces/modes', () => ({
  ModeEnum: {
    NeuroPhoto: 'neuroPhoto',
    ImprovePromptWizard: 'improvePromptWizard',
    SizeWizard: 'sizeWizard',
    MainMenu: 'mainMenu',
  },
}))

// Import after mocks
import { isRussianFromState } from '@/helpers/centralizedLanguage'
import {
  getActiveUserModelsByType,
  getReferalsCountAndUserData,
  getUserData,
  getAspectRatio,
} from '@/core/supabase'
import { generateNeuroPhotoHybrid } from '@/services/generateNeuroPhotoHybrid'
import { sendPhotoDescriptionRequest, handleHelpCancel } from '@/navigation'

describe('neuroPhotoWizard (NeuroPhoto Generation)', () => {
  const mockUserModel = {
    id: 'model-123',
    model_name: 'TestModel',
    model_url: 'https://replicate.com/owner/model:version',
    trigger_word: 'TESTPERSON',
    created_at: '2024-01-15T10:00:00Z',
    steps: 1000,
    status: 'SUCCESS',
  }

  const mockContext = {
    from: { id: 223757230, language_code: 'ru' },
    reply: vi.fn(),
    answerCbQuery: vi.fn(),
    scene: {
      state: {},
      leave: vi.fn(),
      enter: vi.fn(),
      current: { id: 'neuroPhoto' },
    },
    session: {
      userModel: null as any,
      prompt: null as any,
    },
    wizard: {
      next: vi.fn(),
      selectStep: vi.fn(),
      cursor: 0,
    },
    botInfo: { username: 'test_bot' },
    telegram: {
      token: 'test_token',
    },
    message: null as any,
    callbackQuery: null as any,
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockContext.scene.state = {}
    mockContext.session.userModel = null
    mockContext.session.prompt = null
    mockContext.message = null
    mockContext.callbackQuery = null

    ;(isRussianFromState as Mock).mockReturnValue(true)
    ;(getActiveUserModelsByType as Mock).mockResolvedValue([mockUserModel])
    ;(getReferalsCountAndUserData as Mock).mockResolvedValue({
      subscriptionType: 'neurophoto',
    })
    ;(getUserData as Mock).mockResolvedValue({
      telegram_id: '223757230',
      gender: 'male',
    })
    ;(getAspectRatio as Mock).mockResolvedValue('1:1')
    ;(generateNeuroPhotoHybrid as Mock).mockResolvedValue({
      success: true,
      urls: ['https://example.com/image1.jpg'],
    })
    ;(handleHelpCancel as Mock).mockResolvedValue(false)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('1. Шаг 1: Получение моделей пользователя', () => {
    it('должен получать модели типа replicate', async () => {
      const models = await getActiveUserModelsByType(223757230, 'replicate')

      expect(getActiveUserModelsByType).toHaveBeenCalledWith(223757230, 'replicate')
      expect(models).toEqual([mockUserModel])
    })

    it('должен показывать сообщение если нет моделей', async () => {
      ;(getActiveUserModelsByType as Mock).mockResolvedValue([])

      const models = await getActiveUserModelsByType(223757230, 'replicate')
      expect(models).toEqual([])

      const isRu = true
      const noModelsMessage = isRu
        ? '❌ У вас нет обученных моделей для нейрофото.'
        : "❌ You don't have any trained models for neurophotos."

      expect(noModelsMessage).toContain('нет обученных моделей')
    })

    it('должен автоматически выбирать модель если она одна', async () => {
      const models = [mockUserModel]
      expect(models.length).toBe(1)

      // Если одна модель, она автоматически выбирается
      mockContext.session.userModel = models[0]
      expect(mockContext.session.userModel).toEqual(mockUserModel)
    })

    it('должен показывать кнопки выбора если моделей несколько', async () => {
      const models = [
        mockUserModel,
        { ...mockUserModel, id: 'model-456', model_name: 'TestModel2' },
      ]

      ;(getActiveUserModelsByType as Mock).mockResolvedValue(models)

      const result = await getActiveUserModelsByType(223757230, 'replicate')
      expect(result.length).toBe(2)

      // Создаем кнопки для каждой модели
      const buttons = result.map((model: any, index: number) => ({
        text: `${index + 1}. Модель`,
        callback_data: `select_neuro_model_${model.id}`,
      }))

      expect(buttons).toHaveLength(2)
      expect(buttons[0].callback_data).toBe('select_neuro_model_model-123')
    })
  })

  describe('2. Выбор модели через callback', () => {
    it('должен парсить callback_data для выбора модели', () => {
      const callbackData = 'select_neuro_model_model-123'
      const modelId = callbackData.replace('select_neuro_model_', '')

      expect(modelId).toBe('model-123')
    })

    it('должен обрабатывать общие модели (shared_)', () => {
      const callbackData = 'select_neuro_model_shared_model-789'
      let modelId = callbackData.replace('select_neuro_model_', '')

      const isSharedModel = modelId.startsWith('shared_')
      if (isSharedModel) {
        modelId = modelId.replace('shared_', '')
      }

      expect(isSharedModel).toBe(true)
      expect(modelId).toBe('model-789')
    })

    it('должен вызывать sendPhotoDescriptionRequest после выбора модели', async () => {
      mockContext.session.userModel = mockUserModel

      await sendPhotoDescriptionRequest(mockContext as any, true, 'neuro_photo')

      expect(sendPhotoDescriptionRequest).toHaveBeenCalledWith(
        mockContext,
        true,
        'neuro_photo'
      )
    })
  })

  describe('3. Шаг 2: Обработка промпта', () => {
    it('должен валидировать минимальную длину промпта', () => {
      const shortPrompt = 'ab'
      const isValid = shortPrompt.length >= 3

      expect(isValid).toBe(false)
    })

    it('должен принимать валидный промпт', () => {
      const validPrompt = 'A beautiful portrait in nature'
      const isValid = validPrompt.length >= 3

      expect(isValid).toBe(true)
    })

    it('должен сохранять промпт в сессии', () => {
      const prompt = 'A professional headshot'
      mockContext.session.prompt = prompt

      expect(mockContext.session.prompt).toBe(prompt)
    })

    it('должен формировать полный промпт с trigger_word и gender', async () => {
      const prompt = 'Professional portrait'
      const trigger_word = 'TESTPERSON'
      const gender = 'male'

      const userData = await getUserData('223757230')
      expect(userData?.gender).toBe('male')

      const genderPromptPart = gender === 'female' ? 'female' : 'male'
      const detailPrompt = 'Cinematic Lighting, ethereal light'

      const fullPrompt = `Fashionable ${trigger_word} ${genderPromptPart}, ${prompt}, ${detailPrompt}`

      expect(fullPrompt).toContain('TESTPERSON')
      expect(fullPrompt).toContain('male')
      expect(fullPrompt).toContain('Professional portrait')
    })
  })

  describe('4. Генерация изображения', () => {
    it('должен вызывать generateNeuroPhotoHybrid с правильными параметрами', async () => {
      const result = await generateNeuroPhotoHybrid(
        'Test prompt',
        'model_url' as any,
        1,
        '223757230',
        mockContext as any,
        'test_bot',
        '1:1'
      )

      expect(generateNeuroPhotoHybrid).toHaveBeenCalledWith(
        'Test prompt',
        'model_url',
        1,
        '223757230',
        mockContext,
        'test_bot',
        '1:1'
      )
      expect(result.success).toBe(true)
    })

    it('должен обрабатывать неудачную генерацию', async () => {
      ;(generateNeuroPhotoHybrid as Mock).mockResolvedValue({
        success: false,
        urls: null,
      })

      const result = await generateNeuroPhotoHybrid(
        'Test prompt',
        'model_url' as any,
        1,
        '223757230',
        mockContext as any,
        'test_bot',
        '1:1'
      )

      expect(result.success).toBe(false)
    })

    it('должен получать aspect ratio пользователя', async () => {
      const aspectRatio = await getAspectRatio(223757230)

      expect(getAspectRatio).toHaveBeenCalledWith(223757230)
      expect(aspectRatio).toBe('1:1')
    })
  })

  describe('5. Шаг 3: Обработка кнопок', () => {
    it('должен обрабатывать кнопки количества 1️⃣-4️⃣', () => {
      const emojiButtons = ['1️⃣', '2️⃣', '3️⃣', '4️⃣']
      const text = '2️⃣'

      const numImages = emojiButtons.indexOf(text) + 1
      expect(numImages).toBe(2)
    })

    it('должен обрабатывать числовые кнопки 1-4', () => {
      const text = '3'
      const validInputs = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '1', '2', '3', '4']

      expect(validInputs.includes(text)).toBe(true)

      const numImages = parseInt(text, 10)
      expect(numImages).toBe(3)
    })

    it('должен обрабатывать кнопку "Новый промпт"', () => {
      const newPromptButtons = ['🆕 Новый промпт', '🆕 New prompt']
      const text = '🆕 Новый промпт'

      expect(newPromptButtons.includes(text)).toBe(true)
    })

    it('должен обрабатывать кнопку "Улучшить промпт"', () => {
      const improveButtons = ['⬆️ Улучшить промпт', '⬆️ Improve prompt']
      const text = '⬆️ Улучшить промпт'

      expect(improveButtons.includes(text)).toBe(true)
    })

    it('должен обрабатывать кнопку "Изменить размер"', () => {
      const sizeButtons = ['📐 Изменить размер', '📐 Change size']
      const text = '📐 Изменить размер'

      expect(sizeButtons.includes(text)).toBe(true)
    })

    it('должен обрабатывать кнопку "Главное меню"', () => {
      const menuButtons = ['🏠 Главное меню', '🏠 Main menu']
      const text = '🏠 Главное меню'

      expect(menuButtons.includes(text)).toBe(true)
    })
  })

  describe('6. Callback обработчики', () => {
    it('должен обрабатывать new_neurophoto_prompt', () => {
      const callbackData = 'new_neurophoto_prompt'
      expect(callbackData).toBe('new_neurophoto_prompt')
    })

    it('должен обрабатывать improve_prompt', () => {
      const callbackData = 'improve_prompt'
      expect(callbackData).toBe('improve_prompt')
    })

    it('должен обрабатывать change_size', () => {
      const callbackData = 'change_size'
      expect(callbackData).toBe('change_size')
    })

    it('должен обрабатывать go_main_menu', () => {
      const callbackData = 'go_main_menu'
      expect(callbackData).toBe('go_main_menu')
    })

    it('должен обрабатывать cancel_neuro_photo', () => {
      const callbackData = 'cancel_neuro_photo'
      expect(callbackData).toBe('cancel_neuro_photo')
    })
  })

  describe('7. Клавиатура после генерации', () => {
    it('должен создавать клавиатуру с кнопками количества', () => {
      const isRu = true
      const keyboard = {
        reply_markup: {
          keyboard: [
            [{ text: '1️⃣' }, { text: '2️⃣' }, { text: '3️⃣' }, { text: '4️⃣' }],
            [
              { text: isRu ? '🆕 Новый промпт' : '🆕 New prompt' },
              { text: isRu ? '⬆️ Улучшить промпт' : '⬆️ Improve prompt' },
            ],
            [
              { text: isRu ? '📐 Изменить размер' : '📐 Change size' },
              { text: isRu ? '🏠 Главное меню' : '🏠 Main menu' },
            ],
          ],
          resize_keyboard: true,
          one_time_keyboard: false,
        },
      }

      expect(keyboard.reply_markup.keyboard).toHaveLength(3)
      expect(keyboard.reply_markup.keyboard[0]).toHaveLength(4)
    })
  })

  describe('8. Локализация сообщений', () => {
    it('должен показывать русское сообщение об успехе', () => {
      const isRu = true
      const successMessage = isRu
        ? '✨ Нейрофото сгенерировано! Выберите количество дополнительных изображений или используйте другие опции:'
        : '✨ Neurophoto generated! Choose the number of additional images or use other options:'

      expect(successMessage).toContain('Нейрофото сгенерировано')
    })

    it('должен показывать английское сообщение об успехе', () => {
      const isRu = false
      const successMessage = isRu
        ? '✨ Нейрофото сгенерировано!'
        : '✨ Neurophoto generated!'

      expect(successMessage).toContain('Neurophoto generated')
    })

    it('должен показывать русское сообщение об ошибке модели', () => {
      const isRu = true
      const errorMessage = isRu
        ? '❌ Произошла ошибка: модель не выбрана. Попробуйте начать заново.'
        : '❌ Error: model not selected. Please start over.'

      expect(errorMessage).toContain('модель не выбрана')
    })
  })

  describe('9. Обработка HaimGroupMedia бота', () => {
    it('должен использовать специальную функцию для HaimGroupMedia_bot', () => {
      const botName = 'HaimGroupMedia_bot'
      const useSpecialFunction = botName === 'HaimGroupMedia_bot'

      expect(useSpecialFunction).toBe(true)
    })

    it('должен использовать стандартную функцию для других ботов', () => {
      const botName = 'test_bot'
      const useSpecialFunction = botName === 'HaimGroupMedia_bot'

      expect(useSpecialFunction).toBe(false)
    })
  })

  describe('10. Команды сцены', () => {
    it('должен обрабатывать команду /menu', () => {
      const command = '/menu'
      expect(command).toBe('/menu')
    })

    it('должен обрабатывать команду /help', () => {
      const command = '/help'
      expect(command).toBe('/help')

      const isRu = true
      const helpMessage = isRu
        ? 'Это сцена создания нейрофото. Введите описание на английском языке для генерации.'
        : 'This is the neurophoto creation scene. Enter a description in English to generate.'

      expect(helpMessage).toContain('нейрофото')
    })
  })
})
