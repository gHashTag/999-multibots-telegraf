import { retry, downloadFile } from '@/core/replicate/generateVideo'
import axios from 'axios'

jest.mock('axios')

// Правильная типизация моков
const mockedAxios = axios as jest.Mocked<typeof axios>

describe('retry function', () => {
  it('resolves after retries', async () => {
    let calls = 0
    const fn = jest.fn<Promise<string>, []>(() => {
      calls++
      if (calls < 3) throw new Error('fail')
      return Promise.resolve('ok')
    })
    const result = await retry(fn, 5, 1)
    expect(result).toBe('ok')
    expect(fn).toHaveBeenCalledTimes(3)
  })

  it('rejects if all retries fail', async () => {
    const fn = jest.fn<Promise<string>, []>(() => {
      throw new Error('oops')
    })
    await expect(retry(fn, 2, 1)).rejects.toThrow('oops')
    expect(fn).toHaveBeenCalledTimes(2)
  })
})

describe('downloadFile', () => {
  const url = 'http://example.com/test.bin'

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('returns buffer on valid response', async () => {
    const buf = Buffer.from('1234')
    mockedAxios.get.mockResolvedValue({ data: buf })
    const res = await downloadFile(url)
    expect(res).toEqual(buf)
  })

  it('throws on invalid URL', async () => {
    await expect(downloadFile(null as unknown as string)).rejects.toThrow(
      /Invalid URL/
    )
    await expect(downloadFile('ftp://x')).rejects.toThrow(/Invalid URL/)
  })

  it('throws when file too large', async () => {
    const large = Buffer.alloc(51 * 1024 * 1024)
    mockedAxios.get.mockResolvedValue({ data: large })
    await expect(downloadFile(url)).rejects.toThrow(/exceeds Telegram limit/)
  })

  it('throws when axios throws', async () => {
    mockedAxios.get.mockRejectedValue(new Error('net error'))
    await expect(downloadFile(url)).rejects.toThrow(
      /Failed to download file: net error/
    )
  })
})
