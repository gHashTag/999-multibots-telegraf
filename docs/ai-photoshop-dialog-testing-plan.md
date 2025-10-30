# 🧪 AI Photoshop Dialog Mode Testing Plan & Best Practices

Основанный на анализе существующих тестовых файлов в проекте, этот документ содержит рекомендации по тестированию AI Photoshop диалогового режима.

## 📋 Анализ Существующих Паттернов Тестирования

### 1. Общие Паттерны из Telegram Scene Тестов

#### A. Структура Тестов (из `startScene.comprehensive.test.ts`)
```typescript
describe('Scene Name - Feature Testing', () => {
  let mockContext: Partial<MyContext & WizardContext>

  beforeEach(() => {
    // Настройка mock context с полным набором свойств
    mockContext = {
      wizard: {
        cursor: 0,
        selectStep: jest.fn(),
        back: jest.fn(),
        next: jest.fn(),
        state: {}
      },
      session: { /* начальное состояние */ },
      reply: jest.fn().mockResolvedValue({}),
      // ... остальные mock функции
    }

    // Настройка модулей-заглушек
    require('@/core/supabase').getUserDetailsSubscription = mockGetUserDetailsSubscription
  })

  // Тестовые блоки по сценариям
  describe('🎯 Specific Feature Testing', () => {
    // Конкретные тесты
  })
})
```

#### B. Паттерны Мокирования (из `avatarBrainWizard.test.ts`)
```typescript
// Централизованное мокирование модулей
mock.module('../src/core/supabase', () => ({
  updateUserSoul: mock(),
  getUserByTelegramId: mock(),
}))

// Использование vi.mocked для типизированных заглушек
vi.mocked(isRussianFromState).mockReturnValue(true)
```

### 2. Специфические Паттерны AI Photoshop

#### A. Валидация Схем (из `multi-photo-validation.test.ts`)
```typescript
it('should accept multiple images for SeeDream-4 (up to 10)', () => {
  const input = {
    prompt: 'merge these images together',
    size: '1K' as const,
    max_images: 2,
    image_input: [
      'https://example.com/image1.jpg',
      'https://example.com/image2.jpg'
    ],
    telegram_id: '123456789'
  }

  const result = validateSeeDream4Input(input)
  expect(result.success).toBe(true)
  expect(result.data?.image_input?.length).toBe(2)
})
```

#### B. Тестирование Состояний Сессий (из `regression-prevention.test.ts`)
```typescript
it('should preserve user prompt during multi-photo processing', () => {
  const userPrompt = 'merge these two beautiful images together'

  // Установка состояния
  mockContext.session.aiPhotoshopPrompt = userPrompt
  mockContext.session.aiPhotoshopModel = 'seedream'

  // Имитация обработки
  mockContext.session.morphingImages = [/* mock images */]

  // Проверка сохранения состояния
  expect(mockContext.session.aiPhotoshopPrompt).toBe(userPrompt)
})
```

## 🎯 Рекомендации для AI Photoshop Dialog Testing

### 1. Тестирование Состояний Диалога

#### A. State Transitions Testing
```typescript
describe('AI Photoshop Dialog State Management', () => {
  it('should transition through dialog states correctly', async () => {
    const stateFlow = [
      'model_selection',
      'style_selection',
      'image_upload',
      'size_selection',
      'processing',
      'result_display'
    ]

    for (let i = 0; i < stateFlow.length - 1; i++) {
      const currentState = stateFlow[i]
      const nextState = stateFlow[i + 1]

      mockContext.session.aiPhotoshopStep = currentState

      // Simulate user action that triggers transition
      await simulateStateTransition(mockContext, nextState)

      expect(mockContext.session.aiPhotoshopStep).toBe(nextState)
    }
  })

  it('should handle dialog interruptions gracefully', async () => {
    mockContext.session.aiPhotoshopStep = 'image_upload'
    mockContext.session.awaitingAiPhotoshopImage = true

    // User sends text instead of image
    mockContext.message = { text: '/menu' } as any

    // Should exit scene and clear state
    await aiPhotoshopScene.enter(mockContext as any)

    expect(mockContext.session.aiPhotoshopStep).toBeUndefined()
    expect(mockContext.session.awaitingAiPhotoshopImage).toBe(false)
  })
})
```

#### B. Session State Preservation
```typescript
describe('Session State Preservation', () => {
  const testStatePreservation = (
    stateName: string,
    stateValue: any,
    interruptionAction: () => Promise<void>
  ) => {
    it(`should preserve ${stateName} during interruptions`, async () => {
      (mockContext.session as any)[stateName] = stateValue

      // Simulate interruption
      await interruptionAction()

      // State should be preserved
      expect((mockContext.session as any)[stateName]).toBe(stateValue)
    })
  }

  testStatePreservation('aiPhotoshopPrompt', 'custom prompt',
    () => simulateCallbackQuery('ai_photoshop_size_2K'))
  testStatePreservation('aiPhotoshopSize', '1K',
    () => simulateImageUpload())
  testStatePreservation('aiPhotoshopModel', 'seedream',
    () => simulateTextMessage('change style'))
})
```

### 2. Zod Schema Validation Testing

#### A. Comprehensive Input Validation
```typescript
describe('AI Photoshop Input Validation', () => {
  const validationTestSuite = [
    {
      name: 'valid single image input',
      input: {
        prompt: 'enhance this image',
        size: '1K',
        max_images: 1,
        image_input: ['https://example.com/image.jpg'],
        telegram_id: '123456789'
      },
      shouldPass: true
    },
    {
      name: 'invalid prompt - too short',
      input: {
        prompt: 'hi',
        size: '1K',
        max_images: 1,
        image_input: ['https://example.com/image.jpg'],
        telegram_id: '123456789'
      },
      shouldPass: false
    }
    // ... more test cases
  ]

  validationTestSuite.forEach(testCase => {
    it(`should ${testCase.shouldPass ? 'accept' : 'reject'} ${testCase.name}`, () => {
      const result = validateSeeDream4Input(testCase.input)
      expect(result.success).toBe(testCase.shouldPass)
    })
  })
})
```

#### B. Custom Validation Rules Testing
```typescript
describe('Custom Validation Rules', () => {
  it('should enforce model-specific image limits', () => {
    const testCases = [
      { model: 'seedream', images: 10, shouldPass: true },
      { model: 'seedream', images: 11, shouldPass: false },
      { model: 'nano_banana', images: 3, shouldPass: true },
      { model: 'nano_banana', images: 4, shouldPass: false },
      { model: 'flux_max', images: 1, shouldPass: true },
      { model: 'flux_max', images: 2, shouldPass: false }
    ]

    testCases.forEach(({ model, images, shouldPass }) => {
      const result = validateModelImageLimit(model, images)
      expect(result.valid).toBe(shouldPass)
    })
  })

  it('should validate size-cost relationships', () => {
    const sizePricing = {
      '1K': 15,
      '2K': 20,
      '4K': 30
    }

    Object.entries(sizePricing).forEach(([size, expectedCost]) => {
      const cost = calculateProcessingCost(size, 1)
      expect(cost).toBe(expectedCost)
    })
  })
})
```

### 3. Dialog Flow Testing

#### A. Multi-Step Dialog Testing
```typescript
describe('AI Photoshop Dialog Flow', () => {
  it('should complete full dialog workflow', async () => {
    // Step 1: Model Selection
    await simulateCallbackQuery('ai_photoshop_model_seedream')
    expect(mockContext.session.aiPhotoshopModel).toBe('seedream')
    expect(mockContext.session.aiPhotoshopStep).toBe('style_selection')

    // Step 2: Style Selection
    await simulateCallbackQuery('ai_photoshop_style_artistic')
    expect(mockContext.session.aiPhotoshopStyle).toBe('artistic')
    expect(mockContext.session.aiPhotoshopStep).toBe('size_selection')

    // Step 3: Size Selection
    await simulateCallbackQuery('ai_photoshop_size_1K')
    expect(mockContext.session.aiPhotoshopSize).toBe('1K')
    expect(mockContext.session.aiPhotoshopStep).toBe('image_upload')

    // Step 4: Image Upload
    await simulateImageUpload(['image1.jpg', 'image2.jpg'])
    expect(mockContext.session.morphingImages).toHaveLength(2)
    expect(mockContext.session.aiPhotoshopStep).toBe('processing')

    // Step 5: Processing Confirmation
    await simulateCallbackQuery('ai_photoshop_confirm_processing')
    expect(mockContext.session.aiPhotoshopStep).toBe('processing_confirmed')
  })

  it('should allow back navigation with state preservation', async () => {
    // Setup state at image upload step
    setupDialogState('image_upload', {
      model: 'seedream',
      style: 'artistic',
      size: '2K'
    })

    // Navigate back to size selection
    await simulateCallbackQuery('ai_photoshop_back_size')

    // Should preserve previous selections
    expect(mockContext.session.aiPhotoshopModel).toBe('seedream')
    expect(mockContext.session.aiPhotoshopStyle).toBe('artistic')
    expect(mockContext.session.aiPhotoshopStep).toBe('size_selection')
  })
})
```

#### B. Error Handling in Dialog
```typescript
describe('Dialog Error Handling', () => {
  it('should handle invalid file uploads gracefully', async () => {
    setupDialogState('image_upload')

    // Upload invalid file type
    await simulateFileUpload('document.pdf', 'application/pdf')

    // Should show error and stay in same step
    expect(mockContext.reply).toHaveBeenCalledWith(
      expect.stringContaining('Поддерживаются только изображения')
    )
    expect(mockContext.session.aiPhotoshopStep).toBe('image_upload')
  })

  it('should handle timeout during processing', async () => {
    setupDialogState('processing')

    // Mock API timeout
    jest.spyOn(generateSeeDream4, 'call').mockRejectedValue(
      new Error('Request timeout')
    )

    await simulateProcessingTimeout()

    expect(mockContext.reply).toHaveBeenCalledWith(
      expect.stringContaining('Превышено время ожидания')
    )
    expect(mockContext.session.aiPhotoshopStep).toBe('error')
  })
})
```

### 4. Mock API Call Testing

#### A. API Service Mocking
```typescript
describe('AI Photoshop API Integration', () => {
  beforeEach(() => {
    // Mock всех API сервисов
    jest.spyOn(generateSeeDream4, 'call').mockResolvedValue({
      success: true,
      images: ['https://result1.jpg', 'https://result2.jpg'],
      metadata: { processing_time: 25.5 }
    })

    jest.spyOn(generateNanoBanana, 'call').mockResolvedValue({
      success: true,
      result_url: 'https://nano_result.jpg'
    })

    jest.spyOn(generateFluxKontextMax, 'call').mockResolvedValue({
      image: 'https://flux_result.png'
    })
  })

  it('should call correct API based on selected model', async () => {
    const testCases = [
      { model: 'seedream', apiSpy: generateSeeDream4 },
      { model: 'nano_banana', apiSpy: generateNanoBanana },
      { model: 'flux_max', apiSpy: generateFluxKontextMax }
    ]

    for (const { model, apiSpy } of testCases) {
      mockContext.session.aiPhotoshopModel = model
      await processAiPhotoshopRequest(mockContext)

      expect(apiSpy).toHaveBeenCalled()
    }
  })

  it('should handle API failures gracefully', async () => {
    const apiErrors = [
      { error: 'Rate limit exceeded', shouldRetry: true },
      { error: 'Invalid API key', shouldRetry: false },
      { error: 'Service unavailable', shouldRetry: true }
    ]

    for (const { error, shouldRetry } of apiErrors) {
      jest.spyOn(generateSeeDream4, 'call').mockRejectedValue(new Error(error))

      const result = await processAiPhotoshopRequest(mockContext)

      expect(result.success).toBe(false)
      expect(result.shouldRetry).toBe(shouldRetry)
    }
  })
})
```

#### B. Multi-Photo API Testing
```typescript
describe('Multi-Photo API Processing', () => {
  it('should process multiple images correctly', async () => {
    const testImages = createMockImages(3)
    mockContext.session.morphingImages = testImages
    mockContext.session.aiPhotoshopModel = 'seedream'

    await processMultiPhotoRequest(mockContext)

    expect(generateSeeDream4).toHaveBeenCalledWith({
      prompt: expect.any(String),
      size: expect.any(String),
      image_input: expect.arrayContaining([
        expect.stringMatching(/^data:image\//)
      ]),
      max_images: 3
    })
  })

  it('should handle mixed file formats in multi-photo', async () => {
    const mixedFormatImages = [
      createMockImage('image1.jpg', 'image/jpeg'),
      createMockImage('image2.png', 'image/png'),
      createMockImage('image3.heic', 'image/heic')
    ]

    const result = await processMultiFormatUpload(mixedFormatImages)

    expect(result.convertedImages).toHaveLength(3)
    expect(result.convertedImages.every(img =>
      img.mimeType === 'image/jpeg'
    )).toBe(true)
  })
})
```

## 🔧 Helper Functions для Тестирования

### Test Utilities
```typescript
// Утилиты для создания mock данных
export const createMockContext = (sessionState: Partial<MyContext['session']> = {}) => ({
  from: { id: 123456789, first_name: 'Test' },
  session: {
    aiPhotoshopModel: undefined,
    aiPhotoshopStep: undefined,
    awaitingAiPhotoshopImage: false,
    morphingImages: [],
    ...sessionState
  },
  reply: jest.fn(),
  editMessageText: jest.fn(),
  answerCbQuery: jest.fn(),
  scene: {
    enter: jest.fn(),
    leave: jest.fn()
  }
})

export const simulateCallbackQuery = async (data: string) => {
  const handler = aiPhotoshopScene.action(data)
  if (handler) {
    await handler(mockContext)
  }
}

export const simulateImageUpload = async (filenames: string[] = ['test.jpg']) => {
  const mockFiles = filenames.map(filename => createMockFile(filename))
  mockContext.message = {
    photo: mockFiles.map(file => ({ file_id: file.filename }))
  } as any

  const handler = aiPhotoshopScene.on('photo')
  if (handler) {
    await handler(mockContext)
  }
}

export const setupDialogState = (step: string, additionalState: any = {}) => {
  mockContext.session.aiPhotoshopStep = step
  Object.assign(mockContext.session, additionalState)
}
```

## 📊 Метрики и Отчетность

### Test Coverage Metrics
```typescript
describe('Test Coverage Validation', () => {
  it('should cover all dialog states', () => {
    const requiredStates = [
      'model_selection',
      'style_selection',
      'size_selection',
      'image_upload',
      'processing',
      'result_display',
      'error'
    ]

    const testedStates = getTestedDialogStates()

    requiredStates.forEach(state => {
      expect(testedStates).toContain(state)
    })
  })

  it('should cover all error scenarios', () => {
    const errorScenarios = [
      'invalid_file_format',
      'file_too_large',
      'api_timeout',
      'api_rate_limit',
      'processing_failed'
    ]

    const testedErrors = getTestedErrorScenarios()

    errorScenarios.forEach(error => {
      expect(testedErrors).toContain(error)
    })
  })
})
```

## 🚀 Конфигурация Тестового Окружения

### Jest Configuration
```javascript
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: [
    '**/tests/ai-photoshop/**/*.test.ts'
  ],
  setupFilesAfterEnv: [
    '<rootDir>/tests/ai-photoshop/setup.ts'
  ],
  collectCoverageFrom: [
    'src/scenes/aiPhotoshopScene/**/*.ts',
    'src/schemas/seedream4.schema.ts',
    'src/services/generate*.ts'
  ],
  coverageThreshold: {
    global: {
      branches: 85,
      functions: 85,
      lines: 85,
      statements: 85
    },
    'src/scenes/aiPhotoshopScene/': {
      branches: 90,
      functions: 90,
      lines: 90,
      statements: 90
    }
  },
  testTimeout: 30000
}
```

### Test Setup File
```typescript
// tests/ai-photoshop/setup.ts
import { jest } from '@jest/globals'

// Mock all external dependencies
jest.mock('@/core/supabase')
jest.mock('@/services/generateSeeDream4')
jest.mock('@/services/generateNanoBanana')
jest.mock('@/services/generateFluxKontextMax')
jest.mock('@/helpers/saveFileLocally')

// Set test environment variables
process.env.NODE_ENV = 'test'
process.env.TEST_TIMEOUT = '30000'

// Global test utilities
global.createMockContext = createMockContext
global.simulateCallbackQuery = simulateCallbackQuery
global.simulateImageUpload = simulateImageUpload

// Suppress console logs during testing
global.console = {
  ...console,
  log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: console.error // Keep errors for debugging
}
```

## 📋 Best Practices Checklist

### ✅ Dialog State Testing
- [ ] Test all possible state transitions
- [ ] Verify state preservation during interruptions
- [ ] Test back/forward navigation
- [ ] Validate cleanup on dialog cancellation

### ✅ Schema Validation
- [ ] Test all input validation rules
- [ ] Verify model-specific constraints
- [ ] Test edge cases and boundary values
- [ ] Validate error message clarity

### ✅ API Integration
- [ ] Mock all external API calls
- [ ] Test timeout handling
- [ ] Verify retry logic
- [ ] Test rate limit handling

### ✅ File Handling
- [ ] Test supported file formats
- [ ] Validate file size limits
- [ ] Test multi-format processing
- [ ] Verify buffer management

### ✅ Error Handling
- [ ] Test graceful error recovery
- [ ] Verify user-friendly error messages
- [ ] Test error state transitions
- [ ] Validate error logging

### ✅ Performance
- [ ] Test dialog response times
- [ ] Monitor memory usage
- [ ] Verify cleanup efficiency
- [ ] Test concurrent dialogs

Этот план тестирования обеспечивает комплексное покрытие AI Photoshop диалогового режима с использованием проверенных паттернов из существующих тестов проекта.