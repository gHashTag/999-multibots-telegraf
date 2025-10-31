/**
 * 🧪 AI PHOTOSHOP DIALOG MODE TEST EXAMPLE
 *
 * Практический пример тестирования диалогового режима AI Photoshop
 * Основан на найденных паттернах в существующих тестах проекта
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals'
import { MyContext } from '../../src/interfaces'
import { aiPhotoshopScene } from '../../src/scenes/aiPhotoshopScene'
import { validateSeeDream4Input } from '../../src/schemas/seedream4.schema'

// Mock external dependencies (следуя паттерну из avatarBrainWizard.test.ts)
jest.mock('../../src/core/supabase')
jest.mock('../../src/services/generateSeeDream4')
jest.mock('../../src/services/generateNanoBanana')
jest.mock('../../src/services/generateFluxKontextMax')
jest.mock('../../src/helpers/saveFileLocally')
jest.mock('../../src/utils/logger')

describe('AI Photoshop Dialog Mode Integration Tests', () => {
  let mockContext: Partial<MyContext>
  let mockGenerateSeeDream4: jest.Mock
  let mockGenerateNanoBanana: jest.Mock
  let mockSaveFileLocally: jest.Mock

  beforeEach(() => {
    // Setup mock context (следуя паттерну из startScene.comprehensive.test.ts)
    mockContext = {
      from: {
        id: 123456789,
        username: 'testuser',
        first_name: 'Test',
        last_name: 'User',
        is_bot: false,
        language_code: 'ru'
      },
      chat: { id: 123456789, type: 'private' },
      session: {
        // AI Photoshop session state
        aiPhotoshopModel: undefined,
        aiPhotoshopStyle: undefined,
        aiPhotoshopSize: undefined,
        aiPhotoshopPrompt: undefined,
        aiPhotoshopStep: undefined,
        aiPhotoshopImage: undefined,
        awaitingAiPhotoshopImage: false,
        awaitingAiPhotoshopPrompt: false,
        morphingImages: []
      },
      reply: jest.fn().mockResolvedValue({}),
      replyWithHTML: jest.fn().mockResolvedValue({}),
      editMessageText: jest.fn().mockResolvedValue({}),
      answerCbQuery: jest.fn().mockResolvedValue({}),
      deleteMessage: jest.fn().mockResolvedValue({}),
      scene: {
        enter: jest.fn().mockResolvedValue({}),
        leave: jest.fn().mockResolvedValue({}),
        reenter: jest.fn().mockResolvedValue({})
      },
      telegram: {
        getFile: jest.fn().mockResolvedValue({ file_path: 'test/path.jpg' }),
        getFileLink: jest.fn().mockResolvedValue('https://api.telegram.org/file/bot123/test/path.jpg'),
        editMessageText: jest.fn().mockResolvedValue({}),
        deleteMessage: jest.fn().mockResolvedValue({})
      },
      message: undefined,
      callbackQuery: undefined
    } as any

    // Setup API mocks
    mockGenerateSeeDream4 = jest.fn()
    mockGenerateNanoBanana = jest.fn()
    mockSaveFileLocally = jest.fn()

    // Mock module imports
    require('../../src/services/generateSeeDream4').generateSeeDream4 = mockGenerateSeeDream4
    require('../../src/services/generateNanoBanana').generateNanoBanana = mockGenerateNanoBanana
    require('../../src/helpers/saveFileLocally').saveFileLocally = mockSaveFileLocally

    // Mock helpers
    require('../../src/helpers/centralizedLanguage').isRussianFromState = jest.fn().mockReturnValue(true)
  })

  describe('🎭 Complete Dialog Workflow Testing', () => {
    it('should complete full SeeDream-4 workflow with multi-photo', async () => {
      // Step 1: Enter scene
      await aiPhotoshopScene.enter(mockContext as any)

      expect(mockContext.replyWithHTML).toHaveBeenCalledWith(
        expect.stringContaining('🎨 Добро пожаловать в AI Фотошоп'),
        expect.objectContaining({
          reply_markup: expect.objectContaining({
            inline_keyboard: expect.arrayContaining([
              expect.arrayContaining([
                expect.objectContaining({
                  text: expect.stringContaining('SeeDream-4'),
                  callback_data: 'ai_photoshop_model_seedream'
                })
              ])
            ])
          })
        })
      )

      // Step 2: Select model
      mockContext.callbackQuery = {
        data: 'ai_photoshop_model_seedream',
        from: mockContext.from
      } as any

      const modelHandler = aiPhotoshopScene.action('ai_photoshop_model_seedream')
      await modelHandler!(mockContext as any)

      expect(mockContext.session!.aiPhotoshopModel).toBe('seedream')
      expect(mockContext.session!.aiPhotoshopStep).toBe('style_selection')
      expect(mockContext.answerCbQuery).toHaveBeenCalled()

      // Step 3: Select artistic style
      mockContext.callbackQuery!.data = 'ai_photoshop_style_artistic'

      const styleHandler = aiPhotoshopScene.action('ai_photoshop_style_artistic')
      await styleHandler!(mockContext as any)

      expect(mockContext.session!.aiPhotoshopStyle).toBe('artistic')
      expect(mockContext.session!.aiPhotoshopStep).toBe('size_selection')

      // Step 4: Select size
      mockContext.callbackQuery!.data = 'ai_photoshop_size_1K'

      const sizeHandler = aiPhotoshopScene.action('ai_photoshop_size_1K')
      await sizeHandler!(mockContext as any)

      expect(mockContext.session!.aiPhotoshopSize).toBe('1K')
      expect(mockContext.session!.aiPhotoshopStep).toBe('image_upload')
      expect(mockContext.session!.awaitingAiPhotoshopImage).toBe(true)

      // Step 5: Upload multiple images
      const mockImages = [
        {
          buffer: Buffer.from('fake-image-data-1'),
          filename: 'ai_photoshop_image_1.jpg',
          timestamp: Date.now(),
          originalOrder: 1
        },
        {
          buffer: Buffer.from('fake-image-data-2'),
          filename: 'ai_photoshop_image_2.jpg',
          timestamp: Date.now() + 1,
          originalOrder: 2
        }
      ]

      // Mock file save operations
      mockSaveFileLocally
        .mockResolvedValueOnce('path/to/temp/image1.jpg')
        .mockResolvedValueOnce('path/to/temp/image2.jpg')

      // Simulate multi-photo upload
      mockContext.message = {
        media_group_id: 'group_123',
        photo: [
          { file_id: 'photo_1_large', width: 1024, height: 1536 }
        ]
      } as any

      mockContext.session!.morphingImages = mockImages

      const photoHandler = aiPhotoshopScene.on('photo')
      await photoHandler!(mockContext as any)

      expect(mockContext.session!.morphingImages).toHaveLength(2)
      expect(mockContext.session!.awaitingAiPhotoshopImage).toBe(false)

      // Step 6: Confirm processing
      mockContext.callbackQuery!.data = 'ai_photoshop_confirm_processing'

      // Mock successful API response
      mockGenerateSeeDream4.mockResolvedValue({
        success: true,
        images: ['https://result1.jpg', 'https://result2.jpg'],
        metadata: {
          prompt: 'artistic style, creative composition, vibrant colors, detailed artwork',
          size: '1K',
          dimensions: { width: 1024, height: 1536 },
          generation_time: 25.5
        }
      })

      const confirmHandler = aiPhotoshopScene.action('ai_photoshop_confirm_processing')
      await confirmHandler!(mockContext as any)

      // Should call API with correct parameters
      expect(mockGenerateSeeDream4).toHaveBeenCalledWith(
        expect.objectContaining({
          prompt: expect.stringContaining('artistic style'),
          size: '1K',
          max_images: 2,
          image_input: expect.arrayContaining([
            expect.stringMatching(/^data:image\/jpeg;base64,/)
          ]),
          telegram_id: '123456789'
        })
      )

      // Should display results
      expect(mockContext.replyWithHTML).toHaveBeenCalledWith(
        expect.stringContaining('✅ Обработка завершена'),
        expect.objectContaining({
          reply_markup: expect.objectContaining({
            inline_keyboard: expect.arrayContaining([
              expect.arrayContaining([
                expect.objectContaining({
                  text: expect.stringContaining('Создать ещё'),
                  callback_data: 'ai_photoshop_create_more'
                })
              ])
            ])
          })
        })
      )
    })

    it('should handle custom prompt workflow correctly', async () => {
      // Setup initial state
      mockContext.session!.aiPhotoshopModel = 'seedream'
      mockContext.session!.aiPhotoshopStep = 'style_selection'

      // Select custom style
      mockContext.callbackQuery = {
        data: 'ai_photoshop_style_custom',
        from: mockContext.from
      } as any

      const customStyleHandler = aiPhotoshopScene.action('ai_photoshop_style_custom')
      await customStyleHandler!(mockContext as any)

      expect(mockContext.session!.aiPhotoshopStyle).toBe('custom')
      expect(mockContext.session!.aiPhotoshopStep).toBe('custom_prompt')
      expect(mockContext.session!.awaitingAiPhotoshopPrompt).toBe(true)

      // User enters custom prompt
      mockContext.message = {
        text: 'merge these two beautiful images into a magical fantasy scene'
      } as any

      const textHandler = aiPhotoshopScene.on('text')
      await textHandler!(mockContext as any)

      expect(mockContext.session!.aiPhotoshopPrompt).toBe(
        'merge these two beautiful images into a magical fantasy scene'
      )
      expect(mockContext.session!.awaitingAiPhotoshopPrompt).toBe(false)
      expect(mockContext.session!.aiPhotoshopStep).toBe('size_selection')
    })
  })

  describe('🚨 Error Handling & Edge Cases', () => {
    it('should handle invalid file upload gracefully', async () => {
      // Setup image upload state
      mockContext.session!.aiPhotoshopStep = 'image_upload'
      mockContext.session!.awaitingAiPhotoshopImage = true

      // Upload invalid file type
      mockContext.message = {
        document: {
          file_name: 'document.pdf',
          mime_type: 'application/pdf'
        }
      } as any

      const documentHandler = aiPhotoshopScene.on('document')
      await documentHandler!(mockContext as any)

      expect(mockContext.reply).toHaveBeenCalledWith(
        expect.stringContaining('Поддерживаются только изображения')
      )
      expect(mockContext.session!.aiPhotoshopStep).toBe('image_upload')
      expect(mockContext.session!.awaitingAiPhotoshopImage).toBe(true)
    })

    it('should handle API timeout gracefully', async () => {
      // Setup processing state
      mockContext.session!.aiPhotoshopModel = 'seedream'
      mockContext.session!.aiPhotoshopStep = 'processing'
      mockContext.session!.morphingImages = [
        {
          buffer: Buffer.from('test-data'),
          filename: 'test.jpg',
          timestamp: Date.now(),
          originalOrder: 1
        }
      ]

      // Mock API timeout
      mockGenerateSeeDream4.mockRejectedValue(new Error('Request timeout'))

      mockContext.callbackQuery = {
        data: 'ai_photoshop_confirm_processing',
        from: mockContext.from
      } as any

      const confirmHandler = aiPhotoshopScene.action('ai_photoshop_confirm_processing')
      await confirmHandler!(mockContext as any)

      expect(mockContext.reply).toHaveBeenCalledWith(
        expect.stringContaining('⏰ Превышено время ожидания')
      )
      expect(mockContext.session!.aiPhotoshopStep).toBe('error')
    })

    it('should preserve session state during interruptions', async () => {
      // Setup mid-dialog state
      const preservedState = {
        aiPhotoshopModel: 'seedream',
        aiPhotoshopStyle: 'artistic',
        aiPhotoshopSize: '2K',
        aiPhotoshopPrompt: 'enhance this beautiful portrait',
        aiPhotoshopStep: 'image_upload'
      }

      Object.assign(mockContext.session!, preservedState)

      // Simulate interruption (user clicks back button)
      mockContext.callbackQuery = {
        data: 'ai_photoshop_back_size',
        from: mockContext.from
      } as any

      const backHandler = aiPhotoshopScene.action('ai_photoshop_back_size')
      await backHandler!(mockContext as any)

      // Should preserve all previous selections
      expect(mockContext.session!.aiPhotoshopModel).toBe(preservedState.aiPhotoshopModel)
      expect(mockContext.session!.aiPhotoshopStyle).toBe(preservedState.aiPhotoshopStyle)
      expect(mockContext.session!.aiPhotoshopPrompt).toBe(preservedState.aiPhotoshopPrompt)
      // Should only change step
      expect(mockContext.session!.aiPhotoshopStep).toBe('size_selection')
    })

    it('should handle empty morphingImages array', async () => {
      // Setup state with empty images
      mockContext.session!.aiPhotoshopModel = 'seedream'
      mockContext.session!.aiPhotoshopStep = 'processing'
      mockContext.session!.morphingImages = []

      mockContext.callbackQuery = {
        data: 'ai_photoshop_confirm_processing',
        from: mockContext.from
      } as any

      const confirmHandler = aiPhotoshopScene.action('ai_photoshop_confirm_processing')
      await confirmHandler!(mockContext as any)

      expect(mockContext.reply).toHaveBeenCalledWith(
        expect.stringContaining('❌ Нет изображений для обработки')
      )
      expect(mockContext.session!.aiPhotoshopStep).toBe('image_upload')
    })
  })

  describe('📏 Schema Validation Integration', () => {
    it('should validate multi-photo SeeDream-4 input correctly', async () => {
      const validInput = {
        prompt: 'merge these images together in artistic style',
        size: '1K' as const,
        max_images: 2,
        image_input: [
          'https://example.com/image1.jpg',
          'https://example.com/image2.jpg'
        ],
        telegram_id: '123456789',
        is_ru: true
      }

      const result = validateSeeDream4Input(validInput)

      expect(result.success).toBe(true)
      expect(result.data?.prompt).toBe(validInput.prompt)
      expect(result.data?.max_images).toBe(2)
      expect(result.data?.image_input).toHaveLength(2)
    })

    it('should reject invalid multi-photo input', async () => {
      const invalidInputs = [
        // Too many images for nano_banana
        {
          prompt: 'process these images',
          size: '1K' as const,
          max_images: 5,
          image_input: Array(5).fill('https://example.com/image.jpg'),
          telegram_id: '123456789',
          model: 'nano_banana'
        },
        // Empty prompt
        {
          prompt: '',
          size: '1K' as const,
          max_images: 1,
          image_input: ['https://example.com/image.jpg'],
          telegram_id: '123456789'
        },
        // Invalid image URLs
        {
          prompt: 'enhance image',
          size: '1K' as const,
          max_images: 2,
          image_input: ['not-a-url', 'also-invalid'],
          telegram_id: '123456789'
        }
      ]

      invalidInputs.forEach(input => {
        const result = validateSeeDream4Input(input)
        expect(result.success).toBe(false)
      })
    })

    it('should handle custom size validation', async () => {
      const customSizeInput = {
        prompt: 'create custom sized artwork',
        size: 'custom' as const,
        width: 1200,
        height: 1600,
        max_images: 1,
        image_input: ['https://example.com/image.jpg'],
        telegram_id: '123456789'
      }

      const result = validateSeeDream4Input(customSizeInput)
      expect(result.success).toBe(true)

      // Should fail without width/height
      const invalidCustomSize = { ...customSizeInput }
      delete (invalidCustomSize as any).width
      delete (invalidCustomSize as any).height

      const invalidResult = validateSeeDream4Input(invalidCustomSize)
      expect(invalidResult.success).toBe(false)
    })
  })

  describe('💰 Cost Calculation Testing', () => {
    it('should calculate multi-photo costs correctly', async () => {
      const testCases = [
        { size: '1K', images: 1, expected: 15 },
        { size: '1K', images: 2, expected: 30 },
        { size: '1K', images: 5, expected: 75 },
        { size: '2K', images: 1, expected: 20 },
        { size: '2K', images: 3, expected: 60 },
        { size: '4K', images: 1, expected: 30 },
        { size: '4K', images: 2, expected: 60 }
      ]

      const sizePrices = { '1K': 15, '2K': 20, '4K': 30 }

      testCases.forEach(({ size, images, expected }) => {
        const cost = sizePrices[size as keyof typeof sizePrices] * images
        expect(cost).toBe(expected)
      })
    })

    it('should display cost in dialog correctly', async () => {
      mockContext.session!.aiPhotoshopSize = '2K'
      mockContext.session!.morphingImages = [
        { buffer: Buffer.from('img1'), filename: 'img1.jpg', timestamp: Date.now(), originalOrder: 1 },
        { buffer: Buffer.from('img2'), filename: 'img2.jpg', timestamp: Date.now(), originalOrder: 2 },
        { buffer: Buffer.from('img3'), filename: 'img3.jpg', timestamp: Date.now(), originalOrder: 3 }
      ]

      mockContext.callbackQuery = {
        data: 'ai_photoshop_show_cost',
        from: mockContext.from
      } as any

      const costHandler = aiPhotoshopScene.action('ai_photoshop_show_cost')
      await costHandler!(mockContext as any)

      // Should show correct total cost (3 images × 20 stars = 60 stars)
      expect(mockContext.editMessageText).toHaveBeenCalledWith(
        expect.stringContaining('60⭐'),
        expect.anything()
      )
    })
  })

  describe('🏃‍♂️ Performance & Memory Testing', () => {
    it('should handle large image buffers efficiently', async () => {
      const initialMemory = process.memoryUsage().heapUsed

      // Create large mock images (5MB each)
      const largeImages = Array(3).fill(0).map((_, i) => ({
        buffer: Buffer.alloc(5 * 1024 * 1024, i), // 5MB
        filename: `large_image_${i}.jpg`,
        timestamp: Date.now() + i,
        originalOrder: i + 1
      }))

      mockContext.session!.morphingImages = largeImages

      // Process images
      mockGenerateSeeDream4.mockResolvedValue({
        success: true,
        images: ['result1.jpg', 'result2.jpg'],
        metadata: { processing_time: 30 }
      })

      mockContext.callbackQuery = {
        data: 'ai_photoshop_confirm_processing',
        from: mockContext.from
      } as any

      const confirmHandler = aiPhotoshopScene.action('ai_photoshop_confirm_processing')
      await confirmHandler!(mockContext as any)

      // Clean up (simulate scene exit)
      mockContext.session!.morphingImages = []

      // Force garbage collection if available
      if (global.gc) {
        global.gc()
      }

      const finalMemory = process.memoryUsage().heapUsed
      const memoryIncrease = finalMemory - initialMemory

      // Memory increase should be reasonable (less than 20MB after cleanup)
      expect(memoryIncrease).toBeLessThan(20 * 1024 * 1024)
    })

    it('should process dialog interactions quickly', async () => {
      const interactions = [
        'ai_photoshop_model_seedream',
        'ai_photoshop_style_artistic',
        'ai_photoshop_size_1K',
        'ai_photoshop_back_size',
        'ai_photoshop_size_2K'
      ]

      const processingTimes: number[] = []

      for (const interaction of interactions) {
        mockContext.callbackQuery = { data: interaction, from: mockContext.from } as any

        const start = performance.now()

        const handler = aiPhotoshopScene.action(interaction)
        if (handler) {
          await handler(mockContext as any)
        }

        const end = performance.now()
        processingTimes.push(end - start)
      }

      // All interactions should complete within 100ms
      processingTimes.forEach(time => {
        expect(time).toBeLessThan(100)
      })

      // Average processing time should be reasonable
      const avgTime = processingTimes.reduce((a, b) => a + b, 0) / processingTimes.length
      expect(avgTime).toBeLessThan(50)
    })
  })
})

/**
 * Helper Functions для тестирования
 */
const createMockImage = (filename: string, mimeType: string = 'image/jpeg', size: number = 1024000) => ({
  buffer: Buffer.alloc(size, Math.floor(Math.random() * 256)),
  filename,
  mimeType,
  timestamp: Date.now(),
  originalOrder: 1
})

const createMockImages = (count: number) => {
  return Array(count).fill(0).map((_, i) => ({
    buffer: Buffer.from(`mock-image-data-${i + 1}`),
    filename: `ai_photoshop_image_${i + 1}.jpg`,
    timestamp: Date.now() + i,
    originalOrder: i + 1
  }))
}

const simulateCallback = (data: string, context: any) => {
  context.callbackQuery = {
    data,
    from: context.from,
    id: `callback_${Date.now()}`
  }
}

const simulateTextMessage = (text: string, context: any) => {
  context.message = {
    text,
    from: context.from,
    message_id: Date.now(),
    date: Math.floor(Date.now() / 1000),
    chat: context.chat
  }
}

const simulatePhotoUpload = (fileId: string, context: any) => {
  context.message = {
    photo: [
      { file_id: `${fileId}_small`, width: 90, height: 135 },
      { file_id: `${fileId}_medium`, width: 320, height: 480 },
      { file_id: `${fileId}_large`, width: 1024, height: 1536 }
    ],
    from: context.from,
    message_id: Date.now(),
    date: Math.floor(Date.now() / 1000),
    chat: context.chat
  }
}

/**
 * Test Data Fixtures
 */
export const MOCK_DIALOG_STATES = {
  initial: {
    aiPhotoshopModel: undefined,
    aiPhotoshopStyle: undefined,
    aiPhotoshopSize: undefined,
    aiPhotoshopPrompt: undefined,
    aiPhotoshopStep: undefined,
    awaitingAiPhotoshopImage: false,
    awaitingAiPhotoshopPrompt: false,
    morphingImages: []
  },
  model_selected: {
    aiPhotoshopModel: 'seedream',
    aiPhotoshopStyle: undefined,
    aiPhotoshopSize: undefined,
    aiPhotoshopPrompt: undefined,
    aiPhotoshopStep: 'style_selection',
    awaitingAiPhotoshopImage: false,
    awaitingAiPhotoshopPrompt: false,
    morphingImages: []
  },
  ready_for_processing: {
    aiPhotoshopModel: 'seedream',
    aiPhotoshopStyle: 'artistic',
    aiPhotoshopSize: '1K',
    aiPhotoshopPrompt: undefined,
    aiPhotoshopStep: 'processing',
    awaitingAiPhotoshopImage: false,
    awaitingAiPhotoshopPrompt: false,
    morphingImages: createMockImages(2)
  }
}

export const MOCK_API_RESPONSES = {
  seedream_success: {
    success: true,
    images: [
      'https://api.replicate.com/result1.jpg',
      'https://api.replicate.com/result2.jpg'
    ],
    metadata: {
      prompt: 'artistic enhancement',
      size: '1K',
      dimensions: { width: 1024, height: 1536 },
      generation_time: 25.5,
      model_version: 'seedream-4.0'
    }
  },
  nano_banana_success: {
    success: true,
    result_url: 'https://api.google.com/nano_result.jpg',
    processing_time: 18.2
  },
  api_error: {
    error: 'Processing failed',
    code: 'RATE_LIMIT_EXCEEDED',
    details: 'Too many requests'
  }
}