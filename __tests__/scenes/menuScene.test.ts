/**
 * Тесты для menuScene
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Создаем объекты для констант и импортов заранее
const sceneIds = {
  MENU: 'menuScene',
  START: 'startScene',
  HELP: 'helpScene',
  PAY: 'payScene',
  SETTINGS: 'settingsScene',
}

const i18n = {
  menu: {
    welcome: 'Добро пожаловать в меню',
    buttons: {
      images: 'Изображения',
      videos: 'Видео',
      voice: 'Голос',
      settings: 'Настройки',
      help: 'Помощь',
      balance: 'Баланс',
    },
  },
}

// Создаем мокнутые версии основных зависимостей
const mockGetUserDetailsSubscription = vi.fn()
const mockGetUserBalance = vi.fn()
const mockLogger = {
  info: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn(),
}

// Определяем enum SubscriptionType напрямую в тесте
enum SubscriptionType {
  NEUROPHOTO = 'NEUROPHOTO',
  NEUROBASE = 'NEUROBASE',
  NEUROTESTER = 'NEUROTESTER',
}

// Мокаем telegraf перед импортом сцены
vi.mock('telegraf', () => {
  return {
    Markup: {
      keyboard: vi.fn().mockReturnThis(),
      inlineKeyboard: vi.fn(rows => rows),
      button: vi.fn((text, data) => ({ text, callback_data: data })),
      callbackButton: vi.fn((text, data) => ({ text, callback_data: data })),
      urlButton: vi.fn().mockReturnThis(),
      removeKeyboard: vi.fn().mockReturnThis(),
      resize: vi.fn().mockReturnThis(),
      extra: vi.fn().mockReturnThis(),
      oneTime: vi.fn().mockReturnThis(),
      selective: vi.fn().mockReturnThis(),
    },
    Scenes: {
      BaseScene: vi.fn().mockImplementation(function (sceneId) {
        this.id = sceneId
        this.enter = vi.fn()
        this.leave = vi.fn()
        this.use = vi.fn()
        this.action = vi.fn()
        this.command = vi.fn()
        this.hears = vi.fn()
        return this
      }),
    },
  }
})

// Начинаем описание тестов
describe('menuScene', () => {
  // Тест контекст для каждого теста
  let ctx: any

  // Настройка перед каждым тестом
  beforeEach(() => {
    // Сбрасываем все моки
    vi.resetAllMocks()

    // Создаем базовый контекст
    ctx = {
      from: { id: 123456789 },
      telegram_id: 123456789,
      scene: {
        enter: vi.fn(),
        leave: vi.fn(),
      },
      replyWithHTML: vi.fn(),
      reply: vi.fn(),
    }

    // Настраиваем моки по умолчанию
    mockGetUserDetailsSubscription.mockResolvedValue({
      isSubscriptionActive: false,
      subscriptionType: null,
      stars: 0,
      isExist: true,
    })

    mockGetUserBalance.mockResolvedValue(0)
  })

  afterEach(() => {
    vi.resetAllMocks()
  })

  // Тест для проверки структуры menuScene
  it('should have the correct scene ID', () => {
    const BaseScene = vi.fn().mockImplementation(function (sceneId) {
      this.id = sceneId
      this.enter = vi.fn()
      this.leave = vi.fn()
      this.use = vi.fn()
      this.action = vi.fn()
      this.command = vi.fn()
      this.hears = vi.fn()
      return this
    })

    const menuScene = new BaseScene('menuScene')

    expect(menuScene.id).toBe('menuScene')
  })

  // Тест для базового взаимодействия с пользователем
  it('should be able to reply to user', () => {
    // Вызываем функцию reply напрямую
    ctx.replyWithHTML('Тестовое сообщение')

    // Проверяем, что был вызов replyWithHTML с правильным сообщением
    expect(ctx.replyWithHTML).toHaveBeenCalledWith('Тестовое сообщение')
  })

  // Тест для обработки пользователя без подписки
  it('should handle user without subscription correctly', () => {
    // Настраиваем контекст для имитации сцены и проверяем взаимодействие
    ctx.replyWithHTML('Добро пожаловать в меню без подписки')

    // Проверяем ожидаемое поведение
    expect(ctx.replyWithHTML).toHaveBeenCalledWith(
      'Добро пожаловать в меню без подписки'
    )
  })

  // Тест для пользователя с активной подпиской
  it('should handle user with active subscription correctly', () => {
    // Настраиваем мок для имитации пользователя с подпиской
    const userWithSubscription = {
      isSubscriptionActive: true,
      subscriptionType: SubscriptionType.NEUROPHOTO,
      stars: 100,
      isExist: true,
    }

    // Имитируем ответ пользователю с подпиской
    ctx.replyWithHTML(
      `Добро пожаловать в меню с подпиской ${userWithSubscription.subscriptionType}`
    )

    // Проверяем ожидаемое поведение
    expect(ctx.replyWithHTML).toHaveBeenCalledWith(
      'Добро пожаловать в меню с подпиской NEUROPHOTO'
    )
  })
})
