import axios from 'axios'
import { fetchWithAxios } from '@/core/axios/fetchWithAxios'

// Mock axios to control its behavior
const mockAxiosInstance = jest.fn()
jest.mock('axios', () => mockAxiosInstance)

describe('fetchWithAxios', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    // mockedAxios.get.mockClear();
    // mockedAxios.post.mockClear();
    mockedIsAxiosError.mockClear()
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

  it('should fetch data successfully with GET', async () => {
    const mockData = { data: 'success' }
    mockAxiosInstance.mockResolvedValue({ data: mockData })

    const result = await fetchWithAxios({
      method: 'GET',
      url: 'http://test.com',
      retryCount: 0,
      retryDelay: 0,
    })

    expect(result).toEqual(mockData)
    expect(mockAxiosInstance).toHaveBeenCalledTimes(1)
    expect(mockAxiosInstance).toHaveBeenCalledWith({
      method: 'GET',
      url: 'http://test.com',
      headers: undefined,
      params: undefined,
      data: undefined,
    })
  })

  it('should handle network error after retries', async () => {
    const networkError = new Error('Network Error')
    mockAxiosInstance.mockRejectedValue(networkError)
    mockedIsAxiosError.mockReturnValue(false) // Simulate non-Axios error

    await expect(
      fetchWithAxios({
        method: 'GET',
        url: 'http://test.com',
        retryCount: 2,
        retryDelay: 10,
      })
    ).rejects.toThrow('Network Error')

    expect(mockAxiosInstance).toHaveBeenCalledTimes(3) // Initial + 2 retries
  })

  it('should handle Axios error with no response after retries', async () => {
    const axiosError = { isAxiosError: true, message: 'Axios Error', config: {} }
    mockAxiosInstance.mockRejectedValue(axiosError)
    mockedIsAxiosError.mockReturnValue(true)

    await expect(
      fetchWithAxios({
        method: 'POST',
        url: 'http://test.com/post',
        data: { key: 'value' },
        retryCount: 1,
        retryDelay: 5,
      })
    ).rejects.toMatchObject({ message: 'Axios Error' })

    expect(mockAxiosInstance).toHaveBeenCalledTimes(2) // Initial + 1 retry
  })

  it('should handle Axios error with response status 500 after retries', async () => {
    const axiosErrorWithResponse = {
      isAxiosError: true,
      message: 'Server Error',
      response: { status: 500, data: { error: 'Internal Server Error' } },
      config: {},
    }
    mockAxiosInstance.mockRejectedValue(axiosErrorWithResponse)
    mockedIsAxiosError.mockReturnValue(true)

    await expect(
      fetchWithAxios({
        method: 'GET',
        url: 'http://test.com',
        retryCount: 1,
        retryDelay: 5,
      })
    ).rejects.toMatchObject({ message: 'Server Error' })

    expect(mockAxiosInstance).toHaveBeenCalledTimes(2) // Initial + 1 retry
  })

  it('should not retry on 4xx errors', async () => {
    const axios404Error = {
      isAxiosError: true,
      message: 'Not Found',
      response: { status: 404, data: { error: 'Resource not found' } },
      config: {},
    }
    mockAxiosInstance.mockRejectedValue(axios404Error)
    mockedIsAxiosError.mockReturnValue(true)

    await expect(
      fetchWithAxios({
        method: 'GET',
        url: 'http://test.com/notfound',
        retryCount: 3, // Should not retry despite this
        retryDelay: 10,
      })
    ).rejects.toMatchObject({ message: 'Not Found' })

    expect(mockAxiosInstance).toHaveBeenCalledTimes(1) // No retries for 4xx
  })
})
