import { jest, describe, it, expect, beforeEach } from '@jest/globals'
import makeMockContext from '../utils/mockTelegrafContext'

// Mock setModel from supabase
jest.mock('@/core/supabase', () => ({ setModel: jest.fn() }))
import { setModel } from '@/core/supabase'
import { handleModelCallback } from '@/handlers/handleModelCallback'

describe('handleModelCallback', () => {
  let ctx: ReturnType<typeof makeMockContext>
  beforeEach(() => {
    jest.clearAllMocks()
    ctx = makeMockContext()
    // stub reply
    ctx.reply = jest.fn(() => Promise.resolve()) as any
  })

  it('returns early if ctx.from is undefined', async () => {
    ctx.from = undefined as any
    // Should not throw
    await expect(handleModelCallback(ctx as any, 'modelX')).resolves.toBeUndefined()
    expect(setModel).not.toHaveBeenCalled()
    expect(ctx.reply).not.toHaveBeenCalled()
  })

  it('replies success in Russian when setModel succeeds', async () => {
    ctx.from = { id: 1, language_code: 'ru' } as any
    (setModel as jest.Mock).mockResolvedValue(undefined)
    await handleModelCallback(ctx as any, 'mymodel')
    expect(setModel).toHaveBeenCalledWith('1', 'mymodel')
    expect(ctx.reply).toHaveBeenCalledWith('✅ Модель успешно изменена на mymodel')
  })

  it('replies success in English when setModel succeeds', async () => {
    ctx.from = { id: 2, language_code: 'en' } as any
    (setModel as jest.Mock).mockResolvedValue(undefined)
    await handleModelCallback(ctx as any, 'abc')
    expect(ctx.reply).toHaveBeenCalledWith('✅ Model successfully changed to abc')
  })

  it('replies error in Russian when setModel fails', async () => {
    ctx.from = { id: 3, language_code: 'ru' } as any
    const err = new Error('fail')
    (setModel as jest.Mock).mockRejectedValue(err)
    await handleModelCallback(ctx as any, 'x')
    expect(setModel).toHaveBeenCalledWith('3', 'x')
    expect(ctx.reply).toHaveBeenCalledWith('❌ Ошибка при изменении модели')
  })

  it('replies error in English when setModel fails', async () => {
    ctx.from = { id: 4, language_code: 'fr' } as any
    (setModel as jest.Mock).mockRejectedValue(new Error('fail2'))
    await handleModelCallback(ctx as any, 'y')
    expect(ctx.reply).toHaveBeenCalledWith('❌ Error changing model')
  })
})