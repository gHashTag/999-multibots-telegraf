import { jest, describe, it, expect } from '@jest/globals'
// Mock config to control isDev flag
jest.mock('@/config', () => ({ isDev: false }))
import { errorMessageAdmin } from '@/helpers/error/errorMessageAdmin'

describe('errorMessageAdmin', () => {
  const sendMessageMock = jest.fn()
  const ctx: any = { telegram: { sendMessage: sendMessageMock } }
  const testError = new Error('admin error')

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('sends message when not in dev', () => {
    errorMessageAdmin(ctx, testError)
    expect(sendMessageMock).toHaveBeenCalledWith(
      '@neuro_coder_privat',
      `❌ Произошла ошибка.\n\nОшибка: ${testError.message}`
    )
  })

  it('does not send message when in dev', () => {
    // Override isDev to true
    jest.mocked(require('@/config')).isDev = true
    errorMessageAdmin(ctx, testError)
    expect(sendMessageMock).not.toHaveBeenCalled()
  })
})