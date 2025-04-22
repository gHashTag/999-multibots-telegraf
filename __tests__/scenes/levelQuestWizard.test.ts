/**
 * Tests for levelQuestWizard scenes: step0Scene and completeScene
 */
import makeMockContext from '../utils/mockTelegrafContext'
import {
  step0Scene,
  completeScene,
} from '../../src/scenes/levelQuestWizard/index'
import { MyContext } from '@/interfaces'
import { Composer } from 'telegraf'

// Mock dependencies
jest.mock('../../src/scenes/levelQuestWizard/handlers', () => ({
  handleQuestRules: jest.fn(),
  handleQuestComplete: jest.fn(),
}))
jest.mock('@/helpers', () => ({ isRussian: jest.fn() }))

import {
  handleQuestRules,
  handleQuestComplete,
} from '../../src/scenes/levelQuestWizard/handlers'
import { isRussian } from '@/helpers'

describe('levelQuestWizard - step0Scene', () => {
  let ctx: MyContext
  const step0Middleware = step0Scene.middleware()
  const next = jest.fn()

  beforeEach(() => {
    jest.clearAllMocks()
    next.mockClear()
  })

  it('enter: calls handler and replies with continue prompt', async () => {
    ctx = makeMockContext({
      update_id: 1,
      message: {
        from: { id: 1, language_code: 'ru', is_bot: false, first_name: 'Test' },
        chat: { id: 1, type: 'private', first_name: 'Test' },
        date: 0,
        message_id: 1,
      },
    })
    ;(isRussian as jest.Mock).mockReturnValueOnce(true)
    await step0Middleware(ctx, next)
    expect(handleQuestRules).toHaveBeenCalledWith(ctx)
    expect(ctx.reply).toHaveBeenCalledWith(
      'Нажмите "➡️ Далее шаг 1", чтобы продолжить.',
      expect.objectContaining({ reply_markup: expect.any(Object) })
    )
  })

  it('hears nextStep navigates to step1', async () => {
    const messageText = '➡️ Далее шаг 1'
    ctx = makeMockContext({
      update_id: 2,
      message: {
        text: messageText,
        from: { id: 1, language_code: 'ru', is_bot: false, first_name: 'Test' },
        chat: { id: 1, type: 'private', first_name: 'Test' },
        date: 0,
        message_id: 2,
      },
    })
    await step0Middleware(ctx, next)
    expect(ctx.scene.enter).toHaveBeenCalledWith('step1')
  })
})

describe('levelQuestWizard - completeScene', () => {
  let ctx: MyContext
  const completeMiddleware = completeScene.middleware()
  const next = jest.fn()

  beforeEach(() => {
    jest.clearAllMocks()
    next.mockClear()
    ctx = makeMockContext()
  })

  it('enter: calls complete handler and enters menuScene', async () => {
    await completeMiddleware(ctx, next)
    expect(handleQuestComplete).toHaveBeenCalledWith(ctx)
    expect(ctx.scene.enter).toHaveBeenCalledWith('menuScene')
  })
})
