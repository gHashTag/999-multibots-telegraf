import { Context, NarrowedContext } from 'telegraf';
import { Message, Update, Chat } from 'telegraf/typings/core/types/typegram';
import { SceneContextScene, WizardContext, WizardSessionData } from 'telegraf/typings/scenes';
import { IMockFunction, mockFn } from './mockFunction';

// Создаем базовый тип для чата
const defaultChat: Chat.PrivateChat = {
  id: 1,
  type: 'private',
  first_name: 'Test User'
};

// Глобальный мок для fetch
global.fetch = mockFn<typeof fetch>().mockImplementation(async () => ({
  ok: true,
  status: 200,
  statusText: 'OK',
  headers: new Headers(),
  body: null,
  bodyUsed: false,
  type: 'default',
  url: '',
  redirected: false,
  json: async () => ({})
} as Response));

export interface MockContext extends Partial<Context> {
  reply: IMockFunction<(text: string, extra?: any) => Promise<Message.TextMessage>>;
  editMessageText: IMockFunction<(text: string, extra?: any) => Promise<Message.TextMessage & { edit_date: number } | true>>;
  scene: Partial<SceneContextScene<any>> & {
    enter: IMockFunction<(sceneId: string, state?: any) => Promise<unknown>>;
    reenter: IMockFunction<() => Promise<unknown>>;
    leave: IMockFunction<() => Promise<void>>;
  };
  wizard: Partial<WizardContext> & {
    next: IMockFunction<() => WizardContext>;
    back: IMockFunction<() => WizardContext>;
    selectStep: IMockFunction<(step: number) => WizardContext>;
  };
  session: WizardSessionData & {
    [key: string]: any;
    __scenes: Record<string, any>;
    __wizard: {
      cursor: number;
      state: Record<string, any>;
    };
  };
}

/**
 * Создает мок-контекст для тестирования сцен Telegraf
 */
export function createMockContext(
  overrides: Partial<MockContext> = {}
): MockContext {
  const defaultContext: MockContext = {
    reply: mockFn<(text: string, extra?: any) => Promise<Message.TextMessage>>()
      .mockImplementation(async (text: string) => ({
        message_id: 1,
        date: new Date().getTime(),
        text,
        chat: defaultChat
      })),
    
    editMessageText: mockFn<(text: string, extra?: any) => Promise<Message.TextMessage & { edit_date: number } | true>>()
      .mockImplementation(async (text: string) => {
        if (Math.random() > 0.5) return true;
        return {
          message_id: 1,
          date: new Date().getTime(),
          edit_date: new Date().getTime(),
          text,
          chat: defaultChat
        };
      }),
    
    scene: {
      enter: mockFn<(sceneId: string, state?: any) => Promise<unknown>>()
        .mockImplementation(async () => Promise.resolve(undefined)),
      reenter: mockFn<() => Promise<unknown>>()
        .mockImplementation(async () => Promise.resolve(undefined)),
      leave: mockFn<() => Promise<void>>()
        .mockImplementation(async () => Promise.resolve())
    },
    
    wizard: {
      next: mockFn<() => WizardContext>()
        .mockImplementation(() => ({} as WizardContext)),
      back: mockFn<() => WizardContext>()
        .mockImplementation(() => ({} as WizardContext)),
      selectStep: mockFn<(step: number) => WizardContext>()
        .mockImplementation(() => ({} as WizardContext))
    },
    
    session: {
      cursor: 0,
      __scenes: {},
      __wizard: {
        cursor: 0,
        state: {}
      }
    }
  };

  return {
    ...defaultContext,
    ...overrides
  };
}

/**
 * Создает мок-контекст для тестирования визардов
 */
export function createMockWizardContext<T extends Record<string, any>>(
  sessionData: T = {} as T,
  overrides: Partial<MockContext> = {}
): MockContext & { session: T & WizardSessionData } {
  const context = createMockContext(overrides) as MockContext & {
    session: T & WizardSessionData;
  };
  
  context.session = {
    ...context.session,
    ...sessionData,
  };

  return context;
}

export default {
  createMockContext,
  createMockWizardContext,
}; 