import makeMockContext from '../utils/mockTelegrafContext'
import { sendGenerationErrorMessage } from '@/menu/sendGenerationErrorMessage'

describe('sendGenerationErrorMessage', () => {
  let ctx: ReturnType<typeof makeMockContext>

  beforeEach(() => {
    ctx = makeMockContext()
    ctx.reply = jest.fn(() => Promise.resolve()) as any
  })

  it('replies with Russian message when isRu true', async () => {
    await sendGenerationErrorMessage(ctx as any, true)
    expect(ctx.reply).toHaveBeenCalledWith(
      '❌ Произошла ошибка при генерации. Пожалуйста, попробуйте позже.'
    )
  })

  it('replies with English message when isRu false', async () => {
    await sendGenerationErrorMessage(ctx as any, false)
    expect(ctx.reply).toHaveBeenCalledWith(
      '❌ An error occurred while generating. Please try again later.'
    )
  })
})