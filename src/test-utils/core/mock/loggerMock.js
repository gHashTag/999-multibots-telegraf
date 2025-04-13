/**
 * Mock implementation of the logger module for tests
 * This prevents actual logging to external services while in tests
 */

// Store logs for inspection in tests if needed
const logs = {
  info: [],
  error: [],
  warn: [],
  debug: [],
  verbose: []
};

/**
 * Mock logger that collects logs instead of sending them
 */
const logger = {
  // Main logging methods
  info: (message, meta = {}) => {
    logs.info.push({ message, meta, timestamp: new Date() });
    if (process.env.TEST_DEBUG === 'true') {
      console.log(`[INFO] ${message}`, meta);
    }
  },
  
  error: (message, meta = {}) => {
    logs.error.push({ message, meta, timestamp: new Date() });
    if (process.env.TEST_DEBUG === 'true') {
      console.error(`[ERROR] ${message}`, meta);
    }
  },
  
  warn: (message, meta = {}) => {
    logs.warn.push({ message, meta, timestamp: new Date() });
    if (process.env.TEST_DEBUG === 'true') {
      console.warn(`[WARN] ${message}`, meta);
    }
  },
  
  debug: (message, meta = {}) => {
    logs.debug.push({ message, meta, timestamp: new Date() });
    if (process.env.TEST_DEBUG === 'true') {
      console.debug(`[DEBUG] ${message}`, meta);
    }
  },
  
  verbose: (message, meta = {}) => {
    logs.verbose.push({ message, meta, timestamp: new Date() });
    if (process.env.TEST_DEBUG === 'true') {
      console.log(`[VERBOSE] ${message}`, meta);
    }
  },
  
  // Child loggers
  child: (options) => {
    return logger;
  },
  
  // Test helpers
  getLogs: () => logs,
  
  clearLogs: () => {
    Object.keys(logs).forEach(key => {
      logs[key] = [];
    });
  },
  
  getErrorLogs: () => logs.error,
  
  hasErrorWithMessage: (messageFragment) => {
    return logs.error.some(log => 
      log.message.includes(messageFragment) || 
      (log.meta && log.meta.message && log.meta.message.includes(messageFragment))
    );
  }
};

module.exports = {
  logger,
  logs
}; 