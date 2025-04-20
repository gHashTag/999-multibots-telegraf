import { fetchImage } from '@/core/axios/fetchImage'
import axios from 'axios'
import { Buffer } from 'buffer'

jest.mock('axios')

describe('fetchImage', () => {
  it('should return buffer from response data', async () => {
    const data = Buffer.from('testdata')
    ;(axios.get as jest.Mock).mockResolvedValue({ data })
    const result = await fetchImage('http://example.com/image.png')
    expect(axios.get).toHaveBeenCalledWith(
      'http://example.com/image.png',
      expect.objectContaining({
        responseType: 'arraybuffer',
        validateStatus: expect.any(Function),
        timeout: 30000,
      })
    )
    expect(Buffer.isBuffer(result)).toBe(true)
    expect(result).toEqual(data)
  })

  it('should throw error when axios.get rejects', async () => {
    const error = new Error('Network error')
    ;(axios.get as jest.Mock).mockRejectedValue(error)
    await expect(fetchImage('url')).rejects.toThrow('Network error')
  })
})