import * as handlers from '@/handlers'

describe('handlers index re-exports', () => {
  it('should export setupLevelHandlers', () => {
    expect(typeof handlers.setupLevelHandlers).toBe('function')
  })
  it('should export handleSizeSelection', () => {
    expect(typeof handlers.handleSizeSelection).toBe('function')
  })
  it('should export handleSelectStars', () => {
    expect(typeof handlers.handleSelectStars).toBe('function')
  })
  it('should export handleModelCallback', () => {
    expect(typeof handlers.handleModelCallback).toBe('function')
  })
  it('should export handleTextMessage', () => {
    expect(typeof handlers.handleTextMessage).toBe('function')
  })
  it('should export handleMenu', () => {
    expect(typeof handlers.handleMenu).toBe('function')
  })
  it('should have checkFullAccess property', () => {
    expect(handlers).toHaveProperty('checkFullAccess')
  })
  it('should export checkFullAccess', () => {
    expect(typeof handlers.checkFullAccess).toBe('function')
  })
  it('should have handleSelectRubAmount property', () => {
    expect(handlers).toHaveProperty('handleSelectRubAmount')
  })
  it('should export handleSelectRubAmount', () => {
    expect(typeof handlers.handleSelectRubAmount).toBe('function')
  })
})
