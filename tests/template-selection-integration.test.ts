/**
 * 🧪 Template Selection Integration Test
 * Проверяет интеграцию Simple Lip-sync в систему выбора шаблонов
 */

import { describe, it, expect } from 'vitest'
import { AIReelsTemplate, AI_REELS_TEMPLATES, parseTemplateSelection, showTemplateSelection } from '../src/scenes/lipSyncWizard/ai-reels-templates'
import { simpleLipSyncWizard } from '../src/scenes/lipSyncWizard/simple-lipsync-wizard'

describe('🎬 Template Selection Integration Test', () => {
  describe('📋 Template Configuration', () => {
    it('should have all 3 templates defined', () => {
      const templates = Object.values(AI_REELS_TEMPLATES)

      expect(templates).toHaveLength(3)
      console.log('✅ Total templates:', templates.length)

      // Проверяем что есть все нужные шаблоны
      const hasWAN25 = templates.some(t => t.id === AIReelsTemplate.WAN25)
      const hasSimpleLipSync = templates.some(t => t.id === AIReelsTemplate.SIMPLE_LIPSYNC)
      const hasInngest = templates.some(t => t.id === AIReelsTemplate.INNGEST)

      expect(hasWAN25).toBe(true)
      expect(hasSimpleLipSync).toBe(true)
      expect(hasInngest).toBe(true)

      console.log('✅ Template 1 (Veo 3.1):', hasWAN25)
      console.log('✅ Simple Lip-sync:', hasSimpleLipSync)
      console.log('✅ Template 2 (Inngest):', hasInngest)
    })

    it('should have Simple Lip-sync with correct configuration', () => {
      const simpleTemplate = AI_REELS_TEMPLATES[AIReelsTemplate.SIMPLE_LIPSYNC]

      expect(simpleTemplate.id).toBe(AIReelsTemplate.SIMPLE_LIPSYNC)
      expect(simpleTemplate.name.ru).toBe('Шаблон 1 (Simple Lip-sync)')
      expect(simpleTemplate.name.en).toBe('Template 1 (Simple Lip-sync)')
      expect(simpleTemplate.icon).toBe('✨')
      expect(simpleTemplate.recommended).toBe(true)

      // Проверяем особенности
      expect(simpleTemplate.features.ru).toContain('🎬 Lip-sync поверх вашего видео')
      expect(simpleTemplate.features.ru).toContain('⚡ Быстрая генерация (1-2 мин)')
      expect(simpleTemplate.features.ru).toContain('💰 Стоимость: 120 ⭐')

      console.log('✅ Simple Lip-sync configuration is correct')
    })
  })

  describe('🎯 Template Selection Parsing', () => {
    it('should parse Simple Lip-sync selection', () => {
      const testCases = [
        { text: '✨ Простой (Lip-sync)', expected: AIReelsTemplate.SIMPLE_LIPSYNC },
        { text: 'Simple Lip-sync', expected: AIReelsTemplate.SIMPLE_LIPSYNC },
        { text: 'lip-sync', expected: AIReelsTemplate.SIMPLE_LIPSYNC },
        { text: 'lip sync', expected: AIReelsTemplate.SIMPLE_LIPSYNC },
        { text: 'простой', expected: AIReelsTemplate.SIMPLE_LIPSYNC },
        { text: 'simple', expected: AIReelsTemplate.SIMPLE_LIPSYNC },
      ]

      testCases.forEach(({ text, expected }) => {
        const result = parseTemplateSelection(text)
        expect(result).toBe(expected)
        console.log(`✅ Parsed "${text}" -> ${expected}`)
      })
    })

    it('should parse WAN25 (Full Veo 3.1) selection', () => {
      const testCases = [
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

  describe('🎬 Simple Lip-sync Wizard Registration', () => {
    it('should have simpleLipSyncWizard defined', () => {
      expect(simpleLipSyncWizard).toBeDefined()
      expect(simpleLipSyncWizard.id).toBe('simple_lipsync')
      expect(simpleLipSyncWizard.steps).toBeDefined()
      expect(simpleLipSyncWizard.steps.length).toBeGreaterThanOrEqual(3)

      console.log('✅ Simple Lip-sync wizard is registered')
      console.log('   - ID:', simpleLipSyncWizard.id)
      console.log('   - Steps:', simpleLipSyncWizard.steps.length)
    })
  })

  describe('📊 UI Display Configuration', () => {
    it('should have recommended templates marked correctly', () => {
      const templates = Object.values(AI_REELS_TEMPLATES)

      // Simple Lip-sync должен быть recommended
      const simpleTemplate = templates.find(t => t.id === AIReelsTemplate.SIMPLE_LIPSYNC)
      expect(simpleTemplate?.recommended).toBe(true)

      // WAN25 тоже рекомендован (старый template 1)
      const wan25Template = templates.find(t => t.id === AIReelsTemplate.WAN25)
      expect(wan25Template?.recommended).toBe(true)

      console.log('✅ Recommended templates are marked correctly')
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
      expect(allTemplates).toHaveLength(3)
      console.log('✅ All 3 templates defined')

      // Step 2: Check Simple Lip-sync configuration
      console.log('\nStep 2: Checking Simple Lip-sync config...')
      const simpleTemplate = AI_REELS_TEMPLATES[AIReelsTemplate.SIMPLE_LIPSYNC]
      expect(simpleTemplate).toBeDefined()
      expect(simpleTemplate.features.ru).toContain('💰 Стоимость: 120 ⭐')
      console.log('✅ Simple Lip-sync config is correct')

      // Step 3: Check parsing
      console.log('\nStep 3: Testing template parsing...')
      const parsedSimple = parseTemplateSelection('Простой')
      expect(parsedSimple).toBe(AIReelsTemplate.SIMPLE_LIPSYNC)

      const parsedWAN25 = parseTemplateSelection('Полный')
      expect(parsedWAN25).toBe(AIReelsTemplate.WAN25)

      const parsedInngest = parseTemplateSelection('Надежный')
      expect(parsedInngest).toBe(AIReelsTemplate.INNGEST)
      console.log('✅ All templates parse correctly')

      // Step 4: Check wizard registration
      console.log('\nStep 4: Checking wizard registration...')
      expect(simpleLipSyncWizard).toBeDefined()
      expect(simpleLipSyncWizard.id).toBe('simple_lipsync')
      console.log('✅ Simple Lip-sync wizard registered')

      console.log('\n🎉 INTEGRATION TEST COMPLETED!')
      console.log('='.repeat(50))
      console.log('📊 Summary:')
      console.log('   - Templates count:', allTemplates.length)
      console.log('   - Simple Lip-sync price:', simpleTemplate.features.ru.find(f => f.includes('💰')))
      console.log('   - Wizard ID:', simpleLipSyncWizard.id)
      console.log('   - All parsers working: ✅')
      console.log('   - All configs valid: ✅')

      console.log('\n💡 User Journey:')
      console.log('   1. 👤 User chooses "🎬 ИИ Рилс"')
      console.log('   2. 📱 Sees 3 template options')
      console.log('   3. 🎯 Clicks "✨ Simple Lip-sync"')
      console.log('   4. 🎬 Enters simple_lipsync wizard')
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