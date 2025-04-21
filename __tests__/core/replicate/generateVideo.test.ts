import {
  downloadFile,
  retry,
  generateVideo,
} from '@/core/replicate/generateVideo'
import { replicate } from '@/core/replicate'
import { supabase } from '@/core/supabase'
import axios from 'axios'

// Мокаем axios
jest.mock('axios')
// Мокаем replicate
jest.mock('@/core/replicate', () => ({
  replicate: { run: jest.fn() },
}))
// Мокаем supabase insert
jest.mock('@/core/supabase', () => ({
  supabase: {
    from: jest
      .fn()
      .mockReturnValue({
        insert: jest.fn().mockResolvedValue({ data: [], error: null }),
      }),
  },
}))

describe('retry', () => {
  it('retries the function on failure and succeeds', async () => {
    const mockFn = jest.fn()
    mockFn
      .mockRejectedValueOnce(new Error('fail1'))
      .mockRejectedValueOnce(new Error('fail2'))
      .mockResolvedValue('ok')
    const result = await retry(() => mockFn(), 3, 1)
    expect(result).toBe('ok')
    expect(mockFn).toHaveBeenCalledTimes(3)
  })
  it('throws after exceeding attempts', async () => {
    const mockFn = jest.fn().mockRejectedValue(new Error('always fail'))
    await expect(retry(() => mockFn(), 2, 1)).rejects.toThrow('always fail')
    expect(mockFn).toHaveBeenCalledTimes(2)
  })
})

describe('downloadFile', () => {
  const axiosGet = axios.get as jest.Mock
  const MAX_SIZE = 50 * 1024 * 1024

  it('throws on invalid URL', async () => {
    await expect(downloadFile('')).rejects.toThrow(/Invalid URL received/)
    await expect(downloadFile('ftp://example.com')).rejects.toThrow(
      /Invalid URL received/
    )
  })

  it('throws on axios error', async () => {
    axiosGet.mockRejectedValueOnce(new Error('network'))
    await expect(downloadFile('http://test')).rejects.toThrow(
      /Failed to download file: network/
    )
  })

  it('throws when file too large', async () => {
    const large = Buffer.alloc(MAX_SIZE + 1)
    axiosGet.mockResolvedValueOnce({ data: large })
    await expect(downloadFile('http://test')).rejects.toThrow(
      /exceeds Telegram limit/
    )
  })

  it('returns buffer on success', async () => {
    const data = Uint8Array.from([1, 2, 3])
    axiosGet.mockResolvedValueOnce({ data })
    const buf = await downloadFile('http://ok')
    expect(Buffer.isBuffer(buf)).toBe(true)
    expect(buf.length).toBe(3)
  })
})

describe('generateVideo', () => {
  const runMock = replicate.run as jest.Mock
  const axiosGet = axios.get as jest.Mock
  beforeEach(() => {
    jest.clearAllMocks()
    // default axios.get returns small buffer
    axiosGet.mockResolvedValue({ data: Uint8Array.from([9]) })
    // default supabase.from.insert resolved
  })

  it('generates video for haiper model using array output', async () => {
    runMock.mockResolvedValueOnce(['http://video'])
    const res = await generateVideo('p', 'haiper', 'user1')
    expect(runMock).toHaveBeenCalledWith(
      'haiper-ai/haiper-video-2',
      expect.any(Object)
    )
    expect(res.video.length).toBe(1)
  })

  it('generates video for other model using string output', async () => {
    runMock.mockResolvedValueOnce('http://video2')
    const res = await generateVideo('p2', 'other', 'user2')
    expect(runMock).toHaveBeenCalledWith('minimax/video-01', expect.any(Object))
    expect(res.video.length).toBe(1)
  })

  it('throws on empty array output', async () => {
    runMock.mockResolvedValueOnce([])
    await expect(generateVideo('p', 'haiper', 'u')).rejects.toThrow(
      /Empty array or first element is undefined/
    )
  })

  it('throws on unexpected output type', async () => {
    runMock.mockResolvedValueOnce({})
    await expect(generateVideo('p', 'x', 'u')).rejects.toThrow(
      /Unexpected output format/
    )
  })
})
