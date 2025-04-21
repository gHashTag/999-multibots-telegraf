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

describe('Root handlers index', () => {
  it('should export all expected handlers and actions', () => {
    // Check if main handlers are exported
    expect(handlers.handleTextMessage).toBeDefined()
    expect(handlers.handleHelpCancel).toBeDefined()
    expect(handlers.handleMenu).toBeDefined()
    expect(handlers.handleCallback).toBeDefined()
    expect(handlers.hearsActions).toBeDefined()
    expect(handlers.callbackActions).toBeDefined()
    expect(handlers.getUserInfo).toBeDefined()
    expect(handlers.isAdmin).toBeDefined()

    // Check if specific command/action handlers are exported
    expect(handlers.handleBuy).toBeDefined()
    expect(handlers.handleBuySubscription).toBeDefined()
    expect(handlers.handleModelCallback).toBeDefined()
    expect(handlers.handleSelectRubAmount).toBeDefined()
    expect(handlers.handleSelectStars).toBeDefined()
    expect(handlers.handleSizeSelection).toBeDefined()
    expect(handlers.handleSuccessfulPayment).toBeDefined()
    expect(handlers.setupLevelHandlers).toBeDefined()

    // Check payment handlers
    expect(handlers.handlePaymentPolicyInfo).toBeDefined()
    expect(handlers.handlePreCheckoutQuery).toBeDefined()
    expect(handlers.handleTopUp).toBeDefined()

    // Optionally check types if needed, though Jest focuses on existence here
  })
})
