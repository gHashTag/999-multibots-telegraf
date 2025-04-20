import { describe, it, expect, jest, beforeEach } from '@jest/globals'
import makeMockContext from '../utils/mockTelegrafContext'
import { sendPromptImprovementFailureMessage } from '@/menu/sendPromptImprovementFailureMessage'

describe('sendPromptImprovementFailureMessage', () => {
  let ctx: ReturnType<typeof makeMockContext>
  beforeEach(() => {
    jest.clearAllMocks()
    ctx = makeMockContext()
    ctx.reply = jest.fn(() => Promise.resolve()) as any
  })

  it('sends Russian failure message when isRu true', async () => {
    await sendPromptImprovementFailureMessage(ctx as any, true)
    expect(ctx.reply).toHaveBeenCalledWith('❌ Не удалось улучшить промпт')
  })

  it('sends English failure message when isRu false', async () => {
    await sendPromptImprovementFailureMessage(ctx as any, false)
    expect(ctx.reply).toHaveBeenCalledWith('❌ Failed to improve prompt')
  })
})