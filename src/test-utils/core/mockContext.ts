import { TestContext, TestSession } from './TelegramSceneTester'
import { Scenes } from 'telegraf'
import { Update } from 'telegraf/typings/core/types/typegram'

export interface CreateMockContextParams {
  session?: Partial<TestSession>
  scene?: Scenes.SceneContextScene<TestContext, TestSession>
  wizard?: Scenes.WizardContextWizard<TestContext>
  attempts?: number
  amount?: number
  user?: {
    id: number
    username: string
  }
}

export function createMockContext(
  params: CreateMockContextParams = {}
): TestContext {
  const {
    session = {},
    scene,
    wizard,
    attempts = 0,
    amount = 0,
    user = { id: 123456789, username: 'test_user' },
  } = params

  const baseContext: TestContext = {
    update: {} as Update,
    telegram: {
      sendMessage: async () => ({}) as any,
      deleteMessage: async () => true as any,
      editMessageText: async () => ({}) as any,
      editMessageReplyMarkup: async () => ({}) as any,
    } as any,
    session: {
      ...session,
      __scenes: {},
    } as TestSession,
    scene,
    wizard,
    attempts,
    amount,
    user,
    state: {},
    botInfo: {} as any,
  }

  return baseContext
}
