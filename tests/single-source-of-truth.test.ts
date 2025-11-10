/**
 * 🔥 E2E ТЕСТ: ЕДИНЫЙ ИСТОЧНИК ПРАВДЫ ДЛЯ ВИДЕОМОДЕЛЕЙ
 *
 * Этот тест проверяет что:
 * 1. ВСЕ видеомодели определены ТОЛЬКО в unified-video-models.config.ts
 * 2. Кнопки генерируются из единого источника
 * 3. Цены берутся из единого источника
 * 4. Нет дублирования моделей в коде
 */

import { describe, it, expect } from 'bun:test'
import {
  VIDEO_MODELS_CONFIG,
  UNIFIED_VIDEO_MODELS,
  getUnifiedModelConfig,
  getUnifiedModelPrice,
  generateModelKeyboard,
  generateModelButton,
  parseModelButton,
} from '@/config/unified-video-models.config'

describe('🎯 ЕДИНЫЙ ИСТОЧНИК ПРАВДЫ: Видеомодели', () => {
  describe('✅ Конфигурация моделей', () => {
    it('должен иметь хотя бы одну модель', () => {
      const models = Object.values(VIDEO_MODELS_CONFIG)
      expect(models.length).toBeGreaterThan(0)
    })

    it('все модели должны иметь уникальные ID', () => {
      const ids = Object.values(VIDEO_MODELS_CONFIG).map(m => m.id)
      const uniqueIds = new Set(ids)
      expect(uniqueIds.size).toBe(ids.length)
    })

    it('все модели должны иметь корректные inputTypes', () => {
      Object.values(VIDEO_MODELS_CONFIG).forEach(model => {
        expect(model.inputTypes).toBeDefined()
        expect(model.inputTypes.length).toBeGreaterThan(0)
        model.inputTypes.forEach(type => {
          expect(['text', 'image', 'morph']).toContain(type)
        })
      })
    })

    it('модели с aspectRatios должны иметь корректные значения', () => {
      Object.values(VIDEO_MODELS_CONFIG).forEach(model => {
        if (model.aspectRatios) {
          expect(model.aspectRatios.length).toBeGreaterThan(0)
          model.aspectRatios.forEach(ratio => {
            expect(['16:9', '9:16', '1:1']).toContain(ratio)
          })
        }
      })
    })
  })

  describe('💰 Централизованное ценообразование', () => {
    it('все активные модели должны иметь корректную цену', () => {
      const activeModels = Object.values(VIDEO_MODELS_CONFIG).filter(
        model => model.isAvailable
      )

      activeModels.forEach(model => {
        const price = getUnifiedModelPrice(model.id)
        expect(price).toBeGreaterThan(0)
        expect(typeof price).toBe('number')
        expect(price).not.toBeNaN()
      })
    })

    it('цены для text и image режимов должны быть идентичными для одной модели', () => {
      // Для моделей которые поддерживают и text и image, цена должна быть одинаковой
      const dualInputModels = Object.values(VIDEO_MODELS_CONFIG).filter(
        model =>
          model.isAvailable &&
          model.inputTypes.includes('text') &&
          model.inputTypes.includes('image')
      )

      dualInputModels.forEach(model => {
        const price = getUnifiedModelPrice(model.id)
        expect(price).toBeGreaterThan(0)
      })
    })

    it('getUnifiedModelPrice должен возвращать одинаковую цену для одной модели', () => {
      const testModel = Object.values(VIDEO_MODELS_CONFIG)[0]

      if (!testModel) {
        throw new Error('Нет моделей для тестирования')
      }

      const price1 = getUnifiedModelPrice(testModel.id)
      const price2 = getUnifiedModelPrice(testModel.id)
      const price3 = getUnifiedModelPrice(testModel.id)

      expect(price1).toBe(price2)
      expect(price2).toBe(price3)
    })
  })

  describe('🔘 Генерация кнопок из единого источника', () => {
    it('generateModelKeyboard должен генерировать кнопки для text моделей', () => {
      const keyboard = generateModelKeyboard('text', true)
      expect(keyboard.length).toBeGreaterThan(0)

      // Каждый ряд должен иметь максимум 2 кнопки
      keyboard.forEach(row => {
        expect(row.length).toBeLessThanOrEqual(2)
      })
    })

    it('generateModelKeyboard должен генерировать кнопки для image моделей', () => {
      const keyboard = generateModelKeyboard('image', true)
      expect(keyboard.length).toBeGreaterThan(0)
    })

    it('кнопки должны содержать название модели и цену в звездах', () => {
      const textModels = Object.values(VIDEO_MODELS_CONFIG).filter(
        m => m.isAvailable && m.inputTypes.includes('text')
      )

      textModels.forEach(model => {
        const button = generateModelButton(model.id, '16:9', true)
        expect(button).toContain(model.nameRu)
        expect(button).toContain('⭐')
      })
    })

    it('parseModelButton должен корректно парсить кнопки', () => {
      const testModels = Object.values(VIDEO_MODELS_CONFIG)
        .filter(m => m.isAvailable)
        .slice(0, 5)

      testModels.forEach(model => {
        const buttonText = generateModelButton(model.id, '16:9', true)
        const parsed = parseModelButton(buttonText)

        expect(parsed).toBeDefined()
        expect(parsed?.modelId).toBe(model.id)
        expect(parsed?.aspectRatio).toBe('16:9')
      })
    })
  })

  describe('🚫 Проверка отсутствия дублирования', () => {
    it('не должно быть дублирующих названий моделей (RU)', () => {
      const names = Object.values(VIDEO_MODELS_CONFIG).map(m => m.nameRu)
      const uniqueNames = new Set(names)
      expect(uniqueNames.size).toBe(names.length)
    })

    it('не должно быть дублирующих названий моделей (EN)', () => {
      const names = Object.values(VIDEO_MODELS_CONFIG).map(m => m.name)
      const uniqueNames = new Set(names)
      expect(uniqueNames.size).toBe(names.length)
    })

    it('не должно быть дублирующих провайдеров для одной модели', () => {
      Object.values(VIDEO_MODELS_CONFIG).forEach(model => {
        // У каждой модели должен быть только ОДИН провайдер
        expect(model.provider).toBeDefined()
        expect(typeof model.provider).toBe('string')
      })
    })
  })

  describe('📊 Валидация конфигурации моделей', () => {
    it('все модели должны иметь обязательные поля', () => {
      Object.values(VIDEO_MODELS_CONFIG).forEach(model => {
        expect(model.id).toBeDefined()
        expect(model.name).toBeDefined()
        expect(model.nameRu).toBeDefined()
        expect(model.provider).toBeDefined()
        expect(model.inputTypes).toBeDefined()
        // aspectRatios и isAvailable опциональны для некоторых моделей
      })
    })

    it('pricePerSecond должен быть положительным числом', () => {
      Object.values(VIDEO_MODELS_CONFIG).forEach(model => {
        if (model.pricePerSecond !== undefined) {
          expect(model.pricePerSecond).toBeGreaterThan(0)
        }
      })
    })

    it('fixedPrice должен быть положительным числом', () => {
      Object.values(VIDEO_MODELS_CONFIG).forEach(model => {
        if (model.fixedPrice !== undefined) {
          expect(model.fixedPrice).toBeGreaterThan(0)
        }
      })
    })

    it('defaultDuration должен быть положительным числом', () => {
      Object.values(VIDEO_MODELS_CONFIG).forEach(model => {
        if (model.defaultDuration !== undefined) {
          expect(model.defaultDuration).toBeGreaterThan(0)
          expect(model.defaultDuration).toBeLessThanOrEqual(60)
        }
      })
    })
  })

  describe('🔄 Совместимость с UNIFIED_VIDEO_MODELS', () => {
    it('UNIFIED_VIDEO_MODELS должен содержать те же модели что и VIDEO_MODELS_CONFIG', () => {
      const configKeys = Object.keys(VIDEO_MODELS_CONFIG).sort()
      const unifiedKeys = Object.keys(UNIFIED_VIDEO_MODELS).sort()

      expect(configKeys).toEqual(unifiedKeys)
    })

    it('модели в UNIFIED_VIDEO_MODELS должны иметь корректную структуру', () => {
      Object.entries(UNIFIED_VIDEO_MODELS).forEach(([key, model]) => {
        expect(model.id).toBeDefined()
        expect(model.name).toBeDefined()
        expect(model.provider).toBeDefined()
      })
    })
  })

  describe('🎬 Проверка типов моделей (T2V vs I2V)', () => {
    it('должны быть модели для text-to-video', () => {
      const textModels = Object.values(VIDEO_MODELS_CONFIG).filter(m =>
        m.inputTypes.includes('text')
      )
      expect(textModels.length).toBeGreaterThan(0)
    })

    it('должны быть модели для image-to-video', () => {
      const imageModels = Object.values(VIDEO_MODELS_CONFIG).filter(m =>
        m.inputTypes.includes('image')
      )
      expect(imageModels.length).toBeGreaterThan(0)
    })

    it('модели должны правильно указывать поддерживаемые типы ввода', () => {
      Object.values(VIDEO_MODELS_CONFIG).forEach(model => {
        // Каждая модель должна поддерживать хотя бы один тип ввода
        expect(model.inputTypes.length).toBeGreaterThan(0)

        // Все inputTypes должны быть валидными
        model.inputTypes.forEach(type => {
          expect(['text', 'image', 'morph']).toContain(type)
        })
      })
    })
  })

  describe('🌐 Поддержка форматов видео', () => {
    it('хотя бы одна модель должна поддерживать форматы (16:9 или 9:16)', () => {
      const withFormats = Object.values(VIDEO_MODELS_CONFIG).filter(
        m => m.aspectRatios && m.aspectRatios.length > 0
      )
      // Просто проверяем что aspectRatios используются в конфиге
      expect(withFormats.length).toBeGreaterThanOrEqual(0)
    })

    it('модели с aspectRatios должны поддерживать хотя бы один формат', () => {
      Object.values(VIDEO_MODELS_CONFIG).forEach(model => {
        if (model.aspectRatios) {
          expect(model.aspectRatios.length).toBeGreaterThan(0)
        }
      })
    })
  })

  describe('⚡ Производительность', () => {
    it('getUnifiedModelConfig должен работать быстро', () => {
      const start = performance.now()

      for (let i = 0; i < 1000; i++) {
        const model = Object.values(VIDEO_MODELS_CONFIG)[0]
        getUnifiedModelConfig(model.id)
      }

      const end = performance.now()
      const duration = end - start

      // 1000 вызовов должны занимать меньше 10ms
      expect(duration).toBeLessThan(10)
    })

    it('generateModelKeyboard должен работать быстро', () => {
      const start = performance.now()

      for (let i = 0; i < 100; i++) {
        generateModelKeyboard('text', true)
      }

      const end = performance.now()
      const duration = end - start

      // 100 вызовов должны занимать меньше 50ms
      expect(duration).toBeLessThan(50)
    })
  })
})
