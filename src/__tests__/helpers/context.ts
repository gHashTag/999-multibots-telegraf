import { vi } from 'vitest'
import type { MyContext } from '@/interfaces/context.interface'
import type { User, Chat, Message, Update } from 'telegraf/types'

// Default mock user and chat
const defaultUser: User = {
  id: 123456789,
  is_bot: false,
  first_name: 'Test',
  last_name: 'User',
  username: 'testuser',
  language_code: 'en',
}

const defaultChat: Chat.PrivateChat = {
  id: 123456789,
  type: 'private',
  first_name: 'Test',
  last_name: 'User',
  username: 'testuser',
}

/**
 * Creates a mock Telegraf context (`MyContext`) for testing.
 *
 * @param overrides - Partial context object to override default values.
 * @param initialSession - Initial value for ctx.session.
 * @param initialSceneState - Initial value for ctx.scene.state.
 * @returns A mock context object.
 */
export const createMockContext = (
  overrides: Partial<MyContext> = {},
  initialSession: any = {},
  initialSceneState: any = {}
): MyContext => {
  const baseContext: Partial<MyContext> = {
    // Core properties
    from: defaultUser,
    chat: defaultChat,
    message: {
      message_id: 1,
      chat: defaultChat,
      from: defaultUser,
      date: Math.floor(Date.now() / 1000),
      text: '/test',
    } as Message.TextMessage,
    // Basic Update object
    update: { update_id: 1 } as Update,
    // Mock common methods
    reply: vi.fn().mockResolvedValue(true),
    replyWithHTML: vi.fn().mockResolvedValue(true),
    replyWithMarkdown: vi.fn().mockResolvedValue(true),
    replyWithPhoto: vi.fn().mockResolvedValue(true),
    editMessageText: vi.fn().mockResolvedValue(true),
    editMessageReplyMarkup: vi.fn().mockResolvedValue(true),
    deleteMessage: vi.fn().mockResolvedValue(true),
    answerCbQuery: vi.fn().mockResolvedValue(true),
    // Session and scene state management
    session: initialSession,
    scene: {
      enter: vi.fn().mockResolvedValue(undefined),
      leave: vi.fn().mockResolvedValue(undefined),
      reenter: vi.fn().mockResolvedValue(undefined),
      state: initialSceneState,
      session: {
        current: undefined,
        state: initialSceneState,
        __scenes: {},
      },
    },
    // Add other commonly used properties/methods as needed
    // state: {},
    // telegram: {} // Mock telegram API object if needed
  }

  // Merge base context with overrides
  const mockContext = { ...baseContext, ...overrides } as MyContext

  // Ensure scene session state reflects initialSceneState
  if (mockContext.scene && mockContext.scene.session) {
    mockContext.scene.session.state = initialSceneState
  }

  return mockContext
}
