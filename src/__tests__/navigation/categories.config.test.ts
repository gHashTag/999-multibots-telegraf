/**
 * 🧪 Тесты для categories.config - конфигурация категорий навигации
 *
 * Тестирует:
 * - CATEGORIES - массив конфигураций категорий
 * - getCategoryById() - получение категории по ID
 * - getNavigationItemById() - получение функции по ID
 * - getCategoryItems() - получение всех функций категории
 * - getCategoryText() - текст категории на ru/en
 * - getItemText() - текст функции на ru/en
 */

import { describe, it, expect } from 'vitest'
import {
  CATEGORIES,
  CategoryConfig,
  NavigationItem,
  getCategoryById,
  getNavigationItemById,
  getCategoryItems,
  getCategoryText,
  getItemText
} from '@/navigation/config/categories.config'
import { ModeEnum } from '@/interfaces/modes'

describe('categories.config', () => {
  describe('CATEGORIES', () => {
    it('должен быть массивом', () => {
      expect(Array.isArray(CATEGORIES)).toBe(true)
    })

    it('должен содержать 6 категорий', () => {
      expect(CATEGORIES.length).toBe(6)
    })

    it('должен содержать категорию photo', () => {
      const photo = CATEGORIES.find(c => c.id === 'photo')
      expect(photo).toBeDefined()
      expect(photo?.ru).toBe('📸 Фото')
      expect(photo?.en).toBe('📸 Photo')
    })

    it('должен содержать категорию video', () => {
      const video = CATEGORIES.find(c => c.id === 'video')
      expect(video).toBeDefined()
      expect(video?.ru).toBe('🎥 Видео')
      expect(video?.en).toBe('🎥 Video')
    })

    it('должен содержать категорию audio', () => {
      const audio = CATEGORIES.find(c => c.id === 'audio')
      expect(audio).toBeDefined()
      expect(audio?.ru).toBe('🎙️ Аудио')
      expect(audio?.en).toBe('🎙️ Audio')
    })

    it('должен содержать категорию avatars', () => {
      const avatars = CATEGORIES.find(c => c.id === 'avatars')
      expect(avatars).toBeDefined()
      expect(avatars?.ru).toBe('🤖 Аватары')
      expect(avatars?.en).toBe('🤖 Avatars')
    })

    it('должен содержать категорию tools', () => {
      const tools = CATEGORIES.find(c => c.id === 'tools')
      expect(tools).toBeDefined()
      expect(tools?.ru).toBe('🛠️ Инструменты')
      expect(tools?.en).toBe('🛠️ Tools')
    })

    it('должен содержать категорию profile', () => {
      const profile = CATEGORIES.find(c => c.id === 'profile')
      expect(profile).toBeDefined()
      expect(profile?.ru).toBe('👤 Профиль')
      expect(profile?.en).toBe('👤 Profile')
    })

    it('каждая категория должна иметь обязательные поля', () => {
      CATEGORIES.forEach(category => {
        expect(category.id).toBeDefined()
        expect(typeof category.id).toBe('string')
        expect(category.ru).toBeDefined()
        expect(typeof category.ru).toBe('string')
        expect(category.en).toBeDefined()
        expect(typeof category.en).toBe('string')
        expect(category.icon).toBeDefined()
        expect(typeof category.icon).toBe('string')
        expect(category.sceneId).toBeDefined()
        expect(typeof category.sceneId).toBe('string')
        expect(Array.isArray(category.items)).toBe(true)
      })
    })

    it('каждая категория должна иметь уникальный ID', () => {
      const ids = CATEGORIES.map(c => c.id)
      const uniqueIds = new Set(ids)
      expect(uniqueIds.size).toBe(ids.length)
    })

    it('каждая категория должна иметь хотя бы один item', () => {
      CATEGORIES.forEach(category => {
        expect(category.items.length).toBeGreaterThan(0)
      })
    })
  })

  describe('NavigationItem structure', () => {
    it('каждый item должен иметь обязательные поля', () => {
      CATEGORIES.forEach(category => {
        category.items.forEach(item => {
          expect(item.id).toBeDefined()
          expect(typeof item.id).toBe('string')
          expect(item.ru).toBeDefined()
          expect(typeof item.ru).toBe('string')
          expect(item.en).toBeDefined()
          expect(typeof item.en).toBe('string')
          expect(item.icon).toBeDefined()
          expect(typeof item.icon).toBe('string')
          expect(item.mode).toBeDefined()
        })
      })
    })

    it('каждый item должен иметь уникальный ID во всех категориях', () => {
      const allIds: string[] = []
      CATEGORIES.forEach(category => {
        category.items.forEach(item => {
          allIds.push(item.id)
        })
      })
      const uniqueIds = new Set(allIds)
      expect(uniqueIds.size).toBe(allIds.length)
    })

    it('adminOnly items должны быть boolean или undefined', () => {
      CATEGORIES.forEach(category => {
        category.items.forEach(item => {
          if (item.adminOnly !== undefined) {
            expect(typeof item.adminOnly).toBe('boolean')
          }
        })
      })
    })

    it('requiresSubscription items должны быть boolean или undefined', () => {
      CATEGORIES.forEach(category => {
        category.items.forEach(item => {
          if (item.requiresSubscription !== undefined) {
            expect(typeof item.requiresSubscription).toBe('boolean')
          }
        })
      })
    })

    it('directScene items должны быть boolean или undefined', () => {
      CATEGORIES.forEach(category => {
        category.items.forEach(item => {
          if (item.directScene !== undefined) {
            expect(typeof item.directScene).toBe('boolean')
          }
        })
      })
    })
  })

  describe('getCategoryById()', () => {
    it('возвращает категорию по ID', () => {
      const photo = getCategoryById('photo')
      expect(photo).toBeDefined()
      expect(photo?.id).toBe('photo')
    })

    it('возвращает undefined для несуществующего ID', () => {
      const result = getCategoryById('non-existent')
      expect(result).toBeUndefined()
    })

    it('возвращает undefined для пустой строки', () => {
      const result = getCategoryById('')
      expect(result).toBeUndefined()
    })

    it('находит все 6 категорий', () => {
      const categoryIds = ['photo', 'video', 'audio', 'avatars', 'tools', 'profile']
      categoryIds.forEach(id => {
        const category = getCategoryById(id)
        expect(category).toBeDefined()
        expect(category?.id).toBe(id)
      })
    })
  })

  describe('getNavigationItemById()', () => {
    it('находит item по ID', () => {
      const neuroPhoto = getNavigationItemById('neuro_photo')
      expect(neuroPhoto).toBeDefined()
      expect(neuroPhoto?.id).toBe('neuro_photo')
      expect(neuroPhoto?.mode).toBe(ModeEnum.NeuroPhoto)
    })

    it('находит item из разных категорий', () => {
      const balance = getNavigationItemById('balance')
      expect(balance).toBeDefined()
      expect(balance?.id).toBe('balance')

      const textToVideo = getNavigationItemById('text_to_video')
      expect(textToVideo).toBeDefined()
      expect(textToVideo?.id).toBe('text_to_video')
    })

    it('возвращает undefined для несуществующего ID', () => {
      const result = getNavigationItemById('non-existent')
      expect(result).toBeUndefined()
    })

    it('возвращает undefined для пустой строки', () => {
      const result = getNavigationItemById('')
      expect(result).toBeUndefined()
    })
  })

  describe('getCategoryItems()', () => {
    it('возвращает items для существующей категории', () => {
      const photoItems = getCategoryItems('photo')
      expect(Array.isArray(photoItems)).toBe(true)
      expect(photoItems.length).toBeGreaterThan(0)
    })

    it('возвращает пустой массив для несуществующей категории', () => {
      const result = getCategoryItems('non-existent')
      expect(Array.isArray(result)).toBe(true)
      expect(result.length).toBe(0)
    })

    it('возвращает все items категории photo', () => {
      const photoItems = getCategoryItems('photo')
      const expectedIds = [
        'neuro_photo',
        'text_to_image',
        'image_to_prompt',
        'ai_photoshop',
        'image_upscaler',
        'face_swap',
        'morphing'
      ]
      const actualIds = photoItems.map(item => item.id)
      expectedIds.forEach(id => {
        expect(actualIds).toContain(id)
      })
    })

    it('возвращает все items категории profile', () => {
      const profileItems = getCategoryItems('profile')
      const expectedIds = ['balance', 'top_up', 'subscription', 'invite', 'support', 'language']
      const actualIds = profileItems.map(item => item.id)
      expectedIds.forEach(id => {
        expect(actualIds).toContain(id)
      })
    })
  })

  describe('getCategoryText()', () => {
    it('возвращает русский текст для isRussian=true', () => {
      const category = getCategoryById('photo')!
      const text = getCategoryText(category, true)
      expect(text).toBe('📸 Фото')
    })

    it('возвращает английский текст для isRussian=false', () => {
      const category = getCategoryById('photo')!
      const text = getCategoryText(category, false)
      expect(text).toBe('📸 Photo')
    })

    it('работает для всех категорий', () => {
      CATEGORIES.forEach(category => {
        const ruText = getCategoryText(category, true)
        const enText = getCategoryText(category, false)

        expect(ruText).toBe(category.ru)
        expect(enText).toBe(category.en)
      })
    })
  })

  describe('getItemText()', () => {
    it('возвращает русский текст для isRussian=true', () => {
      const item = getNavigationItemById('neuro_photo')!
      const text = getItemText(item, true)
      expect(text).toBe('📸 Нейрофото')
    })

    it('возвращает английский текст для isRussian=false', () => {
      const item = getNavigationItemById('neuro_photo')!
      const text = getItemText(item, false)
      expect(text).toBe('📸 NeuroPhoto')
    })

    it('работает для всех items', () => {
      CATEGORIES.forEach(category => {
        category.items.forEach(item => {
          const ruText = getItemText(item, true)
          const enText = getItemText(item, false)

          expect(ruText).toBe(item.ru)
          expect(enText).toBe(item.en)
        })
      })
    })
  })

  describe('Mode compatibility', () => {
    it('большинство mode значений являются ModeEnum', () => {
      const modeEnumValues = Object.values(ModeEnum)
      let modeEnumCount = 0
      let stringCount = 0

      CATEGORIES.forEach(category => {
        category.items.forEach(item => {
          if (modeEnumValues.includes(item.mode as ModeEnum)) {
            modeEnumCount++
          } else {
            stringCount++
          }
        })
      })

      // Большинство должны быть ModeEnum
      expect(modeEnumCount).toBeGreaterThan(stringCount)
    })

    it('строковые mode должны быть валидными идентификаторами сцен', () => {
      const stringModes: string[] = []
      const modeEnumValues = Object.values(ModeEnum)

      CATEGORIES.forEach(category => {
        category.items.forEach(item => {
          if (!modeEnumValues.includes(item.mode as ModeEnum)) {
            stringModes.push(item.mode as string)
          }
        })
      })

      // Проверяем, что строковые mode выглядят как идентификаторы сцен
      stringModes.forEach(mode => {
        expect(typeof mode).toBe('string')
        expect(mode.length).toBeGreaterThan(0)
        // Обычно это camelCase или snake_case
        expect(mode).toMatch(/^[a-zA-Z_][a-zA-Z0-9_]*$/)
      })
    })
  })

  describe('Admin and Subscription flags', () => {
    it('есть хотя бы одна функция с adminOnly', () => {
      let hasAdminOnly = false
      CATEGORIES.forEach(category => {
        category.items.forEach(item => {
          if (item.adminOnly) {
            hasAdminOnly = true
          }
        })
      })
      expect(hasAdminOnly).toBe(true)
    })

    it('lip_sync должен быть adminOnly', () => {
      const lipSync = getNavigationItemById('lip_sync')
      expect(lipSync?.adminOnly).toBe(true)
    })

    it('instagram_parsing должен быть adminOnly', () => {
      const instagramParsing = getNavigationItemById('instagram_parsing')
      expect(instagramParsing?.adminOnly).toBe(true)
    })

    it('balance НЕ требует подписку', () => {
      const balance = getNavigationItemById('balance')
      expect(balance?.requiresSubscription).toBe(false)
    })

    it('neuro_photo требует подписку', () => {
      const neuroPhoto = getNavigationItemById('neuro_photo')
      expect(neuroPhoto?.requiresSubscription).toBe(true)
    })
  })

  describe('Direct scene flags', () => {
    it('balance имеет directScene=true', () => {
      const balance = getNavigationItemById('balance')
      expect(balance?.directScene).toBe(true)
    })

    it('subscription имеет directScene=true', () => {
      const subscription = getNavigationItemById('subscription')
      expect(subscription?.directScene).toBe(true)
    })

    it('ai_photoshop имеет directScene=true', () => {
      const aiPhotoshop = getNavigationItemById('ai_photoshop')
      expect(aiPhotoshop?.directScene).toBe(true)
    })
  })

  describe('Icon consistency', () => {
    it('все иконки содержат эмодзи', () => {
      // Расширенный regex для всех типов эмодзи, включая ⬆️, 🦸‍♂️ и другие
      const emojiRegex = /[\u{1F300}-\u{1FAD6}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}]/u

      CATEGORIES.forEach(category => {
        // Проверяем иконку категории
        expect(category.icon).toMatch(emojiRegex)

        // Проверяем иконки items
        category.items.forEach(item => {
          expect(item.icon).toMatch(emojiRegex)
        })
      })
    })

    it('ru текст начинается с иконки', () => {
      CATEGORIES.forEach(category => {
        expect(category.ru.startsWith(category.icon)).toBe(true)

        category.items.forEach(item => {
          expect(item.ru.startsWith(item.icon)).toBe(true)
        })
      })
    })

    it('en текст начинается с иконки', () => {
      CATEGORIES.forEach(category => {
        expect(category.en.startsWith(category.icon)).toBe(true)

        category.items.forEach(item => {
          expect(item.en.startsWith(item.icon)).toBe(true)
        })
      })
    })
  })
})
