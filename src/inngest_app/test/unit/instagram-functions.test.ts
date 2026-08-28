/**
 * UNIT TESTS: Instagram Functions
 *
 * Тестируем функции instagram категории:
 * - instagramScraper-v2
 * - instagramScraper-v2-simple
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  instagramScraperV2Data,
  instagramScraperV2SimpleData,
  instagramExpectedResults,
  instagramErrors,
} from '../fixtures/instagram-fixtures'
import {
  setupInngestMocks,
  createMockLogger,
  expectSuccessResponse,
} from '../utils/test-helpers'

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
    scrapeProfile: vi.fn(),
    scrapeHashtag: vi.fn(),
    scrapeLocation: vi.fn(),
    scrapeURL: vi.fn(),
  },
}))

vi.mock('../../utils/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
}))

import { instagramScraperV2 } from '../../functions/instagram/instagramScraper-v2'
import { instagramScraperV2Simple } from '../../functions/instagram/instagramScraper-v2-simple'
import { getHandler } from '../utils/test-helpers'

/**
 * ⚠️ ПОЧЕМУ ЭТОТ ФАЙЛ ПРОПУЩЕН (skip), а не починен.
 *
 * Из того же коммита e7ab699 «checkpoint: Все тесты теперь нужно будет
 * покрыть каждую функцию» (04.11.2025). Описывает контракты, которых нет:
 *
 *   instagramScraperV2Simple — такого экспорта не существует; модуль
 *     instagramScraper-v2-simple отдаёт instagramReelsTest с совсем другим
 *     входом ({username, count} со значениями по умолчанию).
 *   instagramScraperV2 — обработчик требует {username_or_id, project_id}
 *     (см. проверки в instagramScraper-v2.ts), а фикстуры дают
 *     {telegram_id, username, scrape_type, limit}: ни одно поле не совпадает.
 *
 * Ни один тест здесь не проходил ни разу. Подгонка ожиданий под текущий вывод
 * сделала бы из них декорацию, реализация выдуманного контракта — придумала бы
 * продукт за владельца. Skip = явный пункт бэклога, а не вечный красный.
 */
describe.skip('Instagram Functions', () => {
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

  describe('instagramScraper-v2', () => {
    it('должен скрапить профиль', async () => {
      const event = {
        name: 'instagram/scraper-v2',
        data: instagramScraperV2Data.valid_profile,
      }

      const result = await getHandler(instagramScraperV2)({
        event,
        step: mockStep,
        logger: mockLogger,
      })

      expectSuccessResponse(result)
      expect(result).toHaveProperty('posts_found')
      expect(result).toHaveProperty('profile_info')
      expect(result).toHaveProperty('posts')

      expect(mockStep.run).toHaveBeenCalledWith(
        'validate-profile',
        expect.any(Function)
      )
      expect(mockStep.run).toHaveBeenCalledWith(
        'scrape-profile-posts',
        expect.any(Function)
      )
      expect(mockStep.run).toHaveBeenCalledWith(
        'extract-metrics',
        expect.any(Function)
      )
      expect(mockStep.run).toHaveBeenCalledWith(
        'process-posts',
        expect.any(Function)
      )

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('📸 [INSTAGRAM] Scraping profile'),
        expect.any(Object)
      )
    })

    it('должен скрапить по хештегу', async () => {
      const event = {
        name: 'instagram/scraper-v2',
        data: instagramScraperV2Data.valid_hashtag,
      }

      const result = await getHandler(instagramScraperV2)({
        event,
        step: mockStep,
        logger: mockLogger,
      })

      expectSuccessResponse(result)
      expect(result).toHaveProperty('posts_found')
      expect(result).toHaveProperty('hashtag')

      expect(mockStep.run).toHaveBeenCalledWith(
        'validate-hashtag',
        expect.any(Function)
      )
      expect(mockStep.run).toHaveBeenCalledWith(
        'scrape-hashtag-posts',
        expect.any(Function)
      )
      expect(mockStep.run).toHaveBeenCalledWith(
        'apply-min-likes-filter',
        expect.any(Function)
      )
    })

    it('должен скрапить по локации', async () => {
      const event = {
        name: 'instagram/scraper-v2',
        data: instagramScraperV2Data.valid_location,
      }

      const result = await getHandler(instagramScraperV2)({
        event,
        step: mockStep,
        logger: mockLogger,
      })

      expectSuccessResponse(result)
      expect(mockStep.run).toHaveBeenCalledWith(
        'validate-location',
        expect.any(Function)
      )
      expect(mockStep.run).toHaveBeenCalledWith(
        'scrape-location-posts',
        expect.any(Function)
      )
    })

    it('должен отклонять невалидный username', async () => {
      const event = {
        name: 'instagram/scraper-v2',
        data: instagramScraperV2Data.invalid_username,
      }

      await expect(
        getHandler(instagramScraperV2)({
          event,
          step: mockStep,
          logger: mockLogger,
        })
      ).rejects.toThrow('username or hashtag is required')

      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('⚠️ [INSTAGRAM] Invalid profile parameters'),
        expect.any(Object)
      )
    })

    it('должен обрабатывать приватные аккаунты', async () => {
      mockStep.run.mockImplementation((name: string, handler: Function) => {
        if (name === 'scrape-profile-posts') {
          throw new Error('Account is private')
        }
        return handler()
      })

      const event = {
        name: 'instagram/scraper-v2',
        data: instagramScraperV2Data.valid_profile,
      }

      await expect(
        getHandler(instagramScraperV2)({
          event,
          step: mockStep,
          logger: mockLogger,
        })
      ).rejects.toThrow('Account is private')

      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('⚠️ [INSTAGRAM] Private account'),
        expect.any(Object)
      )
    })

    it('должен ограничивать количество постов', async () => {
      const event = {
        name: 'instagram/scraper-v2',
        data: {
          ...instagramScraperV2Data.valid_profile,
          limit: 50,
        },
      }

      await getHandler(instagramScraperV2)({
        event,
        step: mockStep,
        logger: mockLogger,
      })

      expect(mockStep.run).toHaveBeenCalledWith(
        'apply-limit',
        expect.any(Function)
      )
    })

    it('должен фильтровать по минимальным лайкам', async () => {
      const event = {
        name: 'instagram/scraper-v2',
        data: instagramScraperV2Data.valid_hashtag,
      }

      await getHandler(instagramScraperV2)({
        event,
        step: mockStep,
        logger: mockLogger,
      })

      expect(mockStep.run).toHaveBeenCalledWith(
        'filter-by-likes',
        expect.any(Function)
      )
    })
  })

  describe('instagramScraper-v2-simple', () => {
    it('должен скрапить по URL', async () => {
      const event = {
        name: 'instagram/scraper-v2-simple',
        data: instagramScraperV2SimpleData.valid_basic,
      }

      const result = await getHandler(instagramScraperV2Simple)({
        event,
        step: mockStep,
        logger: mockLogger,
      })

      expectSuccessResponse(result)
      expect(result).toHaveProperty('posts_found')

      expect(mockStep.run).toHaveBeenCalledWith(
        'parse-url',
        expect.any(Function)
      )
      expect(mockStep.run).toHaveBeenCalledWith(
        'scrape-content',
        expect.any(Function)
      )
      expect(mockStep.run).toHaveBeenCalledWith(
        'extract-basic-info',
        expect.any(Function)
      )

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('📸 [INSTAGRAM] Simple scraping'),
        expect.any(Object)
      )
    })

    it('должен обрабатывать URL с хештегом', async () => {
      const event = {
        name: 'instagram/scraper-v2-simple',
        data: instagramScraperV2SimpleData.valid_with_hashtag,
      }

      const result = await getHandler(instagramScraperV2Simple)({
        event,
        step: mockStep,
        logger: mockLogger,
      })

      expectSuccessResponse(result)
      expect(mockStep.run).toHaveBeenCalledWith(
        'detect-hashtag-url',
        expect.any(Function)
      )
    })

    it('должен включать метрики', async () => {
      const event = {
        name: 'instagram/scraper-v2-simple',
        data: instagramScraperV2SimpleData.valid_basic,
      }

      await getHandler(instagramScraperV2Simple)({
        event,
        step: mockStep,
        logger: mockLogger,
      })

      expect(mockStep.run).toHaveBeenCalledWith(
        'extract-metrics',
        expect.any(Function)
      )
    })

    it('должен исключать комментарии когда указано', async () => {
      const event = {
        name: 'instagram/scraper-v2-simple',
        data: instagramScraperV2SimpleData.valid_with_hashtag,
      }

      await getHandler(instagramScraperV2Simple)({
        event,
        step: mockStep,
        logger: mockLogger,
      })

      expect(mockStep.run).toHaveBeenCalledWith(
        'skip-comments',
        expect.any(Function)
      )
    })

    it('должен отклонять невалидный URL', async () => {
      const event = {
        name: 'instagram/scraper-v2-simple',
        data: instagramScraperV2SimpleData.invalid_url,
      }

      await expect(
        getHandler(instagramScraperV2Simple)({
          event,
          step: mockStep,
          logger: mockLogger,
        })
      ).rejects.toThrow('url is required')
    })

    it('должен обрабатывать Rate Limit', async () => {
      mockStep.run.mockImplementation((name: string, handler: Function) => {
        if (name === 'scrape-content') {
          throw new Error('Rate limit exceeded')
        }
        return handler()
      })

      const event = {
        name: 'instagram/scraper-v2-simple',
        data: instagramScraperV2SimpleData.valid_basic,
      }

      await expect(
        getHandler(instagramScraperV2Simple)({
          event,
          step: mockStep,
          logger: mockLogger,
        })
      ).rejects.toThrow('Rate limit exceeded')

      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('⚠️ [INSTAGRAM] Rate limited'),
        expect.any(Object)
      )
    })
  })

  describe('Shared functionality', () => {
    it('должен валидировать Instagram URL', async () => {
      const event = {
        name: 'instagram/scraper-v2',
        data: instagramScraperV2Data.valid_profile,
      }

      await getHandler(instagramScraperV2)({
        event,
        step: mockStep,
        logger: mockLogger,
      })

      expect(mockStep.run).toHaveBeenCalledWith(
        'validate-instagram-url',
        expect.any(Function)
      )
    })

    it('должен логировать время выполнения', async () => {
      const startTime = Date.now()

      const event = {
        name: 'instagram/scraper-v2-simple',
        data: instagramScraperV2SimpleData.valid_basic,
      }

      await getHandler(instagramScraperV2Simple)({
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

    it('должен кэшировать результаты', async () => {
      const event = {
        name: 'instagram/scraper-v2',
        data: instagramScraperV2Data.valid_profile,
      }

      await getHandler(instagramScraperV2)({
        event,
        step: mockStep,
        logger: mockLogger,
      })

      expect(mockStep.run).toHaveBeenCalledWith(
        'cache-results',
        expect.any(Function)
      )
    })

    it('должен отправлять прогресс', async () => {
      const event = {
        name: 'instagram/scraper-v2-simple',
        data: instagramScraperV2SimpleData.valid_basic,
      }

      await getHandler(instagramScraperV2Simple)({
        event,
        step: mockStep,
        logger: mockLogger,
      })

      expect(mockStep.run).toHaveBeenCalledWith(
        'send-progress-update',
        expect.any(Function)
      )
    })
  })
})
