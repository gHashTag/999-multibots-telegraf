import axios from 'axios'
import { fetchWithAxios } from '@/core/axios/fetchWithAxios'

// Mock axios to control its behavior
const mockAxiosInstance = jest.fn()
jest.mock('axios', () => mockAxiosInstance)

describe('fetchWithAxios', () => {
  beforeEach(() => {
    mockAxiosInstance.mockClear()
  })

  it('calls axios with provided url and options and returns response', async () => {
    const fakeResponse = { data: { ok: true } }
    mockAxiosInstance.mockResolvedValueOnce(fakeResponse as any)
    const result = await fetchWithAxios('http://example.com', {
      method: 'GET',
      headers: { 'X-Test': '1' },
    })
    expect(mockAxiosInstance).toHaveBeenCalledWith({
      url: 'http://example.com',
      method: 'GET',
      headers: { 'X-Test': '1' },
    })
    expect(result).toBe(fakeResponse)
  })

  it('propagates errors from axios', async () => {
    const error = new Error('network failure')
    mockAxiosInstance.mockRejectedValueOnce(error)
    await expect(fetchWithAxios('http://fail', {})).rejects.toThrow(
      'network failure'
    )
  })
})
