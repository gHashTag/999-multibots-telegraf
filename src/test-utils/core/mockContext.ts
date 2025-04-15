import { Context, NarrowedContext } from 'telegraf';
import { Message, Update } from 'telegraf/typings/core/types/typegram';
import { SceneContextScene, WizardContextWizard, WizardSessionData } from 'telegraf/typings/scenes';
import { IMockFunction, mockFn } from './mockFunction';

// Глобальный мок для fetch
global.fetch = mockFn(async () => ({
  ok: true,
  json: async () => ({}),
})) as unknown as typeof fetch;

export interface MockContext extends Partial<Context> {
  reply: IMockFunction<(text: string, extra?: any) => Promise<Message.TextMessage>>;
  editMessageText: IMockFunction<(text: string, extra?: any) => Promise<Message.TextMessage & { edit_date: number } | true>>;
  scene: Partial<SceneContextScene<any>> & {
    enter: IMockFunction<(sceneId: string, state?: any) => Promise<unknown>>;
    reenter: IMockFunction<() => Promise<unknown>>;
    leave: IMockFunction<() => Promise<void>>;
  };
  wizard: Partial<WizardContextWizard<any>> & {
    next: IMockFunction<() => WizardContextWizard<any>>;
    back: IMockFunction<() => WizardContextWizard<any>>;
    selectStep: IMockFunction<(step: number) => WizardContextWizard<any>>;
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
    reply: mockFn(async (text: string, extra?: any) => ({
      message_id: 1,
      date: new Date().getTime(),
      text,
      chat: { id: 1, type: 'private' },
    } as Message.TextMessage)),
    
    editMessageText: mockFn(async (text: string, extra?: any) => {
      if (Math.random() > 0.5) return true;
      return {
        message_id: 1,
        date: new Date().getTime(),
        edit_date: new Date().getTime(),
        text,
        chat: { id: 1, type: 'private' },
      } as Message.TextMessage & { edit_date: number };
    }),
    
    scene: {
      enter: mockFn(async (sceneId: string, state?: any) => Promise.resolve(undefined as unknown)),
      reenter: mockFn(async () => Promise.resolve(undefined as unknown)),
      leave: mockFn(async () => Promise.resolve()),
    },
    
    wizard: {
      next: mockFn(() => ({} as WizardContextWizard<any>)),
      back: mockFn(() => ({} as WizardContextWizard<any>)),
      selectStep: mockFn((step: number) => ({} as WizardContextWizard<any>)),
    },
    
    session: {
      cursor: 0,
      __scenes: {},
      __wizard: {
        cursor: 0,
        state: {},
      },
    },
  };

  return {
    ...defaultContext,
    ...overrides,
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