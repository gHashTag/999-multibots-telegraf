import type { MyContext } from '@/interfaces/context.interface'
import type { User } from 'telegraf/types'

// Define a default mock user
const mockUser: User = {
  id: 123456789,
  is_bot: false,
  first_name: 'Test',
  last_name: 'User',
  username: 'testuser',
  language_code: 'en',
}

// Function to create a mock context, allowing overrides
export const createMockContext = (
  overrides: Partial<MyContext> = {}
): MyContext => {
  // Default mock context structure
  const defaultContext: Partial<MyContext> = {
    from: mockUser,
    chat: {
      id: 987654321,
      type: 'private',
      first_name: 'Test',
      last_name: 'User',
      username: 'testuser',
    },
    message: {
      message_id: 1,
      date: Math.floor(Date.now() / 1000),
      chat: {
        id: 987654321,
        type: 'private',
        first_name: 'Test',
        last_name: 'User',
        username: 'testuser',
      },
      from: mockUser,
      text: '/start',
    },
    scene: {
      enter: vi.fn(),
      leave: vi.fn(),
      reenter: vi.fn(),
      state: {},
      current: undefined,
      session: {
        __scenes: {},
      },
    },
    reply: vi.fn(),
    telegram: {
      sendMessage: vi.fn(),
      // Add other telegram methods if needed
    },
    // Add other context properties and methods as needed
    // Ensure all properties expected by the code under test are present
    i18n: {
      t: (key: string, args?: any) =>
        `t:${key}` + (args ? JSON.stringify(args) : ''), // Simple mock translation
      locale: (lang?: string) => (lang ? lang : 'en'),
      getResource: vi.fn(),
      getResourceBundle: vi.fn(),
      hasResourceBundle: vi.fn(),
      addResource: vi.fn(),
      addResourceBundle: vi.fn(),
      addResources: vi.fn(),
      removeResourceBundle: vi.fn(),
    },
  }

  // Merge defaults with overrides
  // Need a deep merge potentially, but for simple mocks, shallow is often ok
  return {
    ...defaultContext,
    ...overrides,
    // Ensure nested objects like 'scene' are also merged if overridden
    scene: {
      ...defaultContext.scene,
      ...(overrides.scene || {}),
      session: {
        ...defaultContext.scene?.session,
        ...(overrides.scene?.session || {}),
        __scenes: {
          ...defaultContext.scene?.session?.__scenes,
          ...(overrides.scene?.session?.__scenes || {}),
        },
      },
    },
    // Merge other nested objects similarly if necessary
    from: { ...defaultContext.from, ...(overrides.from || {}) },
    chat: { ...defaultContext.chat, ...(overrides.chat || {}) },
    message: { ...defaultContext.message, ...(overrides.message || {}) },
    i18n: { ...defaultContext.i18n, ...(overrides.i18n || {}) },
  } as MyContext
}
