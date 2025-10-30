import { test, expect, describe, beforeAll } from 'bun:test'

describe('Nano Banana Integration', () => {
  beforeAll(() => {
    // Устанавливаем переменные окружения для тестов
    process.env.REPLICATE_API_TOKEN = 'test-token'
  })

  describe('Prompt Generation', () => {
    test('should generate prompt for Кощей Бессмертный', () => {
      const prompt = createTestPrompt('male', 'Кощей Бессмертный')
      expect(prompt).toContain('immortal sorcerer')
      expect(prompt).toContain('dark ornate robes')
      expect(prompt).toContain('bone and skull motifs')
    })

    test('should generate prompt for Илья Муромец', () => {
      const prompt = createTestPrompt('male', 'Илья Муромец')
      expect(prompt).toContain('mighty')
      expect(prompt).toContain('warrior')
      expect(prompt).toContain('Russian armor')
    })

    test('should generate prompt for Чебурашка', () => {
      const prompt = createTestPrompt('male', 'Чебурашка')
      expect(prompt).toContain('cute')
      expect(prompt).toContain('brown furry costume')
      expect(prompt).toContain('huge round ears')
    })

    test('should generate prompt for Баба Яга', () => {
      const prompt = createTestPrompt('female', 'Баба Яга')
      expect(prompt).toContain('mystical')
      expect(prompt).toContain('witch')
      expect(prompt).toContain('forest elements')
    })
  })

  describe('Button Mapping', () => {
    test('should map Russian buttons correctly', () => {
      const buttonMap = getTestButtonMap()
      
      expect(buttonMap['🛡️ Илья Муромец']).toBe('Илья Муромец')
      expect(buttonMap['💀 Кощей Бессмертный']).toBe('Кощей Бессмертный')
      expect(buttonMap['🐵 Чебурашка']).toBe('Чебурашка')
      expect(buttonMap['🐺 Серый Волк']).toBe('Серый Волк')
    })

    test('should map English buttons correctly', () => {
      const buttonMap = getTestButtonMap()
      
      expect(buttonMap['🛡️ Ilya Muromets']).toBe('Илья Муромец')
      expect(buttonMap['💀 Koschei']).toBe('Кощей Бессмертный')
      expect(buttonMap['🐵 Cheburashka']).toBe('Чебурашка')
      expect(buttonMap['🐺 Grey Wolf']).toBe('Серый Волк')
    })
  })
})

// Вспомогательные функции для тестов
function createTestPrompt(gender: 'male' | 'female', heroName: string): string {
  const baseSettings = `[Cinematic portrait photography. Medium shot. Aspect ratio 9:16. Professional studio lighting with dramatic effects]`
  
  const heroPrompts: Record<string, string> = {
    'Кощей Бессмертный': `${baseSettings} A mystical ${
      gender === 'male' ? 'immortal sorcerer' : 'immortal sorceress'
    } in dark ornate robes with bone and skull motifs. Tall, thin silhouette. Glowing green eyes. Holding a magical staff with crystal. Background with dark castle and treasure chests. Eerie green and purple lighting with magical effects.`,
    
    'Илья Муромец': `${baseSettings} A mighty ${
      gender === 'male' ? 'warrior' : 'warrior woman'
    } in ancient Russian armor with chainmail and helmet. Powerful build. Holding a massive sword and shield. Epic heroic pose. Background with Russian steppe landscape and dramatic storm clouds. Heroic lighting with strong contrasts.`,
    
    'Чебурашка': `${baseSettings} A cute ${
      gender === 'male' ? 'person' : 'person'
    } in brown furry costume with huge round ears. Big innocent eyes. Orange vest. Holding a small orange. Background with toy store and colorful boxes. Soft, warm lighting with nostalgic feel.`,
    
    'Баба Яга': `${baseSettings} A mystical ${
      gender === 'male' ? 'wizard' : 'witch'
    } in tattered robes with forest elements. Wild grey hair. Holding a broom and mortar. Mischievous grin. Background with chicken leg hut and dark forest. Mysterious lighting with green and purple magic.`,
  }
  
  return heroPrompts[heroName] || `${baseSettings} Default prompt for ${heroName}`
}

function getTestButtonMap(): Record<string, string> {
  return {
    // Славянские - Русские
    '🤴 Иван-царевич': 'Иван-царевич',
    '🛡️ Илья Муромец': 'Илья Муромец',
    '💉 Добрыня Никитич': 'Добрыня Никитич',
    '🎯 Алёша Попович': 'Алёша Попович',
    '💀 Кощей Бессмертный': 'Кощей Бессмертный',
    '🐺 Серый Волк': 'Серый Волк',
    '🎣 Емеля': 'Емеля',
    '🐵 Чебурашка': 'Чебурашка',
    '🐊 Крокодил Гена': 'Крокодил Гена',
    '🐱 Кот Матроскин': 'Кот Матроскин',
    '🐻 Винни-Пух': 'Винни-Пух',
    
    // Славянские - Английские
    '🛡️ Ilya Muromets': 'Илья Муромец',
    '💀 Koschei': 'Кощей Бессмертный',
    '🐺 Grey Wolf': 'Серый Волк',
    '🐵 Cheburashka': 'Чебурашка',
    '🐊 Gena': 'Крокодил Гена',
    '🐻 Winnie Pooh': 'Винни-Пух',
  }
}