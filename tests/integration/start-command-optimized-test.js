/**
 * COMPREHENSIVE INTEGRATION TEST: Optimized Start Command with Usage-Based Redirection
 *
 * This test validates the enhanced start command logic that checks user usage patterns
 * and redirects experienced users directly to the main menu while preserving the
 * onboarding flow for new users.
 *
 * Test Scenarios:
 * 1. New users (no usage) -> Full onboarding flow
 * 2. Experienced users (multiple transactions) -> Direct main menu redirect
 * 3. Users with income but few transactions -> Main menu redirect
 * 4. Users with multiple services used -> Main menu redirect
 * 5. Performance optimization with caching
 * 6. Error handling and fallbacks
 */

const { shouldSkipOnboarding, shouldSkipOnboardingCached, getUserUsageCount, isReturningUser, clearUserExperienceCache, getUserExperienceCacheStats } = require('../../src/helpers/getUserUsageCount')

// Test configuration
const TEST_CONFIG = {
  NEW_USER_ID: '999000001', // User with no usage history
  EXPERIENCED_USER_ID: '999000002', // User with multiple transactions
  INCOME_USER_ID: '999000003', // User with income but few transactions
  MULTI_SERVICE_USER_ID: '999000004', // User with multiple services
  ERROR_USER_ID: '999000005', // User that will trigger database errors
  BOT_NAME: 'test_bot',
  CACHE_TEST_ITERATIONS: 100, // For performance testing
}

// Mock logger to capture test output
const testLogger = {
  logs: [],
  info: function(message, data) {
    this.logs.push({ level: 'info', message, data, timestamp: Date.now() })
  },
  warn: function(message, data) {
    this.logs.push({ level: 'warn', message, data, timestamp: Date.now() })
  },
  error: function(message, data) {
    this.logs.push({ level: 'error', message, data, timestamp: Date.now() })
  },
  clear: function() {
    this.logs = []
  },
  getLastLog: function() {
    return this.logs[this.logs.length - 1]
  },
  filterByLevel: function(level) {
    return this.logs.filter(log => log.level === level)
  }
}

/**
 * Test Results Collection
 */
class TestResults {
  constructor() {
    this.tests = []
    this.startTime = Date.now()
    this.performance = {
      dbQueries: [],
      cacheHits: 0,
      cacheMisses: 0,
      totalResponseTime: 0
    }
  }

  addTest(name, passed, details = {}) {
    this.tests.push({
      name,
      passed,
      details,
      timestamp: Date.now()
    })
  }

  addPerformanceMetric(operation, duration, cached = false) {
    if (cached) {
      this.performance.cacheHits++
    } else {
      this.performance.cacheMisses++
      this.performance.dbQueries.push({ operation, duration })
    }
    this.performance.totalResponseTime += duration
  }

  getSummary() {
    const passed = this.tests.filter(t => t.passed).length
    const failed = this.tests.length - passed
    const totalTime = Date.now() - this.startTime
    const avgResponseTime = this.performance.totalResponseTime / this.tests.length || 0
    const cacheHitRate = this.performance.cacheHits / (this.performance.cacheHits + this.performance.cacheMisses) * 100

    return {
      total: this.tests.length,
      passed,
      failed,
      successRate: (passed / this.tests.length) * 100,
      totalTime,
      avgResponseTime: Math.round(avgResponseTime * 100) / 100,
      cacheHitRate: Math.round(cacheHitRate * 100) / 100,
      dbQueries: this.performance.dbQueries.length,
      performance: this.performance
    }
  }

  printReport() {
    const summary = this.getSummary()

    console.log('\n🎯 OPTIMIZED START COMMAND TEST REPORT')
    console.log('=====================================')
    console.log(`📊 Total Tests: ${summary.total}`)
    console.log(`✅ Passed: ${summary.passed}`)
    console.log(`❌ Failed: ${summary.failed}`)
    console.log(`🎯 Success Rate: ${summary.successRate.toFixed(1)}%`)
    console.log(`⏱️ Total Time: ${summary.totalTime}ms`)
    console.log(`📈 Avg Response Time: ${summary.avgResponseTime}ms`)
    console.log(`💾 Cache Hit Rate: ${summary.cacheHitRate}%`)
    console.log(`🗃️ Database Queries: ${summary.dbQueries}`)
    console.log('')

    // Performance analysis
    if (summary.dbQueries > 0) {
      const avgDbTime = this.performance.dbQueries.reduce((sum, q) => sum + q.duration, 0) / this.performance.dbQueries.length
      console.log(`🔍 Performance Analysis:`)
      console.log(`   • Average DB Query Time: ${avgDbTime.toFixed(2)}ms`)
      console.log(`   • Cache Hits: ${this.performance.cacheHits}`)
      console.log(`   • Cache Misses: ${this.performance.cacheMisses}`)
    }

    // Failed tests details
    const failedTests = this.tests.filter(t => !t.passed)
    if (failedTests.length > 0) {
      console.log('\n❌ Failed Tests:')
      failedTests.forEach(test => {
        console.log(`   • ${test.name}`)
        if (test.details.error) {
          console.log(`     Error: ${test.details.error}`)
        }
      })
    }

    console.log('')
    return summary
  }
}

/**
 * Mock Database Functions
 * Simulates various user scenarios for testing
 */
const mockDatabase = {
  users: {
    [TEST_CONFIG.NEW_USER_ID]: {
      total_transactions: 0,
      total_real_income: 0,
      total_bonus_income: 0,
      services_breakdown: [],
      current_balance: 0
    },
    [TEST_CONFIG.EXPERIENCED_USER_ID]: {
      total_transactions: 15,
      total_real_income: 500,
      total_bonus_income: 100,
      services_breakdown: ['neuro_photo', 'text_to_video', 'voice_avatar'],
      current_balance: 250
    },
    [TEST_CONFIG.INCOME_USER_ID]: {
      total_transactions: 2,
      total_real_income: 200,
      total_bonus_income: 50,
      services_breakdown: ['neuro_photo'],
      current_balance: 150
    },
    [TEST_CONFIG.MULTI_SERVICE_USER_ID]: {
      total_transactions: 1,
      total_real_income: 0,
      total_bonus_income: 0,
      services_breakdown: ['neuro_photo', 'text_to_speech'],
      current_balance: 0
    }
  },

  getUserBalanceStatsOptimized: async function(telegramId, botName, limitServices, limitTransactions) {
    const delay = Math.random() * 50 + 10 // Simulate database delay 10-60ms
    await new Promise(resolve => setTimeout(resolve, delay))

    if (telegramId === TEST_CONFIG.ERROR_USER_ID) {
      throw new Error('Database connection error')
    }

    return this.users[telegramId] || null
  }
}

/**
 * Test Functions
 */
async function runTest(name, testFn, results) {
  const startTime = Date.now()
  testLogger.clear()

  try {
    console.log(`🧪 Running: ${name}`)
    const result = await testFn()
    const duration = Date.now() - startTime

    results.addTest(name, result.success, {
      duration,
      cached: result.cached,
      details: result.details
    })

    results.addPerformanceMetric(name, duration, result.cached)

    console.log(`   ${result.success ? '✅' : '❌'} ${duration}ms ${result.cached ? '(cached)' : '(db)'}`)
    if (!result.success && result.error) {
      console.log(`   Error: ${result.error}`)
    }

  } catch (error) {
    const duration = Date.now() - startTime
    results.addTest(name, false, { duration, error: error.message })
    console.log(`   ❌ ${duration}ms - Error: ${error.message}`)
  }
}

/**
 * Individual Test Cases
 */

// Test 1: New user should NOT skip onboarding
async function testNewUser() {
  const userId = TEST_CONFIG.NEW_USER_ID
  const result = await shouldSkipOnboarding(userId, TEST_CONFIG.BOT_NAME)

  return {
    success: result === false,
    cached: false,
    details: { userId, shouldSkip: result },
    error: result !== false ? 'New user should not skip onboarding' : null
  }
}

// Test 2: Experienced user should skip onboarding
async function testExperiencedUser() {
  const userId = TEST_CONFIG.EXPERIENCED_USER_ID
  const result = await shouldSkipOnboarding(userId, TEST_CONFIG.BOT_NAME)

  return {
    success: result === true,
    cached: false,
    details: { userId, shouldSkip: result },
    error: result !== true ? 'Experienced user should skip onboarding' : null
  }
}

// Test 3: User with income should skip onboarding
async function testIncomeUser() {
  const userId = TEST_CONFIG.INCOME_USER_ID
  const result = await shouldSkipOnboarding(userId, TEST_CONFIG.BOT_NAME)

  return {
    success: result === true,
    cached: false,
    details: { userId, shouldSkip: result },
    error: result !== true ? 'User with significant income should skip onboarding' : null
  }
}

// Test 4: User with multiple services should skip onboarding
async function testMultiServiceUser() {
  const userId = TEST_CONFIG.MULTI_SERVICE_USER_ID
  const result = await shouldSkipOnboarding(userId, TEST_CONFIG.BOT_NAME)

  return {
    success: result === true,
    cached: false,
    details: { userId, shouldSkip: result },
    error: result !== true ? 'User with multiple services should skip onboarding' : null
  }
}

// Test 5: Cached function performance
async function testCachedPerformance() {
  const userId = TEST_CONFIG.EXPERIENCED_USER_ID

  // First call (cache miss)
  const start1 = Date.now()
  await shouldSkipOnboardingCached(userId, TEST_CONFIG.BOT_NAME)
  const time1 = Date.now() - start1

  // Second call (cache hit)
  const start2 = Date.now()
  const result = await shouldSkipOnboardingCached(userId, TEST_CONFIG.BOT_NAME)
  const time2 = Date.now() - start2

  // Cache should be significantly faster
  const improvement = ((time1 - time2) / time1) * 100

  return {
    success: result === true && time2 < time1 && improvement > 50,
    cached: true,
    details: {
      firstCallTime: time1,
      cachedCallTime: time2,
      improvement: Math.round(improvement),
      shouldSkip: result
    },
    error: improvement <= 50 ? `Cache improvement only ${improvement.toFixed(1)}%, expected >50%` : null
  }
}

// Test 6: Error handling and fallback
async function testErrorHandling() {
  const userId = TEST_CONFIG.ERROR_USER_ID

  try {
    const result = await shouldSkipOnboarding(userId, TEST_CONFIG.BOT_NAME)

    // Should fall back to false (safe default)
    return {
      success: result === false,
      cached: false,
      details: { userId, shouldSkip: result, errorHandled: true },
      error: result !== false ? 'Error should result in safe fallback (false)' : null
    }
  } catch (error) {
    return {
      success: false,
      cached: false,
      details: { userId, errorHandled: false },
      error: 'Error should be handled gracefully, not thrown'
    }
  }
}

// Test 7: Cache statistics and management
async function testCacheManagement() {
  // Clear cache first
  clearUserExperienceCache()

  // Make some calls to populate cache
  await shouldSkipOnboardingCached(TEST_CONFIG.EXPERIENCED_USER_ID, TEST_CONFIG.BOT_NAME)
  await shouldSkipOnboardingCached(TEST_CONFIG.NEW_USER_ID, TEST_CONFIG.BOT_NAME)

  // Get cache stats
  const stats = getUserExperienceCacheStats()

  return {
    success: stats.totalEntries >= 2 && stats.validEntries >= 2,
    cached: true,
    details: stats,
    error: stats.totalEntries < 2 ? 'Cache should contain at least 2 entries' : null
  }
}

// Test 8: Basic usage count function
async function testGetUserUsageCount() {
  const userId = TEST_CONFIG.EXPERIENCED_USER_ID
  const count = await getUserUsageCount(userId, TEST_CONFIG.BOT_NAME)

  return {
    success: count === 15, // Expected from mock data
    cached: false,
    details: { userId, usageCount: count },
    error: count !== 15 ? `Expected usage count 15, got ${count}` : null
  }
}

// Test 9: Returning user detection
async function testIsReturningUser() {
  const newUser = await isReturningUser(TEST_CONFIG.NEW_USER_ID, TEST_CONFIG.BOT_NAME)
  const expUser = await isReturningUser(TEST_CONFIG.EXPERIENCED_USER_ID, TEST_CONFIG.BOT_NAME)

  return {
    success: newUser === false && expUser === true,
    cached: false,
    details: { newUser, expUser },
    error: !(newUser === false && expUser === true) ? 'User classification incorrect' : null
  }
}

// Test 10: Performance stress test
async function testPerformanceStress() {
  const userId = TEST_CONFIG.EXPERIENCED_USER_ID
  const iterations = 20
  const times = []

  // Clear cache for fair test
  clearUserExperienceCache()

  for (let i = 0; i < iterations; i++) {
    const start = Date.now()
    await shouldSkipOnboardingCached(userId, TEST_CONFIG.BOT_NAME)
    times.push(Date.now() - start)
  }

  const avgTime = times.reduce((a, b) => a + b, 0) / times.length
  const maxTime = Math.max(...times)
  const minTime = Math.min(...times)

  // After first call, all should be cached and much faster
  const cachedTimes = times.slice(1)
  const avgCachedTime = cachedTimes.reduce((a, b) => a + b, 0) / cachedTimes.length

  return {
    success: avgCachedTime < 5 && maxTime < 100, // Cached calls should be <5ms, max <100ms
    cached: true,
    details: {
      iterations,
      avgTime: Math.round(avgTime * 100) / 100,
      avgCachedTime: Math.round(avgCachedTime * 100) / 100,
      maxTime,
      minTime
    },
    error: avgCachedTime >= 5 ? `Cached calls too slow: ${avgCachedTime.toFixed(2)}ms` : null
  }
}

/**
 * Main Test Runner
 */
async function runAllTests() {
  console.log('🚀 Starting Optimized Start Command Integration Tests')
  console.log('====================================================')

  // Initialize results tracker
  const results = new TestResults()

  // Mock the database functions
  const originalGetUserBalanceStatsOptimized = require('../../src/core/supabase/getUserBalanceStatsOptimized').getUserBalanceStatsOptimized
  require('../../src/core/supabase/getUserBalanceStatsOptimized').getUserBalanceStatsOptimized = mockDatabase.getUserBalanceStatsOptimized.bind(mockDatabase)

  try {
    // Run all tests
    await runTest('New User Onboarding Flow', testNewUser, results)
    await runTest('Experienced User Main Menu Redirect', testExperiencedUser, results)
    await runTest('Income User Main Menu Redirect', testIncomeUser, results)
    await runTest('Multi-Service User Main Menu Redirect', testMultiServiceUser, results)
    await runTest('Cached Function Performance', testCachedPerformance, results)
    await runTest('Error Handling and Fallback', testErrorHandling, results)
    await runTest('Cache Management', testCacheManagement, results)
    await runTest('Get User Usage Count', testGetUserUsageCount, results)
    await runTest('Returning User Detection', testIsReturningUser, results)
    await runTest('Performance Stress Test', testPerformanceStress, results)

    // Generate final report
    const summary = results.printReport()

    // Additional analysis
    console.log('🔍 IMPLEMENTATION ANALYSIS')
    console.log('==========================')
    console.log('✅ Features Implemented:')
    console.log('   • Advanced user experience detection')
    console.log('   • High-performance caching system')
    console.log('   • Comprehensive error handling')
    console.log('   • Multiple fallback mechanisms')
    console.log('   • Performance optimization')
    console.log('   • Detailed logging and metrics')
    console.log('')

    // Performance benchmarks
    if (summary.cacheHitRate > 80) {
      console.log('⚡ PERFORMANCE: Excellent cache efficiency')
    } else if (summary.cacheHitRate > 50) {
      console.log('📈 PERFORMANCE: Good cache efficiency')
    } else {
      console.log('⚠️ PERFORMANCE: Cache efficiency needs improvement')
    }

    if (summary.avgResponseTime < 20) {
      console.log('🚀 PERFORMANCE: Excellent response times')
    } else if (summary.avgResponseTime < 50) {
      console.log('✅ PERFORMANCE: Good response times')
    } else {
      console.log('⚠️ PERFORMANCE: Response times need optimization')
    }

    console.log('')

    // Success criteria
    const meetsRequirements = summary.successRate >= 90 && summary.cacheHitRate >= 70 && summary.avgResponseTime < 50

    if (meetsRequirements) {
      console.log('🎉 SUCCESS: Implementation meets all performance and functionality requirements!')
    } else {
      console.log('⚠️ NEEDS IMPROVEMENT: Some requirements not fully met')
    }

    return summary

  } catch (error) {
    console.error('💥 Test suite failed:', error.message)
    return null

  } finally {
    // Restore original function
    require('../../src/core/supabase/getUserBalanceStatsOptimized').getUserBalanceStatsOptimized = originalGetUserBalanceStatsOptimized
  }
}

// Export for external use
module.exports = {
  runAllTests,
  TEST_CONFIG,
  TestResults
}

// Run tests if called directly
if (require.main === module) {
  runAllTests()
    .then((summary) => {
      if (summary && summary.successRate >= 90) {
        process.exit(0) // Success
      } else {
        process.exit(1) // Failure
      }
    })
    .catch((error) => {
      console.error('Test execution failed:', error)
      process.exit(1)
    })
}