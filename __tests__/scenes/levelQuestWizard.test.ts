/**
 * Tests for levelQuestWizard scenes: step0Scene and completeScene
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals'
import makeMockContext from '../utils/mockTelegrafContext'
import {
  step0Scene,
  completeScene,
} from '../../src/scenes/levelQuestWizard/index'

// Mock dependencies
jest.mock('../../src/scenes/levelQuestWizard/handlers', () => ({
  handleQuestRules: jest.fn(),
  handleQuestComplete: jest.fn(),
}))
jest.mock('@/helpers', () => ({ isRussian: jest.fn() }))

import { handleQuestRules, handleQuestComplete } from '../../src/scenes/levelQuestWizard/handlers'
import { isRussian } from '@/helpers'

describe('levelQuestWizard - step0Scene', () => {
  let ctx: ReturnType<typeof makeMockContext>
  beforeEach(() => {
    jest.clearAllMocks()
    ctx = makeMockContext()
    ctx.from.language_code = 'ru'
  })

  it('enter: calls handler and replies with continue prompt', async () => {
    ;(isRussian as jest.Mock).mockReturnValueOnce(true)
    // @ts-ignore
    await step0Scene.enterHandler(ctx)
    expect(handleQuestRules).toHaveBeenCalledWith(ctx)
    expect(ctx.reply).toHaveBeenCalledWith(
      'Нажмите "➡️ Далее шаг 1", чтобы продолжить.',
      expect.objectContaining({ reply_markup: expect.any(Object) })
    )
  })

  it('hears nextStep navigates to step1', async () => {
    // @ts-ignore
    const hear = step0Scene.middleware()
    await ctx.match('➡️ Далее шаг 1')
    // simulate hears
    // @ts-ignore
    await step0Scene.hearsHandlers[0][1](ctx)
    expect(ctx.scene.enter).toHaveBeenCalledWith('step1')
  })
})

describe('levelQuestWizard - completeScene', () => {
  let ctx: ReturnType<typeof makeMockContext>
  beforeEach(() => {
    jest.clearAllMocks()
    ctx = makeMockContext()
  })

  it('enter: calls complete handler and enters menuScene', async () => {
    // @ts-ignore
    await completeScene.enterHandler(ctx)
    expect(handleQuestComplete).toHaveBeenCalledWith(ctx)
    expect(ctx.scene.enter).toHaveBeenCalledWith('menuScene')
  })
})