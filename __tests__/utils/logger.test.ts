import logger, { botLogger, securityLogger, logSecurityEvent } from '../../src/utils/logger'

describe.skip('botLogger', () => {
  let infoSpy: jest.SpyInstance
  beforeEach(() => {
    infoSpy = jest.spyOn(logger, 'info').mockImplementation(() => {})
  })
  afterEach(() => {
    infoSpy.mockRestore()
  })
  it('info logs with bot name prefix', () => {
    botLogger.info('botX', 'message', { extra: true })
    expect(infoSpy).toHaveBeenCalledWith('[botX] message', { extra: true })
  })
  it('warn logs with bot name prefix', () => {
    const warnSpy = jest.spyOn(logger, 'warn').mockImplementation(() => {})
    botLogger.warn('botY', 'warnmsg', { w: 1 })
    expect(warnSpy).toHaveBeenCalledWith('[botY] warnmsg', { w: 1 })
    warnSpy.mockRestore()
  })
  it('error logs with bot name prefix', () => {
    const errorSpy = jest.spyOn(logger, 'error').mockImplementation(() => {})
    botLogger.error('botZ', 'errormsg', { e: 'x' })
    expect(errorSpy).toHaveBeenCalledWith('[botZ] errormsg', { e: 'x' })
    errorSpy.mockRestore()
  })
  it('debug logs with bot name prefix', () => {
    const debugSpy = jest.spyOn(logger, 'debug').mockImplementation(() => {})
    botLogger.debug('botD', 'dbgmsg', { d: 2 })
    expect(debugSpy).toHaveBeenCalledWith('[botD] dbgmsg', { d: 2 })
    debugSpy.mockRestore()
  })
})

describe('logSecurityEvent', () => {
  let warnSpy: jest.SpyInstance
  beforeEach(() => {
    warnSpy = jest.spyOn(securityLogger, 'warn').mockImplementation(() => {})
  })
  afterEach(() => {
    warnSpy.mockRestore()
  })
  it('logs security event with default severity warn', () => {
    const details = { foo: 'bar' }
    logSecurityEvent('EVT', details)
    expect(warnSpy).toHaveBeenCalledWith(
      'Событие безопасности: EVT',
      expect.objectContaining({ ...details, eventType: 'EVT' })
    )
  })
  it('logs security event with specified severity', () => {
    const infoSpy = jest.spyOn(securityLogger, 'info').mockImplementation(() => {})
    logSecurityEvent('INFO_EVT', { a: 1 }, 'info')
    expect(infoSpy).toHaveBeenCalled()
    infoSpy.mockRestore()
  })
})