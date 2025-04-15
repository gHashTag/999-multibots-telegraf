import { Context } from 'telegraf';
import { MyContext } from '../../types/context';

export const createMockContext = (overrides: Partial<MyContext> = {}): MyContext => {
  const defaultContext: Partial<MyContext> = {
    scene: {
      enter: jest.fn(),
      leave: jest.fn(),
      state: {},
    },
    session: {
      __scenes: {},
    },
    reply: jest.fn(),
    replyWithHTML: jest.fn(),
    replyWithMarkdown: jest.fn(),
    editMessageText: jest.fn(),
    deleteMessage: jest.fn(),
  };

  return {
    ...defaultContext,
    ...overrides,
  } as MyContext;
}; 