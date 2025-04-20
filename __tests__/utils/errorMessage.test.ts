import makeMockContext from './mockTelegrafContext'
import { errorMessage } from '../../src/helpers/error/errorMessage'

describe('errorMessage', () => {
  let ctx = makeMockContext()
  beforeEach(() => {
    ctx = makeMockContext()
    jest.clearAllMocks()
  })

  it('sends Russian error message', () => {
    const err = new Error('ошибка')
    ctx.from.language_code = 'ru'
    errorMessage(ctx, err, true)
    expect(ctx.telegram.sendMessage).toHaveBeenCalledWith(
      ctx.from.id.toString(),
      '❌ Произошла ошибка.\n\nОшибка: ошибка'
    )
  })

  it('sends English error message', () => {
    const err = new Error('error')
    ctx.from.language_code = 'en'
    errorMessage(ctx, err, false)
    expect(ctx.telegram.sendMessage).toHaveBeenCalledWith(
      ctx.from.id.toString(),
      '❌ An error occurred.\n\nError: error'
    )
  })
})