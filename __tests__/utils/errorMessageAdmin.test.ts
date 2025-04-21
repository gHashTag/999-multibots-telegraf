import makeMockContext from './mockTelegrafContext'
// Mock isDev flag
jest.mock('../../src/config', () => ({ isDev: false }))
import { errorMessageAdmin } from '../../src/helpers/error/errorMessageAdmin'

describe('errorMessageAdmin', () => {
  let ctx = makeMockContext()
  beforeEach(() => {
    ctx = makeMockContext()
    jest.clearAllMocks()
  })

  it('should send admin notification when not development', () => {
    const err = new Error('admin error')
    errorMessageAdmin(ctx, err)
    expect(ctx.telegram.sendMessage).toHaveBeenCalledWith(
      '@neuro_coder_privat',
      '❌ Произошла ошибка.\n\nОшибка: admin error'
    )
  })

  it('should not send when development mode', () => {
    // override isDev to true
    jest.resetModules()
    jest.mock('../../src/config', () => ({ isDev: true }))
    const {
      errorMessageAdmin: emAdmin,
    } = require('../../src/helpers/error/errorMessageAdmin')
    const ctx2 = makeMockContext()
    emAdmin(ctx2, new Error('e'))
    expect(ctx2.telegram.sendMessage).not.toHaveBeenCalled()
  })
})
