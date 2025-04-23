import {
  downloadFile,
  retry,
  generateVideo,
} from '@/core/replicate/generateVideo'
import * as replicateModule from '@/core/replicate'
import * as supabaseModule from '@/core/supabase'
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
    from: jest.fn().mockReturnValue({
      insert: jest.fn().mockResolvedValue({ data: [], error: null }),
    }),
  },
}))

// Типизация моков
const mockedAxios = axios as jest.Mocked<typeof axios>
const mockedReplicate = replicateModule.replicate as jest.Mocked<
  typeof replicateModule.replicate
> & { run: jest.Mock }
const mockedSupabase = supabaseModule.supabase as jest.Mocked<
  typeof supabaseModule.supabase
> & {
  from: jest.Mock<() => { insert: jest.Mock }>
}

describe('retry', () => {
  it('retries the function on failure and succeeds', async () => {
    const mockFn = jest.fn<Promise<string>, []>()
    mockFn
      .mockRejectedValueOnce(new Error('fail1'))
      .mockRejectedValueOnce(new Error('fail2'))
      .mockResolvedValue('ok')
    const result = await retry(() => mockFn(), 3, 1)
    expect(result).toBe('ok')
    expect(mockFn).toHaveBeenCalledTimes(3)
  })

  it('throws after exceeding attempts', async () => {
    const mockFn = jest
      .fn<Promise<string>, []>()
      .mockRejectedValue(new Error('always fail'))
    await expect(retry(() => mockFn(), 2, 1)).rejects.toThrow('always fail')
    expect(mockFn).toHaveBeenCalledTimes(2)
  })
})

describe('downloadFile', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('throws on invalid URL', async () => {
    await expect(downloadFile('')).rejects.toThrow(/Invalid URL received/)
    await expect(downloadFile('ftp://example.com')).rejects.toThrow(
      /Invalid URL received/
    )
  })

  it('throws on axios error', async () => {
    mockedAxios.get.mockRejectedValueOnce(new Error('network'))
    await expect(downloadFile('http://test')).rejects.toThrow(
      /Failed to download file: network/
    )
  })

  it('throws when file too large', async () => {
    const MAX_SIZE = 50 * 1024 * 1024
    const large = Buffer.alloc(MAX_SIZE + 1)
    mockedAxios.get.mockResolvedValueOnce({ data: large })
    await expect(downloadFile('http://test')).rejects.toThrow(
      /exceeds Telegram limit/
    )
  })

  it('returns buffer on success', async () => {
    const data = Uint8Array.from([1, 2, 3])
    mockedAxios.get.mockResolvedValueOnce({ data })
    const buf = await downloadFile('http://ok')
    expect(Buffer.isBuffer(buf)).toBe(true)
    expect(buf.length).toBe(3)
  })
})

describe('generateVideo', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    // default axios.get returns small buffer
    mockedAxios.get.mockResolvedValue({ data: Uint8Array.from([9]) })
    // default supabase.from.insert resolved
  })

  it('generates video for haiper model using array output', async () => {
    mockedReplicate.run.mockResolvedValueOnce(['http://video'])
    const res = await generateVideo('p', 'haiper', 'user1')
    expect(mockedReplicate.run).toHaveBeenCalledWith(
      'haiper-ai/haiper-video-2',
      expect.objectContaining({
        input: expect.objectContaining({
          prompt: 'p',
          duration: 6,
          aspect_ratio: '16:9',
          use_prompt_enhancer: true,
        }),
      })
    )
    expect(res.video.length).toBe(1)
    expect(mockedSupabase.from).toHaveBeenCalledWith('assets')
  })

  it('generates video for other model using string output', async () => {
    mockedReplicate.run.mockResolvedValueOnce('http://video2')
    const res = await generateVideo('p2', 'other', 'user2')
    expect(mockedReplicate.run).toHaveBeenCalledWith(
      'minimax/video-01',
      expect.objectContaining({
        input: expect.objectContaining({
          prompt: 'p2',
          prompt_optimizer: true,
        }),
      })
    )
    expect(res.video.length).toBe(1)
    expect(mockedSupabase.from).toHaveBeenCalledWith('assets')
  })

  it('throws on empty array output', async () => {
    mockedReplicate.run.mockResolvedValueOnce([])
    await expect(generateVideo('p', 'haiper', 'u')).rejects.toThrow(
      /Empty array or first element is undefined/
    )
  })

  it('throws on unexpected output type', async () => {
    mockedReplicate.run.mockResolvedValueOnce({})
    await expect(generateVideo('p', 'x', 'u')).rejects.toThrow(
      /Unexpected output format/
    )
  })
})
