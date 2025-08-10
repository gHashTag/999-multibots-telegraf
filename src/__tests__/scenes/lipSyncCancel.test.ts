import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { MyContext } from '@/interfaces'
import { handleHelpCancel } from '@/handlers/handleHelpCancel'
import { ModeEnum } from '@/interfaces/modes'

// Мокаем зависимости
vi.mock('@/helpers/centralizedLanguage', () => ({
  isRussianFromState: vi.fn(() => true),
}))

describe('LipSync Cancel Functionality', () => {
  let mockCtx: Partial<MyContext>
  let mockReply: ReturnType<typeof vi.fn>
  let mockSceneEnter: ReturnType<typeof vi.fn>
  let mockSceneLeave: ReturnType<typeof vi.fn>

  beforeEach(() => {
    mockReply = vi.fn()
    mockSceneEnter = vi.fn()
    mockSceneLeave = vi.fn()

    mockCtx = {
      message: undefined,
      from: { id: 123456789 },
      reply: mockReply,
      scene: {
        enter: mockSceneEnter,
        leave: mockSceneLeave,
      } as any,
    }
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('должен обрабатывать команду отмены на русском языке', async () => {
    mockCtx.message = {
      text: 'отмена',
    } as any

    const result = await handleHelpCancel(mockCtx as MyContext)

    expect(result).toBe(true)
    expect(mockReply).toHaveBeenCalledWith('❌ Процесс отменён.')
    expect(mockSceneEnter).toHaveBeenCalledWith(ModeEnum.MainMenu)
  })

  it('должен обрабатывать команду отмены на английском языке', async () => {
    // Мокаем английский язык
    const { isRussianFromState } = await import('@/helpers/centralizedLanguage')
    vi.mocked(isRussianFromState).mockReturnValueOnce(false)

    mockCtx.message = {
      text: 'cancel',
    } as any

    const result = await handleHelpCancel(mockCtx as MyContext)

    expect(result).toBe(true)
    expect(mockReply).toHaveBeenCalledWith('❌ Process cancelled.')
    expect(mockSceneEnter).toHaveBeenCalledWith(ModeEnum.MainMenu)
  })

  it('должен обрабатывать команду помощи на русском языке', async () => {
    mockCtx.message = {
      text: 'справка по команде',
    } as any

    const result = await handleHelpCancel(mockCtx as MyContext)

    expect(result).toBe(true)
    expect(mockSceneEnter).toHaveBeenCalledWith('helpScene')
  })

  it('должен игнорировать обычные текстовые сообщения', async () => {
    mockCtx.message = {
      text: 'обычное сообщение',
    } as any

    const result = await handleHelpCancel(mockCtx as MyContext)

    expect(result).toBe(false)
    expect(mockReply).not.toHaveBeenCalled()
    expect(mockSceneEnter).not.toHaveBeenCalled()
  })

  it('должен игнорировать сообщения без текста', async () => {
    mockCtx.message = undefined

    const result = await handleHelpCancel(mockCtx as MyContext)

    expect(result).toBe(false)
    expect(mockReply).not.toHaveBeenCalled()
    expect(mockSceneEnter).not.toHaveBeenCalled()
  })

  it('должен правильно обрабатывать регистр команд', async () => {
    mockCtx.message = {
      text: 'ОТМЕНА',
    } as any

    const result = await handleHelpCancel(mockCtx as MyContext)

    expect(result).toBe(true)
    expect(mockReply).toHaveBeenCalledWith('❌ Процесс отменён.')
    expect(mockSceneEnter).toHaveBeenCalledWith(ModeEnum.MainMenu)
  })
})
