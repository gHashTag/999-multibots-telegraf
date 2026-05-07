/**
 * Tests for featureInfo.ts
 *
 * Feature Guard System - Single Source of Truth for paid feature information
 */

import { describe, it, expect } from 'vitest'
import { ModeEnum } from '@/interfaces/modes'
import {
  FEATURE_INFO,
  formatFeatureHelp,
  getFeatureMinCost,
  isFeaturePaid,
  getFeatureInfo,
  FeatureInfo,
} from '@/helpers/featureInfo'

describe('FEATURE_INFO', () => {
  it('should contain all expected paid features', () => {
    const expectedFeatures = [
      ModeEnum.NeuroPhoto,
      ModeEnum.TextToImage,
      ModeEnum.ImageToPrompt,
      ModeEnum.ImageUpscaler,
      ModeEnum.TextToVideo,
      ModeEnum.ImageToVideo,
      ModeEnum.TextToSpeech,
      ModeEnum.VoiceToText,
      ModeEnum.LipSync,
      ModeEnum.MorphingWizard,
      ModeEnum.DigitalAvatarBody,
      ModeEnum.AiPhotoshop,
      ModeEnum.FaceSwap,
    ]

    expectedFeatures.forEach(mode => {
      expect(FEATURE_INFO[mode]).toBeDefined()
    })
  })

  it('each feature should have name in both ru and en', () => {
    Object.values(FEATURE_INFO).forEach(info => {
      if (info) {
        expect(info.name).toBeDefined()
        expect(info.name.ru).toBeDefined()
        expect(info.name.ru.length).toBeGreaterThan(0)
        expect(info.name.en).toBeDefined()
        expect(info.name.en.length).toBeGreaterThan(0)
      }
    })
  })

  it('each feature should have description in both ru and en', () => {
    Object.values(FEATURE_INFO).forEach(info => {
      if (info) {
        expect(info.description).toBeDefined()
        expect(info.description.ru).toBeDefined()
        expect(info.description.ru.length).toBeGreaterThan(0)
        expect(info.description.en).toBeDefined()
        expect(info.description.en.length).toBeGreaterThan(0)
      }
    })
  })

  it('minCost should be > 0 for all paid features', () => {
    Object.values(FEATURE_INFO).forEach(info => {
      if (info && info.isPaid) {
        expect(info.minCost).toBeGreaterThan(0)
      }
    })
  })

  it('maxCost should be >= minCost when defined', () => {
    Object.values(FEATURE_INFO).forEach(info => {
      if (info && info.maxCost !== undefined) {
        expect(info.maxCost).toBeGreaterThanOrEqual(info.minCost)
      }
    })
  })

  it('isPaid should be true for all defined features', () => {
    Object.values(FEATURE_INFO).forEach(info => {
      if (info) {
        expect(info.isPaid).toBe(true)
      }
    })
  })
})

describe('formatFeatureHelp', () => {
  const mockFeatureInfo: FeatureInfo = {
    name: { ru: 'Тест', en: 'Test' },
    description: { ru: 'Описание на русском', en: 'Description in English' },
    howItWorks: { ru: 'Как работает', en: 'How it works' },
    examples: { ru: ['Пример 1', 'Пример 2'], en: ['Example 1', 'Example 2'] },
    tips: { ru: ['Совет 1'], en: ['Tip 1'] },
    minCost: 10,
    maxCost: 20,
    isPaid: true,
  }

  it('should format help message in Russian', () => {
    const result = formatFeatureHelp(mockFeatureInfo, true)

    expect(result).toContain('<b>Тест</b>')
    expect(result).toContain('Описание на русском')
    expect(result).toContain('Как работает')
    expect(result).toContain('Пример 1')
    expect(result).toContain('Совет 1')
    expect(result).toContain('10–20⭐')
  })

  it('should format help message in English', () => {
    const result = formatFeatureHelp(mockFeatureInfo, false)

    expect(result).toContain('<b>Test</b>')
    expect(result).toContain('Description in English')
    expect(result).toContain('How it works')
    expect(result).toContain('Example 1')
    expect(result).toContain('Tip 1')
    expect(result).toContain('10–20⭐')
  })

  it('should show single cost when minCost equals maxCost', () => {
    const singleCostFeature: FeatureInfo = {
      name: { ru: 'Тест', en: 'Test' },
      description: { ru: 'Описание', en: 'Description' },
      minCost: 15,
      maxCost: 15,
      isPaid: true,
    }

    const result = formatFeatureHelp(singleCostFeature, true)
    expect(result).toContain('15⭐')
    expect(result).not.toContain('–')
  })

  it('should show single cost when maxCost is undefined', () => {
    const noMaxCostFeature: FeatureInfo = {
      name: { ru: 'Тест', en: 'Test' },
      description: { ru: 'Описание', en: 'Description' },
      minCost: 5,
      isPaid: true,
    }

    const result = formatFeatureHelp(noMaxCostFeature, false)
    expect(result).toContain('5⭐')
    expect(result).not.toContain('–')
  })

  it('should include examples when provided', () => {
    const result = formatFeatureHelp(mockFeatureInfo, true)
    expect(result).toContain('Примеры запросов')
    expect(result).toContain('• Пример 1')
    expect(result).toContain('• Пример 2')
  })

  it('should include tips when provided', () => {
    const result = formatFeatureHelp(mockFeatureInfo, false)
    expect(result).toContain('Tips for better results')
    expect(result).toContain('• Tip 1')
  })

  it('should not include howItWorks section if not provided', () => {
    const minimalFeature: FeatureInfo = {
      name: { ru: 'Тест', en: 'Test' },
      description: { ru: 'Описание', en: 'Description' },
      minCost: 5,
      isPaid: true,
    }

    const result = formatFeatureHelp(minimalFeature, true)
    expect(result).not.toContain('Как это работает')
  })
})

describe('getFeatureMinCost', () => {
  it('should return minCost for known feature', () => {
    const cost = getFeatureMinCost(ModeEnum.NeuroPhoto)
    expect(cost).toBe(6)
  })

  it('should return minCost for TextToVideo', () => {
    const cost = getFeatureMinCost(ModeEnum.TextToVideo)
    expect(cost).toBe(38)
  })

  it('should return 0 for unknown feature', () => {
    const cost = getFeatureMinCost('unknown_feature' as ModeEnum)
    expect(cost).toBe(0)
  })

  it('should return correct cost for DigitalAvatarBody', () => {
    const cost = getFeatureMinCost(ModeEnum.DigitalAvatarBody)
    expect(cost).toBe(220)
  })
})

describe('isFeaturePaid', () => {
  it('should return true for paid features', () => {
    expect(isFeaturePaid(ModeEnum.NeuroPhoto)).toBe(true)
    expect(isFeaturePaid(ModeEnum.TextToImage)).toBe(true)
    expect(isFeaturePaid(ModeEnum.LipSync)).toBe(true)
  })

  it('should return false for unknown feature', () => {
    expect(isFeaturePaid('unknown_feature' as ModeEnum)).toBe(false)
  })
})

describe('getFeatureInfo', () => {
  it('should return FeatureInfo for known feature', () => {
    const info = getFeatureInfo(ModeEnum.NeuroPhoto)

    expect(info).toBeDefined()
    expect(info?.name.ru).toBe('📸 Нейрофото')
    expect(info?.name.en).toBe('📸 NeuroPhoto')
    expect(info?.minCost).toBe(6)
  })

  it('should return undefined for unknown feature', () => {
    const info = getFeatureInfo('unknown_feature' as ModeEnum)
    expect(info).toBeUndefined()
  })

  it('should return complete info for LipSync', () => {
    const info = getFeatureInfo(ModeEnum.LipSync)

    expect(info).toBeDefined()
    expect(info?.name.ru).toContain('Синхронизация губ')
    expect(info?.minCost).toBe(84)
    expect(info?.isPaid).toBe(true)
    expect(info?.tips).toBeDefined()
    expect(info?.howItWorks).toBeDefined()
  })
})

describe('FeatureInfo structure validation', () => {
  it('all features should have consistent structure', () => {
    const features = Object.entries(FEATURE_INFO)

    features.forEach(([mode, info]) => {
      if (info) {
        // Required fields
        expect(info.name).toBeDefined()
        expect(info.description).toBeDefined()
        expect(typeof info.minCost).toBe('number')
        expect(typeof info.isPaid).toBe('boolean')

        // Optional fields should be properly typed if present
        if (info.howItWorks) {
          expect(info.howItWorks.ru).toBeDefined()
          expect(info.howItWorks.en).toBeDefined()
        }

        if (info.examples) {
          expect(Array.isArray(info.examples.ru)).toBe(true)
          expect(Array.isArray(info.examples.en)).toBe(true)
        }

        if (info.tips) {
          expect(Array.isArray(info.tips.ru)).toBe(true)
          expect(Array.isArray(info.tips.en)).toBe(true)
        }

        if (info.maxCost !== undefined) {
          expect(typeof info.maxCost).toBe('number')
        }
      }
    })
  })
})
