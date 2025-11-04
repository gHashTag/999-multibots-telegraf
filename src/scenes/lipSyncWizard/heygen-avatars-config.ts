/**
 * 🎬 HEYGEN AVATARS CONFIGURATION
 *
 * Конфигурация аватаров HeyGen для двух владельцев:
 * - Cocoage: 8 аватаров
 * - Haim: 11 аватаров
 */

export interface HeyGenAvatarSet {
  name: string
  apiKey: string
  voiceId: string // Дефолтный voice_id для этого набора аватаров
  avatars: HeyGenAvatar[]
}

export interface HeyGenAvatar {
  id: string
  name: string
  emoji: string
}

/**
 * Аватары Cocoage
 */
export const COCOAGE_AVATARS: HeyGenAvatar[] = [
  { id: '4c34500dc5af419c9809a104874b9466', name: 'Avatar 1', emoji: '👤' },
  { id: '27c6cbedfd2b47d5b55b27419739a267', name: 'Avatar 2', emoji: '👥' },
  { id: 'e8f8c980d9234f9c8f352180e950ecbf', name: 'Avatar 3', emoji: '🎭' },
  { id: '3d35833e81604bd69614da73779ddc0a', name: 'Avatar 4', emoji: '🎪' },
  { id: 'b150fbefd4984f75a6f48551bebd0ce7', name: 'Avatar 5', emoji: '🎬' },
  { id: '11664679d7b24560b51ba88b12b5d3c3', name: 'Avatar 6', emoji: '🎨' },
  { id: '94078296b04d494c9cd84f453dacc8c9', name: 'Avatar 7', emoji: '🎯' },
  { id: '04973f5fb5c14d078e8fe7ddee8b1705', name: 'Avatar 8', emoji: '🎲' },
]

/**
 * Аватары Haim
 */
export const HAIM_AVATARS: HeyGenAvatar[] = [
  { id: 'bf56d364324b47d791717fb1ab772f74', name: 'Avatar 1', emoji: '👤' },
  { id: 'e043a4dbe1724fd6bb6f8ec2e604dd1c', name: 'Avatar 2', emoji: '👥' },
  { id: '00bde1e30acd4de98fa870ab827209db', name: 'Avatar 3', emoji: '🎭' },
  { id: '1a9ab725dc974662afaa0e23347373b7', name: 'Avatar 4', emoji: '🎪' },
  { id: '2012999ab5d0428da44a54025bdd1580', name: 'Avatar 5', emoji: '🎬' },
  { id: 'e11c19e3e1d04d3e82b3bf2263c9684c', name: 'Avatar 6', emoji: '🎨' },
  { id: 'c61aedd2173c4c26a67af0ce6f8feb74', name: 'Avatar 7', emoji: '🎯' },
  { id: '6cb5aa7a0d574f6b8a4d802f41eb72e1', name: 'Avatar 8', emoji: '🎲' },
  { id: '24bb390a51c34a01b3a64a1906a02b45', name: 'Avatar 9', emoji: '🎰' },
  { id: 'c244b5c053094c39a7207d99ceffd558', name: 'Avatar 10', emoji: '🎻' },
  { id: 'c2251854fceb46319262660cde417d94', name: 'Avatar 11', emoji: '🎺' },
]

/**
 * Наборы аватаров с API ключами и voice_id
 */
/**
 * ✅ БЕЗОПАСНО: API ключи читаются из переменных окружения (.env)
 * Добавьте в .env файл:
 * HEYGEN_COCOAGE_API_KEY=YOUR_HEYGEN_API_KEY_HERE
 * HEYGEN_HAIM_API_KEY=YOUR_HEYGEN_API_KEY_HERE
 */
export const HEYGEN_AVATAR_SETS: Record<string, HeyGenAvatarSet> = {
  cocoage: {
    name: 'Cocoage',
    apiKey: process.env.HEYGEN_COCOAGE_API_KEY || '',
    voiceId:
      process.env.HEYGEN_COCOAGE_VOICE_ID ||
      '2b2e1f15157b454487f1250ffe586d7a', // Голос Дианы "Вау" для Cocoage
    avatars: COCOAGE_AVATARS,
  },
  haim: {
    name: 'Haim',
    apiKey: process.env.HEYGEN_HAIM_API_KEY || '',
    voiceId:
      process.env.HEYGEN_HAIM_VOICE_ID || 'dc9cd149b0d741d6934a1d95e3f3ef00', // Голос для Haim
    avatars: HAIM_AVATARS,
  },
}

/**
 * Получить voice_id для конкретного аватара
 * Каждый набор (Cocoage/Haim) имеет свой voice_id
 */
export function getVoiceIdForAvatar(avatarId: string): string | null {
  for (const set of Object.values(HEYGEN_AVATAR_SETS)) {
    const avatar = set.avatars.find(a => a.id === avatarId)
    if (avatar) {
      return set.voiceId
    }
  }
  return null
}

/**
 * Получить набор аватаров по имени владельца
 */
export function getAvatarSet(setName: string): HeyGenAvatarSet | null {
  return HEYGEN_AVATAR_SETS[setName.toLowerCase()] || null
}

/**
 * Получить аватар по ID из всех наборов
 */
export function findAvatarById(
  avatarId: string
): { avatar: HeyGenAvatar; setName: string; apiKey: string } | null {
  for (const [setName, set] of Object.entries(HEYGEN_AVATAR_SETS)) {
    const avatar = set.avatars.find(a => a.id === avatarId)
    if (avatar) {
      return { avatar, setName: set.name, apiKey: set.apiKey }
    }
  }
  return null
}
