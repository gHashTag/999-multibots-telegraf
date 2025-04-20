import { beforeAll, describe, test, expect, jest } from '@jest/globals'

// Reset modules and mocks for production branch
afterAll(() => jest.resetModules())
beforeAll(() => {
  jest.doMock('@/config', () => ({
    isDev: false,
    SECRET_API_KEY: 'secret',
    LOCAL_SERVER_URL: 'http://localhost:3000',
    ELESTIO_URL: 'https://api.example.com',
  }))
  jest.doMock('@/helpers/language', () => ({ isRussian: () => false }))
  jest.doMock('axios', () => ({ post: jest.fn().mockResolvedValue({ data: { data: 'prodOK' } }) }))
})

const axios = require('axios')
const { generateNeuroImage } = require('@/services/generateNeuroImage')

describe('generateNeuroImage production branch', () => {
  test('uses ELESTIO_URL when isDev is false', async () => {
    const ctx = { session: { prompt: 'p', userModel: 'm' }, from: { username: 'u' }, reply: jest.fn() }
    const res = await generateNeuroImage('prompt', 'modelUrl', 1, 'tid', ctx, 'bot')
    expect(res).toEqual({ data: 'prodOK' })
    expect(axios.post).toHaveBeenCalledWith(
      'https://api.example.com/generate/neuro-photo',
      expect.any(Object),
      expect.objectContaining({ headers: expect.objectContaining({ 'x-secret-key': 'secret' }) })
    )
  })
})
