import { supabase } from '@/core/supabase'
import {
  getGeneratedImages,
  getAspectRatio,
  setAspectRatio,
} from '@/core/supabase/ai'

jest.mock('@/core/supabase', () => ({
  supabase: { from: jest.fn() },
}))

describe('getGeneratedImages', () => {
  const fromMock = supabase.from as jest.Mock
  let selectMock: jest.Mock
  let eqMock: jest.Mock
  let singleMock: jest.Mock
  beforeEach(() => {
    jest.clearAllMocks()
    selectMock = jest.fn()
    eqMock = jest.fn()
    singleMock = jest.fn()
    fromMock.mockReturnValue({ select: selectMock })
    selectMock.mockReturnValue({ eq: eqMock })
    eqMock.mockReturnValue({ single: singleMock })
  })

  it('returns default when error or no data', async () => {
    singleMock.mockResolvedValue({ data: null, error: new Error('fail') })
    const res = await getGeneratedImages(1)
    expect(res).toEqual({ count: 0, limit: 2 })
  })

  it('returns parsed counts when data present', async () => {
    singleMock.mockResolvedValue({
      data: { count: '5', limit: '10' },
      error: null,
    })
    const res = await getGeneratedImages(2)
    expect(res).toEqual({ count: 5, limit: 10 })
  })
})

describe('getAspectRatio', () => {
  const fromMock = supabase.from as jest.Mock
  let selectMock: jest.Mock
  let eqMock: jest.Mock
  let singleMock: jest.Mock
  beforeEach(() => {
    jest.clearAllMocks()
    selectMock = jest.fn()
    eqMock = jest.fn()
    singleMock = jest.fn()
    fromMock.mockReturnValue({ select: selectMock })
    selectMock.mockReturnValue({ eq: eqMock })
    eqMock.mockReturnValue({ single: singleMock })
  })

  it('returns null when error or no data', async () => {
    singleMock.mockResolvedValue({ data: null, error: null })
    const res = await getAspectRatio(3)
    expect(res).toBeNull()
  })

  it('returns aspect_ratio when data present', async () => {
    singleMock.mockResolvedValue({
      data: { aspect_ratio: '16:9' },
      error: null,
    })
    const res = await getAspectRatio(4)
    expect(res).toBe('16:9')
  })
})

describe('setAspectRatio', () => {
  const fromMock = supabase.from as jest.Mock
  let updateMock: jest.Mock
  let eqMock: jest.Mock
  beforeEach(() => {
    jest.clearAllMocks()
    updateMock = jest.fn()
    eqMock = jest.fn()
    fromMock.mockReturnValue({ update: updateMock })
    updateMock.mockReturnValue({ eq: eqMock })
  })

  it('returns true when no error', async () => {
    updateMock.mockResolvedValue({ error: null })
    const res = await setAspectRatio(5, '4:3')
    expect(res).toBe(true)
    expect(updateMock).toHaveBeenCalledWith({ aspect_ratio: '4:3' })
    expect(eqMock).toHaveBeenCalledWith('telegram_id', '5')
  })

  it('returns false on error', async () => {
    updateMock.mockResolvedValue({ error: new Error('err') })
    const res = await setAspectRatio(6, '1:1')
    expect(res).toBe(false)
  })
})
