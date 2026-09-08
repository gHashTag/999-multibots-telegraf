/**
 * Tests for aiReelsWizard (AI Reels Creation)
 * Covers: Image upload, text/voice input, lip-sync generation, VEO 3.1 generation, video merging
 * Scenarios: Photo upload, URL input, voice messages, balance checks, error handling
 */

import { describe, it, expect, beforeEach, vi, Mock, afterEach } from 'vitest'

// Mock dependencies BEFORE imports
vi.mock('@/helpers/centralizedLanguage', () => ({
  isRussianFromState: vi.fn(() => true),
}))

vi.mock('@/core/supabase/getUserBalance', () => ({
  getUserBalance: vi.fn(() => Promise.resolve(500)),
}))

vi.mock('@/core/supabase/updateUserBalance', () => ({
  updateUserBalance: vi.fn(() => Promise.resolve(true)),
}))

vi.mock('@/core/supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn(() =>
            Promise.resolve({
              data: { voice_id_elevenlabs: 'test-voice-id' },
              error: null,
            })
          ),
        })),
      })),
    })),
  },
}))

vi.mock('@/core/elevenlabs', () => ({
  checkVoiceExists: vi.fn(() => Promise.resolve(true)),
  assertVoiceExistsAuthoritative: vi.fn(() => Promise.resolve(true)),
}))

vi.mock('@/core/elevenlabs/createAudioFileFromText', () => ({
  createAudioFileFromText: vi.fn(() => Promise.resolve('/tmp/audio.mp3')),
}))

vi.mock('@/core/supabase/getVoiceId', () => ({
  getVoiceId: vi.fn(() => Promise.resolve('test-voice-id')),
}))

// Шаг склейки скачивает видео во временные файлы и читает результат.
// Без мока загрузка уходит в сеть/ФС, а чтение несуществующего
// final-reels.mp4 всплывает уже ПОСЛЕ теста как unhandled ENOENT и метит
// прогон как упавший. Загрузку заглушаем.
// Шаг склейки после загрузки делает fs.stat/readFile по временным путям.
// Заглушка загрузки файлов не создаёт, поэтому реальные вызовы падали уже
// ПОСЛЕ завершения теста («unhandled ENOENT … final-reels.mp4») и метили весь
// прогон как упавший. Мокаем файловые операции.
// Отправка готового ролика идёт через `createReadStream(finalVideoPath)`
// из синхронного модуля 'fs' (динамический import внутри сцены). Поток по
// несуществующему пути открывается лениво и падает уже после теста —
// именно это давало «unhandled ENOENT … final-reels.mp4».
vi.mock('fs', async importOriginal => {
  const actual = await importOriginal<typeof import('fs')>()
  const { Readable } = await import('node:stream')
  const createReadStream = vi.fn(() =>
    Readable.from([Buffer.from('video-bytes')])
  )
  return {
    ...actual,
    createReadStream,
    default: { ...actual, createReadStream },
  }
})

vi.mock('fs/promises', () => {
  const api = {
    stat: vi.fn(() => Promise.resolve({ size: 1024 })),
    readFile: vi.fn(() => Promise.resolve(Buffer.from('video-bytes'))),
    writeFile: vi.fn(() => Promise.resolve()),
    mkdir: vi.fn(() => Promise.resolve()),
    unlink: vi.fn(() => Promise.resolve()),
    rm: vi.fn(() => Promise.resolve()),
  }
  return { ...api, default: api }
})

vi.mock('@/helpers/file-helpers', () => ({
  downloadFile: vi.fn(() => Promise.resolve()),
}))

vi.mock('@/core/lipsync/lipsync-orchestrator', () => ({
  lipSyncOrchestrator: {
    generate: vi.fn(() =>
      Promise.resolve({
        success: true,
        videoUrl: 'https://example.com/lipsync-video.mp4',
      })
    ),
  },
}))

vi.mock('@/core/lipsync/providers/fal-veo31-provider', () => ({
  FalVeo31Provider: vi.fn().mockImplementation(() => ({
    generateVideoFromReference: vi.fn(() =>
      Promise.resolve({
        success: true,
        videoUrl: 'https://example.com/veo31-video.mp4',
      })
    ),
  })),
}))

vi.mock('@/helpers/video-helpers', () => ({
  combineVideos: vi.fn(() => Promise.resolve('/tmp/final-video.mp4')),
}))

vi.mock('@/helpers/file-helpers', () => ({
  downloadFile: vi.fn(() => Promise.resolve()),
}))

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    storage: {
      from: vi.fn(() => ({
        upload: vi.fn(() => Promise.resolve({ data: {}, error: null })),
        getPublicUrl: vi.fn(() => ({
          data: { publicUrl: 'https://storage.example.com/image.jpg' },
        })),
      })),
    },
  })),
}))

vi.mock('@/config', () => ({
  SUPABASE_URL: 'https://test.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'test-key',
}))

vi.mock('@/config/lipsync-models.config', () => ({
  LIPSYNC_MODELS: {},
  getAvailableLipSyncModels: vi.fn(() => []),
  calculateLipSyncCost: vi.fn(() => 100),
}))

vi.mock('@/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}))

// A SECOND vi.mock('fs/promises') stood here, with a default-only factory and
// a smaller API than the one above. Two factories for one module leave the
// winner to hoisting order, and the outcome of "should merge two videos
// successfully" followed that: it passed in one worktree and failed in another
// built from the same commit, at the same moment, with identical files.
// One factory only -- the complete one above, which also provides the named
// exports the default-only version dropped.

vi.mock('path', () => ({
  default: {
    join: vi.fn((...args) => args.join('/')),
  },
}))

vi.mock('os', () => ({
  default: {
    tmpdir: vi.fn(() => '/tmp'),
  },
}))

// Import after mocks
import { isRussianFromState } from '@/helpers/centralizedLanguage'
import { getUserBalance } from '@/core/supabase/getUserBalance'
import { updateUserBalance } from '@/core/supabase/updateUserBalance'
import { supabase } from '@/core/supabase'
import {
  checkVoiceExists,
  assertVoiceExistsAuthoritative,
} from '@/core/elevenlabs'
import { createAudioFileFromText } from '@/core/elevenlabs/createAudioFileFromText'
import { getVoiceId } from '@/core/supabase/getVoiceId'
import { lipSyncOrchestrator } from '@/core/lipsync/lipsync-orchestrator'
import { FalVeo31Provider } from '@/core/lipsync/providers/fal-veo31-provider'
import { combineVideos } from '@/helpers/video-helpers'
import { downloadFile } from '@/helpers/file-helpers'

describe('aiReelsWizard (AI Reels Creation)', () => {
  const mockContext = {
    from: { id: 223757230, username: 'testuser', language_code: 'ru' },
    reply: vi.fn(),
    replyWithVideo: vi.fn(),
    replyWithPhoto: vi.fn(),
    sendChatAction: vi.fn(),
    telegram: {
      getFileLink: vi.fn(() =>
        Promise.resolve({ href: 'https://api.telegram.org/file/test.jpg' })
      ),
    },
    scene: {
      state: {},
      leave: vi.fn(),
      enter: vi.fn(),
      current: { id: 'ai_reels_wizard' },
    },
    session: {
      aiReels: undefined as any,
    },
    wizard: {
      next: vi.fn(),
      selectStep: vi.fn(),
      cursor: 0,
      steps: [] as any[],
    },
    message: null as any,
    botInfo: { username: 'test_bot' },
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockContext.message = null
    mockContext.session.aiReels = undefined
    mockContext.session.aiReelsInProgress = false

    // Reset all mocks to default values
    ;(isRussianFromState as Mock).mockReturnValue(true)
    ;(getUserBalance as Mock).mockResolvedValue(500)
    ;(updateUserBalance as Mock).mockResolvedValue(true)
    ;(checkVoiceExists as Mock).mockResolvedValue(true)
    ;(assertVoiceExistsAuthoritative as Mock).mockResolvedValue(true)
    ;(createAudioFileFromText as Mock).mockResolvedValue('/tmp/audio.mp3')
    ;(getVoiceId as Mock).mockResolvedValue('test-voice-id')
    ;(lipSyncOrchestrator.generate as Mock).mockResolvedValue({
      success: true,
      videoUrl: 'https://example.com/lipsync-video.mp4',
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('Step 0: Image Request', () => {
    it('should initialize session and request image', async () => {
      const { aiReelsWizard } = await import(
        '@/scenes/lipSyncWizard/ai-reels-wizard'
      )
      const step0 = (aiReelsWizard as any).steps[0]

      await step0(mockContext)

      expect(mockContext.session.aiReels).toBeDefined()
      expect(mockContext.session.aiReels.step).toBe('image')
      expect(mockContext.session.aiReels.startTime).toBeDefined()
      expect(mockContext.reply).toHaveBeenCalledWith(
        expect.stringContaining('ИИ Рилс'),
        expect.any(Object)
      )
      expect(mockContext.wizard.next).toHaveBeenCalled()
    })

    it('should handle English language for image request', async () => {
      ;(isRussianFromState as Mock).mockReturnValue(false)

      const { aiReelsWizard } = await import(
        '@/scenes/lipSyncWizard/ai-reels-wizard'
      )
      const step0 = (aiReelsWizard as any).steps[0]

      await step0(mockContext)

      expect(mockContext.reply).toHaveBeenCalledWith(
        expect.stringContaining('AI Reels'),
        expect.any(Object)
      )
    })

    it('should handle return from voice creation', async () => {
      mockContext.session.aiReels = {
        imageUrl: 'https://example.com/image.jpg',
        text: 'Test text',
        needsVoiceCreation: true,
        step: 'text',
        startTime: Date.now(),
      }

      const { aiReelsWizard } = await import(
        '@/scenes/lipSyncWizard/ai-reels-wizard'
      )
      const step0 = (aiReelsWizard as any).steps[0]

      await step0(mockContext)

      expect(mockContext.session.aiReels.needsVoiceCreation).toBe(false)
      expect(mockContext.wizard.selectStep).toHaveBeenCalledWith(2)
      expect(mockContext.wizard.next).toHaveBeenCalled()
    })

    it('should handle missing telegram ID', async () => {
      const contextWithoutId = {
        ...mockContext,
        from: undefined,
      }

      const { aiReelsWizard } = await import(
        '@/scenes/lipSyncWizard/ai-reels-wizard'
      )
      const step0 = (aiReelsWizard as any).steps[0]

      await step0(contextWithoutId)

      expect(contextWithoutId.reply).toHaveBeenCalledWith(
        expect.stringContaining('Ошибка')
      )
      expect(contextWithoutId.scene.leave).toHaveBeenCalled()
    })
  })

  describe('Step 1: Image Processing', () => {
    beforeEach(() => {
      mockContext.session.aiReels = {
        step: 'image',
        startTime: Date.now(),
      }
    })

    it('should process photo upload from Telegram', async () => {
      mockContext.message = {
        photo: [
          { file_id: 'photo1', file_size: 1000, width: 100, height: 100 },
          { file_id: 'photo2', file_size: 2000, width: 200, height: 200 },
        ],
      }

      global.fetch = vi.fn(() =>
        Promise.resolve({
          ok: true,
          arrayBuffer: () => Promise.resolve(new ArrayBuffer(1024)),
        })
      ) as any

      const { aiReelsWizard } = await import(
        '@/scenes/lipSyncWizard/ai-reels-wizard'
      )
      const step1 = (aiReelsWizard as any).steps[1]

      await step1(mockContext)

      expect(mockContext.telegram.getFileLink).toHaveBeenCalledWith('photo2')
      expect(mockContext.session.aiReels.imageUrl).toBeDefined()
      expect(mockContext.session.aiReels.step).toBe('text')
      expect(mockContext.reply).toHaveBeenCalledWith(
        expect.stringContaining('Изображение получено')
      )
      expect(mockContext.wizard.next).toHaveBeenCalled()
    })

    it('should process image URL from text message', async () => {
      mockContext.message = {
        text: 'https://example.com/test-image.jpg',
      }

      const { aiReelsWizard } = await import(
        '@/scenes/lipSyncWizard/ai-reels-wizard'
      )
      const step1 = (aiReelsWizard as any).steps[1]

      await step1(mockContext)

      expect(mockContext.session.aiReels.imageUrl).toBe(
        'https://example.com/test-image.jpg'
      )
      expect(mockContext.session.aiReels.step).toBe('text')
      expect(mockContext.wizard.next).toHaveBeenCalled()
    })

    it('should reject invalid image input', async () => {
      mockContext.message = {
        text: 'not a url',
      }

      const { aiReelsWizard } = await import(
        '@/scenes/lipSyncWizard/ai-reels-wizard'
      )
      const step1 = (aiReelsWizard as any).steps[1]

      await step1(mockContext)

      expect(mockContext.reply).toHaveBeenCalledWith(
        expect.stringContaining('Некорректное изображение')
      )
      expect(mockContext.scene.leave).toHaveBeenCalled()
    })

    it('should handle photo upload error', async () => {
      mockContext.message = {
        photo: [
          { file_id: 'photo1', file_size: 1000, width: 100, height: 100 },
        ],
      }

      global.fetch = vi.fn(() =>
        Promise.resolve({
          ok: false,
          statusText: 'Not Found',
        })
      ) as any

      const { aiReelsWizard } = await import(
        '@/scenes/lipSyncWizard/ai-reels-wizard'
      )
      const step1 = (aiReelsWizard as any).steps[1]

      await step1(mockContext)

      expect(mockContext.reply).toHaveBeenCalledWith(
        expect.stringContaining('Ошибка загрузки фото')
      )
      expect(mockContext.scene.leave).toHaveBeenCalled()
    })
  })

  describe('Step 2: Text/Voice Processing and Lip-Sync Generation', () => {
    beforeEach(() => {
      mockContext.session.aiReels = {
        step: 'text',
        imageUrl: 'https://example.com/image.jpg',
        startTime: Date.now(),
      }
    })

    it('should process text message and generate lip-sync video', async () => {
      mockContext.message = {
        text: 'Test text for lip-sync generation',
      }

      const { aiReelsWizard } = await import(
        '@/scenes/lipSyncWizard/ai-reels-wizard'
      )
      const step2 = (aiReelsWizard as any).steps[2]

      await step2(mockContext)

      expect(getVoiceId).toHaveBeenCalledWith('223757230')
      expect(assertVoiceExistsAuthoritative).toHaveBeenCalledWith(
        'test-voice-id'
      )
      expect(getUserBalance).toHaveBeenCalledWith('223757230')
      expect(updateUserBalance).toHaveBeenCalledWith(
        '223757230',
        240,
        expect.any(String),
        'AI Reels Шаблон 1',
        expect.any(Object)
      )
    })

    it('should process voice message', async () => {
      mockContext.message = {
        voice: {
          file_id: 'voice123',
          duration: 15,
          file_size: 5000,
        },
      }

      global.fetch = vi.fn(() =>
        Promise.resolve({
          ok: true,
          arrayBuffer: () => Promise.resolve(new ArrayBuffer(5000)),
        })
      ) as any

      const { aiReelsWizard } = await import(
        '@/scenes/lipSyncWizard/ai-reels-wizard'
      )
      const step2 = (aiReelsWizard as any).steps[2]

      await step2(mockContext)

      expect(mockContext.telegram.getFileLink).toHaveBeenCalledWith('voice123')
      expect(mockContext.session.aiReels.audioUrl).toBeDefined()
    })

    it('should reject voice message longer than 30 seconds', async () => {
      mockContext.message = {
        voice: {
          file_id: 'voice123',
          duration: 35,
          file_size: 10000,
        },
      }

      const { aiReelsWizard } = await import(
        '@/scenes/lipSyncWizard/ai-reels-wizard'
      )
      const step2 = (aiReelsWizard as any).steps[2]

      await step2(mockContext)

      expect(mockContext.reply).toHaveBeenCalledWith(
        expect.stringContaining('слишком длинное')
      )
      expect(mockContext.scene.leave).toHaveBeenCalled()
    })

    it('should reject text longer than 5000 characters', async () => {
      mockContext.message = {
        text: 'a'.repeat(5001),
      }

      const { aiReelsWizard } = await import(
        '@/scenes/lipSyncWizard/ai-reels-wizard'
      )
      const step2 = (aiReelsWizard as any).steps[2]

      await step2(mockContext)

      expect(mockContext.reply).toHaveBeenCalledWith(
        expect.stringContaining('слишком длинный')
      )
      expect(mockContext.scene.leave).toHaveBeenCalled()
    })

    it('should handle missing voice ID', async () => {
      mockContext.message = {
        text: 'Test text',
      }

      // Сцена берёт голос из supabase (users.voice_id_elevenlabs), а не из
      // getVoiceId — обнуление getVoiceId на неё не влияло. Отдаём пустой
      // voice_id из запроса, как и происходит у пользователя без голоса.
      ;(supabase.from as unknown as Mock).mockReturnValueOnce({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn(() =>
              Promise.resolve({
                data: { voice_id_elevenlabs: null },
                error: null,
              })
            ),
          })),
        })),
      })

      const { aiReelsWizard } = await import(
        '@/scenes/lipSyncWizard/ai-reels-wizard'
      )
      const step2 = (aiReelsWizard as any).steps[2]

      await step2(mockContext)

      expect(mockContext.reply).toHaveBeenCalledWith(
        expect.stringContaining('не настроен голос аватара')
      )
      expect(mockContext.scene.enter).toHaveBeenCalled()
    })

    it('should handle invalid voice ID in ElevenLabs', async () => {
      mockContext.message = {
        text: 'Test text',
      }
      ;(assertVoiceExistsAuthoritative as Mock).mockResolvedValueOnce(false)

      const { aiReelsWizard } = await import(
        '@/scenes/lipSyncWizard/ai-reels-wizard'
      )
      const step2 = (aiReelsWizard as any).steps[2]

      await step2(mockContext)

      // К сообщению добавлена инлайн-кнопка «🎤 Создать голос» (второй
      // аргумент reply), поэтому вызов с ОДНИМ аргументом больше не совпадает.
      // Проверяем текст и допускаем наличие разметки.
      expect(mockContext.reply).toHaveBeenCalledWith(
        expect.stringContaining('не найден в системе ElevenLabs'),
        expect.anything()
      )
      expect(mockContext.scene.leave).toHaveBeenCalled()
    })

    it('should handle insufficient balance', async () => {
      mockContext.message = {
        text: 'Test text',
      }
      ;(getUserBalance as Mock).mockResolvedValueOnce(100)

      const { aiReelsWizard } = await import(
        '@/scenes/lipSyncWizard/ai-reels-wizard'
      )
      const step2 = (aiReelsWizard as any).steps[2]

      await step2(mockContext)

      /*
       * The refusal now carries a keyboard, so the call has a SECOND argument.
       * Asserting the text alone would have to be loosened to pass -- instead
       * it is tightened: a person told they are short of stars must be handed
       * the way to add some. The old single-argument form pinned the defect.
       */
      expect(mockContext.reply).toHaveBeenCalledWith(
        expect.stringContaining('Недостаточно средств'),
        expect.objectContaining({
          reply_markup: expect.objectContaining({
            inline_keyboard: expect.any(Array),
          }),
        })
      )
      expect(mockContext.scene.leave).toHaveBeenCalled()
    })

    it('should handle null balance', async () => {
      mockContext.message = {
        text: 'Test text',
      }
      ;(getUserBalance as Mock).mockResolvedValueOnce(null)

      const { aiReelsWizard } = await import(
        '@/scenes/lipSyncWizard/ai-reels-wizard'
      )
      const step2 = (aiReelsWizard as any).steps[2]

      await step2(mockContext)

      expect(mockContext.reply).toHaveBeenCalledWith(
        expect.stringContaining('Ошибка получения баланса')
      )
      expect(mockContext.scene.leave).toHaveBeenCalled()
    })

    it('should handle payment failure', async () => {
      mockContext.message = {
        text: 'Test text',
      }
      ;(updateUserBalance as Mock).mockResolvedValueOnce(false)

      const { aiReelsWizard } = await import(
        '@/scenes/lipSyncWizard/ai-reels-wizard'
      )
      const step2 = (aiReelsWizard as any).steps[2]

      await step2(mockContext)

      expect(mockContext.reply).toHaveBeenCalledWith(
        expect.stringContaining('Ошибка списания средств')
      )
      expect(mockContext.scene.leave).toHaveBeenCalled()
    })

    it('should handle test mode with USE_TEST_LIPSYNC flag', async () => {
      process.env.NODE_ENV = 'development'
      process.env.USE_TEST_LIPSYNC = 'true'

      mockContext.message = {
        text: 'Test text',
      }

      const { aiReelsWizard } = await import(
        '@/scenes/lipSyncWizard/ai-reels-wizard'
      )
      const step2 = (aiReelsWizard as any).steps[2]

      await step2(mockContext)

      expect(mockContext.reply).toHaveBeenCalledWith(
        expect.stringContaining('ТЕСТОВЫЙ РЕЖИМ')
      )
      expect(mockContext.replyWithVideo).toHaveBeenCalled()

      // Cleanup
      delete process.env.USE_TEST_LIPSYNC
    })
  })

  describe('Step 3: VEO 3.1 Video Generation', () => {
    beforeEach(() => {
      mockContext.session.aiReels = {
        step: 'wan_generation',
        imageUrl: 'https://example.com/image.jpg',
        text: 'Test text',
        firstVideoUrl: 'https://example.com/lipsync-video.mp4',
        startTime: Date.now(),
      }
    })

    // 🚩 ФУНКЦИЯ ОТКЛЮЧЕНА В КОДЕ, А НЕ СЛОМАНА В ТЕСТЕ.
    // В ai-reels-wizard.ts оба вызова провайдера закомментированы:
    // `// storyPrompt = await falVeo31.generateStoryPrompt(...)` и
    // `// veo31Result = await falVeo31.generate(veo31Input)`. Пояснения к
    // отключению в коде нет, поэтому включать платные вызовы Fal.ai по своей
    // инициативе нельзя. Пока они закомментированы, второе видео не
    // генерируется никогда. Снимите skip вместе с комментариями в сцене.
    it.skip('should generate second video with VEO 3.1', async () => {
      const mockProvider = {
        generateVideoFromReference: vi.fn(() =>
          Promise.resolve({
            success: true,
            videoUrl: 'https://example.com/veo31-video.mp4',
          })
        ),
      }
      ;(FalVeo31Provider as any).mockImplementation(() => mockProvider)

      const { aiReelsWizard } = await import(
        '@/scenes/lipSyncWizard/ai-reels-wizard'
      )
      const step3 = (aiReelsWizard as any).steps[3]

      await step3(mockContext)

      expect(mockProvider.generateVideoFromReference).toHaveBeenCalled()
      expect(mockContext.session.aiReels.secondVideoUrl).toBe(
        'https://example.com/veo31-video.mp4'
      )
    })

    it('should handle missing first video URL', async () => {
      mockContext.session.aiReels.firstVideoUrl = undefined

      const { aiReelsWizard } = await import(
        '@/scenes/lipSyncWizard/ai-reels-wizard'
      )
      const step3 = (aiReelsWizard as any).steps[3]

      await step3(mockContext)

      expect(mockContext.reply).toHaveBeenCalledWith(
        expect.stringContaining('Ошибка')
      )
      expect(mockContext.scene.leave).toHaveBeenCalled()
    })

    it('should handle VEO 3.1 generation failure', async () => {
      const mockProvider = {
        generateVideoFromReference: vi.fn(() =>
          Promise.resolve({
            success: false,
            error: 'Generation failed',
          })
        ),
      }
      ;(FalVeo31Provider as any).mockImplementation(() => mockProvider)

      const { aiReelsWizard } = await import(
        '@/scenes/lipSyncWizard/ai-reels-wizard'
      )
      const step3 = (aiReelsWizard as any).steps[3]

      await step3(mockContext)

      expect(mockContext.reply).toHaveBeenCalledWith(
        expect.stringContaining('Ошибка генерации второго видео')
      )
    })
  })

  describe('Step 4: Video Merging', () => {
    beforeEach(() => {
      mockContext.session.aiReels = {
        step: 'merging',
        imageUrl: 'https://example.com/image.jpg',
        text: 'Test text',
        firstVideoUrl: 'https://example.com/lipsync-video.mp4',
        secondVideoUrl: 'https://example.com/veo31-video.mp4',
        startTime: Date.now(),
      }
    })

    it('should merge two videos successfully', async () => {
      const { aiReelsWizard } = await import(
        '@/scenes/lipSyncWizard/ai-reels-wizard'
      )
      const step4 = (aiReelsWizard as any).steps[4]

      await step4(mockContext)

      expect(downloadFile).toHaveBeenCalledTimes(2)
      expect(combineVideos).toHaveBeenCalled()
      expect(mockContext.replyWithVideo).toHaveBeenCalled()
    })

    it('should handle missing video URLs', async () => {
      mockContext.session.aiReels.secondVideoUrl = undefined

      const { aiReelsWizard } = await import(
        '@/scenes/lipSyncWizard/ai-reels-wizard'
      )
      const step4 = (aiReelsWizard as any).steps[4]

      await step4(mockContext)

      expect(mockContext.reply).toHaveBeenCalledWith(
        expect.stringContaining('не найдены URL обоих видео')
      )
      expect(mockContext.scene.leave).toHaveBeenCalled()
    })

    it('should handle video download failure', async () => {
      ;(downloadFile as Mock).mockRejectedValueOnce(
        new Error('Download failed')
      )

      const { aiReelsWizard } = await import(
        '@/scenes/lipSyncWizard/ai-reels-wizard'
      )
      const step4 = (aiReelsWizard as any).steps[4]

      await step4(mockContext)

      expect(mockContext.reply).toHaveBeenCalledWith(
        expect.stringContaining('Ошибка')
      )
    })

    it('should handle video merge failure', async () => {
      ;(combineVideos as Mock).mockRejectedValueOnce(new Error('Merge failed'))

      const { aiReelsWizard } = await import(
        '@/scenes/lipSyncWizard/ai-reels-wizard'
      )
      const step4 = (aiReelsWizard as any).steps[4]

      await step4(mockContext)

      expect(mockContext.reply).toHaveBeenCalledWith(
        expect.stringContaining('Ошибка')
      )
    })
  })

  describe('Pricing and Cost Calculation', () => {
    it('should charge fixed cost of 240 stars for Template 1', async () => {
      mockContext.message = {
        text: 'Test text',
      }
      mockContext.session.aiReels = {
        step: 'text',
        imageUrl: 'https://example.com/image.jpg',
        startTime: Date.now(),
      }

      const { aiReelsWizard } = await import(
        '@/scenes/lipSyncWizard/ai-reels-wizard'
      )
      const step2 = (aiReelsWizard as any).steps[2]

      await step2(mockContext)

      expect(updateUserBalance).toHaveBeenCalledWith(
        '223757230',
        240, // Fixed cost
        expect.any(String),
        'AI Reels Шаблон 1',
        expect.objectContaining({
          service_type: 'ai_reels_template_1',
          fixed_cost: 240,
        })
      )
    })

    it('should show correct pricing in insufficient balance message', async () => {
      mockContext.message = {
        text: 'Test text',
      }
      mockContext.session.aiReels = {
        step: 'text',
        imageUrl: 'https://example.com/image.jpg',
        startTime: Date.now(),
      }
      ;(getUserBalance as Mock).mockResolvedValueOnce(100)

      const { aiReelsWizard } = await import(
        '@/scenes/lipSyncWizard/ai-reels-wizard'
      )
      const step2 = (aiReelsWizard as any).steps[2]

      await step2(mockContext)

      // Second argument: the top-up keyboard that now travels with the price.
      expect(mockContext.reply).toHaveBeenCalledWith(
        expect.stringContaining('240⭐'),
        expect.objectContaining({ reply_markup: expect.anything() })
      )
      expect(mockContext.reply).toHaveBeenCalledWith(
        expect.stringContaining('$2.40'),
        expect.objectContaining({ reply_markup: expect.anything() })
      )
    })
  })

  describe('Localization', () => {
    it('should display Russian messages when language is RU', async () => {
      ;(isRussianFromState as Mock).mockReturnValue(true)

      const { aiReelsWizard } = await import(
        '@/scenes/lipSyncWizard/ai-reels-wizard'
      )
      const step0 = (aiReelsWizard as any).steps[0]

      await step0(mockContext)

      expect(mockContext.reply).toHaveBeenCalledWith(
        expect.stringContaining('ИИ Рилс'),
        expect.any(Object)
      )
    })

    it('should display English messages when language is EN', async () => {
      ;(isRussianFromState as Mock).mockReturnValue(false)

      const { aiReelsWizard } = await import(
        '@/scenes/lipSyncWizard/ai-reels-wizard'
      )
      const step0 = (aiReelsWizard as any).steps[0]

      await step0(mockContext)

      expect(mockContext.reply).toHaveBeenCalledWith(
        expect.stringContaining('AI Reels'),
        expect.any(Object)
      )
    })

    it('should show Russian error messages', async () => {
      ;(isRussianFromState as Mock).mockReturnValue(true)
      mockContext.message = {
        text: 'not a valid input',
      }
      mockContext.session.aiReels = {
        step: 'text',
        imageUrl: 'https://example.com/image.jpg',
        startTime: Date.now(),
      }
      ;(getUserBalance as Mock).mockResolvedValueOnce(null)

      const { aiReelsWizard } = await import(
        '@/scenes/lipSyncWizard/ai-reels-wizard'
      )
      const step2 = (aiReelsWizard as any).steps[2]

      await step2(mockContext)

      expect(mockContext.reply).toHaveBeenCalledWith(
        expect.stringContaining('Ошибка')
      )
    })

    it('should show English error messages', async () => {
      ;(isRussianFromState as Mock).mockReturnValue(false)
      mockContext.message = {
        text: 'not a valid input',
      }
      mockContext.session.aiReels = {
        step: 'text',
        imageUrl: 'https://example.com/image.jpg',
        startTime: Date.now(),
      }
      ;(getUserBalance as Mock).mockResolvedValueOnce(null)

      const { aiReelsWizard } = await import(
        '@/scenes/lipSyncWizard/ai-reels-wizard'
      )
      const step2 = (aiReelsWizard as any).steps[2]

      await step2(mockContext)

      expect(mockContext.reply).toHaveBeenCalledWith(
        expect.stringContaining('Error')
      )
    })
  })

  describe('Session Management', () => {
    it('should initialize session correctly in step 0', async () => {
      const { aiReelsWizard } = await import(
        '@/scenes/lipSyncWizard/ai-reels-wizard'
      )
      const step0 = (aiReelsWizard as any).steps[0]

      await step0(mockContext)

      expect(mockContext.session.aiReels).toBeDefined()
      expect(mockContext.session.aiReels.step).toBe('image')
      expect(mockContext.session.aiReels.startTime).toBeGreaterThan(0)
    })

    it('should preserve session data across steps', async () => {
      mockContext.session.aiReels = {
        step: 'text',
        imageUrl: 'https://example.com/image.jpg',
        startTime: Date.now(),
      }

      mockContext.message = {
        text: 'Test text',
      }

      const { aiReelsWizard } = await import(
        '@/scenes/lipSyncWizard/ai-reels-wizard'
      )
      const step2 = (aiReelsWizard as any).steps[2]

      await step2(mockContext)

      expect(mockContext.session.aiReels.imageUrl).toBe(
        'https://example.com/image.jpg'
      )
      expect(mockContext.session.aiReels.text).toBeDefined()
    })

    // Зависит от того же отключённого шага VEO 3.1 (см. пояснение выше):
    // secondVideoUrl не появляется, пока вызовы провайдера закомментированы.
    it.skip('should update session state during video generation', async () => {
      mockContext.session.aiReels = {
        step: 'wan_generation',
        imageUrl: 'https://example.com/image.jpg',
        text: 'Test text',
        firstVideoUrl: 'https://example.com/lipsync-video.mp4',
        startTime: Date.now(),
      }

      const mockProvider = {
        generateVideoFromReference: vi.fn(() =>
          Promise.resolve({
            success: true,
            videoUrl: 'https://example.com/veo31-video.mp4',
          })
        ),
      }
      ;(FalVeo31Provider as any).mockImplementation(() => mockProvider)

      const { aiReelsWizard } = await import(
        '@/scenes/lipSyncWizard/ai-reels-wizard'
      )
      const step3 = (aiReelsWizard as any).steps[3]

      await step3(mockContext)

      expect(mockContext.session.aiReels.secondVideoUrl).toBe(
        'https://example.com/veo31-video.mp4'
      )
      expect(mockContext.session.aiReels.step).toBe('merging')
    })
  })

  describe('Error Recovery', () => {
    it('should clean up on photo upload error', async () => {
      mockContext.message = {
        photo: [
          { file_id: 'photo1', file_size: 1000, width: 100, height: 100 },
        ],
      }

      global.fetch = vi.fn(() =>
        Promise.reject(new Error('Network error'))
      ) as any

      const { aiReelsWizard } = await import(
        '@/scenes/lipSyncWizard/ai-reels-wizard'
      )
      const step1 = (aiReelsWizard as any).steps[1]

      await step1(mockContext)

      expect(mockContext.scene.leave).toHaveBeenCalled()
    })

    it('should show first video even if second video generation fails', async () => {
      mockContext.session.aiReels = {
        step: 'wan_generation',
        imageUrl: 'https://example.com/image.jpg',
        text: 'Test text',
        firstVideoUrl: 'https://example.com/lipsync-video.mp4',
        startTime: Date.now(),
      }

      const mockProvider = {
        generateVideoFromReference: vi.fn(() =>
          Promise.reject(new Error('VEO failed'))
        ),
      }
      ;(FalVeo31Provider as any).mockImplementation(() => mockProvider)

      const { aiReelsWizard } = await import(
        '@/scenes/lipSyncWizard/ai-reels-wizard'
      )
      const step3 = (aiReelsWizard as any).steps[3]

      await step3(mockContext)

      expect(mockContext.replyWithVideo).toHaveBeenCalledWith(
        { url: 'https://example.com/lipsync-video.mp4' },
        expect.any(Object)
      )
    })

    it('should handle unexpected errors gracefully', async () => {
      mockContext.message = {
        text: 'Test text',
      }
      mockContext.session.aiReels = {
        step: 'text',
        imageUrl: 'https://example.com/image.jpg',
        startTime: Date.now(),
      }
      ;(getUserBalance as Mock).mockRejectedValueOnce(
        new Error('Database error')
      )

      const { aiReelsWizard } = await import(
        '@/scenes/lipSyncWizard/ai-reels-wizard'
      )
      const step2 = (aiReelsWizard as any).steps[2]

      await step2(mockContext)

      expect(mockContext.scene.leave).toHaveBeenCalled()
    })
  })
})
