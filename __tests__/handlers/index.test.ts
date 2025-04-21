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
  // registerCallbackActions is removed; ensure hearsActions is still exported
  it('should export registerHearsActions', () => {
    expect(typeof handlers.registerHearsActions).toBe('function')
  })
})