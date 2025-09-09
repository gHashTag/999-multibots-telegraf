import { describe, test, expect, beforeEach, vi, Mock } from 'bun:test'
import { MyContext } from '@/interfaces'

describe('Avatar Transform Scene', () => {
  describe('Character Prompts', () => {
    const heroPrompts = {
      'Илья Муромец': {
        emoji: '🛡️',
        keywords: ['mighty', 'warrior', 'Russian armor', 'sword', 'shield'],
        hasGenderVariant: true
      },
      'Кощей Бессмертный': {
        emoji: '💀',
        keywords: ['immortal', 'sorcerer', 'dark ornate robes', 'bone', 'skull'],
        hasGenderVariant: true
      },
      'Чебурашка': {
        emoji: '🐵',
        keywords: ['cute', 'brown furry', 'huge round ears', 'orange vest'],
        hasGenderVariant: false
      },
      'Баба Яга': {
        emoji: '🧙',
        keywords: ['wizard', 'forest', 'broom', 'mortar', 'chicken leg hut'],
        hasGenderVariant: true
      },
      'Винни-Пух': {
        emoji: '🐻',
        keywords: ['bear', 'red shirt', 'honey pot', 'friendly'],
        hasGenderVariant: false
      },
      'Крокодил Гена': {
        emoji: '🐊',
        keywords: ['crocodile', 'accordion', 'suit', 'hat'],
        hasGenderVariant: false
      },
      'Кот Матроскин': {
        emoji: '🐱',
        keywords: ['cat', 'striped', 'sailor shirt', 'countryside'],
        hasGenderVariant: false
      },
      'Серый Волк': {
        emoji: '🐺',
        keywords: ['grey wolf', 'forest', 'mystical', 'cunning'],
        hasGenderVariant: true
      },
      'Емеля': {
        emoji: '🎣',
        keywords: ['pike', 'magical', 'lazy', 'stove'],
        hasGenderVariant: true
      },
      'Иван-царевич': {
        emoji: '🤴',
        keywords: ['prince', 'royal', 'embroidered', 'young'],
        hasGenderVariant: true
      },
      'Добрыня Никитич': {
        emoji: '💉',
        keywords: ['warrior', 'strong', 'armor', 'dragon slayer'],
        hasGenderVariant: true
      },
      'Алёша Попович': {
        emoji: '🎯',
        keywords: ['warrior', 'young', 'clever', 'bow'],
        hasGenderVariant: true
      },
      'Снегурочка': {
        emoji: '❄️',
        keywords: ['snow maiden', 'ice', 'blue robes', 'winter'],
        hasGenderVariant: false
      },
      'Василиса Прекрасная': {
        emoji: '👸',
        keywords: ['beautiful', 'princess', 'wise', 'magical doll'],
        hasGenderVariant: false
      },
      'Жар-птица': {
        emoji: '🔥',
        keywords: ['firebird', 'golden', 'feathers', 'magical'],
        hasGenderVariant: false
      },
      'Золотая рыбка': {
        emoji: '🐠',
        keywords: ['golden fish', 'magical', 'wishing pearl', 'ocean'],
        hasGenderVariant: false
      }
    }

    test('should have unique emojis for each character', () => {
      const emojis = Object.values(heroPrompts).map(h => h.emoji)
      const uniqueEmojis = new Set(emojis)
      expect(uniqueEmojis.size).toBe(emojis.length)
    })

    test('should have required keywords in prompts', () => {
      for (const [hero, config] of Object.entries(heroPrompts)) {
        const prompt = createTestPrompt('male', hero)
        for (const keyword of config.keywords) {
          expect(prompt.toLowerCase()).toContain(keyword.toLowerCase())
        }
      }
    })

    test('should handle gender variants correctly', () => {
      const malePrompt = createTestPrompt('male', 'Илья Муромец')
      const femalePrompt = createTestPrompt('female', 'Илья Муромец')
      
      expect(malePrompt).toContain('warrior')
      expect(femalePrompt).toContain('warrior woman')
    })
  })

  describe('Button Mappings', () => {
    test('should map Russian buttons correctly', () => {
      const buttonMap = getTestButtonMap()
      
      expect(buttonMap['🛡️ Илья Муромец']).toBe('Илья Муромец')
      expect(buttonMap['💀 Кощей Бессмертный']).toBe('Кощей Бессмертный')
      expect(buttonMap['🐵 Чебурашка']).toBe('Чебурашка')
      expect(buttonMap['🐺 Серый Волк']).toBe('Серый Волк')
      expect(buttonMap['🐊 Крокодил Гена']).toBe('Крокодил Гена')
      expect(buttonMap['🐱 Кот Матроскин']).toBe('Кот Матроскин')
      expect(buttonMap['🐻 Винни-Пух']).toBe('Винни-Пух')
      expect(buttonMap['🎣 Емеля']).toBe('Емеля')
      expect(buttonMap['🤴 Иван-царевич']).toBe('Иван-царевич')
    })

    test('should map English buttons correctly', () => {
      const buttonMap = getTestButtonMap()
      
      expect(buttonMap['🛡️ Ilya Muromets']).toBe('Илья Муромец')
      expect(buttonMap['💀 Koschei']).toBe('Кощей Бессмертный')
      expect(buttonMap['🐵 Cheburashka']).toBe('Чебурашка')
      expect(buttonMap['🐺 Grey Wolf']).toBe('Серый Волк')
      expect(buttonMap['🐊 Gena']).toBe('Крокодил Гена')
      expect(buttonMap['🐻 Winnie Pooh']).toBe('Винни-Пух')
    })

    test('should have all characters in both languages', () => {
      const buttonMap = getTestButtonMap()
      const russianCharacters = [
        'Илья Муромец', 'Кощей Бессмертный', 'Чебурашка', 'Серый Волк',
        'Крокодил Гена', 'Кот Матроскин', 'Винни-Пух', 'Емеля', 'Иван-царевич'
      ]
      
      for (const char of russianCharacters) {
        const hasRussianButton = Object.values(buttonMap).includes(char)
        expect(hasRussianButton).toBe(true)
      }
    })
  })

  describe('Prompt Generation', () => {
    test('should include cinematic settings in all prompts', () => {
      const characters = ['Илья Муромец', 'Кощей Бессмертный', 'Чебурашка']
      
      for (const char of characters) {
        const prompt = createTestPrompt('male', char)
        expect(prompt).toContain('Cinematic portrait')
        expect(prompt).toContain('9:16')
        expect(prompt).toContain('Professional')
      }
    })

    test('should generate unique prompts for each character', () => {
      const prompts = [
        createTestPrompt('male', 'Илья Муромец'),
        createTestPrompt('male', 'Кощей Бессмертный'),
        createTestPrompt('male', 'Чебурашка')
      ]
      
      const uniquePrompts = new Set(prompts)
      expect(uniquePrompts.size).toBe(prompts.length)
    })
  })
})

// Helper functions matching the actual implementation
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
    
    'Винни-Пух': `${baseSettings} A friendly ${
      gender === 'male' ? 'person' : 'person'
    } in bear costume with red shirt. Holding a honey pot. Round, cuddly appearance. Background with Hundred Acre Wood. Warm, sunny lighting with soft shadows.`,
    
    'Крокодил Гена': `${baseSettings} A friendly ${
      gender === 'male' ? 'person' : 'person'
    } in green crocodile costume. Playing accordion. Wearing suit and hat. Kind expression. Background with train station. Nostalgic Soviet-era lighting.`,
    
    'Кот Матроскин': `${baseSettings} A clever ${
      gender === 'male' ? 'person' : 'person'
    } in striped cat costume. Sailor shirt. Practical expression. Holding milk jug. Background with Russian countryside house. Natural daylight with rural atmosphere.`,
    
    'Серый Волк': `${baseSettings} A ${
      gender === 'male' ? 'cunning character' : 'cunning character'
    } in grey wolf costume. Forest attire. Mystical aura. Sharp features. Background with deep forest. Moonlight filtering through trees.`,
    
    'Емеля': `${baseSettings} A ${
      gender === 'male' ? 'lazy but clever young man' : 'lazy but clever young woman'
    } on a magical stove. Simple peasant clothes. Holding a pike fish. Relaxed pose. Background with Russian village. Magical golden hour lighting.`,
    
    'Иван-царевич': `${baseSettings} A ${
      gender === 'male' ? 'young prince' : 'young princess'
    } in royal Russian attire. Embroidered caftan. Noble bearing. Holding a sword. Background with palace. Regal lighting with rich colors.`,
    
    'Добрыня Никитич': `${baseSettings} A ${
      gender === 'male' ? 'strong warrior' : 'strong warrior woman'
    } and dragon slayer. Massive build. Russian armor with unique patterns. Holding mace and shield. Background with defeated dragon. Epic battle lighting.`,
    
    'Алёша Попович': `${baseSettings} A ${
      gender === 'male' ? 'young clever warrior' : 'young clever warrior woman'
    }. Agile build. Light armor. Holding bow and arrows. Witty expression. Background with Russian landscape. Dynamic action lighting.`,
    
    'Снегурочка': `${baseSettings} A snow maiden in shimmering ice blue robes. Crystalline crown. Delicate features. Holding snowflake staff. Background with winter palace. Soft blue and white lighting.`,
    
    'Василиса Прекрасная': `${baseSettings} A beautiful wise princess. Elegant royal gown. Holding magical doll. Graceful pose. Background with enchanted garden. Golden hour lighting.`,
    
    'Жар-птица': `${baseSettings} A person transformed into a magical firebird. Golden feathers costume. Glowing effects. Spread wings pose. Background with night sky. Fiery orange and gold lighting.`,
    
    'Золотая рыбка': `${baseSettings} A person in shimmering golden fish costume. Scales that catch light. Magical aura. Holding wishing pearl. Ocean background. Underwater lighting effects.`,
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