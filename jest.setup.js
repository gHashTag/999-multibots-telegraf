// jest.setup.js
// Global setup for Jest: silence console methods and mocks

// Override console methods to avoid noisy logs in test runs
const noop = () => {}
global.console = {
  log: noop,
  info: noop,
  warn: noop,
  error: noop,
  debug: noop,
  trace: noop,
}
// Optionally mock logger
jest.mock('./src/utils/logger', () => ({
  logger: {
    info: noop,
    warn: noop,
    error: noop,
    debug: noop,
  },
}))
