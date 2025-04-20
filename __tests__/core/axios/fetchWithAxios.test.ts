import axios from 'axios'
import { fetchWithAxios } from '@/core/axios/fetchWithAxios'

// Mock axios to control its behavior
jest.mock('axios')
const mockedAxios = axios as jest.Mocked<typeof axios>

describe('fetchWithAxios', () => {
  beforeEach(() => {
    jest.resetAllMocks()
  })

  it('calls axios with provided url and options and returns response', async () => {
    const fakeResponse = { data: { ok: true } }
    mockedAxios.mockResolvedValueOnce(fakeResponse as any)
    const result = await fetchWithAxios('http://example.com', { method: 'GET', headers: { 'X-Test': '1' } })
    expect(mockedAxios).toHaveBeenCalledWith({ url: 'http://example.com', method: 'GET', headers: { 'X-Test': '1' } })
    expect(result).toBe(fakeResponse)
  })

  it('propagates errors from axios', async () => {
    const error = new Error('network failure')
    mockedAxios.mockRejectedValueOnce(error)
    await expect(fetchWithAxios('http://fail', {})).rejects.toThrow('network failure')
  })
})