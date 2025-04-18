/**
 * Tests for sizeWizard
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals'
import { sizeWizard } from '../../src/scenes/sizeWizard'
import makeMockContext from '../utils/mockTelegrafContext'

// Mock dependencies
jest.mock('../../src/helpers/language', () => ({ isRussian: jest.fn() }))
jest.mock('../../src/handlers', () => ({ handleSizeSelection: jest.fn() }))

import { isRussian } from '../../src/helpers/language'
import { handleSizeSelection } from '../../src/handlers'

describe.skip('sizeWizard', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('step 0: sends prompt and next()', async () => {
    const ctx = makeMockContext()
    ;(isRussian as jest.Mock).mockReturnValueOnce(false)
    // @ts-ignore
    const step0 = sizeWizard.steps[0]
    await step0(ctx)
    expect(isRussian).toHaveBeenCalledWith(ctx)
    expect(ctx.reply).toHaveBeenCalledWith(
      'Choose image size:',
      expect.objectContaining({ reply_markup: expect.any(Object) })
    )
    expect(ctx.wizard.next).toHaveBeenCalled()
  })

  it('step 1: no message leaves scene', async () => {
    const ctx = makeMockContext()
    // no message
    // @ts-ignore
    const step1 = sizeWizard.steps[1]
    await step1(ctx)
    expect(ctx.scene.leave).toHaveBeenCalled()
  })

  it('step 1: invalid size replies error', async () => {
    const ctx = makeMockContext({}, { message: { text: 'foo' } })
    ;(isRussian as jest.Mock).mockReturnValueOnce(true)
    // @ts-ignore
    const step1 = sizeWizard.steps[1]
    await step1(ctx)
    expect(ctx.reply).toHaveBeenCalledWith(
      expect.stringContaining('Неверный размер'),
      expect.any(Object)
    )
    expect(handleSizeSelection).not.toHaveBeenCalled()
  })

  it('step 1: valid size calls handler and leaves', async () => {
    const ctx = makeMockContext({}, { message: { text: '1:1' } })
    ;(isRussian as jest.Mock).mockReturnValueOnce(false)
    // @ts-ignore
    const step1 = sizeWizard.steps[1]
    await step1(ctx)
    expect(handleSizeSelection).toHaveBeenCalledWith(ctx, '1:1')
    expect(ctx.scene.leave).toHaveBeenCalled()
  })
})