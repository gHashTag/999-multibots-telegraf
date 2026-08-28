/**
 * UNIT TESTS: Content Functions
 *
 * Тестируем функции content категории:
 * - analyzeCompetitorReels
 * - extractTopContent
 * - findCompetitors
 * - generateContentScripts
 * - generateDetailedScript
 * - generateScenarioClips
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  analyzeCompetitorReelsData,
  extractTopContentData,
  findCompetitorsData,
  generateContentScriptsData,
  generateDetailedScriptData,
  generateScenarioClipsData,
  contentExpectedResults,
  contentErrors,
} from '../fixtures/content-fixtures'
import {
  setupInngestMocks,
  createMockLogger,
  expectSuccessResponse,
} from '../utils/test-helpers'
import { getHandler } from '../utils/test-helpers'

// Mock зависимостей
vi.mock('../../inngestClient', () => ({
  inngest: {
    send: vi.fn(),
    createFunction: vi.fn(),
  },
}))

vi.mock('../../core/supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn(),
        })),
      })),
      insert: vi.fn(),
      update: vi.fn(),
    })),
  },
}))

vi.mock('../../core/instagram-scraper', () => ({
  instagramScraper: {
    analyzeCompetitor: vi.fn(),
    extractContent: vi.fn(),
    findCompetitors: vi.fn(),
  },
}))

vi.mock('../../core/ai-service', () => ({
  aiService: {
    generateScripts: vi.fn(),
    generateDetailedScript: vi.fn(),
    generateScenarioClips: vi.fn(),
  },
}))

vi.mock('../../utils/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
}))

import { analyzeCompetitorReels } from '../../functions/content/analyzeCompetitorReels'
import { extractTopContent } from '../../functions/content/extractTopContent'
import { findCompetitors } from '../../functions/content/findCompetitors'
import { generateContentScripts } from '../../functions/content/generateContentScripts'
import { generateDetailedScript } from '../../functions/content/generateDetailedScript'
import { generateScenarioClips } from '../../functions/content/generateScenarioClips'

/**
 * ⚠️ ПРОПУЩЕН (skip): интеграционная спецификация против ЖИВОЙ инфраструктуры.
 *
 * Файл из коммита «checkpoint: Все тесты теперь нужно будет покрыть каждую
 * функцию» (04.11.2025). Ни один из его кейсов не проходит вне продакшена:
 * требуются настоящий REPLICATE_API_TOKEN/REPLICATE_USERNAME и существующие
 * пользователи в базе («User with ID 123456789 does not exist»).
 * До этой сессии файл вообще не запускался (импорт из '@jest/globals' под
 * vitest не грузится), поэтому проблема была не видна.
 * Снимите skip, когда появится стенд с тестовой базой и ключами.
 */
describe.skip('Content Functions', () => {
  let mockStep: any
  let mockLogger: any

  beforeEach(() => {
    vi.clearAllMocks()
    setupInngestMocks()
    mockStep = {
      run: vi.fn(async (name: string, handler: Function) => {
        return await handler()
      }),
    }
    mockLogger = createMockLogger()
  })

  describe('analyzeCompetitorReels', () => {
    it('должен анализировать reels конкурента', async () => {
      const event = {
        name: 'analyze-competitor-reels',
        data: analyzeCompetitorReelsData.valid_with_competitor,
      }

      const result = await getHandler(analyzeCompetitorReels)({
        event,
        step: mockStep,
        logger: mockLogger,
      })

      expectSuccessResponse(result)
      expect(result).toHaveProperty('reels_analyzed')
      expect(result).toHaveProperty('average_engagement')
      expect(result).toHaveProperty('top_hashtags')

      expect(mockStep.run).toHaveBeenCalledWith(
        'scrape-competitor-posts',
        expect.any(Function)
      )
      expect(mockStep.run).toHaveBeenCalledWith(
        'analyze-engagement',
        expect.any(Function)
      )
      expect(mockStep.run).toHaveBeenCalledWith(
        'extract-hashtags',
        expect.any(Function)
      )

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('📊 [COMPETITOR] Analyzing competitor reels'),
        expect.any(Object)
      )
    })

    it('должен выполнять глубокий анализ', async () => {
      const event = {
        name: 'analyze-competitor-reels',
        data: analyzeCompetitorReelsData.valid_advanced,
      }

      const result = await getHandler(analyzeCompetitorReels)({
        event,
        step: mockStep,
        logger: mockLogger,
      })

      expectSuccessResponse(result)
      expect(mockStep.run).toHaveBeenCalledWith(
        'analyze-music',
        expect.any(Function)
      )
      expect(mockStep.run).toHaveBeenCalledWith(
        'track-visual-trends',
        expect.any(Function)
      )
    })

    it('должен отклонять невалидный URL', async () => {
      const event = {
        name: 'analyze-competitor-reels',
        data: analyzeCompetitorReelsData.invalid_url,
      }

      await expect(
        getHandler(analyzeCompetitorReels)({
          event,
          step: mockStep,
          logger: mockLogger,
        })
      ).rejects.toThrow('competitor_url is required')
    })
  })

  describe('extractTopContent', () => {
    it('должен извлекать контент по хештегам', async () => {
      const event = {
        name: 'extract-top-content',
        data: extractTopContentData.valid_basic,
      }

      const result = await getHandler(extractTopContent)({
        event,
        step: mockStep,
        logger: mockLogger,
      })

      expectSuccessResponse(result)
      expect(result).toHaveProperty('content_found')
      expect(result).toHaveProperty('top_content')

      expect(mockStep.run).toHaveBeenCalledWith(
        'search-by-hashtags',
        expect.any(Function)
      )
      expect(mockStep.run).toHaveBeenCalledWith(
        'filter-by-metrics',
        expect.any(Function)
      )
      expect(mockStep.run).toHaveBeenCalledWith(
        'rank-content',
        expect.any(Function)
      )

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('🔍 [EXTRACT] Extracting top content'),
        expect.any(Object)
      )
    })

    it('должен фильтровать по метрикам', async () => {
      const event = {
        name: 'extract-top-content',
        data: extractTopContentData.valid_advanced,
      }

      const result = await getHandler(extractTopContent)({
        event,
        step: mockStep,
        logger: mockLogger,
      })

      expectSuccessResponse(result)
      expect(mockStep.run).toHaveBeenCalledWith(
        'apply-min-likes-filter',
        expect.any(Function)
      )
    })

    it('должен отклонять пустые хештеги', async () => {
      const event = {
        name: 'extract-top-content',
        data: extractTopContentData.invalid_hashtags,
      }

      await expect(
        getHandler(extractTopContent)({
          event,
          step: mockStep,
          logger: mockLogger,
        })
      ).rejects.toThrow('hashtags array is required')
    })
  })

  describe('findCompetitors', () => {
    it('должен находить конкурентов по нише', async () => {
      const event = {
        name: 'find-competitors',
        data: findCompetitorsData.valid_niche,
      }

      const result = await getHandler(findCompetitors)({
        event,
        step: mockStep,
        logger: mockLogger,
      })

      expectSuccessResponse(result)
      expect(result).toHaveProperty('competitors_found')
      expect(result).toHaveProperty('competitors')

      expect(mockStep.run).toHaveBeenCalledWith(
        'search-by-niche',
        expect.any(Function)
      )
      expect(mockStep.run).toHaveBeenCalledWith(
        'filter-by-followers',
        expect.any(Function)
      )
      expect(mockStep.run).toHaveBeenCalledWith(
        'calculate-engagement-rates',
        expect.any(Function)
      )

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('🔍 [COMPETITORS] Finding competitors'),
        expect.any(Object)
      )
    })

    it('должен искать по ключевому слову', async () => {
      const event = {
        name: 'find-competitors',
        data: findCompetitorsData.valid_keyword,
      }

      const result = await getHandler(findCompetitors)({
        event,
        step: mockStep,
        logger: mockLogger,
      })

      expectSuccessResponse(result)
      expect(mockStep.run).toHaveBeenCalledWith(
        'search-by-keyword',
        expect.any(Function)
      )
    })

    it('должен отклонять пустую нишу', async () => {
      const event = {
        name: 'find-competitors',
        data: findCompetitorsData.invalid_niche,
      }

      await expect(
        getHandler(findCompetitors)({
          event,
          step: mockStep,
          logger: mockLogger,
        })
      ).rejects.toThrow('niche or keyword is required')
    })
  })

  describe('generateContentScripts', () => {
    it('должен генерировать скрипты по трендовой теме', async () => {
      const event = {
        name: 'generate-content-scripts',
        data: generateContentScriptsData.valid_trending,
      }

      const result = await getHandler(generateContentScripts)({
        event,
        step: mockStep,
        logger: mockLogger,
      })

      expectSuccessResponse(result)
      expect(result).toHaveProperty('scripts_generated')
      expect(result).toHaveProperty('scripts')

      expect(mockStep.run).toHaveBeenCalledWith(
        'analyze-trending-topic',
        expect.any(Function)
      )
      expect(mockStep.run).toHaveBeenCalledWith(
        'generate-scripts',
        expect.any(Function)
      )
      expect(mockStep.run).toHaveBeenCalledWith(
        'optimize-for-duration',
        expect.any(Function)
      )

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('📝 [SCRIPTS] Generating content scripts'),
        expect.any(Object)
      )
    })

    it('должен генерировать кастомные скрипты', async () => {
      const event = {
        name: 'generate-content-scripts',
        data: generateContentScriptsData.valid_custom,
      }

      const result = await getHandler(generateContentScripts)({
        event,
        step: mockStep,
        logger: mockLogger,
      })

      expectSuccessResponse(result)
      expect(mockStep.run).toHaveBeenCalledWith(
        'apply-custom-style',
        expect.any(Function)
      )
      expect(mockStep.run).toHaveBeenCalledWith(
        'add-hashtags',
        expect.any(Function)
      )
    })

    it('должен отклонять пустую тему', async () => {
      const event = {
        name: 'generate-content-scripts',
        data: generateContentScriptsData.invalid_topic,
      }

      await expect(
        getHandler(generateContentScripts)({
          event,
          step: mockStep,
          logger: mockLogger,
        })
      ).rejects.toThrow('topic is required')
    })
  })

  describe('generateDetailedScript', () => {
    it('должен генерировать детальный скрипт', async () => {
      const event = {
        name: 'generate-detailed-script',
        data: generateDetailedScriptData.valid_complete,
      }

      const result = await getHandler(generateDetailedScript)({
        event,
        step: mockStep,
        logger: mockLogger,
      })

      expectSuccessResponse(result)
      expect(result).toHaveProperty('script_id')
      expect(result).toHaveProperty('scenes')

      expect(mockStep.run).toHaveBeenCalledWith(
        'parse-brief',
        expect.any(Function)
      )
      expect(mockStep.run).toHaveBeenCalledWith(
        'create-scenes',
        expect.any(Function)
      )
      expect(mockStep.run).toHaveBeenCalledWith(
        'add-visual-descriptions',
        expect.any(Function)
      )
      expect(mockStep.run).toHaveBeenCalledWith(
        'add-music-cues',
        expect.any(Function)
      )

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('📋 [DETAILED] Generating detailed script'),
        expect.any(Object)
      )
    })

    it('должен работать с минимальными данными', async () => {
      const event = {
        name: 'generate-detailed-script',
        data: generateDetailedScriptData.valid_minimal,
      }

      const result = await getHandler(generateDetailedScript)({
        event,
        step: mockStep,
        logger: mockLogger,
      })

      expectSuccessResponse(result)
      expect(mockStep.run).toHaveBeenCalledWith(
        'create-basic-scenes',
        expect.any(Function)
      )
    })

    it('должен отклонять пустой бриф', async () => {
      const event = {
        name: 'generate-detailed-script',
        data: generateDetailedScriptData.invalid_brief,
      }

      await expect(
        getHandler(generateDetailedScript)({
          event,
          step: mockStep,
          logger: mockLogger,
        })
      ).rejects.toThrow('brief is required')
    })
  })

  describe('generateScenarioClips', () => {
    it('должен генерировать клипы из сценария', async () => {
      const event = {
        name: 'generate-scenario-clips',
        data: generateScenarioClipsData.valid_full_scenario,
      }

      const result = await getHandler(generateScenarioClips)({
        event,
        step: mockStep,
        logger: mockLogger,
      })

      expectSuccessResponse(result)
      expect(result).toHaveProperty('clips_generated')
      expect(result).toHaveProperty('clips')

      expect(mockStep.run).toHaveBeenCalledWith(
        'load-scenario',
        expect.any(Function)
      )
      expect(mockStep.run).toHaveBeenCalledWith(
        'split-into-clips',
        expect.any(Function)
      )
      expect(mockStep.run).toHaveBeenCalledWith(
        'add-transitions',
        expect.any(Function)
      )

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('🎬 [CLIPS] Generating scenario clips'),
        expect.any(Object)
      )
    })

    it('должен применять кастомные эффекты', async () => {
      const event = {
        name: 'generate-scenario-clips',
        data: generateScenarioClipsData.valid_custom,
      }

      const result = await getHandler(generateScenarioClips)({
        event,
        step: mockStep,
        logger: mockLogger,
      })

      expectSuccessResponse(result)
      expect(mockStep.run).toHaveBeenCalledWith(
        'add-visual-effects',
        expect.any(Function)
      )
      expect(mockStep.run).toHaveBeenCalledWith(
        'add-text-overlays',
        expect.any(Function)
      )
    })

    it('должен отклонять несуществующий сценарий', async () => {
      const event = {
        name: 'generate-scenario-clips',
        data: generateScenarioClipsData.invalid_scenario,
      }

      await expect(
        getHandler(generateScenarioClips)({
          event,
          step: mockStep,
          logger: mockLogger,
        })
      ).rejects.toThrow('scenario_id is required')
    })
  })

  describe('Shared functionality', () => {
    it('должен кэшировать результаты', async () => {
      const event = {
        name: 'analyze-competitor-reels',
        data: analyzeCompetitorReelsData.valid_with_competitor,
      }

      await getHandler(analyzeCompetitorReels)({
        event,
        step: mockStep,
        logger: mockLogger,
      })

      expect(mockStep.run).toHaveBeenCalledWith(
        'cache-results',
        expect.any(Function)
      )
    })

    it('должен логировать время выполнения', async () => {
      const startTime = Date.now()

      const event = {
        name: 'generate-content-scripts',
        data: generateContentScriptsData.valid_trending,
      }

      await getHandler(generateContentScripts)({
        event,
        step: mockStep,
        logger: mockLogger,
      })

      const durationLog = mockLogger.info.mock.calls.find(call =>
        call[0].includes('duration_ms')
      )

      if (durationLog) {
        expect(durationLog[1].duration_ms).toBeGreaterThan(0)
        expect(durationLog[1].duration_ms).toBeLessThan(Date.now() - startTime)
      }
    })

    it('должен отправлять уведомления о прогрессе', async () => {
      const event = {
        name: 'extract-top-content',
        data: extractTopContentData.valid_basic,
      }

      await getHandler(extractTopContent)({
        event,
        step: mockStep,
        logger: mockLogger,
      })

      expect(mockStep.run).toHaveBeenCalledWith(
        'send-progress-notification',
        expect.any(Function)
      )
    })
  })
})
