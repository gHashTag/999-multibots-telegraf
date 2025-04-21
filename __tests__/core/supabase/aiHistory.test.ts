import { supabase } from '@/core/supabase'
import {
  getHistory,
  setHistory,
  incrementGeneratedImages,
  incrementLimit,
} from '@/core/supabase/ai'

jest.mock('@/core/supabase', () => ({
  supabase: { from: jest.fn() },
}))

describe('core/supabase/ai - getHistory and setHistory', () => {
  const mockFrom = supabase.from as jest.Mock
  const selectMock = jest.fn()
  const orderMock = jest.fn()
  const limitMock = jest.fn()
  const eqMock = jest.fn()
  beforeEach(() => {
    jest.clearAllMocks()
    mockFrom.mockReturnValue({ select: selectMock })
    selectMock.mockReturnValue({ order: orderMock })
    orderMock.mockReturnValue({ limit: limitMock })
    limitMock.mockReturnValue({ eq: eqMock })
  })

  it('getHistory returns data array on success', async () => {
    const data = [{ x: 1 }]
    eqMock.mockResolvedValue({ data, error: null })
    const res = await getHistory('b', 'c', 't')
    expect(res).toEqual(data)
    expect(mockFrom).toHaveBeenCalledWith('clips')
    expect(selectMock).toHaveBeenCalledWith('*')
  })

  it('getHistory returns empty on error', async () => {
    eqMock.mockResolvedValue({ data: null, error: { message: 'err' } })
    const res = await getHistory('b', 'c', 't')
    expect(res).toEqual([])
  })

  it('setHistory returns true on insert success', async () => {
    const insertMock = jest.fn().mockResolvedValue({ data: null, error: null })
    mockFrom.mockReturnValue({ insert: insertMock })
    const ok = await setHistory({
      brand: 'b',
      response: 'r',
      video_url: 'u',
      command: 'c',
      type: 't',
      voice_id: 'v',
      chat_id: 'ch',
      lang: 'en',
      trigger: 'tr',
    })
    expect(ok).toBe(true)
    expect(mockFrom).toHaveBeenCalledWith('clips')
  })

  it('setHistory returns false on insert error', async () => {
    const insertMock = jest
      .fn()
      .mockResolvedValue({ data: null, error: { message: 'err' } })
    mockFrom.mockReturnValue({ insert: insertMock })
    const ok = await setHistory({
      brand: 'b',
      response: 'r',
      video_url: 'u',
      command: 'c',
      type: 't',
      voice_id: 'v',
      chat_id: 'ch',
      lang: 'en',
      trigger: 'tr',
    })
    expect(ok).toBe(false)
  })
})

describe('core/supabase/ai - incrementGeneratedImages and incrementLimit', () => {
  const mockFrom = supabase.from as jest.Mock
  let selectMock: jest.Mock
  let eqMock: jest.Mock
  let singleMock: jest.Mock
  let insertMock: jest.Mock
  let updateMock: jest.Mock
  beforeEach(() => {
    jest.clearAllMocks()
    selectMock = jest.fn()
    eqMock = jest.fn()
    singleMock = jest.fn()
    insertMock = jest.fn()
    updateMock = jest.fn()
    mockFrom.mockReturnValue({
      select: selectMock,
      insert: insertMock,
      update: updateMock,
    })
    selectMock.mockReturnValue({ eq: eqMock })
    eqMock.mockReturnValue({ single: singleMock })
  })

  it('incrementGeneratedImages inserts on PGRST116', async () => {
    singleMock.mockResolvedValue({ data: null, error: { code: 'PGRST116' } })
    insertMock.mockResolvedValue({ error: null })
    const fn = await import('@/core/supabase/ai').then(
      m => m.incrementGeneratedImages
    )
    const ok = await fn(5)
    expect(ok).toBe(true)
    expect(insertMock).toHaveBeenCalled()
  })

  it('incrementGeneratedImages updates on existing', async () => {
    singleMock.mockResolvedValue({ data: { count: 2 }, error: null })
    updateMock.mockResolvedValue({ error: null })
    const fn = await import('@/core/supabase/ai').then(
      m => m.incrementGeneratedImages
    )
    const ok = await fn(5)
    expect(ok).toBe(true)
    expect(updateMock).toHaveBeenCalled()
  })

  it('incrementGeneratedImages returns false otherwise', async () => {
    singleMock.mockResolvedValue({ data: null, error: { code: 'OTHER' } })
    const fn = await import('@/core/supabase/ai').then(
      m => m.incrementGeneratedImages
    )
    const ok = await fn(5)
    expect(ok).toBe(false)
  })

  it('incrementLimit behaves similarly', async () => {
    // PGRST116
    singleMock.mockResolvedValue({ data: null, error: { code: 'PGRST116' } })
    insertMock.mockResolvedValue({ error: null })
    const fn = await import('@/core/supabase/ai').then(m => m.incrementLimit)
    const ok1 = await fn({ telegram_id: 1, amount: 3 })
    expect(ok1).toBe(true)
    // existing
    singleMock.mockResolvedValue({ data: { limit: 4 }, error: null })
    updateMock.mockResolvedValue({ error: null })
    const ok2 = await fn({ telegram_id: 1, amount: 3 })
    expect(ok2).toBe(true)
  })
})
