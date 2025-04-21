// Объявления моков ПЕРЕД импортами
const mockGetUserDetails = jest.fn()
const mockCreateUser = jest.fn()
const mockGetReferalsCountAndUserData = jest.fn()
const mockSendMessage = jest.fn()
const mockReply = jest.fn()
const mockSceneEnter = jest.fn()

import { Scenes, Telegraf } from 'telegraf'
import { MyContext } from '@/interfaces'
import { handleStartCommand, stage } from '@/registerCommands'
import { ModeEnum } from '@/interfaces/modes'
import { defaultSession } from '@/store'

// Мокируем зависимости (теперь используют уже объявленные переменные)
jest.mock('@/core/supabase', () => ({
  getUserDetails: mockGetUserDetails,
  createUser: mockCreateUser,
  getReferalsCountAndUserData: mockGetReferalsCountAndUserData,
}))

jest.mock('@/helpers/contextUtils', () => ({
  extractInviteCodeFromContext: jest.fn(),
}))

// Мок контекста Telegraf
const createMockContext = (
  messageText: string,
  fromId: number,
  existingUser: boolean
): Partial<MyContext> => {
  const mockFrom = {
    id: fromId,
    is_bot: false,
    first_name: 'Test',
    username: 'testuser',
    language_code: 'en',
  }
  const mockChat = {
    id: fromId,
    type: 'private' as const,
    first_name: mockFrom.first_name,
    username: mockFrom.username,
  }
  const mockCtx: Partial<MyContext> = {
    from: mockFrom,
    message: {
      message_id: 1,
      date: Date.now(),
      chat: mockChat,
      text: messageText,
      from: mockFrom,
      entities: [{ type: 'bot_command', offset: 0, length: 6 }],
    },
    session: { ...defaultSession },
    scene: {
      enter: mockSceneEnter,
      leave: jest.fn(),
    } as any,
    reply: mockReply,
    telegram: {
      sendMessage: mockSendMessage,
    } as any,
    botInfo: { username: 'test_bot' } as any,
  }
  return mockCtx
}

describe('Registration Flow (/start command)', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    // Мокируем extractInviteCode по умолчанию
    require('@/helpers/contextUtils').extractInviteCodeFromContext.mockReturnValue(
      ''
    )
    // getUserDetails не нужен для теста самого handleStartCommand
  })

  test('should always enter StartScene for plain /start', async () => {
    const userId = 12345
    const mockCtx = createMockContext('/start', userId, false) as MyContext

    await handleStartCommand(mockCtx)

    // Проверяем главное: всегда вход в StartScene
    expect(mockSceneEnter).toHaveBeenCalledTimes(1)
    expect(mockSceneEnter).toHaveBeenCalledWith(ModeEnum.StartScene)
    // Проверяем, что код извлекался
    expect(
      require('@/helpers/contextUtils').extractInviteCodeFromContext
    ).toHaveBeenCalledWith(mockCtx)
    // Проверяем, что код не сохранился (т.к. не было)
    expect(mockCtx.session.inviteCode).toBeUndefined()
  })

  test('should save invite code and always enter StartScene for /start with code', async () => {
    const userId = 98765
    const inviteCode = 'testcode123'
    require('@/helpers/contextUtils').extractInviteCodeFromContext.mockReturnValueOnce(
      inviteCode
    )
    const mockCtx = createMockContext(
      `/start ${inviteCode}`,
      userId,
      false
    ) as MyContext

    await handleStartCommand(mockCtx)

    // Проверяем главное: всегда вход в StartScene
    expect(mockSceneEnter).toHaveBeenCalledTimes(1)
    expect(mockSceneEnter).toHaveBeenCalledWith(ModeEnum.StartScene)
    // Проверяем, что код извлекался
    expect(
      require('@/helpers/contextUtils').extractInviteCodeFromContext
    ).toHaveBeenCalledWith(mockCtx)
    // Проверяем, что код СОХРАНЕН
    expect(mockCtx.session.inviteCode).toBe(inviteCode)
  })

  test('should save invite code and always enter StartScene for deep link', async () => {
    const userId = 11223
    const inviteCode = '555666'
    const botUsername = 'test_bot'
    require('@/helpers/contextUtils').extractInviteCodeFromContext.mockReturnValueOnce(
      inviteCode
    )
    const mockCtx = createMockContext(
      `https://t.me/${botUsername}?start=${inviteCode}`,
      userId,
      false
    ) as MyContext

    await handleStartCommand(mockCtx)

    // Проверяем главное: всегда вход в StartScene
    expect(mockSceneEnter).toHaveBeenCalledTimes(1)
    expect(mockSceneEnter).toHaveBeenCalledWith(ModeEnum.StartScene)
    // Проверяем, что код извлекался
    expect(
      require('@/helpers/contextUtils').extractInviteCodeFromContext
    ).toHaveBeenCalledWith(mockCtx)
    // Проверяем, что код СОХРАНЕН
    expect(mockCtx.session.inviteCode).toBe(inviteCode)
  })
})
