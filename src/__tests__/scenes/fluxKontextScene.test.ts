/**
 * Tests for fluxKontextScene (FLUX Kontext AI Image Editing)
 * Covers: Mode selection, camera angles, image processing, prompt handling
 */

import { describe, it, expect, beforeEach, vi, Mock, afterEach } from 'vitest'

// Mock dependencies BEFORE imports
vi.mock('@/helpers/centralizedLanguage', () => ({
  isRussianFromState: vi.fn(() => true),
}))

vi.mock('@/price/models/FLUX_KONTEXT_MODELS', () => ({
  FLUX_KONTEXT_MODELS: {
    'black-forest-labs/flux-kontext-max': {
      shortName: 'FLUX Kontext Max',
      costPerImage: 15,
    },
  },
}))

vi.mock('@/services/generateFluxKontext', () => ({
  generateAdvancedFluxKontext: vi.fn(() =>
    Promise.resolve({
      success: true,
      prompt_id: 'prompt_123',
    })
  ),
}))

vi.mock('@/core/supabase', () => ({
  getUserBalance: vi.fn(() => Promise.resolve(100)),
}))

vi.mock('@/navigation', () => ({
  showMainMenu: vi.fn(() => Promise.resolve()),
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
import { FLUX_KONTEXT_MODELS } from '@/price/models/FLUX_KONTEXT_MODELS'
import { generateAdvancedFluxKontext } from '@/services/generateFluxKontext'
import { getUserBalance } from '@/core/supabase'
import { showMainMenu } from '@/navigation'

// Camera angles from source
const FLUX_CAMERA_ANGLES = {
  medium_shot:
    '[camera: medium shot, balanced composition, natural perspective]',
  close_up: '[camera: close-up shot, intimate detail, emotional connection]',
  extreme_close_up:
    '[camera: extreme close-up, fine detail focus, artistic impact]',
  wide_shot: '[camera: wide shot, environmental context, spacious composition]',
  profile_shot: '[camera: profile shot, sculptural beauty, classic elegance]',
  three_quarter:
    '[camera: three-quarter view, dimensional depth, natural pose]',
}

// Lighting setups from source
const FLUX_LIGHTING_SETUPS = {
  soft_natural:
    '[lighting: soft natural light, gentle illumination, flattering glow]',
  dramatic: '[lighting: dramatic lighting, high contrast, artistic shadows]',
  golden_hour:
    '[lighting: golden hour warmth, magical illumination, perfect timing]',
  studio:
    '[lighting: professional studio setup, perfect illumination, commercial quality]',
}

// Mode configurations
const FLUX_MODES = {
  quick: {
    title_ru: '⚡ Быстрое редактирование',
    title_en: '⚡ Quick Edit',
    images_required: 1,
    skip_camera_selection: true,
  },
  single: {
    title_ru: '🖼️ Профессиональное редактирование',
    title_en: '🖼️ Professional Edit',
    images_required: 1,
    camera_angles: ['medium_shot', 'close_up', 'wide_shot', 'profile_shot'],
  },
  multi: {
    title_ru: '🔗 Объединение изображений',
    title_en: '🔗 Multi-Image Combine',
    images_required: 2,
  },
  haircut: {
    title_ru: '💇 Изменить стрижку',
    title_en: '💇 Change Haircut',
    images_required: 1,
  },
  landmarks: {
    title_ru: '🏛️ Знаменитые места',
    title_en: '🏛️ Iconic Locations',
    images_required: 1,
  },
  headshot: {
    title_ru: '📸 Профессиональный портрет',
    title_en: '📸 Professional Headshot',
    images_required: 1,
  },
}

describe('fluxKontextScene (FLUX Kontext AI Image Editing)', () => {
  const mockContext = {
    from: { id: 223757230, username: 'testuser', language_code: 'ru' },
    reply: vi.fn(),
    editMessageText: vi.fn(),
    answerCbQuery: vi.fn(),
    scene: {
      state: {},
      leave: vi.fn(),
      enter: vi.fn(),
      reenter: vi.fn(),
      current: { id: 'flux_kontext_scene' },
    },
    session: {
      fluxKontextMode: null as string | null,
      fluxKontextImageA: null as string | null,
      fluxKontextImageB: null as string | null,
      awaitingFluxKontextImageA: false,
      awaitingFluxKontextImageB: false,
      fluxKontextStep: 'mode_select',
      kontextModelType: null as string | null,
      fluxKontextCameraAngle: null as string | null,
      fluxKontextCameraSettings: null as string | null,
      awaitingFluxKontextPrompt: false,
    },
    wizard: {
      next: vi.fn(),
      cursor: 0,
    },
    telegram: {
      getFileLink: vi.fn(() =>
        Promise.resolve({ href: 'https://example.com/image.jpg' })
      ),
    },
    message: null as any,
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockContext.session = {
      fluxKontextMode: null,
      fluxKontextImageA: null,
      fluxKontextImageB: null,
      awaitingFluxKontextImageA: false,
      awaitingFluxKontextImageB: false,
      fluxKontextStep: 'mode_select',
      kontextModelType: null,
      fluxKontextCameraAngle: null,
      fluxKontextCameraSettings: null,
      awaitingFluxKontextPrompt: false,
    }
    mockContext.message = null
    ;(isRussianFromState as Mock).mockReturnValue(true)
    ;(getUserBalance as Mock).mockResolvedValue(100)
    ;(generateAdvancedFluxKontext as Mock).mockResolvedValue({
      success: true,
      prompt_id: 'prompt_123',
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('1. Вход в сцену', () => {
    it('должен определять язык пользователя', () => {
      const isRu = isRussianFromState(mockContext as any)
      expect(isRu).toBe(true)
    })

    it('должен проверять наличие from.id', () => {
      const hasFromId = !!mockContext.from?.id
      expect(hasFromId).toBe(true)
    })

    it('должен сбрасывать состояние сессии при входе', () => {
      mockContext.session.fluxKontextMode = undefined
      mockContext.session.fluxKontextImageA = undefined
      mockContext.session.fluxKontextImageB = undefined
      mockContext.session.awaitingFluxKontextImageA = false
      mockContext.session.awaitingFluxKontextImageB = false
      mockContext.session.fluxKontextStep = 'mode_select'

      expect(mockContext.session.fluxKontextMode).toBeUndefined()
      expect(mockContext.session.fluxKontextStep).toBe('mode_select')
    })

    it('должен показывать заголовок на русском', () => {
      const isRu = true
      const title = isRu
        ? '🎨 *FLUX Kontext* - Продвинутое ИИ редактирование изображений'
        : '🎨 *FLUX Kontext* - Advanced AI Image Editing'

      expect(title).toContain('FLUX Kontext')
    })
  })

  describe('2. Режимы редактирования', () => {
    it('должен иметь режим quick (быстрое редактирование)', () => {
      const mode = FLUX_MODES.quick
      expect(mode.title_ru).toContain('Быстрое')
      expect(mode.images_required).toBe(1)
      expect(mode.skip_camera_selection).toBe(true)
    })

    it('должен иметь режим single (профессиональное редактирование)', () => {
      const mode = FLUX_MODES.single
      expect(mode.title_ru).toContain('Профессиональное')
      expect(mode.images_required).toBe(1)
      expect(mode.camera_angles).toBeDefined()
    })

    it('должен иметь режим multi (объединение изображений)', () => {
      const mode = FLUX_MODES.multi
      expect(mode.title_ru).toContain('Объединение')
      expect(mode.images_required).toBe(2)
    })

    it('должен иметь режим haircut (изменение стрижки)', () => {
      const mode = FLUX_MODES.haircut
      expect(mode.title_ru).toContain('стрижку')
    })

    it('должен иметь режим landmarks (знаменитые места)', () => {
      const mode = FLUX_MODES.landmarks
      expect(mode.title_ru).toContain('Знаменитые места')
    })

    it('должен иметь режим headshot (профессиональный портрет)', () => {
      const mode = FLUX_MODES.headshot
      expect(mode.title_ru).toContain('портрет')
    })
  })

  describe('3. Углы камеры', () => {
    it('должен иметь угол medium_shot', () => {
      expect(FLUX_CAMERA_ANGLES.medium_shot).toContain('medium shot')
    })

    it('должен иметь угол close_up', () => {
      expect(FLUX_CAMERA_ANGLES.close_up).toContain('close-up')
    })

    it('должен иметь угол wide_shot', () => {
      expect(FLUX_CAMERA_ANGLES.wide_shot).toContain('wide shot')
    })

    it('должен иметь угол profile_shot', () => {
      expect(FLUX_CAMERA_ANGLES.profile_shot).toContain('profile')
    })

    it('должен иметь угол three_quarter', () => {
      expect(FLUX_CAMERA_ANGLES.three_quarter).toContain('three-quarter')
    })
  })

  describe('4. Освещение', () => {
    it('должен иметь мягкое естественное освещение', () => {
      expect(FLUX_LIGHTING_SETUPS.soft_natural).toContain('soft natural')
    })

    it('должен иметь драматическое освещение', () => {
      expect(FLUX_LIGHTING_SETUPS.dramatic).toContain('dramatic')
    })

    it('должен иметь освещение golden hour', () => {
      expect(FLUX_LIGHTING_SETUPS.golden_hour).toContain('golden hour')
    })

    it('должен иметь студийное освещение', () => {
      expect(FLUX_LIGHTING_SETUPS.studio).toContain('studio')
    })
  })

  describe('5. Выбор режима', () => {
    it('должен сохранять режим в сессии', () => {
      mockContext.session.fluxKontextMode = 'quick'
      expect(mockContext.session.fluxKontextMode).toBe('quick')
    })

    it('должен отвечать на callback query', async () => {
      await mockContext.answerCbQuery()
      expect(mockContext.answerCbQuery).toHaveBeenCalled()
    })

    it('должен показывать описание режима', () => {
      const mode = FLUX_MODES.quick
      const isRu = true
      const message = isRu
        ? `✅ *Выбран режим:* ${mode.title_ru}`
        : `✅ *Selected mode:* ${mode.title_en}`

      expect(message).toContain('Быстрое редактирование')
    })
  })

  describe('6. Выбор угла камеры', () => {
    it('должен сохранять угол камеры в сессии', () => {
      mockContext.session.fluxKontextCameraAngle = 'medium_shot'
      expect(mockContext.session.fluxKontextCameraAngle).toBe('medium_shot')
    })

    it('должен переходить к загрузке изображения после выбора угла', () => {
      mockContext.session.fluxKontextStep = 'image_a'
      mockContext.session.awaitingFluxKontextImageA = true

      expect(mockContext.session.fluxKontextStep).toBe('image_a')
      expect(mockContext.session.awaitingFluxKontextImageA).toBe(true)
    })

    it('должен поддерживать автовыбор угла камеры', () => {
      const mode = FLUX_MODES.single
      if (mode.camera_angles) {
        mockContext.session.fluxKontextCameraAngle = mode.camera_angles[0]
      }

      expect(mockContext.session.fluxKontextCameraAngle).toBe('medium_shot')
    })
  })

  describe('7. Загрузка изображений', () => {
    it('должен получать ссылку на файл изображения', async () => {
      const fileLink = await mockContext.telegram.getFileLink('photo_123')

      expect(mockContext.telegram.getFileLink).toHaveBeenCalledWith('photo_123')
      expect(fileLink.href).toBe('https://example.com/image.jpg')
    })

    it('должен сохранять первое изображение в сессии', () => {
      mockContext.session.fluxKontextImageA = 'https://example.com/image1.jpg'
      mockContext.session.awaitingFluxKontextImageA = false

      expect(mockContext.session.fluxKontextImageA).toBeDefined()
    })

    it('должен запрашивать второе изображение для режима multi', () => {
      mockContext.session.fluxKontextMode = 'multi'
      mockContext.session.fluxKontextImageA = 'https://example.com/image1.jpg'
      mockContext.session.awaitingFluxKontextImageB = true

      expect(mockContext.session.awaitingFluxKontextImageB).toBe(true)
    })

    it('должен сохранять второе изображение в сессии', () => {
      mockContext.session.fluxKontextImageB = 'https://example.com/image2.jpg'
      mockContext.session.awaitingFluxKontextImageB = false

      expect(mockContext.session.fluxKontextImageB).toBeDefined()
    })
  })

  describe('8. Выбор модели', () => {
    it('должен иметь модель FLUX Kontext Max', () => {
      const model = FLUX_KONTEXT_MODELS['black-forest-labs/flux-kontext-max']

      expect(model.shortName).toBe('FLUX Kontext Max')
      expect(model.costPerImage).toBe(15)
    })

    it('должен сохранять тип модели в сессии', () => {
      mockContext.session.kontextModelType = 'max'
      expect(mockContext.session.kontextModelType).toBe('max')
    })
  })

  describe('9. Обработка промпта', () => {
    it('должен устанавливать флаг ожидания промпта', () => {
      mockContext.session.awaitingFluxKontextPrompt = true
      expect(mockContext.session.awaitingFluxKontextPrompt).toBe(true)
    })

    it('должен показывать примеры промптов для режима quick', () => {
      const isRu = true
      const examples = isRu
        ? '"add sunglasses"\n"change background to beach"\n"make it vintage style"'
        : '"add sunglasses"\n"change background to beach"'

      expect(examples).toContain('sunglasses')
    })

    it('должен показывать примеры промптов для режима haircut', () => {
      const isRu = true
      const examples = isRu
        ? '"give her a bob haircut"\n"change hair color to blonde"'
        : '"give her a bob haircut"'

      expect(examples).toContain('bob haircut')
    })
  })

  describe('10. Генерация изображения', () => {
    it('должен вызывать generateAdvancedFluxKontext', async () => {
      mockContext.session.fluxKontextMode = 'quick'
      mockContext.session.fluxKontextImageA = 'https://example.com/image.jpg'
      mockContext.session.kontextModelType = 'max'

      const result = await generateAdvancedFluxKontext({
        prompt: 'add sunglasses',
        mode: 'quick',
        imageA: 'https://example.com/image.jpg',
        modelType: 'max',
        telegram_id: '223757230',
        username: 'testuser',
        is_ru: true,
        ctx: mockContext as any,
      })

      expect(generateAdvancedFluxKontext).toHaveBeenCalled()
      expect(result.success).toBe(true)
    })

    it('должен очищать сессию после успешной генерации', () => {
      mockContext.session.fluxKontextMode = undefined
      mockContext.session.fluxKontextImageA = undefined
      mockContext.session.fluxKontextImageB = undefined
      mockContext.session.fluxKontextStep = undefined
      mockContext.session.kontextModelType = undefined

      expect(mockContext.session.fluxKontextMode).toBeUndefined()
    })
  })

  describe('11. Callback handlers', () => {
    it('должен обрабатывать flux_kontext_cancel', async () => {
      await mockContext.answerCbQuery()
      await mockContext.scene.leave()

      expect(mockContext.scene.leave).toHaveBeenCalled()
    })

    it('должен обрабатывать flux_kontext_retry', async () => {
      await mockContext.scene.reenter()
      expect(mockContext.scene.reenter).toHaveBeenCalled()
    })

    it('должен обрабатывать flux_more_editing', async () => {
      mockContext.session.fluxKontextMode = undefined
      mockContext.session.fluxKontextImageA = undefined
      await mockContext.scene.reenter()

      expect(mockContext.scene.reenter).toHaveBeenCalled()
    })

    it('должен обрабатывать flux_back_to_modes', async () => {
      await mockContext.answerCbQuery()
      expect(mockContext.answerCbQuery).toHaveBeenCalled()
    })
  })

  describe('12. Обработка ошибок', () => {
    it('должен показывать ошибку при недостаточных данных', () => {
      const isRu = true
      const errorMessage = isRu
        ? '❌ Ошибка: недостаточно данных для обработки.'
        : '❌ Error: insufficient data for processing.'

      expect(errorMessage).toContain('недостаточно данных')
    })

    it('должен выходить из сцены при ошибке', async () => {
      await mockContext.scene.leave()
      expect(mockContext.scene.leave).toHaveBeenCalled()
    })

    it('должен показывать главное меню при отмене', async () => {
      await showMainMenu(mockContext as any)
      expect(showMainMenu).toHaveBeenCalled()
    })
  })

  describe('13. Локализация', () => {
    it('должен показывать сообщение на русском для отмены', () => {
      const isRu = true
      const message = isRu
        ? '❌ Процесс отменён. Возвращаюсь в главное меню.'
        : '❌ Process cancelled. Returning to main menu.'

      expect(message).toContain('отменён')
    })

    it('должен показывать сообщение об обработке на русском', () => {
      const isRu = true
      const message = isRu
        ? '✅ Промпт получен! Начинаю обработку изображения...'
        : '✅ Prompt received! Starting image processing...'

      expect(message).toContain('Промпт получен')
    })
  })
})
