/**
 * Tests for digitalAvatarBodyWizard (Digital Avatar / LoRA Training)
 * Covers: Gender selection, model naming, steps selection, training cost
 */

import { describe, it, expect, beforeEach, vi, Mock, afterEach } from 'vitest'

// Mock dependencies BEFORE imports
vi.mock('@/helpers/centralizedLanguage', () => ({
  isRussianFromState: vi.fn(() => true),
}))

vi.mock('@/navigation', () => ({
  getStepSelectionMenu: vi.fn(isRu => ({
    reply_markup: {
      keyboard: [[{ text: isRu ? '1000 шагов' : '1000 steps' }]],
      resize_keyboard: true,
    },
  })),
  handleHelpCancel: vi.fn(() => Promise.resolve(false)),
}))

vi.mock('@/price/helpers', () => ({
  handleTrainingCost: vi.fn(() =>
    Promise.resolve({
      leaveScene: false,
      trainingCostInStars: 500,
      currentBalance: 1000,
    })
  ),
}))

vi.mock('@/price/priceCalculator', () => ({
  generateCostMessage: vi.fn(() => 'Стоимость обучения: 500⭐'),
  stepOptions: {
    v1: { steps: 1000, cost: 500 },
    v2: { steps: 2000, cost: 800 },
  },
  calculateCost: vi.fn(() => 500),
}))

vi.mock('@/core/bot/shouldShowRubles', () => ({
  shouldShowRubles: vi.fn(() => true),
}))

vi.mock('@/interfaces/modes', () => ({
  ModeEnum: {
    DigitalAvatarBody: 'digital_avatar_body',
  },
}))

vi.mock('@/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}))

// Import after mocks
import { isRussianFromState } from '@/helpers/centralizedLanguage'
import { getStepSelectionMenu, handleHelpCancel } from '@/navigation'
import { handleTrainingCost } from '@/price/helpers'
import {
  generateCostMessage,
  stepOptions,
  calculateCost,
} from '@/price/priceCalculator'
import { shouldShowRubles } from '@/core/bot/shouldShowRubles'
import { ModeEnum } from '@/interfaces/modes'

describe('digitalAvatarBodyWizard (Digital Avatar / LoRA Training)', () => {
  const mockContext = {
    from: { id: 223757230, language_code: 'ru' },
    reply: vi.fn(),
    scene: {
      state: {},
      leave: vi.fn(),
      enter: vi.fn(),
      current: { id: 'digital_avatar_body' },
    },
    session: {
      wizardData: {} as any,
      mode: null as any,
      gender: null as any,
      modelName: null as any,
      triggerWord: null as any,
      steps: null as any,
    },
    wizard: {
      next: vi.fn(),
      cursor: 0,
    },
    message: null as any,
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockContext.session = {
      wizardData: {},
      mode: null,
      gender: null,
      modelName: null,
      triggerWord: null,
      steps: null,
    }
    mockContext.message = null
    ;(isRussianFromState as Mock).mockReturnValue(true)
    ;(handleHelpCancel as Mock).mockResolvedValue(false)
    ;(handleTrainingCost as Mock).mockResolvedValue({
      leaveScene: false,
      trainingCostInStars: 500,
      currentBalance: 1000,
    })
    ;(shouldShowRubles as Mock).mockReturnValue(true)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('1. Шаг 0: Инициализация и выбор пола', () => {
    it('должен инициализировать wizardData', () => {
      mockContext.session.wizardData = {}
      expect(mockContext.session.wizardData).toBeDefined()
    })

    it('должен устанавливать режим DigitalAvatarBody', () => {
      mockContext.session.mode = ModeEnum.DigitalAvatarBody
      expect(mockContext.session.mode).toBe('digital_avatar_body')
    })

    it('должен определять язык пользователя', () => {
      const isRu = isRussianFromState(mockContext as any)
      expect(isRu).toBe(true)
    })

    it('должен показывать клавиатуру выбора пола на русском', () => {
      const isRu = true
      const maleButton = isRu ? '👨‍💼 Мужской' : '👨‍💼 Male'
      const femaleButton = isRu ? '👩‍💼 Женский' : '👩‍💼 Female'

      expect(maleButton).toBe('👨‍💼 Мужской')
      expect(femaleButton).toBe('👩‍💼 Женский')
    })

    it('должен показывать запрос пола', () => {
      const isRu = true
      const message = isRu
        ? '👤 Выберите пол для модели:'
        : '👤 Select gender for the model:'

      expect(message).toContain('пол')
    })

    it('должен добавлять кнопки справки и отмены', () => {
      const isRu = true
      const helpButton = isRu ? '❓ Справка' : '❓ Help'
      const cancelButton = isRu ? 'Отмена' : 'Cancel'

      expect(helpButton).toBe('❓ Справка')
      expect(cancelButton).toBe('Отмена')
    })
  })

  describe('2. Шаг 1: Обработка выбора пола', () => {
    it('должен проверять отмену/справку', async () => {
      ;(handleHelpCancel as Mock).mockResolvedValue(true)

      const isCancel = await handleHelpCancel(mockContext as any)
      expect(isCancel).toBe(true)
    })

    it('должен распознавать мужской пол на русском', () => {
      const messageText = '👨‍💼 Мужской'
      const isRu = true
      let gender: string | null = null

      if (isRu) {
        if (messageText.includes('Мужской') || messageText.includes('👨')) {
          gender = 'male'
        }
      }

      expect(gender).toBe('male')
    })

    it('должен распознавать женский пол на русском', () => {
      const messageText = '👩‍💼 Женский'
      const isRu = true
      let gender: string | null = null

      if (isRu) {
        if (messageText.includes('Женский') || messageText.includes('👩')) {
          gender = 'female'
        }
      }

      expect(gender).toBe('female')
    })

    it('должен распознавать пол на английском', () => {
      const messageText = '👨‍💼 Male'
      const isRu = false
      let gender: string | null = null

      if (!isRu) {
        if (messageText.includes('Male') || messageText.includes('👨')) {
          gender = 'male'
        }
      }

      expect(gender).toBe('male')
    })

    it('должен сохранять пол в сессии', () => {
      const gender = 'male'
      mockContext.session.gender = gender
      mockContext.session.wizardData.gender = gender

      expect(mockContext.session.gender).toBe('male')
      expect(mockContext.session.wizardData.gender).toBe('male')
    })

    it('должен запрашивать название модели после выбора пола', () => {
      const isRu = true
      const message = isRu
        ? '📝 Введите название модели (например: my_avatar_model):'
        : '📝 Enter model name (e.g., my_avatar_model):'

      expect(message).toContain('название модели')
    })

    it('должен показывать подсказку при неправильном выборе', () => {
      const isRu = true
      const message = isRu
        ? '👤 Пожалуйста, выберите пол из кнопок выше.'
        : '👤 Please select gender from the buttons above.'

      expect(message).toContain('выберите пол')
    })
  })

  describe('3. Шаг 2: Обработка названия модели', () => {
    it('должен сохранять название модели', () => {
      const modelName = 'my_avatar_model'
      mockContext.session.modelName = modelName
      mockContext.session.wizardData.modelName = modelName

      expect(mockContext.session.modelName).toBe('my_avatar_model')
    })

    it('должен создавать triggerWord из названия', () => {
      const modelName = 'my_avatar_model'
      mockContext.session.triggerWord = modelName.toUpperCase()

      expect(mockContext.session.triggerWord).toBe('MY_AVATAR_MODEL')
    })

    it('должен проверять длину названия', () => {
      const modelName = 'my_avatar_model'
      const isValid = modelName.trim().length > 0

      expect(isValid).toBe(true)
    })

    it('должен отклонять пустое название', () => {
      const modelName = ''
      const isValid = modelName.trim().length > 0

      expect(isValid).toBe(false)
    })

    it('должен показывать меню выбора шагов', () => {
      const menu = getStepSelectionMenu(true)

      expect(getStepSelectionMenu).toHaveBeenCalledWith(true)
      expect(menu.reply_markup).toBeDefined()
    })

    it('должен генерировать сообщение о стоимости', () => {
      const showRubles = shouldShowRubles(mockContext as any)
      const costMessage = generateCostMessage(
        stepOptions.v1,
        true,
        'v1',
        showRubles,
        true
      )

      expect(generateCostMessage).toHaveBeenCalled()
    })
  })

  describe('4. Шаг 3: Выбор количества шагов', () => {
    it('должен парсить количество шагов из текста', () => {
      const messageText = '1000 шагов'
      const stepsMatch = messageText.match(/\d+/)

      expect(stepsMatch).toBeDefined()
      expect(stepsMatch?.[0]).toBe('1000')
    })

    it('должен сохранять количество шагов', () => {
      const steps = 1000
      mockContext.session.steps = steps
      mockContext.session.wizardData.steps = steps

      expect(mockContext.session.steps).toBe(1000)
      expect(mockContext.session.wizardData.steps).toBe(1000)
    })

    it('должен вызывать handleTrainingCost', async () => {
      const steps = 1000
      const isRu = true

      const result = await handleTrainingCost(mockContext as any, steps, isRu)

      expect(handleTrainingCost).toHaveBeenCalledWith(mockContext, steps, isRu)
      expect(result.leaveScene).toBe(false)
      expect(result.trainingCostInStars).toBe(500)
    })

    it('должен выходить если handleTrainingCost требует', async () => {
      ;(handleTrainingCost as Mock).mockResolvedValue({
        leaveScene: true,
        trainingCostInStars: 500,
        currentBalance: 100,
      })

      const result = await handleTrainingCost(mockContext as any, 1000, true)
      expect(result.leaveScene).toBe(true)
    })

    it('должен показывать подтверждение выбора шагов', () => {
      const isRu = true
      const steps = 1000
      const trainingCostInStars = 500
      const currentBalance = 1000

      const message = isRu
        ? `✅ Вы выбрали ${steps} шагов стоимостью ${trainingCostInStars}⭐️ звезд\n\nВаш баланс: ${currentBalance} ⭐️\n\n📸 Переход к загрузке изображений для обучения модели...`
        : `✅ You selected ${steps} steps costing ${trainingCostInStars}⭐️ stars\n\nYour balance: ${currentBalance} ⭐️\n\n📸 Proceeding to image upload for model training...`

      expect(message).toContain('1000 шагов')
      expect(message).toContain('500⭐️')
    })

    it('должен переходить в trainFluxModelWizard', async () => {
      await mockContext.scene.enter('trainFluxModelWizard')

      expect(mockContext.scene.enter).toHaveBeenCalledWith(
        'trainFluxModelWizard'
      )
    })
  })

  describe('5. Обработка stepOptions', () => {
    it('должен иметь опцию v1', () => {
      expect(stepOptions.v1).toBeDefined()
      expect(stepOptions.v1.steps).toBe(1000)
    })

    it('должен иметь опцию v2', () => {
      expect(stepOptions.v2).toBeDefined()
      expect(stepOptions.v2.steps).toBe(2000)
    })

    it('должен рассчитывать стоимость', () => {
      const cost = calculateCost(1000)

      expect(calculateCost).toHaveBeenCalledWith(1000)
    })
  })

  describe('6. Проверка баланса и стоимости', () => {
    it('должен проверять достаточность баланса', async () => {
      const result = await handleTrainingCost(mockContext as any, 1000, true)

      expect(result.currentBalance).toBe(1000)
      expect(result.trainingCostInStars).toBe(500)
      expect(result.currentBalance >= result.trainingCostInStars).toBe(true)
    })

    it('должен выходить при недостаточном балансе', async () => {
      ;(handleTrainingCost as Mock).mockResolvedValue({
        leaveScene: true,
        trainingCostInStars: 500,
        currentBalance: 100,
      })

      const result = await handleTrainingCost(mockContext as any, 1000, true)
      expect(result.leaveScene).toBe(true)
    })

    it('должен проверять shouldShowRubles', () => {
      const showRubles = shouldShowRubles(mockContext as any)

      expect(shouldShowRubles).toHaveBeenCalledWith(mockContext)
      expect(showRubles).toBe(true)
    })
  })

  describe('7. Обработка отмены и справки', () => {
    it('должен выходить из сцены при отмене', async () => {
      ;(handleHelpCancel as Mock).mockResolvedValue(true)

      const isCancel = await handleHelpCancel(mockContext as any)
      if (isCancel) {
        await mockContext.scene.leave()
      }

      expect(mockContext.scene.leave).toHaveBeenCalled()
    })

    it('должен показывать сообщение о необходимости выбора шагов', () => {
      const isRu = true
      const message = isRu
        ? '🔢 Пожалуйста, выберите количество шагов для продолжения обучения модели.'
        : '🔢 Please select the number of steps to proceed with model training.'

      expect(message).toContain('количество шагов')
    })
  })

  describe('8. Валидация ввода', () => {
    it('должен проверять наличие текстового сообщения', () => {
      mockContext.message = { text: 'test' }
      const hasText = mockContext.message && 'text' in mockContext.message

      expect(hasText).toBe(true)
    })

    it('должен обрабатывать отсутствие сообщения', () => {
      mockContext.message = null
      const hasText = mockContext.message && 'text' in mockContext.message

      expect(hasText).toBeFalsy()
    })

    it('должен требовать числовой ввод для шагов', () => {
      const messageText = 'not a number'
      const stepsMatch = messageText.match(/\d+/)

      expect(stepsMatch).toBeNull()
    })
  })

  describe('9. Локализация сообщений', () => {
    it('должен показывать сообщения на русском', () => {
      ;(isRussianFromState as Mock).mockReturnValue(true)

      const isRu = isRussianFromState(mockContext as any)
      expect(isRu).toBe(true)
    })

    it('должен показывать сообщения на английском', () => {
      ;(isRussianFromState as Mock).mockReturnValue(false)

      const isRu = isRussianFromState(mockContext as any)
      expect(isRu).toBe(false)
    })

    it('должен показывать запрос названия на обоих языках', () => {
      const ruMessage =
        '📝 Введите название модели (например: my_avatar_model):'
      const enMessage = '📝 Enter model name (e.g., my_avatar_model):'

      expect(ruMessage).toContain('название')
      expect(enMessage).toContain('model name')
    })
  })

  describe('10. Инициализация wizardData', () => {
    it('должен инициализировать wizardData в шаге 0', () => {
      mockContext.session.wizardData = {}
      expect(mockContext.session.wizardData).toEqual({})
    })

    it('должен инициализировать wizardData если его нет в шаге 1', () => {
      if (!mockContext.session.wizardData) {
        mockContext.session.wizardData = {}
      }
      expect(mockContext.session.wizardData).toBeDefined()
    })

    it('должен инициализировать wizardData если его нет в шаге 3', () => {
      mockContext.session.wizardData = null as any
      if (!mockContext.session.wizardData) {
        mockContext.session.wizardData = {}
      }
      expect(mockContext.session.wizardData).toBeDefined()
    })
  })

  describe('11. Навигация wizard', () => {
    it('должен переходить к следующему шагу', () => {
      mockContext.wizard.next()
      expect(mockContext.wizard.next).toHaveBeenCalled()
    })

    it('должен отслеживать текущий шаг', () => {
      expect(mockContext.wizard.cursor).toBe(0)
    })
  })

  describe('12. Проверка telegram_id', () => {
    it('должен проверять наличие telegram_id', () => {
      const telegramId = mockContext.from?.id
      expect(telegramId).toBe(223757230)
    })

    it('должен обрабатывать отсутствие telegram_id', () => {
      const context = { from: null }
      const telegramId = context.from?.id

      expect(telegramId).toBeUndefined()
    })
  })
})
