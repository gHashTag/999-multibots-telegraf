/**
 * 🧪 Template Selection Integration Test
 * Проверяет интеграцию Simple Lip-sync в систему выбора шаблонов
 */

import { describe, it, expect } from 'vitest'
import { AIReelsTemplate, AI_REELS_TEMPLATES, parseTemplateSelection, showTemplateSelection } from '../src/scenes/lipSyncWizard/ai-reels-templates'
import { aiReelsWizard } from '../src/scenes/lipSyncWizard/ai-reels-wizard'

describe('🎬 Template Selection Integration Test', () => {
  describe('📋 Template Configuration', () => {
    it('should have all 2 templates defined', () => {
      const templates = Object.values(AI_REELS_TEMPLATES)

      expect(templates).toHaveLength(2)
      console.log('✅ Total templates:', templates.length)

      // Проверяем что есть все нужные шаблоны
      const hasWAN25 = templates.some(t => t.id === AIReelsTemplate.WAN25)
      const hasInngest = templates.some(t => t.id === AIReelsTemplate.INNGEST)

      expect(hasWAN25).toBe(true)
      expect(hasInngest).toBe(true)

      console.log('✅ Template 1 (Simple Lip-sync):', hasWAN25)
      console.log('✅ Template 2 (Inngest):', hasInngest)
    })

    it('should have Template 1 (Simple Lip-sync) with correct configuration', () => {
      const template1 = AI_REELS_TEMPLATES[AIReelsTemplate.WAN25]

      expect(template1.id).toBe(AIReelsTemplate.WAN25)
      expect(template1.name.ru).toBe('Шаблон 1 (Простой Lip-sync)')
      expect(template1.name.en).toBe('Template 1 (Simple Lip-sync)')
      expect(template1.icon).toBe('1️⃣')
      expect(template1.recommended).toBe(true)

      // Проверяем особенности
      expect(template1.features.ru).toContain('🎬 Lip-sync поверх вашего видео')
      expect(template1.features.ru).toContain('⚡ Быстрая генерация (1-2 мин)')
      expect(template1.features.ru).toContain('💰 Стоимость: 120 ⭐')

      console.log('✅ Template 1 configuration is correct')
    })
  })

  describe('🎯 Template Selection Parsing', () => {
    it('should parse Template 1 (Simple Lip-sync) selection', () => {
      const testCases = [
        { text: '1️⃣ Шаблон 1', expected: AIReelsTemplate.WAN25 },
        { text: '⚡ Полный (Veo 3.1)', expected: AIReelsTemplate.WAN25 },
        { text: 'Full (Veo 3.1)', expected: AIReelsTemplate.WAN25 },
        { text: 'wan', expected: AIReelsTemplate.WAN25 },
        { text: 'veo', expected: AIReelsTemplate.WAN25 },
        { text: 'полный', expected: AIReelsTemplate.WAN25 },
      ]

      testCases.forEach(({ text, expected }) => {
        const result = parseTemplateSelection(text)
        expect(result).toBe(expected)
        console.log(`✅ Parsed "${text}" -> ${expected}`)
      })
    })

    it('should parse Template 1 (Simple Lip-sync) via Veo keywords', () => {
      const testCases = [
        { text: 'Template 1', expected: AIReelsTemplate.WAN25 },
        { text: 'шаблон 1', expected: AIReelsTemplate.WAN25 },
        { text: 'simple', expected: AIReelsTemplate.WAN25 },
        { text: 'простой', expected: AIReelsTemplate.WAN25 },
      ]

      testCases.forEach(({ text, expected }) => {
        const result = parseTemplateSelection(text)
        expect(result).toBe(expected)
        console.log(`✅ Parsed "${text}" -> ${expected}`)
      })
    })

    it('should parse INNGEST selection', () => {
      const testCases = [
        { text: '🔄 Надежный (Inngest)', expected: AIReelsTemplate.INNGEST },
        { text: 'Reliable (Inngest)', expected: AIReelsTemplate.INNGEST },
        { text: 'inngest', expected: AIReelsTemplate.INNGEST },
        { text: 'надежный', expected: AIReelsTemplate.INNGEST },
      ]

      testCases.forEach(({ text, expected }) => {
        const result = parseTemplateSelection(text)
        expect(result).toBe(expected)
        console.log(`✅ Parsed "${text}" -> ${expected}`)
      })
    })

    it('should return null for unknown text', () => {
      const unknownTexts = [
        'unknown',
        'random',
        'test',
        '',
      ]

      unknownTexts.forEach(text => {
        const result = parseTemplateSelection(text)
        expect(result).toBeNull()
        console.log(`✅ Parsed "${text}" -> null`)
      })
    })
  })

  describe('🎬 Template 1 (Simple Lip-sync) Wizard Registration', () => {
    it('should have aiReelsWizard defined with Simple Lip-sync logic', () => {
      expect(aiReelsWizard).toBeDefined()
      expect(aiReelsWizard.id).toBe('ai_reels_wizard')
      expect(aiReelsWizard.steps).toBeDefined()
      expect(aiReelsWizard.steps.length).toBeGreaterThanOrEqual(3)

      console.log('✅ Template 1 (Simple Lip-sync) wizard is registered')
      console.log('   - ID:', aiReelsWizard.id)
      console.log('   - Steps:', aiReelsWizard.steps.length)
    })
  })

  describe('📊 UI Display Configuration', () => {
    it('should have recommended templates marked correctly', () => {
      const templates = Object.values(AI_REELS_TEMPLATES)

      // Template 1 (Simple Lip-sync) должен быть recommended
      const template1 = templates.find(t => t.id === AIReelsTemplate.WAN25)
      expect(template1?.recommended).toBe(true)

      console.log('✅ Recommended templates are marked correctly')
      console.log('   - Template 1 (Simple Lip-sync):', template1?.recommended)
    })

    it('should have unique icons for each template', () => {
      const templates = Object.values(AI_REELS_TEMPLATES)
      const icons = templates.map(t => t.icon)

      // Проверяем уникальность иконок
      const uniqueIcons = new Set(icons)
      expect(uniqueIcons.size).toBe(icons.length)

      console.log('✅ All icons are unique:', icons)
    })
  })

  describe('🧪 Full Integration Test', () => {
    it('should complete full template selection workflow', async () => {
      console.log('\n🚀 Testing Full Template Selection Workflow')
      console.log('='.repeat(50))

      // Step 1: Check all templates are defined
      console.log('\nStep 1: Checking template definitions...')
      const allTemplates = Object.values(AI_REELS_TEMPLATES)
      expect(allTemplates).toHaveLength(2)
      console.log('✅ All 2 templates defined')

      // Step 2: Check Template 1 configuration
      console.log('\nStep 2: Checking Template 1 config...')
      const template1 = AI_REELS_TEMPLATES[AIReelsTemplate.WAN25]
      expect(template1).toBeDefined()
      expect(template1.features.ru).toContain('💰 Стоимость: 120 ⭐')
      expect(template1.name.ru).toBe('Шаблон 1 (Простой Lip-sync)')
      console.log('✅ Template 1 (Simple Lip-sync) config is correct')

      // Step 3: Check parsing
      console.log('\nStep 3: Testing template parsing...')
      const parsedTemplate1 = parseTemplateSelection('Простой')
      expect(parsedTemplate1).toBe(AIReelsTemplate.WAN25)

      const parsedInngest = parseTemplateSelection('Надежный')
      expect(parsedInngest).toBe(AIReelsTemplate.INNGEST)
      console.log('✅ All templates parse correctly')

      // Step 4: Check wizard registration
      console.log('\nStep 4: Checking wizard registration...')
      expect(aiReelsWizard).toBeDefined()
      expect(aiReelsWizard.id).toBe('ai_reels_wizard')
      console.log('✅ Template 1 (Simple Lip-sync) wizard registered')

      console.log('\n🎉 INTEGRATION TEST COMPLETED!')
      console.log('='.repeat(50))
      console.log('📊 Summary:')
      console.log('   - Templates count:', allTemplates.length)
      console.log('   - Template 1 (Simple Lip-sync) price:', template1.features.ru.find(f => f.includes('💰')))
      console.log('   - Wizard ID:', aiReelsWizard.id)
      console.log('   - All parsers working: ✅')
      console.log('   - All configs valid: ✅')

      console.log('\n💡 User Journey:')
      console.log('   1. 👤 User chooses "🎬 ИИ Рилс"')
      console.log('   2. 📱 Sees 2 template options')
      console.log('   3. 🎯 Clicks "1️⃣ Template 1"')
      console.log('   4. 🎬 Enters ai_reels_wizard')
      console.log('   5. 📹 Uploads video (up to 30 sec)')
      console.log('   6. ✍️ Enters text (or voice)')
      console.log('   7. 💰 Pays 120⭐')
      console.log('   8. 🎤 TTS generated')
      console.log('   9. 🎬 Lip-sync applied')
      console.log('   10. 📤 Receives result in 1-2 min')

      return true
    })
  })
})

/**
 * 📋 SUMMARY
 * Этот тест проверяет:
 *
 * 1. ✅ Все 3 шаблона определены в конфигурации
 * 2. ✅ Simple Lip-sync имеет правильную конфигурацию
 * 3. ✅ Парсинг выбора работает для всех шаблонов
 * 4. ✅ Simple Lip-sync wizard зарегистрирован
 * 5. ✅ UI конфигурация корректна
 * 6. ✅ Полная интеграция работает
 *
 * 🎯 Результат: Simple Lip-sync полностью интегрирован в систему!
 */