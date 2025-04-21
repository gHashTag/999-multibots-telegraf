import axios from 'axios'
import { downloadFile } from '@/helpers/downloadFile'

jest.mock('axios')
const mockedAxios = axios as jest.Mocked<typeof axios>

describe('downloadFile', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('should download and return buffer when response data is valid and under limit', async () => {
    const data = Buffer.from('test data')
    mockedAxios.get.mockResolvedValue({ data } as any)
    const result = await downloadFile('http://example.com/file.bin')
    expect(result).toEqual(data)
    expect(mockedAxios.get).toHaveBeenCalledWith(
      'http://example.com/file.bin',
      expect.objectContaining({ responseType: 'arraybuffer' })
    )
  })

  it('should throw error when URL is invalid', async () => {
    await expect(downloadFile('ftp://invalid.url')).rejects.toThrow(
      /Invalid URL received/
    )
    expect(mockedAxios.get).not.toHaveBeenCalled()
  })

  it('should throw error when response data is empty', async () => {
    mockedAxios.get.mockResolvedValue({ data: null } as any)
    await expect(downloadFile('http://example.com/empty')).rejects.toThrow(
      /Empty response data/
    )
  })
})
