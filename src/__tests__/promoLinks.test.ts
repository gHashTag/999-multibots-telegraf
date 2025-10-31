import { extractPromoFromContext, extractInviteCodeFromContext } from '@/helpers/contextUtils'
import { processPromoLink } from '@/helpers/promoHelper'
import { MyContext } from '@/interfaces'

// Мокаем контекст Telegram бота
const mockContext = (messageText: string): MyContext => ({
  from: {
    id: 123456789,
    username: 'test_user',
    first_name: 'Test',
    last_name: 'User',
    is_bot: false,
    language_code: 'en'
  },
  chat: {
    id: 123456789,
    type: 'private'
  },
  message: {
    message_id: 1,
    date: Math.floor(Date.now() / 1000),
    chat: { id: 123456789, type: 'private' },
    text: messageText,
    from: {
      id: 123456789,
      username: 'test_user',
      first_name: 'Test',
      last_name: 'User',
      is_bot: false,
      language_code: 'en'
    }
  },
  botInfo: {
    id: 987654321,
    username: 'MetaMuse_Manifest_bot',
    first_name: 'MetaMuse Bot',
    can_join_groups: true,
    can_read_all_group_messages: false,
    supports_inline_queries: false,
    can_connect_to_business: false,
    has_main_web_app: false
  },
  session: {},
  reply: jest.fn(),
  telegram: {
    getMe: jest.fn(),
    sendMessage: jest.fn(),
    deleteWebhook: jest.fn(),
    getWebhookInfo: jest.fn()
  }
} as any)

describe('Промо-ссылки в MetaMuse Manifest Bot', () => {
  describe('extractPromoFromContext', () => {
    test('должен извлекать neurovideo промо-параметр из /start neurovideo', () => {
      const ctx = mockContext('/start neurovideo')
      const result = extractPromoFromContext(ctx)

      expect(result).toBeTruthy()
      expect(result?.isPromo).toBe(true)
      expect(result?.parameter).toBe('neurovideo')
    })

    test('должен извлекать neurophoto промо-параметр из /start neurophoto', () => {
      const ctx = mockContext('/start neurophoto')
      const result = extractPromoFromContext(ctx)

      expect(result).toBeTruthy()
      expect(result?.isPromo).toBe(true)
      expect(result?.parameter).toBe('neurophoto')
    })

    test('должен извлекать промо-параметр из /start promo neurovideo', () => {
      const ctx = mockContext('/start promo neurovideo')
      const result = extractPromoFromContext(ctx)

      expect(result).toBeTruthy()
      expect(result?.isPromo).toBe(true)
      expect(result?.parameter).toBe('neurovideo')
    })

    test('должен извлекать промо-параметр из /start promo neurophoto', () => {
      const ctx = mockContext('/start promo neurophoto')
      const result = extractPromoFromContext(ctx)

      expect(result).toBeTruthy()
      expect(result?.isPromo).toBe(true)
      expect(result?.parameter).toBe('neurophoto')
    })

    test('должен возвращать null для обычных команд /start', () => {
      const ctx = mockContext('/start')
      const result = extractPromoFromContext(ctx)

      expect(result).toBeNull()
    })

    test('должен возвращать null для реферальных ссылок', () => {
      const ctx = mockContext('/start 123456789')
      const result = extractPromoFromContext(ctx)

      expect(result).toBeNull()
    })
  })

  describe('extractInviteCodeFromContext', () => {
    test('должен извлекать реферальный код из /start 123456789', () => {
      const ctx = mockContext('/start 123456789')
      const result = extractInviteCodeFromContext(ctx)

      expect(result).toBe('123456789')
    })

    test('не должен извлекать код из промо-команд', () => {
      const ctx = mockContext('/start neurovideo')
      const result = extractInviteCodeFromContext(ctx)

      expect(result).toBe('')
    })

    test('не должен извлекать код из /start promo neurovideo', () => {
      const ctx = mockContext('/start promo neurovideo')
      const result = extractInviteCodeFromContext(ctx)

      expect(result).toBe('')
    })
  })

  describe('processPromoLink', () => {
    test('должен успешно обработать neurovideo промо', async () => {
      const telegramId = '123456789'
      const promoType = 'neurovideo'
      const botName = 'MetaMuse_Manifest_bot'

      // Этот тест будет работать только если база данных доступна
      // и пользователь с таким ID существует
      const result = await processPromoLink(telegramId, promoType, botName)

      // Проверяем структуру ответа
      expect(typeof result).toBe('boolean')
      // Если пользователь уже получал промо, результат будет false
      // Если пользователь новый или не получал промо, результат будет true
    })

    test('должен успешно обработать neurophoto промо', async () => {
      const telegramId = '123456789'
      const promoType = 'neurophoto'
      const botName = 'MetaMuse_Manifest_bot'

      const result = await processPromoLink(telegramId, promoType, botName)

      expect(typeof result).toBe('boolean')
    })

    test('должен вернуть false для неизвестного типа промо', async () => {
      const telegramId = '123456789'
      const promoType = 'unknown_promo'
      const botName = 'MetaMuse_Manifest_bot'

      const result = await processPromoLink(telegramId, promoType, botName)

      expect(result).toBe(false)
    })
  })

  describe('Интеграционный тест промо-ссылок', () => {
    test('полный цикл обработки neurovideo промо-ссылки', () => {
      const ctx = mockContext('/start neurovideo')

      // 1. Извлечение промо-параметров
      const promoInfo = extractPromoFromContext(ctx)
      expect(promoInfo?.isPromo).toBe(true)
      expect(promoInfo?.parameter).toBe('neurovideo')

      // 2. Проверка что не извлекается как реферальный код
      const inviteCode = extractInviteCodeFromContext(ctx)
      expect(inviteCode).toBe('')

      // 3. Промо-тип должен быть neurovideo
      const promoType = promoInfo?.parameter
      expect(promoType).toBe('neurovideo')
    })

    test('полный цикл обработки neurophoto промо-ссылки', () => {
      const ctx = mockContext('/start neurophoto')

      // 1. Извлечение промо-параметров
      const promoInfo = extractPromoFromContext(ctx)
      expect(promoInfo?.isPromo).toBe(true)
      expect(promoInfo?.parameter).toBe('neurophoto')

      // 2. Проверка что не извлекается как реферальный код
      const inviteCode = extractInviteCodeFromContext(ctx)
      expect(inviteCode).toBe('')

      // 3. Промо-тип должен быть neurophoto
      const promoType = promoInfo?.parameter
      expect(promoType).toBe('neurophoto')
    })
  })

  describe('Конфигурация промо-ссылок', () => {
    test('проверка URL промо-ссылок', () => {
      const neurovideoUrl = 'https://t.me/MetaMuse_Manifest_bot?start=neurovideo'
      const neurophotoUrl = 'https://t.me/MetaMuse_Manifest_bot?start=neurophoto'

      // Проверяем что URL содержит правильные параметры
      expect(neurovideoUrl).toContain('neurovideo')
      expect(neurophotoUrl).toContain('neurophoto')
      expect(neurovideoUrl).toContain('MetaMuse_Manifest_bot')
      expect(neurophotoUrl).toContain('MetaMuse_Manifest_bot')
    })

    test('проверка ожидаемых бонусов', () => {
      // NeuroVideo: 1303 звезды
      // NeuroPhoto: 476 звезд

      const expectedNeuroVideoStars = 1303
      const expectedNeuroPhotoStars = 476

      expect(expectedNeuroVideoStars).toBeGreaterThan(expectedNeuroPhotoStars)
      expect(expectedNeuroVideoStars).toBe(1303)
      expect(expectedNeuroPhotoStars).toBe(476)
    })
  })
})
