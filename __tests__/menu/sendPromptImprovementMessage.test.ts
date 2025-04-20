import { describe, it, expect, jest, beforeEach } from '@jest/globals'
import makeMockContext from '../utils/mockTelegrafContext'
import { sendPromptImprovementMessage } from '@/menu/sendPromptImprovementMessage'

describe('sendPromptImprovementMessage', () => {
  let ctx: ReturnType<typeof makeMockContext>
  beforeEach(() => {
    jest.clearAllMocks()
    ctx = makeMockContext()
    ctx.reply = jest.fn(() => Promise.resolve()) as any
  })

  it('sends Russian start message when isRu true', async () => {
    await sendPromptImprovementMessage(ctx as any, true)
    expect(ctx.reply).toHaveBeenCalledWith('⏳ Начинаю улучшение промпта...')
  })

  it('sends English start message when isRu false', async () => {
    await sendPromptImprovementMessage(ctx as any, false)
    expect(ctx.reply).toHaveBeenCalledWith('⏳ Starting prompt improvement...')
  })
})