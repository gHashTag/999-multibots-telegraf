import makeMockContext from '../utils/mockTelegrafContext'
import { defaultSession } from '@/store' // Импорт сессии

// Mock Supabase wrappers
jest.mock('@/core/supabase', () => ({
  getUserModel: jest.fn(),
  getUserData: jest.fn(),
}))
// Mock OpenAI request
jest.mock('@/core/openai/requests', () => ({ answerAi: jest.fn() }))

import { handleTextMessage } from '@/handlers/handleTextMessage'
import { getUserModel, getUserData } from '@/core/supabase'
import { answerAi } from '@/core/openai/requests'

describe('handleTextMessage', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('skips commands starting with slash', async () => {
    const ctx = makeMockContext({
      message: {
        text: '/start',
        from: {
          id: 42,
          username: 'user',
          first_name: 'First',
          last_name: 'Last',
          language_code: 'ru',
          is_bot: false,
        },
        chat: { id: 100, type: 'private', first_name: 'ChatFirst' },
      },
    })
    ctx.session = { ...defaultSession }
    ctx.reply = jest.fn().mockResolvedValue({} as any)

    await handleTextMessage(ctx as any)
    expect(answerAi).not.toHaveBeenCalled()
    expect(ctx.reply).not.toHaveBeenCalled()
  })

  it('replies error when message missing', async () => {
    const ctx = makeMockContext({
      update_id: 2,
    })
    ctx.session = { ...defaultSession }
    ctx.reply = jest.fn().mockResolvedValue({} as any)

    await handleTextMessage(ctx as any)
    expect(ctx.reply).toHaveBeenCalledWith(
      'Не удалось получить текст сообщения'
    )
  })

  it('replies error when text empty', async () => {
    const ctx = makeMockContext({
      message: {
        text: '',
        from: {
          id: 42,
          username: 'user',
          first_name: 'First',
          last_name: 'Last',
          language_code: 'ru',
          is_bot: false,
        },
        chat: { id: 100, type: 'private', first_name: 'ChatFirst' },
      },
    })
    ctx.session = { ...defaultSession }
    ctx.reply = jest.fn().mockResolvedValue({} as any)

    await handleTextMessage(ctx as any)
    expect(ctx.reply).toHaveBeenCalledWith(
      'Не удалось получить текст сообщения'
    )
  })

  it('processes message with existing user', async () => {
    const ctx = makeMockContext({
      message: {
        text: 'Hello',
        from: {
          id: 42,
          username: 'user',
          first_name: 'First',
          last_name: 'Last',
          language_code: 'ru',
          is_bot: false,
        },
        chat: { id: 100, type: 'private', first_name: 'ChatFirst' },
      },
    })
    ctx.session = { ...defaultSession }
    ctx.reply = jest.fn().mockResolvedValue({} as any)
    ctx.telegram.sendChatAction = jest.fn().mockResolvedValue(true)
    ;(getUserModel as jest.Mock).mockResolvedValue('modelA')
    const userData = {
      username: 'user',
      first_name: 'First',
      last_name: 'Last',
      language_code: 'ru',
      company: '',
      position: '',
      designation: '',
    }
    ;(getUserData as jest.Mock).mockResolvedValue(userData)
    ;(answerAi as jest.Mock).mockResolvedValue('AI response')
    await handleTextMessage(ctx as any)
    expect(ctx.telegram.sendChatAction).toHaveBeenCalledWith(100, 'typing')
    expect(answerAi).toHaveBeenCalledWith(
      'modelA',
      userData,
      'Hello',
      'ru',
      expect.stringContaining('Your name is')
    )
    expect(ctx.reply).toHaveBeenCalledWith('AI response', {
      parse_mode: 'Markdown',
    })
  })

  it('uses fallback when user not found', async () => {
    const ctx = makeMockContext({
      message: {
        text: 'Test',
        from: {
          id: 42,
          username: 'user',
          first_name: 'First',
          last_name: 'Last',
          language_code: 'ru',
          is_bot: false,
        },
        chat: { id: 100, type: 'private', first_name: 'ChatFirst' },
      },
    })
    ctx.session = { ...defaultSession }
    ctx.reply = jest.fn().mockResolvedValue({} as any)
    ctx.telegram.sendChatAction = jest.fn().mockResolvedValue(true)
    ;(getUserModel as jest.Mock).mockResolvedValue('modelB')
    ;(getUserData as jest.Mock).mockResolvedValue(null)
    ;(answerAi as jest.Mock).mockResolvedValue('fallback')
    await handleTextMessage(ctx as any)
    expect(answerAi).toHaveBeenCalledWith(
      'gpt-4o',
      expect.objectContaining({
        username: 'user',
        first_name: 'First',
        last_name: 'Last',
        language_code: 'ru',
      }),
      'Test',
      'ru',
      expect.any(String)
    )
    expect(ctx.reply).toHaveBeenCalledWith('fallback', {
      parse_mode: 'Markdown',
    })
  })

  it('replies GPT error when answerAi returns falsy', async () => {
    const ctx = makeMockContext({
      message: {
        text: 'Hi',
        from: {
          id: 42,
          username: 'user',
          first_name: 'First',
          last_name: 'Last',
          language_code: 'ru',
          is_bot: false,
        },
        chat: { id: 100, type: 'private', first_name: 'ChatFirst' },
      },
    })
    ctx.session = { ...defaultSession }
    ctx.reply = jest.fn().mockResolvedValue({} as any)
    ctx.telegram.sendChatAction = jest.fn().mockResolvedValue(true)
    ;(getUserModel as jest.Mock).mockResolvedValue('m')
    ;(getUserData as jest.Mock).mockResolvedValue({})
    ;(answerAi as jest.Mock).mockResolvedValue(null)
    await handleTextMessage(ctx as any)
    expect(ctx.reply).toHaveBeenCalledWith(
      'Не удалось получить ответ от GPT. Пожалуйста, попробуйте позже.'
    )
  })

  it('replies and throws on exception', async () => {
    const ctx = makeMockContext({
      message: {
        text: 'Err',
        from: {
          id: 42,
          username: 'user',
          first_name: 'First',
          last_name: 'Last',
          language_code: 'ru',
          is_bot: false,
        },
        chat: { id: 100, type: 'private', first_name: 'ChatFirst' },
      },
    })
    ctx.session = { ...defaultSession }
    ctx.reply = jest.fn().mockResolvedValue({} as any)
    ctx.telegram.sendChatAction = jest.fn().mockResolvedValue(true)
    ;(getUserModel as jest.Mock).mockResolvedValue('x')
    ;(getUserData as jest.Mock).mockResolvedValue({})
    const err = new Error('fail')
    ;(answerAi as jest.Mock).mockRejectedValue(err)
    await expect(handleTextMessage(ctx as any)).rejects.toBe(err)
    expect(ctx.reply).toHaveBeenCalledWith(
      'Произошла ошибка при обработке запроса'
    )
  })
})
