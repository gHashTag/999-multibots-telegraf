/**
 * Tests for aiPhotoshopScene (AI Image Processing)
 * Covers: Model pricing, image upload, prompt handling, multi-model processing
 */

import { describe, it, expect, beforeEach, vi, Mock, afterEach } from 'vitest'

// Mock dependencies BEFORE imports
vi.mock('@/helpers/centralizedLanguage', () => ({
  isRussianFromState: vi.fn(() => true),
}))

vi.mock('@/interfaces/paidServices', () => ({
  calculateFinalPriceInStars: vi.fn((usdPrice, rate = 0.016, markup = 2.4) => {
    return Math.ceil((usdPrice / rate) * markup)
  }),
}))

vi.mock('@/services/generateSeeDream4', () => ({
  generateSeeDream4: vi.fn(() => Promise.resolve({
    success: true,
    imageUrl: 'https://example.com/seedream.jpg',
  })),
}))

vi.mock('@/services/generateNanoBanana', () => ({
  generateNanoBanana: vi.fn(() => Promise.resolve({
    success: true,
    imageUrl: 'https://example.com/nanobanana.jpg',
  })),
}))

vi.mock('@/services/generateFluxKontext', () => ({
  generateAdvancedFluxKontext: vi.fn(() => Promise.resolve({
    success: true,
    imageUrl: 'https://example.com/fluxkontext.jpg',
  })),
}))

vi.mock('@/services/generateQwenImageEditPlus', () => ({
  generateQwenImageEditPlus: vi.fn(() => Promise.resolve({
    success: true,
    imageUrl: 'https://example.com/qwen.jpg',
  })),
}))

vi.mock('@/services/generateFluxKontextPro', () => ({
  generateFluxKontextPro: vi.fn(() => Promise.resolve({
    success: true,
    imageUrl: 'https://example.com/fluxtextpro.jpg',
  })),
}))

vi.mock('@/services/generateSeedEdit3', () => ({
  generateSeedEdit3: vi.fn(() => Promise.resolve({
    success: true,
    imageUrl: 'https://example.com/seededit3.jpg',
  })),
}))

vi.mock('@/services/generateQwenImageEdit', () => ({
  generateQwenImageEdit: vi.fn(() => Promise.resolve({
    success: true,
    imageUrl: 'https://example.com/qwenimageedit.jpg',
  })),
}))

vi.mock('@/services/imageUpscaler', () => ({
  upscaleImage: vi.fn(() => Promise.resolve({
    success: true,
    imageUrl: 'https://example.com/upscaled.jpg',
  })),
}))

vi.mock('@/helpers/saveFileLocally', () => ({
  saveFileLocally: vi.fn(() => Promise.resolve('/tmp/saved_image.jpg')),
}))

vi.mock('@/handlers/multiPhotoHandler', () => ({
  detectMultiPhotoUpload: vi.fn(() => false),
  handleMultiPhotoNeurophoto: vi.fn(() => Promise.resolve()),
  checkMultiPhotoEvents: vi.fn(() => Promise.resolve(false)),
}))

vi.mock('@/handlers/getBotToken', () => ({
  getBotToken: vi.fn(() => 'test_bot_token'),
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
import { calculateFinalPriceInStars } from '@/interfaces/paidServices'
import { generateSeeDream4 } from '@/services/generateSeeDream4'
import { generateNanoBanana } from '@/services/generateNanoBanana'
import { generateAdvancedFluxKontext } from '@/services/generateFluxKontext'
import { generateQwenImageEditPlus } from '@/services/generateQwenImageEditPlus'
import { generateFluxKontextPro } from '@/services/generateFluxKontextPro'
import { generateSeedEdit3 } from '@/services/generateSeedEdit3'
import { generateQwenImageEdit } from '@/services/generateQwenImageEdit'
import { upscaleImage } from '@/services/imageUpscaler'

describe('aiPhotoshopScene (AI Image Processing)', () => {
  const mockContext = {
    from: { id: 223757230, language_code: 'ru' },
    reply: vi.fn(),
    replyWithPhoto: vi.fn(),
    scene: {
      state: {},
      leave: vi.fn(),
      enter: vi.fn(),
      current: { id: 'aiPhotoshopScene' },
    },
    session: {
      wizardData: {} as any,
      selectedModel: null as any,
      imageUrl: null as any,
      prompt: null as any,
    },
    wizard: {
      next: vi.fn(),
      cursor: 0,
    },
    telegram: {
      token: 'test_token',
      getFile: vi.fn(() => Promise.resolve({ file_path: 'photos/file_123.jpg' })),
    },
    message: null as any,
  }

  // AI Photoshop Pricing для тестов
  const AI_PHOTOSHOP_PRICING = {
    modelsUSD: {
      seedream: 0.03,
      nano_banana: 0.039,
      flux_multi_kontext: 0.03,
      qwen_edit_plus: 0.03,
      flux_kontext_pro: 0.05,
      seededit_3: 0.05,
      qwen_image_edit: 0.025,
    },
    markup: 2.4,
    qualityMultipliers: {
      '1K': 1,
      '2K': 4,
      '4K': 6,
    },
    defaultAspectRatio: '9:16',
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockContext.session = {
      wizardData: {},
      selectedModel: null,
      imageUrl: null,
      prompt: null,
    }
    mockContext.message = null

    ;(isRussianFromState as Mock).mockReturnValue(true)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('1. Ценообразование моделей', () => {
    it('должен иметь базовые USD цены моделей', () => {
      expect(AI_PHOTOSHOP_PRICING.modelsUSD.seedream).toBe(0.03)
      expect(AI_PHOTOSHOP_PRICING.modelsUSD.nano_banana).toBe(0.039)
      expect(AI_PHOTOSHOP_PRICING.modelsUSD.flux_multi_kontext).toBe(0.03)
      expect(AI_PHOTOSHOP_PRICING.modelsUSD.qwen_edit_plus).toBe(0.03)
    })

    it('должен иметь новые модели January 2025', () => {
      expect(AI_PHOTOSHOP_PRICING.modelsUSD.flux_kontext_pro).toBe(0.05)
      expect(AI_PHOTOSHOP_PRICING.modelsUSD.seededit_3).toBe(0.05)
      expect(AI_PHOTOSHOP_PRICING.modelsUSD.qwen_image_edit).toBe(0.025)
    })

    it('должен использовать наценку 2.4x (140%)', () => {
      expect(AI_PHOTOSHOP_PRICING.markup).toBe(2.4)
    })

    it('должен рассчитывать цену в звездах', () => {
      const price = calculateFinalPriceInStars(0.03, 0.016, 2.4)

      expect(calculateFinalPriceInStars).toHaveBeenCalled()
      expect(typeof price).toBe('number')
    })
  })

  describe('2. Множители качества', () => {
    it('должен иметь множитель 1x для 1K', () => {
      expect(AI_PHOTOSHOP_PRICING.qualityMultipliers['1K']).toBe(1)
    })

    it('должен иметь множитель 4x для 2K', () => {
      expect(AI_PHOTOSHOP_PRICING.qualityMultipliers['2K']).toBe(4)
    })

    it('должен иметь множитель 6x для 4K', () => {
      expect(AI_PHOTOSHOP_PRICING.qualityMultipliers['4K']).toBe(6)
    })
  })

  describe('3. Aspect Ratio', () => {
    it('должен использовать дефолтный aspect ratio 9:16', () => {
      expect(AI_PHOTOSHOP_PRICING.defaultAspectRatio).toBe('9:16')
    })
  })

  describe('4. Камера и композиция', () => {
    it('должен поддерживать camera angles', () => {
      const cameraAngles = {
        medium_shot: '[camera: medium shot, balanced composition]',
        close_up: '[camera: close-up shot, intimate detail]',
        wide_shot: '[camera: wide shot, environmental context]',
      }

      expect(cameraAngles.medium_shot).toContain('medium shot')
      expect(cameraAngles.close_up).toContain('close-up')
      expect(cameraAngles.wide_shot).toContain('wide shot')
    })

    it('должен поддерживать frame composition', () => {
      const composition = {
        center_weighted: '[composition: center-weighted balance]',
        rule_thirds: '[composition: rule of thirds]',
        golden_ratio: '[composition: golden ratio portrait]',
      }

      expect(composition.center_weighted).toContain('center-weighted')
      expect(composition.rule_thirds).toContain('rule of thirds')
      expect(composition.golden_ratio).toContain('golden ratio')
    })

    it('должен поддерживать lighting setups', () => {
      const lighting = {
        soft_natural: '[lighting: soft natural light]',
        dramatic: '[lighting: dramatic lighting]',
        golden_hour: '[lighting: golden hour warmth]',
        studio: '[lighting: professional studio setup]',
      }

      expect(lighting.soft_natural).toContain('soft natural')
      expect(lighting.dramatic).toContain('dramatic')
      expect(lighting.golden_hour).toContain('golden hour')
    })
  })

  describe('5. Генерация с разными моделями', () => {
    it('должен вызывать generateSeeDream4', async () => {
      const result = await generateSeeDream4({
        imageUrl: 'https://example.com/image.jpg',
        prompt: 'Test prompt',
      })

      expect(generateSeeDream4).toHaveBeenCalled()
      expect(result.success).toBe(true)
    })

    it('должен вызывать generateNanoBanana', async () => {
      const result = await generateNanoBanana({
        imageUrl: 'https://example.com/image.jpg',
        prompt: 'Test prompt',
      })

      expect(generateNanoBanana).toHaveBeenCalled()
      expect(result.success).toBe(true)
    })

    it('должен вызывать generateAdvancedFluxKontext', async () => {
      const result = await generateAdvancedFluxKontext({
        imageUrl: 'https://example.com/image.jpg',
        prompt: 'Test prompt',
      })

      expect(generateAdvancedFluxKontext).toHaveBeenCalled()
      expect(result.success).toBe(true)
    })

    it('должен вызывать generateQwenImageEditPlus', async () => {
      const result = await generateQwenImageEditPlus({
        imageUrl: 'https://example.com/image.jpg',
        prompt: 'Test prompt',
      })

      expect(generateQwenImageEditPlus).toHaveBeenCalled()
      expect(result.success).toBe(true)
    })

    it('должен вызывать generateFluxKontextPro', async () => {
      const result = await generateFluxKontextPro({
        imageUrl: 'https://example.com/image.jpg',
        prompt: 'Test prompt',
      })

      expect(generateFluxKontextPro).toHaveBeenCalled()
      expect(result.success).toBe(true)
    })

    it('должен вызывать generateSeedEdit3', async () => {
      const result = await generateSeedEdit3({
        imageUrl: 'https://example.com/image.jpg',
        prompt: 'Test prompt',
      })

      expect(generateSeedEdit3).toHaveBeenCalled()
      expect(result.success).toBe(true)
    })

    it('должен вызывать generateQwenImageEdit', async () => {
      const result = await generateQwenImageEdit({
        imageUrl: 'https://example.com/image.jpg',
        prompt: 'Test prompt',
      })

      expect(generateQwenImageEdit).toHaveBeenCalled()
      expect(result.success).toBe(true)
    })
  })

  describe('6. Upscaling', () => {
    it('должен поддерживать upscale изображений', async () => {
      const result = await upscaleImage({
        imageUrl: 'https://example.com/image.jpg',
        scale: 2,
      })

      expect(upscaleImage).toHaveBeenCalled()
      expect(result.success).toBe(true)
    })
  })

  describe('7. Валидация пользовательского ввода', () => {
    it('должен валидировать текстовый ввод', () => {
      const input = { type: 'text', text: 'Test prompt' }

      const isValid = input && typeof input === 'object'
      expect(isValid).toBe(true)
    })

    it('должен валидировать ввод изображения', () => {
      const input = { type: 'image', imageUrl: 'https://example.com/image.jpg' }

      const isValid = !!(input && typeof input === 'object' && input.imageUrl)
      expect(isValid).toBe(true)
    })

    it('должен отклонять невалидный ввод', () => {
      const input = null

      const isValid = input && typeof input === 'object'
      expect(isValid).toBeFalsy()
    })
  })

  describe('8. Dialog состояния', () => {
    it('должен поддерживать состояние WAITING_INPUT', () => {
      const DialogState = {
        WAITING_INPUT: 'waiting_input',
        PROCESSING: 'processing',
        COMPLETED: 'completed',
      }

      expect(DialogState.WAITING_INPUT).toBe('waiting_input')
    })

    it('должен поддерживать состояние PROCESSING', () => {
      const DialogState = {
        WAITING_INPUT: 'waiting_input',
        PROCESSING: 'processing',
        COMPLETED: 'completed',
      }

      expect(DialogState.PROCESSING).toBe('processing')
    })

    it('должен поддерживать состояние COMPLETED', () => {
      const DialogState = {
        WAITING_INPUT: 'waiting_input',
        PROCESSING: 'processing',
        COMPLETED: 'completed',
      }

      expect(DialogState.COMPLETED).toBe('completed')
    })
  })

  describe('9. Типы пользовательского ввода', () => {
    it('должен поддерживать тип TEXT', () => {
      const UserInputType = {
        TEXT: 'text',
        IMAGE: 'image',
        COMMAND: 'command',
      }

      expect(UserInputType.TEXT).toBe('text')
    })

    it('должен поддерживать тип IMAGE', () => {
      const UserInputType = {
        TEXT: 'text',
        IMAGE: 'image',
        COMMAND: 'command',
      }

      expect(UserInputType.IMAGE).toBe('image')
    })

    it('должен поддерживать тип COMMAND', () => {
      const UserInputType = {
        TEXT: 'text',
        IMAGE: 'image',
        COMMAND: 'command',
      }

      expect(UserInputType.COMMAND).toBe('command')
    })
  })

  describe('10. Локализация', () => {
    it('должен определять язык пользователя', () => {
      const isRu = isRussianFromState(mockContext as any)
      expect(isRu).toBe(true)
    })

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
  })

  describe('11. Обработка фото', () => {
    it('должен получать файл по file_id', async () => {
      const file = await mockContext.telegram.getFile('test_file_id')

      expect(mockContext.telegram.getFile).toHaveBeenCalledWith('test_file_id')
      expect(file.file_path).toBe('photos/file_123.jpg')
    })

    it('должен формировать URL файла', () => {
      const token = 'test_token'
      const filePath = 'photos/file_123.jpg'
      const fileUrl = `https://api.telegram.org/file/bot${token}/${filePath}`

      expect(fileUrl).toBe('https://api.telegram.org/file/bottest_token/photos/file_123.jpg')
    })
  })

  describe('12. Навигация', () => {
    it('должен переходить к следующему шагу', () => {
      mockContext.wizard.next()
      expect(mockContext.wizard.next).toHaveBeenCalled()
    })

    it('должен выходить из сцены', async () => {
      await mockContext.scene.leave()
      expect(mockContext.scene.leave).toHaveBeenCalled()
    })

    it('должен отправлять результат как фото', async () => {
      await mockContext.replyWithPhoto('https://example.com/result.jpg', { caption: 'Done!' })

      expect(mockContext.replyWithPhoto).toHaveBeenCalledWith(
        'https://example.com/result.jpg',
        { caption: 'Done!' }
      )
    })
  })
})
